import { Page } from 'playwright-core';
import { breakSliderVerify, getBase64 } from '../../utils';
import { AutomationScript } from '../../script';
import { getAutomationOverlay } from '../../../worker/automation-overlay';

/**
 * OCR 提示的来源标识。
 *
 * 用独立来源而不是覆盖「自动程序」那条常显：OCR 结束只撤这一条，
 * 外层「正在自动操作中」的文案会自动恢复，不用记住原文。
 */
const OCR_TIP_SOURCE = 'zhs-login-ocr';
const OCR_TIP_MESSAGE = 'OCR 识别中，无需操作';

type ZHSCaptchaOptions = {
	ocrApiUrl?: string;
	detTargetKey?: string;
	detBackgroundKey?: string;
};

export const ZHSUnitLoginScript = new AutomationScript(
	{
		schoolname: {
			label: '学校',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入学校名称'
		},
		id: {
			label: '学号',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入学号'
		},
		password: {
			label: '密码',
			value: '',
			type: 'password',
			required: true,
			placeholder: '请输入密码'
		}
	},
	{
		name: '智慧树-学校登录',
		icon: 'https://www.zhihuishu.com/',
		async run(page, configs, options?: ZHSCaptchaOptions) {
			try {
				if (!(await isNotLogin(page))) return;

				// 新登录中心：学号登录 = 学校下拉 + 学号 + 密码
				await openLoginTab(page, '学号登录');
				await selectSchool(page, configs.schoolname);
				await page.fill('input[name="unid"]', configs.id);
				await page.fill('input[type="password"]', configs.password);
				await agreeAndSubmit(page);
				await solveCaptcha(page, options);
				await waitForLogin(page);
			} catch (err) {
				ZHSUnitLoginScript.emit('script-error', String(err));
			}
		}
	}
);

export const ZHSPhoneLoginScript = new AutomationScript(
	{
		phone: {
			label: '手机号',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入手机号或用户名'
		},
		password: {
			label: '密码',
			value: '',
			type: 'password',
			required: true,
			placeholder: '请输入密码'
		}
	},
	{
		name: '智慧树-手机密码登录',
		icon: 'https://www.zhihuishu.com/',
		async run(page, configs, options?: ZHSCaptchaOptions) {
			try {
				if (!(await isNotLogin(page))) return;

				// 新登录中心：账号登录 = 手机号/用户名 + 密码
				await openLoginTab(page, '账号登录');
				await page.fill('input[name="mobile"]', configs.phone);
				await page.fill('input[type="password"]', configs.password);
				await agreeAndSubmit(page);
				await solveCaptcha(page, options);
				await waitForLogin(page);
			} catch (err) {
				ZHSPhoneLoginScript.emit('script-error', String(err));
			}
		}
	}
);

/** 切到指定登录方式并等待表单出现 */
async function openLoginTab(page: Page, name: '账号登录' | '学号登录') {
	const tab = page.getByText(name, { exact: true }).first();
	if (await tab.count().catch(() => 0)) {
		await tab.click().catch(() => {});
		await page.waitForTimeout(800);
	}
	await page.waitForSelector('input[type="password"]', { timeout: 15000 });
}

/** 在 Element Plus 下拉框中按学校名搜索并选择第一个匹配项 */
async function selectSchool(page: Page, schoolname: string) {
	const name = `${schoolname || ''}`.trim();
	if (!name) throw new Error('学校名称为空，请先在自动程序中填写学校');

	const select = page.locator('.el-select').first();
	if (!(await select.count().catch(() => 0))) throw new Error('未找到学校选择框');
	await select.click();
	await page.waitForTimeout(300);

	const input = page.locator('.el-select__input').first();
	if (!(await input.count().catch(() => 0))) throw new Error('未找到学校搜索框');
	await input.fill(name);
	await page.waitForTimeout(1800);

	const options = page.locator('.el-select-dropdown__item');
	if (!(await options.count().catch(() => 0))) throw new Error(`未找到学校：${name}`);
	const texts = await options.allTextContents();
	const exactIndex = texts.findIndex((text) => text.trim() === name);
	if (exactIndex >= 0) await options.nth(exactIndex).click();
	else await options.first().click();
	await page.waitForTimeout(500);
}

