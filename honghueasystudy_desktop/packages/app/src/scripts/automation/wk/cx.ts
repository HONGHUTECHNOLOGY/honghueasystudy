import type { Page } from 'playwright-core';
import { breakSliderVerify, breakVerifyCode, getBase64, slowType } from '../../utils';
import { AutomationScript } from '../../script';

export const CXUnitLoginScript = new AutomationScript(
	{
		unit: {
			label: '学校/单位',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入学校/单位名称'
		},
		id: {
			label: '学号/工号',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入学号/工号'
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
		name: '超星-学校机构登录',
		icon: 'https://www.chaoxing.com/',
		async run(
			page,
			configs,
			options?: {
				ocrApiUrl?: string;
				ocrApiImageKey?: string;
				detTargetKey?: string;
				detBackgroundKey?: string;
			}
		) {
			try {
				if (await isNotLogin(page)) {
					/**
					 * 新版页面（`newversion=true`）默认就是「机构账号登录」，`#otherlogin` 已经不存在；
					 * 旧版才需要先点一下「其他登录」。所以按输入框是否可见来判断，不要盲点。
					 */
					const unitInput = page.locator('#inputunitname');
					if (!(await unitInput.isVisible().catch(() => false))) {
						await page.click('#otherlogin', { timeout: 5000 }).catch(() => {});
						await page.waitForTimeout(2000);
					}

					/**
					 * 学校名照填就行，**不需要选列表、也不需要匹配 fid**
					 *
					 * 新版页面就是个普通输入框，用户手动也是直接敲学校名然后填学号密码，
					 * `fid` 一直是 -1 也能登录（服务端按学号归属匹配学校）。
					 * 之前那套「查接口拿 fid + 调 selectSchool」纯属多余，还会因为
					 * `/api/getcasurl` 失败而静默不生效，反而把简单流程搞坏。
					 */
					await slowType(page, '#inputunitname', configs.unit);
					await page.fill('#uname', configs.id);
					await page.fill('#password', configs.password);

					await login(page, options);
				}
			} catch (err) {
				CXUnitLoginScript.emit('script-error', String(err));
			}
		}
	}
);

export const CXPhoneLoginScript = new AutomationScript(
	{
		phone: {
			label: '手机号',
			value: '',
			type: 'text',
			required: true,
			placeholder: '请输入手机号'
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
		name: '超星-手机密码登录',
		/**
		 * 推荐用手机号登录
		 *
		 * 机构登录现在会弹「文字点选」验证码（请依次点击 X Y Z），本地 ddddocr 拿不到文字坐标，
		 * 只能人工过；手机密码登录走的是短信校验的路子，不卡点选验证码。
		 */
		recommend: true,
		icon: 'https://www.chaoxing.com/',
		async run(page, configs) {
			try {
				if (await isNotLogin(page)) {
					await page.fill('#phone', configs.phone);
					await page.fill('#pwd', configs.password);

					await login(page);
				}
			} catch (err) {
				CXPhoneLoginScript.emit('script-error', String(err));
			}
		}
	}
);

function login(
	page: Page,
	opts?: {
		ocrApiUrl?: string;
		ocrApiImageKey?: string;
		detTargetKey?: string;
		detBackgroundKey?: string;
	}
) {
	return new Promise<void>((resolve, reject) => {
		// 监听登录状态
		const listenerLogin = (page: Page) => {
			// 登录成功
			if (page.url().includes('/space/index') || page.url().includes('/base')) {
				page.off('load', listenerLogin);
				clearTimeout(timeout);
				resolve();
			}
		};

		/**
		 * 登录超时
		 *
		 * 点选验证码环节要留给用户手动操作的时间，60 秒不够（读提示、找字、点三下）。
		 * 收到 3 分钟：脚本会一直等验证码消失，超时才报错。
		 */
		const timeout = setTimeout(() => {
			reject(new Error('登录超时,请重试。'));
		}, 180 * 1000);

		/** 先定义 timeout 再注册监听：回调里要用到它，反过来写会踩 const 的暂时性死区 */
		page.on('load', listenerLogin);

		// 重试5次
		let tryCount = 5;
		/** 登录按钮只点一次：验证码是点完才弹的，重复点会反复提交 */
		let loginClicked = false;
		// 尝试登录
		const tryLogin = async () => {
			tryCount--;

			/**
			 * 先点一次「登录」
			 *
			 * 以前只有滑块分支（`tryCount === 4`）里才点，点选/无验证码场景下永远不点，
			 * 表单填完就停在那里 —— 用户看到的现象就是「填完了但不点登录」。
			 */
			if (!loginClicked) {
				loginClicked = true;

				/**
				 * 勾「下次自动登录」
				 *
				 * 必须**先勾、再点登录**：验证码是点登录之后才弹的，那时候弹窗会盖住这块区域，
				 * 再想点就是 30 秒超时（实测）。
				 *
				 * 要点 `.check-input`（14×14 的勾选框），**不是**旁边的文字 `.auto-lg-next` ——
				 * 文字那行没绑点击事件，点上去 class 和 cookie 都不变（实测）。
				 * 勾上后 `.check-input` 变成 `check-input checked-input`，cookie `retainlogin` 从 2 变 1。
				 */
				const checkBox = page.locator('.check-input');
				if (await checkBox.isVisible().catch(() => false)) {
					/** 已经是勾选态就别再点，这是个 toggle，第二下会取消 */
					const checked = await checkBox
						.evaluate((el) => el.classList.contains('checked-input'))
						.catch(() => false);
					if (!checked) {
						await checkBox.click({ timeout: 5000 }).catch((e) => {
							console.warn('[自动化] 勾选「下次自动登录」失败：' + String(e).slice(0, 60));
						});
						await page.waitForTimeout(400);
					}
				}

				await page.click('#loginBtn', { timeout: 10000 }).catch((e) => {
					console.warn('[自动化] 点击登录按钮失败：' + String(e).slice(0, 80));
				});
				await page.waitForTimeout(2500);
			}

			const area = await page.$('#numVerCode');
			const codeInput = await page.$('#vercode');
			if (area && codeInput) {
				/** 破解验证码 */
				if (opts?.ocrApiUrl && opts?.ocrApiImageKey && area) {
					await breakVerifyCode(page, area, codeInput, {
						ocrApiUrl: opts.ocrApiUrl,
						ocrApiImageKey: opts.ocrApiImageKey
					});
				}

				// 点击登录
				await page.click('#loginBtn');
				await page.waitForTimeout(3000);
			}

			// 2024年新增-滑块验证码
			const captchaEl = await page.$('#captcha');
			if (captchaEl) {
				/**
				 * 先分辨是「滑块」还是「文字点选」
				 *
				 * 超星现在会给文字点选（提示「请依次点击 X Y Z」，背景图上有彩色字）。
				 * 这种验证码要文字检测 + 坐标 + 顺序，本地的 ddddocr 只能识别 4 位字符和滑块缺口，
				 * 拿不到「某个字在图上什么位置」。以前会走滑块分支，算出的缺口坐标对不上任何文字，
				 * 白点几次后报「验证超时」—— 用户完全不知道发生了什么。
				 *
				 * 所以这里直接认出来、抛明确错误，交给 worker 提示用户手动完成。
				 */
				const captchaKind = await page
					.evaluate(() => {
						const tip = (document.querySelector('.cx_tip_text')?.textContent || '').trim();
						const drag = document.querySelector('.cx_imgDrag') as HTMLImageElement | null;
						return { tip, hasSlideImg: !!(drag && drag.src) };
					})
					.catch(() => ({ tip: '', hasSlideImg: false }));

				/**
				 * 只按提示文案判断，**不要看 `.cx_imgDrag` 有没有 src**
				 *
				 * 点选页面上那个 `<img class="cx_imgDrag">` 同样带着 src（实测非空），
				 * 用它区分点选/滑块会全部判成滑块，点选永远走不到这里。
				 * "请依次点击 X Y Z" 是点选独有的文案，够用。
				 */
				if (/依次点击/.test(captchaKind.tip)) {
					const tip = captchaKind.tip;
					console.warn(`[自动化] 超星文字点选验证码，等待手动完成：「${tip}」`);
					/**
					 * 通知用户，但**不中断登录流程**
					 *
					 * 点完文字后超星会自动提交并跳转，`listenerLogin` 会接住登录成功。
					 * 所以这里只需要等验证码消失，不用自己点登录。
					 *
					 * 以前是直接静默等 60 秒再报「登录超时,请重试。」——
					 * 用户完全不知道要先去点验证码，这就是「验证码出来没反应」。
					 */
					CXUnitLoginScript.emit(
						'script-error',
						`遇到文字点选验证码（${tip}），请在页面上手动点击图中文字，并勾选「下次自动登录」。完成后会自动继续登录。`
					);
					await page
						.waitForFunction(
							() => {
								const cap = document.querySelector('#captcha');
								if (!cap) return true;
								const st = getComputedStyle(cap);
								return st.display === 'none' || st.visibility === 'hidden';
							},
							{},
							{ timeout: 170 * 1000 }
						)
						.catch(() => {});
					return;
				}

				// 先登录才会出现验证码
				if (tryCount === 4) {
					await page.click('#loginBtn');
					await page.waitForTimeout(3000);
				}

				/** 破解验证码 */
				if (opts?.ocrApiUrl && opts?.detBackgroundKey && opts?.detTargetKey) {
					if (tryCount === 4) {
						await page.waitForFunction(
							() => document.querySelector<HTMLDivElement>('.u-opacity')?.style.display === 'block',
							{},
							{ timeout: 10 * 1000 }
						);
					}

					// 删除遮挡
					await page.evaluate(() => document.querySelectorAll('.u-opacity').forEach((el) => el.remove()));

					const det_target_el = await page.$('.cx_imgBtn > img');
					const det_slider_el = await page.$('.cx_rightBtn');
					const src = await det_target_el?.getAttribute('src');

					if (det_slider_el && src) {
						// 传 page：图片地址可能带会话校验，独立下载会被服务端回 400
						const target_base64 = await getBase64(src, page);
						// 隐藏拼图，要不然会影响算法
						await page.evaluate(() =>
							document.querySelector<HTMLDivElement>('.cx_imgBtn')?.style.setProperty('display', 'none')
						);
						const det_bg_base64 = await page.$('#cx_obstacle_canvas').then((el) => el?.screenshot());
						if (det_bg_base64) {
							await breakSliderVerify(page, det_slider_el, target_base64, det_bg_base64.toString('base64'), {
								ocrApiUrl: opts.ocrApiUrl,
								detTargetKey: opts.detTargetKey,
								detBackgroundKey: opts.detBackgroundKey,
								offset: 25
							});
						}

						// 显示拼图
						await page.evaluate(() =>
							document.querySelector<HTMLDivElement>('.cx_imgBtn')?.style.setProperty('display', 'block')
						);
					}
				}
				try {
					const captcha = await page.$('#captcha');
					if (captcha && (await captcha.isVisible())) {
						if (tryCount === 0) {
							clearTimeout(timeout);
							throw new Error('滑动验证失败，请尝试手动处理。');
						} else {
							console.log('tryLogin');
							await tryLogin();
						}
					}
				} catch (e) {
					console.log(e);
					await tryLogin();
				}
			}

			// 检测错误
			const vercodeMsg = await page.evaluate(() =>
				Array.from(document.querySelectorAll('#vercodeMsg.err-txt'))
					.map((e) => e.textContent?.trim() || '')
					.filter(Boolean)
			);

			const errors = await page.evaluate(() =>
				Array.from(document.querySelectorAll('.err-txt,.err-tip'))
					.map((e) => e.textContent?.trim() || '')
					.filter(Boolean)
			);

			if (vercodeMsg.concat(errors).some((str) => str.includes('验证码'))) {
				if (tryCount === 0) {
					clearTimeout(timeout);
					throw new Error(vercodeMsg.join('\n').trim() + '，请尝试手动输入。');
				} else {
					await tryLogin();
				}
			} else if (errors.length) {
				clearTimeout(timeout);
				throw new Error(errors.join('\n').trim());
			} else {
				/**
				 * 这里必须 resolve
				 *
				 * 之前只 `clearTimeout` 不 settle，Promise 永久 pending：
				 * 脚本看起来「跑完了但什么都没发生」，日志里也一个字都没有 ——
				 * 验证码弹着、表单填好了，然后无声无息地挂死。
				 */
				clearTimeout(timeout);
				resolve();
			}
		};

		tryLogin().catch(reject);
	});
}

async function isNotLogin(page: Page) {
	// 不能使用 https ，这里如果使用 https 在登录后会导致某些同学的课程无法访问
	await page.goto('http://i.chaoxing.com/');
	await page.waitForTimeout(2000);

	return page.url().includes('passport2.chaoxing.com');
}
