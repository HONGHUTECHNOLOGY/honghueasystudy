import { SimplifyWorkResult, WorkerEvents, WorkResult } from '@honghu/core';
import { $ui, $message, MessageElement, Script, h, CommonEventEmitter, cors, $elements } from 'easy-us';
import { CommonProject } from '../projects/common';
import { CommonWorkOptions, workPreCheckMessage } from '.';
import { setExtensionAutomation } from './automation-state';

export let globalControlPanel: HTMLElement | null = null;

/**
 * 通用作业考试工具方法
 */
export function commonWork(
	script: Script,
	options: {
		start_delay_seconds?: number;
		enable_control_panel?: boolean;
		/** 没有题库配置也照常开始（平台自带内置题库时用） */
		allowEmptyAnswerer?: boolean;
		workerProvider: (opts: CommonWorkOptions) => CommonEventEmitter<WorkerEvents> | undefined;
		beforeRunning?: () => void | Promise<void>;
		onRestart?: () => void | Promise<void>;
		onWorkerCreated?: (worker: CommonEventEmitter<WorkerEvents>) => void | Promise<void>;
	}
) {
	// 置顶当前脚本
	CommonProject.scripts.render.methods.pin(script);
	let worker: CommonEventEmitter<WorkerEvents> | undefined;

	/**
	 * 是否已经按下了开始按钮
	 */
	let startBtnPressed = false;
	/**
	 * 是否检查失败
	 */
	let checkFailed = false;

	/**
	 * 是否正在运行
	 */
	let running = false;

	/**
	 * 当前运行的序号。
	 *
	 * 「重新答题」会先让旧 worker 停止再创建新 worker，旧 worker 迟到的 done 事件
	 * 不能把新任务刚点亮的流光关掉，所以只有最后一次运行结束才熄灭。
	 */
	let runSeq = 0;

	/** 显示答题控制按钮 */
	const createWorkControlPanel = () => {
		const { controlBtn, restartBtn, startBtn } = createWorkerControl({
			workerProvider: () => worker,
			onStart: async () => {
				startBtnPressed = true;
				if (checkMessage instanceof MessageElement) {
					checkMessage.remove();
				}
				await closeAnswerWrapperEmptyWarning();
				start();
			},
			onRestart: async () => {
				worker?.emit('close');
				await options.onRestart?.();
				start();
			}
		});

		startBtn.style.flex = '1';
		startBtn.style.padding = '4px';
		restartBtn.style.flex = '1';
		restartBtn.style.padding = '4px';
		controlBtn.style.flex = '1';
		controlBtn.style.padding = '4px';

		const container = h(
			'div',
			{ style: { marginTop: '12px', display: 'flex' } },
			running ? [controlBtn, restartBtn] : [startBtn]
		);

		globalControlPanel = container;

		return { container, startBtn, restartBtn, controlBtn };
	};
	const workResultPanel = () => CommonProject.scripts.workResults.methods.createWorkResultsPanel();

	const sync_script = [script];
	if (options.enable_control_panel) {
		sync_script.push(CommonProject.scripts.workResults);
	}

	for (const script of sync_script) {
		script.on('render', () => {
			let gotoSettingsBtnContainer: string | HTMLElement = '';
			if (checkFailed) {
				const gotoSettingsBtn = $ui.button('前往设置题库配置', {
					className: 'base-style-button',
					style: { flex: '1', padding: '4px' }
				});
				gotoSettingsBtn.style.flex = '1';
				gotoSettingsBtn.style.padding = '4px';
				gotoSettingsBtn.onclick = () => {
					CommonProject.scripts.render.methods.pin(CommonProject.scripts.settings);
				};
				gotoSettingsBtnContainer = h('div', { style: { display: 'flex' } }, [gotoSettingsBtn]);
			}

			script.panel?.body?.replaceChildren(
				h('div', { style: { marginTop: '12px' } }, [
					gotoSettingsBtnContainer,
					...(options.enable_control_panel ? [globalControlPanel || createWorkControlPanel().container] : []),
					workResultPanel()
				])
			);
		});
	}

	const workOptions = CommonProject.scripts.settings.methods.getWorkOptions();

	/**
	 * 检查题库是否配置，并询问是否开始答题
	 */
	let checkMessage = workPreCheckMessage({
		allowEmptyAnswerer: options.allowEmptyAnswerer,
		onrun: () => startBtnPressed === false && start(),
		onclose: (_, closedMsg) => (checkMessage = closedMsg),
		onNoAnswererWrappers: () => {
			checkFailed = true;
		},
		...workOptions,
		start_delay_seconds: options.start_delay_seconds
	});

	const start = async () => {
		await options.beforeRunning?.();
		running = true;
		const seq = ++runSeq;
		setExtensionAutomation(true, script.fullName());
		try {
			worker = options.workerProvider(workOptions);
		} catch (e) {
			// 创建 worker 就抛错时不会有 done 事件，必须立刻熄灭，否则光效会一直挂着
			setExtensionAutomation(false, script.fullName());
			throw e;
		}

		if (worker) {
			options.onWorkerCreated?.(worker);
		} else {
			setExtensionAutomation(false, script.fullName());
		}

		const { container, controlBtn } = createWorkControlPanel();
		// 更新状态
		script.panel?.body?.replaceChildren(container, workResultPanel());

		worker?.once('done', () => {
			running = false;
			globalControlPanel = null;
			controlBtn.disabled = true;
			/*
			 * 答题结束必须主动熄灭流光。
			 *
			 * 桌面端按「扩展上报的心跳租约」常显（每 20 秒续租一次），只要脚本不报
			 * active=false，光效就会一直亮着 —— 此前作业/考试答完后脚本已停，边框却还在。
			 */
			if (seq === runSeq) setExtensionAutomation(false, script.fullName());
		});
	};
}