/** 勾选隐私协议并点击登录 */
async function agreeAndSubmit(page: Page) {
	const isChecked = () =>
		evaluateSafe(page, () =>
			page.evaluate(() => !!(document.querySelector('input.el-checkbox__original') as HTMLInputElement | null)?.checked)
		);

	if (!(await isChecked())) {
		// 只点复选框本身，不能点整个 label：label 内的《用户协议》等文字会打开协议页
		const checkbox = page.locator('label.privacy-checkbox .el-checkbox__inner').first();
		if (await checkbox.count().catch(() => 0)) {
			await checkbox.click({ force: true }).catch(() => {});
		} else {
			await evaluateSafe(page, () =>
				page.evaluate(() => (document.querySelector('input.el-checkbox__original') as HTMLInputElement | null)?.click())
			);
		}
		await page.waitForTimeout(300);
	}

	// 兜底：某些版本复选框被遮挡时，直接用 DOM 触发 input
	if (!(await isChecked())) {
		await evaluateSafe(page, () =>
			page.evaluate(() => (document.querySelector('input.el-checkbox__original') as HTMLInputElement | null)?.click())
		);
		await page.waitForTimeout(300);
	}
	if (!(await isChecked())) throw new Error('未能勾选隐私协议');

	const button = page.locator('.btn-block__grandient_login').first();
	if (!(await button.count().catch(() => 0))) throw new Error('未找到登录按钮');
	await button.click();
	await page.waitForTimeout(3000);
}

async function solveCaptcha(page: Page, options?: ZHSCaptchaOptions) {
	if (!options?.ocrApiUrl || !options?.detTargetKey || !options?.detBackgroundKey) return;

	/**
	 * 整个「识别 + 拖动 + 重试」区间都切成静态纯蓝，并暂停流光的大面积动画。
	 *
	 * 流光是两块全屏动画（旋转的 conic + blur），会把登录页压到个位数帧率；
	 * 验证码的图片解码与拖动正好与它抢渲染，表现为「OCR 启动很慢」。
	 * 放在循环外：验证码常有多次重试，如果每次 verify 都切回流光，
	 * 视觉会在蓝和流光之间反复跳，重试间隙也重新变卡。
	 * 结束时（无论成功、失败、异常）finally 再渐变回流光。
	 */
	const overlay = getAutomationOverlay(page.context());
	overlay?.setSourceActive(OCR_TIP_SOURCE, OCR_TIP_MESSAGE, true, { steady: true });
	try {
		let count = 5;
		while (await isNotVerified(page)) {
			if (count <= 0) throw new Error('滑块识别失败，请手动登录。');
			count--;
			await verify(page, {
				ocrApiUrl: options.ocrApiUrl,
				detTargetKey: options.detTargetKey,
				detBackgroundKey: options.detBackgroundKey
			});
			await page.waitForTimeout(2000);
			if (await isNotVerified(page)) {
				// 拖动失败后换一张图再试，避免一直重复同一张失败图片
				const refresh = page.locator('.yidun_refresh').first();
				if (await refresh.count().catch(() => 0)) {
					await refresh.click().catch(() => {});
					await page.waitForTimeout(1500);
				}
			}
		}
	} finally {
		overlay?.setSourceActive(OCR_TIP_SOURCE, '', false);
	}
}

/**
 * 是否仍停在登录入口
 *
 * 智慧树登录成功不是一步到位：login 中心 → passport → www，连续跳转好几轮。
 * 只认 `login.zhihuishu.com` 的话，`passport.zhihuishu.com` 这段中间页
 * 只要地址稳定 3 秒就会被误判成「登录完成」，脚本随即结束、读课程立即开跑，
 * 结果就是在登录页上抽出空列表并报错。
 */
