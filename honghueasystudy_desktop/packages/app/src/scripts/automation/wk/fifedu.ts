import type { Page } from 'playwright-core';
import { AutomationScript } from '../../script';
import { slowType } from '../../utils';

/** 统一登录入口，service 指回学习空间，登录成功后会直接跳回去 */
const LOGIN_URL =
	'https://www.fifedu.com/iplat/fifLogin/index.html?service=https%3A%2F%2Ficourse.fifedu.com%2FhomePage%3Fislogin%3Dtrue';

/**
 * 讯飞智慧课程平台 · 账号登录
 *
 * 登录页 https://www.fifedu.com/iplat/fifLogin 的「账号登录」tab 只有两个输入框：
 * `input[name=user]`（占位「请输入学校简称+学工号」）与 `#passWord`。
 * 账号在平台上就是「学校简称 + 学号」拼成的一串，所以这里给两种填法：
 *
 *   · 用户名密码（默认）：直接把完整账号填进用户名，原样提交，不查任何东西；
 *   · 学校 + 学号 + 密码：学校填全称/简称，脚本去页面右上「查询学校简称」浮层换成简称再拼接。
 *
 * 平台没有手机号+密码的登录方式（手机号 tab 只能用短信验证码），因此不提供手机登录。
 */
export const FIFLoginScript = new AutomationScript(
	{
		mode: {
			label: '登录方式',
			value: 'password',
			type: 'select',
			options: [
				{ label: '用户名 + 密码', value: 'password' },
				{ label: '学校 + 学号 + 密码', value: 'school' }
			]
		},
		account: {
			label: '用户名',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入用户名',
			/** 只在用户名模式下出现：密码模式下这一项就是完整账号，原样提交 */
			showIf: { key: 'mode', value: 'password' }
		},
		school: {
			label: '学校/机构',
			value: '',
			type: 'text',
			required: true,
			placeholder: '学校简称或学校全称',
			showIf: { key: 'mode', value: 'school' }
		},
		id: {
			label: '学号/工号',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入学号/工号',
			showIf: { key: 'mode', value: 'school' }
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
		name: '讯飞智慧课程-账号密码登录',
		icon: 'https://icourse.fifedu.com/',
		/** 旧名字：已经配好的「学校机构登录」条目还能直接跑，打开面板时会被改回新名字 */
		aliases: ['讯飞智慧课程-学校机构登录'],
		async run(page, configs) {
			try {
				if (!(await isNotLogin(page))) return;

				await openLogin(page);

				const mode = resolveMode(configs);
				const user =
					mode === 'school'
						? buildAccount(await resolveSchoolAbbr(page, configs.school), configs.id)
						: String(configs.account || '').trim();

				if (!user) throw new Error('请填写用户名');

				await page.fill('input[name="user"]', '');
				await slowType(page, 'input[name="user"]', user);

				const passSelector = (await page.$('#passWord')) ? '#passWord' : 'input[name="pass"]';
				await page.fill(passSelector, '');
				await slowType(page, passSelector, configs.password);

				await submit(page);
				await finish(page, mode === 'school' ? '登录失败，请检查学校、学号与密码' : '登录失败，请检查用户名与密码');
			} catch (err) {
				FIFLoginScript.emit('script-error', String(err instanceof Error ? err.message : err));
			}
		}
	}
);

/**
 * 这次按哪种方式登录
 *
 * 老配置（脚本还叫「学校机构登录」时存的）没有 `mode` 字段，归一化会补成默认的 password，
 * 但那种配置里账号是空的、学校是有值的——直接按学校模式跑，用户不用为了脚本改版重填一遍。
 */
function resolveMode(configs: Record<string, any>): 'password' | 'school' {
	if (configs.mode === 'school') return 'school';

	const account = String(configs.account || '').trim();
	const school = String(configs.school || '').trim();
	if (!account && school) {
		FIFLoginScript.emit('script-data', '[讯飞] 用户名未填、学校有值，按「学校 + 学号」登录');
		return 'school';
	}
	return 'password';
}

/** 打开登录页并等表单渲染出来 */
async function openLogin(page: Page) {
	await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('input[name="user"]', { timeout: 20000 });
	await page.waitForTimeout(800);
}

/** 是否未登录：首页右上角有「登录」按钮就是没登录 */
async function isNotLogin(page: Page) {
	await page.goto('https://icourse.fifedu.com/homePage');
	await page.waitForTimeout(2500);
	return page.evaluate(() => Boolean(document.querySelector('a.btn.login')));
}

function leftLoginPage(page: Page) {
	const url = page.url();
	return url.includes('icourse.fifedu.com') && !url.includes('fifLogin');
}

/**
 * 学校 → 学校简称
 *
 * 平台右上角「查询学校简称」浮层：输入学校全称，结果项形如
 * `<li><span>学校名</span><span id="copyText-{简称}">{简称}</span></li>`。
 * 已经填的是简称（纯字母）就直接用，不再走查询。
 */
async function resolveSchoolAbbr(page: Page, school: string) {
	const raw = (school || '').trim();
	if (!raw) throw new Error('请填写学校简称或学校全称');
	// 纯字母/数字视为已经是简称
	if (/^[A-Za-z][A-Za-z0-9]{1,15}$/.test(raw)) return raw;

	try {
		await page.getByText('查询学校简称', { exact: true }).first().click({ timeout: 8000 });
		const input = await page.waitForSelector('input[placeholder="输入学校名称"]', { timeout: 8000 });
		await input.click();
		await input.fill('');
		await input.type(raw, { delay: 60 });

		let items: { name: string; abbr: string }[] = [];
		for (let i = 0; i < 16; i++) {
			await page.waitForTimeout(500);
			items = await page.evaluate(() => {
				return Array.from(document.querySelectorAll('.sear_list li'))
					.map((li) => {
						const nameEl = li.querySelector('span');
						const abbrEl = li.querySelector('[id^="copyText-"]');
						return {
							name: (nameEl?.textContent || '').trim(),
							abbr: abbrEl ? (abbrEl.id || '').replace('copyText-', '') : ''
						};
					})
					.filter((o) => o.abbr);
			});
			if (items.length) break;
		}

		if (!items.length) throw new Error(`没查到「${raw}」对应的学校简称，请确认学校名称，或直接填写学校简称`);

		const exact = items.find((o) => o.name === raw) || items[0];
		return exact.abbr;
	} finally {
		// 关掉查询浮层，别挡住登录表单
		await page
			.locator('.off_box')
			.first()
			.click({ timeout: 3000 })
			.catch(async () => {
				await page.keyboard.press('Escape').catch(() => {});
			});
		await page.waitForTimeout(500);
	}
}

/** 学校简称 + 学号；如果学号里已经带了简称就不重复拼 */
function buildAccount(abbr: string, id: string) {
	const account = (id || '').trim();
	if (!account) return abbr;
	if (account.toLowerCase().startsWith(abbr.toLowerCase())) return account;
	return `${abbr}${account}`;
}

/** 点登录按钮（页面上「登录」「注册」都是 button.cursor_p，按文字挑） */
async function submit(page: Page) {
	await page.locator('button.cursor_p', { hasText: '登录' }).first().click();
}

/** 等登录结果：离开登录页即成功，否则把页面上的报错抛出来 */
async function finish(page: Page, fallback: string) {
	const ok = await waitLogin(page);
	if (ok) return;

	if (await hasImageCaptcha(page)) {
		throw new Error('登录需要图片验证码，请手动登录一次后再使用自动登录');
	}
	const error = await readError(page);
	throw new Error(error || fallback);
}

/** 等待离开登录页 */
async function waitLogin(page: Page, timeout = 30000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (leftLoginPage(page)) {
			// 再等页面骨架渲染，避免后续操作打空
			await page.waitForTimeout(2000);
			return true;
		}
		await page.waitForTimeout(500);
	}
	return false;
}

/** 账号登录被要求填图形验证码时，`#verCode` 会露出来 */
async function hasImageCaptcha(page: Page) {
	if (!page.url().includes('fifLogin')) return false;
	return page.evaluate(() => {
		const el = document.querySelector<HTMLInputElement>('#verCode');
		if (!el || el.offsetParent === null) return false;
		return true;
	});
}

/** 读取登录页上的报错文案（ElementUI 的 el-message / 表单校验提示） */
async function readError(page: Page) {
	return page.evaluate(() => {
		const texts = Array.from(
			document.querySelectorAll<HTMLElement>('.el-message, .el-form-item__error, .error-tip, .tips')
		)
			.map((el) => (el.textContent || '').trim())
			.filter(Boolean);
		return texts.join('；');
	});
}