/**
 * 答题控制
 */
export function createWorkerControl(options: {
	workerProvider: () => CommonEventEmitter<WorkerEvents> | undefined;
	onStart: () => void;
	onRestart: () => void;
}) {
	let stop = false;
	let stopMessage: MessageElement | undefined;
	const startBtn = $ui.button('开始答题');
	const restartBtn = $ui.button('重新答题');
	const controlBtn = $ui.button('暂停');

	startBtn.onclick = () => {
		startBtn.remove();
		options.onStart();
	};
	restartBtn.onclick = () => {
		// 重新答题时，清除暂停提示
		stopMessage?.remove();
		options.onRestart();
	};
	controlBtn.onclick = () => {
		stop = !stop;
		const worker = options.workerProvider();
		worker?.emit?.(stop ? 'stop' : 'continuate');
		controlBtn.value = stop ? '继续' : '暂停';
		if (stop) {
			stopMessage = $message.warn({ duration: 0, content: '暂停中...' });
		} else {
			stopMessage?.remove();
		}
	};

	return { startBtn, restartBtn, controlBtn };
}

/**
 * 图片识别，将图片链接追加到 text 中
 * 返回一个克隆的节点
 */
export function optimizationElementWithImage(root: HTMLElement, clone_node: boolean = false): HTMLElement {
	const clone = clone_node ? (root.cloneNode(true) as HTMLElement) : root;
	for (const img of Array.from(clone.querySelectorAll('img'))) {
		// 如果已经存在识别结果，则不处理
		if (
			Array.from(img.parentElement!.querySelectorAll('span')).some(
				(e) => e.style.fontSize === '0px' && e.textContent?.includes(img.src)
			)
		) {
			continue;
		}

		const src = document.createElement('span');
		src.innerText = img.src;
		// 隐藏图片，但不影响 innerText 的获取
		src.style.fontSize = '0px';
		img.after(src);
	}
	return clone;
}

/**
 * 收集题目（题干 + 选项）里的图片地址
 *
 * 题干提取走的是 `innerText`，图片在文字里只是一段 URL；那串地址对模型毫无意义。
 * 这里只负责「有哪些图」，下载、压缩、转 base64 交给宿主注册的解析器
 * （见 `setQuestionImageResolver`），最后以纯文本形式拼回题干。
 *
 * 过滤掉小图标：选项前的对勾、装饰性 png 既占 token 又干扰模型。
 */
export function collectQuestionImages(elements: (HTMLElement | undefined | null)[], limit = 4): string[] {
	const urls: string[] = [];
	for (const el of elements) {
		if (!el) continue;
		for (const img of Array.from(el.querySelectorAll('img'))) {
			/** 和 `optimizationElementWithImage` 注入题干的那段文本保持同一个地址，才能精确删掉 */
			const src = img.src || img.currentSrc || img.getAttribute('data-src') || '';
			if (!src || !/^(https?:|data:image)/i.test(src)) continue;
			/** 没有尺寸信息的图片（公式图常见）一律保留，只过滤明确很小的图标 */
			const w = img.naturalWidth || img.width || 0;
			const h = img.naturalHeight || img.height || 0;
			if (w && h && w <= 32 && h <= 32) continue;
			if (!urls.includes(src)) urls.push(src);
			if (urls.length >= limit) return urls;
		}
	}
	return urls;
}