function isLoginEntryUrl(url: string): boolean {
	const text = String(url || '');
	if (!/^https?:/i.test(text)) return false;
	if (/^https?:\/\/(login|passport)\.zhihuishu\.com/i.test(text)) return true;
	return /zhihuishu\.com\/(?:[^?#]*\/)?(?:login|signin)(?:\.html?)?(?:[/?#]|$)/i.test(text);
}

/** 登录页可能停留在新登录中心，等待跳转；超时则给出明确错误 */
async function waitForLogin(page: Page) {
	/**
	 * 登录成功后智慧树不是一步到位：login 中心 → passport → www → 学习页，
	 * 会连续跳转好几轮。这里必须等**地址稳定**再返回，否则后面的读课流程
	 * 会在跳转途中被顶掉（表现为读到空列表或执行上下文被销毁）。
	 *
	 * 上限给到 60 秒：弱网下 passport 换票据 + 首页渲染可能超过 40 秒，
	 * 提前放弃会让脚本「正常结束」，读课程随即撞上还没登录完的页面。
	 */
	const deadline = Date.now() + 60 * 1000;
	let lastUrl = '';
	let stable = 0;
	while (Date.now() < deadline) {
		const url = page.url();
		if (isLoginEntryUrl(url)) {
			lastUrl = url;
			stable = 0;
		} else {
			stable = url === lastUrl ? stable + 1 : 0;
			lastUrl = url;
			/** 连续 3 秒地址不变，且已经落在真正的网页上，才认为多轮跳转结束 */
			if (stable >= 3 && /^https?:/i.test(url)) {
				await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
				return;
			}
		}
		await page.waitForTimeout(1000);
	}
	throw new Error('登录未完成，请检查账号密码，或手动完成安全验证。');
}

/**
 * 跳转瞬间的 evaluate
 *
 * 页面每发生一次跳转，旧的执行上下文就会被销毁，此时 `page.evaluate` 抛出
 * `Execution context was destroyed, most likely because of a navigation`。
 * 这不是登录失败，等页面落定后重试即可 —— 直接冒泡会让用户看到莫名其妙的
 * 「自动化程序错误」，也会把已经成功的登录误判成失败。
 */
function isNavigationRace(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return /Execution context was destroyed|Cannot find context with specified id/i.test(message);
}

async function evaluateSafe<T>(page: Page, fn: () => Promise<T>, attempts = 6): Promise<T> {
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			if (i === attempts - 1 || !isNavigationRace(err)) throw err;
			await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
			await page.waitForTimeout(500);
		}
	}
	throw new Error('页面跳转过于频繁，读取页面状态失败');
}

/**
 * 滑块验证
 */
async function verify(page: Page, opts: { ocrApiUrl: string; detTargetKey: string; detBackgroundKey: string }) {
	// 删除 yidun 遮挡层，避免影响拖动
	await page.evaluate(() =>
		document.querySelectorAll('.yidun_cover-frame,.yidun_popup__mask').forEach((el) => el.remove())
	);

	const det_slider_el = await page.$('.yidun_slider');
	const det_target_el = await page.$('[alt="验证码滑块"]');
	const det_bg_el = await page.$('[alt="验证码背景"]');

	if (det_target_el && det_slider_el && det_bg_el) {
		const det_target_src = await det_target_el.getAttribute('src');
		const det_bg_src = await det_bg_el.getAttribute('src');
		if (det_target_src && det_bg_src) {
			// 必须把 page 传进去：易盾的图片地址带会话校验，由 Node 侧独立下载会被回 400
			const [det_target_base64, det_bg_base64] = await Promise.all([
				getBase64(det_target_src, page),
				getBase64(det_bg_src, page)
			]);
			// 拼图元素自身的位移已经按背景图显示比例缩放过了，鼠标拖动距离直接使用 OCR 原始偏移；
			// 再乘一次显示比例会导致拖动不足，拼图偏左。
			await breakSliderVerify(page, det_slider_el, det_target_base64, det_bg_base64, {
				...opts,
				offset: 0,
				startAtCenter: true,
				pieceElement: det_target_el,
				backgroundElement: det_bg_el
			});
		}
	}
}

