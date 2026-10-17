import { Page } from 'playwright-core';
import { breakSliderVerify, getBase64 } from '../../utils';
import { AutomationScript } from '../../script';

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
		page.evaluate(
			() => !!(document.querySelector('input.el-checkbox__original') as HTMLInputElement | null)?.checked
		);

	if (!(await isChecked())) {
		// 只点复选框本身，不能点整个 label：label 内的《用户协议》等文字会打开协议页
		const checkbox = page.locator('label.privacy-checkbox .el-checkbox__inner').first();
		if (await checkbox.count().catch(() => 0)) {
			await checkbox.click({ force: true }).catch(() => {});
		} else {
			await page.evaluate(() =>
				(document.querySelector('input.el-checkbox__original') as HTMLInputElement | null)?.click()
			);
		}
		await page.waitForTimeout(300);
	}

	// 兜底：某些版本复选框被遮挡时，直接用 DOM 触发 input
	if (!(await isChecked())) {
		await page.evaluate(() =>
			(document.querySelector('input.el-checkbox__original') as HTMLInputElement | null)?.click()
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
}

/** 登录页可能停留在新登录中心，等待跳转；超时则给出明确错误 */
async function waitForLogin(page: Page) {
	for (let i = 0; i < 10; i++) {
		if (!page.url().includes('login.zhihuishu.com')) return;
		await page.waitForTimeout(1000);
	}
	throw new Error('登录未完成，请检查账号密码，或手动完成安全验证。');
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
			// 拼图元素自身的位移已经按背景图显示比例缩放过了，鼠标拖动距离直接使用 OCR 原始偏移；
			// 再乘一次显示比例会导致拖动不足，拼图偏左。
			await breakSliderVerify(page, det_slider_el, await getBase64(det_target_src), await getBase64(det_bg_src), {
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

	const errors = await page.evaluate(() =>
		Array.from(document.querySelectorAll('.el-form-item__error, .form-ipt-error.is-visible'))
			.map((e) => (e.textContent || '').trim())
			.filter(Boolean)
	);

	if (errors.length) {
		throw new Error(errors.join('\n'));
	}

	return !!(await page.$('.yidun_popup .yidun_slider, .yidun_popup--light .yidun_slider, .yidun_slider'));
}

/** 智慧树已改为 login.zhihuishu.com 登录中心 */
async function isNotLogin(page: Page) {
	await page.goto('https://www.zhihuishu.com/');
	await page.waitForTimeout(2000);

	const loggedIn = await page.evaluate(() => {
		const el = document.querySelector('#login') as HTMLElement | null;
		return !!el && getComputedStyle(el).display !== 'none';
	});
	if (loggedIn) return false;

	const href = await page.getAttribute('#notLogin a', 'href').catch(() => null);
	await page.goto(href || 'https://login.zhihuishu.com/?origin=zhs');
	await page.waitForTimeout(2000);
	return true;
}