/**
 * 创建一个不可见的文本节点，追加到图片后面，便于文本获取
 */
export function createUnVisibleTextOfImage(img: HTMLImageElement) {
	const src = document.createElement('span');
	src.innerText = img.src;
	// 隐藏图片，但不影响 innerText 的获取
	src.style.fontSize = '0px';
	img.after(src);
}

/** 将 {@link WorkResult} 转换成 {@link SimplifyWorkResult} */
export function simplifyWorkResult(
	results: WorkResult<any>[],
	/**
	 * 标题处理方法
	 * 在答题时使用相同的处理方法，可以使答题结果显示的题目与搜题的题目保持一致
	 */
	titleTransform?: (title: (HTMLElement | undefined)[], index: number) => string
): SimplifyWorkResult[] {
	const res: SimplifyWorkResult[] = [];
	let i = 0;
	for (const wr of results) {
		const ques =
			titleTransform?.(wr.ctx?.elements.title || [], i) ||
			wr.ctx?.elements.title
				?.map((e) => e?.innerText.trim())
				.filter(Boolean)
				.join('<br>') ||
			'';
		res.push({
			requested: wr.requested,
			resolved: wr.resolved,
			error: wr.error,
			type: wr.ctx?.type,
			question: ques,
			finish: wr.result?.finish,
			searchInfos:
				wr.ctx?.searchInfos.map((sr) => ({
					error: sr.error,
					name: sr.name,
					homepage: sr.homepage,
					results: sr.results.map((ans) => [ans.question, ans.answer, ans.extra_data || {}])
				})) || []
		});
		i++;
	}

	return res;
}

/**
 * 从题目中移除指定的冗余词
 */
export function removeRedundantWords(str: string, words: string[]) {
	for (const word of words.map((w) => w.trim())) {
		str = str.replace(word, '');
	}
	return str;
}

let answererWrapperUnsetMessage: MessageElement | undefined;

export const answerWrapperEmptyWarning = cors.defineTopFunction((duration: number) => {
	const setting = h('button', { className: 'base-style-button-secondary' }, '通用-全局设置');
	setting.onclick = () => {
		CommonProject.scripts.render.methods.pin(CommonProject.scripts.settings);
		setTimeout(() => {
			$elements.root?.querySelector<HTMLElement>('[value="点击配置"]')?.click();
		}, 500);
	};

	/**
	 * 精准提示
	 *
	 * 「填了 AI 配置」和「启用了 AI」是两件事：只有点过「启用」，AI 才会被写成
	 * `AI答题` 条目进 `answererWrappers`，而所有平台的自动答题只看这个数组。
	 * 原来一律提示「你还没设置题库」，用户明明填好了 AI 却被要求去配题库，根本对不上。
	 */
	let content: any[] = ['你还没设置题库，无法自动答题，请切换到 ', setting, ' 页面进行配置。'];
	try {
		const scripts: any = CommonProject.scripts;
		const aiCfg: any = scripts.aiSettings?.cfg || {};
		const cfg: any = scripts.settings?.cfg || {};
		const wrappers: any[] = cfg.answererWrappers || [];
		const hasAiWrapper = wrappers.some((aw) => aw && aw.name === 'AI答题');
		const aiDisabled = (cfg.disabledAnswererWrapperNames || []).includes('AI答题');
		const aiFilled = !!(aiCfg.aiEndpoint && aiCfg.aiApiKey && aiCfg.aiModel);

		if (aiFilled && !hasAiWrapper) {
			const aiBtn = h('button', { className: 'base-style-button-secondary' }, 'AI 答题配置');
			aiBtn.onclick = () => CommonProject.scripts.render.methods.pin(CommonProject.scripts.aiSettings);
			content = ['AI 配置已经填好，但还没点「启用」，所以无法自动答题。请到 ', aiBtn, ' 页面点击「启用」。'];
		} else if (hasAiWrapper && aiDisabled) {
			content = ['AI 答题被「禁用」了，无法自动答题。请到 ', setting, ' 的题库列表里取消禁用。'];
		}
	} catch (err) {
		// 读配置失败就沿用默认文案，提示本身不能把流程打断
		console.log('生成题库未配置提示失败', err);
	}

	answererWrapperUnsetMessage?.remove();
	answererWrapperUnsetMessage = $message.warn({
		content: h('span', {}, content),
		duration: duration
	});
});

export const closeAnswerWrapperEmptyWarning = cors.defineTopFunction(() => {
	answererWrapperUnsetMessage?.remove();
	answererWrapperUnsetMessage = undefined;
});