/** 是否还存在未完成的安全验证 */
async function isNotVerified(page: Page) {
	await page.waitForTimeout(1000);

	const errors = await evaluateSafe(page, () =>
		page.evaluate(() =>
			Array.from(document.querySelectorAll('.el-form-item__error, .form-ipt-error.is-visible'))
				.map((e) => (e.textContent || '').trim())
				.filter(Boolean)
		)
	);

	if (errors.length) {
		throw new Error(errors.join('\n'));
	}

	return !!(await page.$('.yidun_popup .yidun_slider, .yidun_popup--light .yidun_slider, .yidun_slider'));
}

/** 智慧树课程列表：只有它能证明「课程系统」真的已登录 */
const ZHS_COURSE_LIST_URL = 'https://onlineweb.zhihuishu.com/onlinestuh5';

/**
 * 课程系统的登录态校验
 *
 * 打开课程列表并等它落定：
 * - 被重定向到 passport / login 登录中心 → 未登录；
 * - 连续 4 秒稳定停在课程列表主机上 → 已登录。
 *
 * 观察到的跳转链：onlineweb（约 0.1s）→ passport（约 2.1s）→ 登录中心，
 * 所以必须等几秒再看，太早检查会把「马上要被踢去登录」误判成已登录。
 */
async function isCourseSystemLoggedIn(page: Page, timeoutMs = 20000): Promise<boolean> {
	await page
		.goto(ZHS_COURSE_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
		.catch(() => {});

	const listHost = new URL(ZHS_COURSE_LIST_URL).hostname;
	const deadline = Date.now() + timeoutMs;
	let lastUrl = '';
	let stable = 0;

	while (Date.now() < deadline) {
		const url = page.url();
		if (isLoginEntryUrl(url)) return false;

		let onListHost = false;
		try {
			onListHost = new URL(url).hostname === listHost;
		} catch {}

		if (/^https?:/i.test(url) && onListHost) {
			stable = url === lastUrl ? stable + 1 : 0;
			lastUrl = url;
			if (stable >= 4) return true;
		} else {
			stable = 0;
			lastUrl = url;
		}
		await page.waitForTimeout(1000);
	}
	return false;
}

/**
 * 是否还没登录（true = 需要执行登录）
 *
 * 注意：**不能只看 www 首页**。首页顶部显示用户名（`#login` 可见）只代表门户会话还在，
 * 课程系统的 SSO 会话可以独立过期 —— 页面看起来「已登录」，
 * 一打开课程列表却被 302 回登录中心，登录脚本于是被整段跳过，
 * 读课程只能读到首页的推荐卡片。所以这里直接用课程列表页判断真实登录态。
 */
async function isNotLogin(page: Page) {
	if (await isCourseSystemLoggedIn(page)) return false;

	/** 已经被重定向到登录中心时保留它（带 service 参数，登录后会回到课程列表） */
	if (!isLoginEntryUrl(page.url())) {
		await page.goto('https://login.zhihuishu.com/?origin=zhs').catch(() => {});
		await page.waitForTimeout(1500);
	}
	/**
	 * 等登录表单真正渲染出来再返回：
	 * 检测到 login 域名时页面往往还在跳转，表单稍后才出现；
	 * 早退会让 `openLoginTab` 看不到「学号登录」入口，直接去填学校表单而失败。
	 */
	await page.waitForSelector('input[type="password"]', { timeout: 20000 }).catch(() => {});
	await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
	return true;
}
