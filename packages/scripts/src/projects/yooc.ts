import { CommonEventEmitter, Project, Script, $, $message, $ui } from 'easy-us';
import {
	createDefaultQuestionResolver,
	defaultAnswerWrapperHandler,
	SearchInformation,
	WorkerEvents,
	WorkResult
} from '@honghu/core';
import { CommonProject } from './common';
import { $console } from './background';
import { CommonWorkOptions } from '../utils';
import { commonWork, simplifyWorkResult } from '../utils/work';
import { trustedPointerClick } from '../utils/safe-click';
import { waitFor, waitForElement } from '../utils/study';
import YOOC_BANK from './yooc-bank.json';
import {
	buildBankIndex,
	findBankEntry as findBankEntryIn,
	normalizeOptionText,
	pickAnswerTexts,
	type YoocBankEntry as BankEntry
} from './yooc-bank-match';

/**
 * 易班优课（exam.yooc.me）
 *
 * 该平台考试页是 React 单页应用，**整卷题目不会同时渲染**，一次只显示一题，
 * 需要逐题「读题 → 搜答案 → 点选项 → 下一题」。
 *
 * 关键约定（均为实测结论，改动前请先复核页面）：
 * - 整卷数据挂在 React 容器的 fiber `memoizedProps.paper` 上，含题型、题干、选项与 section 分组；
 * - 服务端在考试进行中不下发答案（`subject.answer` 是统一占位密文），只能靠题库 / AI；
 * - 选项没有 input，选中态是 `li` 上的 `_c` 类；点击必须派发真实鼠标事件序列；
 * - 界面选项顺序与 paper 中的顺序**不同**（前端固定置换），因此一律以 DOM 实际顺序为准，
 *   由解析器返回的 option 元素直接点击，不按索引推算；
 * - 单选题再次点击同一选项不会取消，点其它选项会替换；多选题可多选、可取消。
 */

/** 易班题目结构（来自 React props.paper） */
type YoocSubject = {
	subjectId: number;
	type: string;
	points: string;
	inputs: string;
	title: string[];
	option: string[][];
	extra_img?: string[][];
};

type YoocSection = {
	sectionId: number;
	sectionName: string;
	subjects: YoocSubject[];
};

/** 选项选中态 class */
const CHOSEN_CLASS = '_c';

/**
 * 题库条目（结构见 `yooc-bank-match.ts`）：**只存题干 + 正确选项文本，不存选项集合**。
 *
 * 易班每场都会洗牌选项顺序、还可能随机增删干扰项，只有答案文本稳定；
 * 干扰项永远不会出现在答案池里，因此天然不会被误选。
 */
export type YoocBankEntry = BankEntry;

/** 内置题库，由 `scripts/collect-yooc-bank.js` 交卷后从 `answer/get` 抓取生成 */
const YOOC_BANK_ITEMS: YoocBankEntry[] = (((YOOC_BANK as any)?.items || []) as YoocBankEntry[]).filter(
	(it) => it && (it.q || it.stem) && ((it.versions || []).length || (it.all || []).length)
);

const BANK_INDEX = buildBankIndex(YOOC_BANK_ITEMS);

/** 查题库（精确优先，容忍少量题干差异） */
function findBankEntry(title: string) {
	return findBankEntryIn(BANK_INDEX, YOOC_BANK_ITEMS, title);
}

/**
 * 在页面选项里定位题库答案对应的元素。
 *
 * 只依赖题干与正确选项文本：干扰项不在答案池里，因此天然不会被选中。
 * 具体策略（全选池 → 精确版本 → 软匹配）见 `yooc-bank-match.ts`。
 */
function pickOptionElements(entry: YoocBankEntry, optionElements: HTMLElement[]) {
	const picked = pickAnswerTexts(
		entry,
		optionElements.map((el) => el.innerText || '')
	);
	const els = picked.indices.map((i) => optionElements[i]).filter(Boolean) as HTMLElement[];
	return { elements: els, reason: picked.reason, score: picked.score };
}

/** 考试页选项元素（底部翻页按钮同样是 li，用 button 排除） */
function queryOptionElements(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('main li')).filter((li) => {
		if (li.querySelector('button')) return false;
		const text = (li.innerText || '').trim();
		return /^[A-Z][.、．]/.test(text) || !!li.querySelector('.icon');
	});
}

function isChosen(el: HTMLElement) {
	return el.classList.contains(CHOSEN_CLASS);
}

/** 当前题号，形如 `12 / 100` */
function readPosition(): { index: number; total: number } | undefined {
	for (const span of Array.from(document.querySelectorAll('main span'))) {
		const matched = (span.textContent || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
		if (matched) return { index: Number(matched[1]), total: Number(matched[2]) };
	}
	return undefined;
}

function findButton(text: string | RegExp): HTMLButtonElement | undefined {
	return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((btn) => {
		if (btn.disabled) return false;
		const label = (btn.innerText || '').replace(/\s+/g, ' ').trim();
		return typeof text === 'string' ? label === text : text.test(label);
	});
}

/**
 * 从 React fiber 中取出整卷数据
 *
 * React 把内部 fiber 挂在容器节点的 `__reactContainer$xxx` 自有属性上，
 * 脚本运行在 MAIN world 所以可以直接读取。取不到时返回 undefined，
 * 调用方需退回纯 DOM 模式（此时题型只能靠选项特征猜测）。
 */
function readPaper(): YoocSection[] | undefined {
	const root = document.querySelector('#root');
	if (!root) return undefined;

	const containerKey = Object.keys(root).find((k) => k.startsWith('__reactContainer'));
	const fiberKey = containerKey || Object.keys(root).find((k) => k.startsWith('__reactFiber'));
	if (!fiberKey) return undefined;

	const seen = new Set<unknown>();
	let paper: YoocSection[] | undefined;
	let visited = 0;

	const walk = (fiber: any) => {
		if (!fiber || seen.has(fiber) || paper || visited > 4000) return;
		seen.add(fiber);
		visited++;

		const props = fiber.memoizedProps;
		if (props && typeof props === 'object' && Array.isArray(props.paper) && props.paper.length) {
			const first = props.paper[0];
			if (first && Array.isArray(first.subjects) && first.subjects.length) {
				paper = props.paper as YoocSection[];
				return;
			}
		}

		walk(fiber.child);
		walk(fiber.sibling);
	};

	walk((root as any)[fiberKey]);
	return paper;
}

function countSubjects(paper: YoocSection[]) {
	return paper.reduce((sum, section) => sum + section.subjects.length, 0);
}

/** 按整卷顺序（从 0 开始）取题目 */
function getSubjectByIndex(paper: YoocSection[], index: number): YoocSubject | undefined {
	let cursor = 0;
	for (const section of paper) {
		if (index < cursor + section.subjects.length) {
			return section.subjects[index - cursor];
		}
		cursor += section.subjects.length;
	}
	return undefined;
}

/** 题目文本：题干 + 题图地址 */
function buildTitle(subject: YoocSubject): string {
	const parts = subject.title.map((t) => String(t ?? '').trim()).filter(Boolean);
	const images = (subject.extra_img || []).flat().filter(Boolean);
	if (images.length) parts.push(images.join('\n'));
	return parts.join('\n');
}

/** 把易班题型映射到解析器类型（判断题由 single 解析器内部自动识别） */
function toResolverType(subject: YoocSubject | undefined) {
	if (!subject) return 'single';
	if (subject.type === 'multiplechoice') return 'multiple';
	if (subject.type === 'completion') return 'completion';
	return 'single';
}

/** 只渲染了一题，题干从 DOM 兜底提取（去掉 "1、[1分]" 前缀） */
function readDomTitle(): string {
	const heading = document.querySelector<HTMLElement>('main h3, main h2');
	if (!heading) return '';
	const clone = heading.cloneNode(true) as HTMLElement;
	// 去掉题号与分值 `1、[1分]`
	clone.querySelectorAll('span').forEach((span) => {
		if (/^[\d、.]*\s*\[.*分\]\s*$/.test((span.textContent || '').trim())) span.remove();
	});
	return (clone.innerText || '').replace(/\s+/g, ' ').trim();
}

async function waitIfStopped(isStop: () => boolean, isClose: () => boolean) {
	while (isStop() && !isClose()) {
		await $.sleep(300);
	}
}

class YoocExamWorker extends CommonEventEmitter<WorkerEvents> {
	isClose = false;
	isStop = false;

	constructor(
		private readonly options: CommonWorkOptions & {
			autoSubmit: boolean;
			skipAnswered: boolean;
			/** 学生手册题库开关：关闭后全部题目走 AI / 题库接口 */
			useBank: boolean;
		}
	) {
		super();
		this.once('close', () => (this.isClose = true));
		this.on('stop', () => (this.isStop = true));
		this.on('continuate', () => (this.isStop = false));
	}

	async doWork() {
		try {
			await this.run();
		} catch (e) {
			$console.error(e);
			$message.error({
				content: '易班自动答题出错：' + (e instanceof Error ? e.message : String(e)),
				duration: 0
			});
		} finally {
			this.emit('done');
		}
	}

	/** 等待页面真正切到目标题号，避免点到上一题的选项 */
	private async waitForPosition(target: number, timeoutMs = 6000) {
		return waitFor(() => readPosition()?.index === target, { timeout_seconds: timeoutMs / 1000, check_period_ms: 120 });
	}

	/** 逐步翻页到指定题号 */
	private async gotoIndex(target: number) {
		let stuck = 0;
		for (let guard = 0; guard < 300; guard++) {
			if (this.isClose) return false;
			if (this.isStop) {
				await waitIfStopped(() => this.isStop, () => this.isClose);
				continue;
			}

			const pos = readPosition();
			if (!pos) return false;
			if (pos.index === target) return true;

			const forward = pos.index < target;
			const btn = findButton(forward ? '下一题' : '上一题');
			if (!btn) return false;

			btn.click();
			const next = pos.index + (forward ? 1 : -1);
			const arrived = await this.waitForPosition(next, 3000);
			// 连续点不动说明翻页按钮被遮挡或失效，直接放弃而不是空转到超时
			if (arrived) {
				stuck = 0;
			} else if (++stuck >= 3) {
				$console.warn(`[易班] 翻页无响应（目标第 ${target} 题，当前第 ${pos.index} 题）`);
				return false;
			}
		}
		return false;
	}

	/** 点击选项，直到它真的变成期望的选中态 */
	private async setOption(el: HTMLElement, wanted: boolean) {
		if (isChosen(el) === wanted) return true;
		for (let attempt = 0; attempt < 3; attempt++) {
			if (this.isClose) return false;
			try {
				el.scrollIntoView({ block: 'center', inline: 'nearest' });
				await $.sleep(80);
				trustedPointerClick(el);
				await $.sleep(200);
			} catch (e) {
				// 单次点击失败不中断流程，交给下一次重试
			}
			if (isChosen(el) === wanted) return true;
		}
		return isChosen(el) === wanted;
	}

	/** 搜题：优先命中本地缓存 */
	private async search(subject: YoocSubject | undefined, title: string, options: HTMLElement[], type: string) {
		const optionText = type === 'completion' ? '' : options.map((el) => el.innerText).join('\n');
		return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
			await $.sleep((this.options.period ?? 3) * 1000);
			return defaultAnswerWrapperHandler(this.options.answererWrappers, { type, title, options: optionText });
		});
	}

	/**
	 * 读取整卷数据
	 *
	 * 页面的 `main` 会比 React 挂载 fiber 早出现，刚进页面时可能还取不到 paper，
	 * 所以短时间内多次重试；仍取不到则退回 DOM 模式。
	 */
	private async readPaperWithRetry() {
		for (let i = 0; i < 10; i++) {
			const paper = readPaper();
			if (paper) return paper;
			await $.sleep(300);
		}
		return undefined;
	}

	private async run() {
		$message.info({ content: '正在读取易班试卷...' });

		await waitForElement('main', { timeout_seconds: 30 });
		await waitFor(() => readPosition() !== undefined, { timeout_seconds: 15, check_period_ms: 200 });

		const paper = await this.readPaperWithRetry();
		const position = readPosition();
		const total = paper ? countSubjects(paper) : position?.total ?? 0;

		if (!total) {
			throw new Error('未读取到题目，请确认当前处于考试答题界面（地址含 /take）');
		}

		$console.log(
			`[易班] 试卷共 ${total} 题${paper ? `，分组：${paper.map((s) => `${s.sectionName || '未命名'}(${s.subjects.length})`).join(' / ')}` : '（未取到整卷数据，按 DOM 逐题作答）'}`
		);
		$console.log(
			this.options.useBank
				? `[易班] 学生手册题库：已启用（内置 ${YOOC_BANK_ITEMS.length} 题），未命中的题目才走 AI`
				: '[易班] 学生手册题库：已关闭，全部题目走 AI / 题库接口'
		);

		const separators = this.options.answerSeparators.split(',').map((s) => s.trim());
		const resolver = createDefaultQuestionResolver({
			root: document.body,
			elements: {},
			searchInfos: [],
			type: 'single',
			answerSeparators: separators
		});

		// 从第一题开始，保证「题号 ↔ 试卷序号」一一对应
		if ((readPosition()?.index ?? 1) !== 1) {
			$console.log('[易班] 正在回到第一题...');
			await this.gotoIndex(1);
		}

		const results: WorkResult<any>[] = [];
		const missing: number[] = [];
		let answered = 0;
		let bankHits = 0;

		for (let i = 0; i < total; i++) {
			if (this.isClose) {
				$console.log('[易班] 已手动关闭答题');
				return;
			}
			await waitIfStopped(() => this.isStop, () => this.isClose);
			if (this.isClose) return;

			const pageIndex = i + 1;
			const current = readPosition();
			if (!current || current.index !== pageIndex) {
				const moved = await this.gotoIndex(pageIndex);
				if (!moved) {
					$console.warn(`[易班] 无法切换到第 ${pageIndex} 题，停止答题`);
					missing.push(pageIndex);
					break;
				}
			}

			const optionElements = queryOptionElements();
			const subject = paper ? getSubjectByIndex(paper, i) : undefined;
			const type = toResolverType(subject);
			const title = subject ? buildTitle(subject) : readDomTitle();

			// 结果面板依据 title 元素展示题目，这里包一层承载题干文本
			const titleElement = document.createElement('div');
			titleElement.innerText = title;

			const record: WorkResult<any> = {
				requested: false,
				resolved: false,
				ctx: {
					root: document.body,
					elements: { title: [titleElement], options: optionElements },
					searchInfos: [],
					type: type as any
				}
			};
			results[i] = record;

			if (!title) {
				$console.warn(`[易班] 第 ${pageIndex} 题题干为空，跳过`);
				missing.push(pageIndex);
				record.error = '题干为空';
				if (pageIndex < total) await this.gotoIndex(pageIndex + 1);
				continue;
			}

			const alreadyAnswered = optionElements.some(isChosen);
			if (alreadyAnswered && this.options.skipAnswered) {
				answered++;
				record.result = { finish: true };
				record.resolved = true;
				record.requested = true;
				$console.log(`[易班] 第 ${pageIndex} 题已有答案，跳过`);
				if (pageIndex < total) await this.gotoIndex(pageIndex + 1);
				continue;
			}

			$console.log(`[易班] 第 ${pageIndex}/${total} 题：${title.slice(0, 40)}`);

			// 题库优先：命中后直接按「正确答案文本」点选，不再发搜索请求
			// 开关关闭时完全跳过题库，全部交给 AI / 题库接口
			const bankEntry = this.options.useBank ? findBankEntry(title) : undefined;
			if (bankEntry) {
				const picked = pickOptionElements(bankEntry, optionElements);
				let hits = picked.elements;
				if (hits.length) {
					// 单选只能选一个：软匹配可能命中多个，取文本最长（最贴近答案）的那个
					if (type !== 'multiple' && hits.length > 1) {
						hits = [...hits].sort(
							(a, b) => normalizeOptionText(b.innerText || '').length - normalizeOptionText(a.innerText || '').length
						);
					}
					const targets = type === 'multiple' ? hits : hits.slice(0, 1);
					if (type === 'multiple') {
						for (const el of optionElements) {
							if (isChosen(el) && !targets.includes(el)) await this.setOption(el, false);
						}
					}
					for (const el of targets) await this.setOption(el, true);
					record.result = { finish: true };
					record.resolved = true;
					record.requested = true;
					answered++;
					bankHits++;
					$console.log(
						`[易班] 第 ${pageIndex} 题命中题库（${picked.reason} ${picked.score.toFixed(2)}）：${targets
							.map((el) => (el.innerText || '').trim())
							.join(' / ')}`
					);
					CommonProject.scripts.workResults.methods.updateWorkStateByResults(results);
					if (pageIndex < total) await this.gotoIndex(pageIndex + 1);
					continue;
				}
				$console.log(`[易班] 第 ${pageIndex} 题题库有记录但选项文本对不上，转搜题`);
			}

			let searchInfos: SearchInformation[] = [];
			try {
				searchInfos = await this.search(subject, title, optionElements, type);
				record.requested = true;
			} catch (e) {
				record.requested = true;
				record.error = e instanceof Error ? e.message : String(e);
				$console.warn(`[易班] 第 ${pageIndex} 题搜题失败：${record.error}`);
			}
			record.ctx!.searchInfos = searchInfos;

			let finish = false;
			if (searchInfos.length) {
				// 多选题先清空已有选择，避免残留选项混入答案
				if (type === 'multiple') {
					for (const el of optionElements) {
						if (isChosen(el)) await this.setOption(el, false);
					}
				}

				try {
					const handler = resolver[type as 'single' | 'multiple' | 'completion'] || resolver.single;
					const resolved = await handler(searchInfos, optionElements, async (_t, _answer, option) => {
						if (option) await this.setOption(option as HTMLElement, true);
					});
					finish = !!resolved.finish && optionElements.some(isChosen);
				} catch (e) {
					record.error = e instanceof Error ? e.message : String(e);
					$console.warn(`[易班] 第 ${pageIndex} 题应用答案失败：${record.error}`);
				}
			}

			record.result = { finish };
			record.resolved = true;
			if (finish) {
				answered++;
			} else {
				missing.push(pageIndex);
				$console.warn(`[易班] 第 ${pageIndex} 题未匹配到答案`);
			}

			CommonProject.scripts.workResults.methods.updateWorkStateByResults(results);

			if (pageIndex < total) {
				await this.gotoIndex(pageIndex + 1);
			}
		}

		$console.log(
			this.options.useBank
				? `[易班] 作答结束：共 ${total} 题，已选中 ${answered} 题（题库命中 ${bankHits} 题），未答 ${missing.length} 题`
				: `[易班] 作答结束：共 ${total} 题，已选中 ${answered} 题（题库开关已关闭，全部走 AI），未答 ${missing.length} 题`
		);
		try {
			CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(results));
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(results);
		} catch (e) {
			// 结果面板异常不影响答题
		}

		if (missing.length) {
			$message.warn({
				content: `第 ${missing.slice(0, 20).join('、')}${missing.length > 20 ? ' 等' : ''} 题没有匹配到答案，请手动处理。`,
				duration: 0
			});
		}

		if (this.options.autoSubmit) {
			if (missing.length) {
				$message.warn({ content: '存在未作答题目，已跳过自动交卷。', duration: 0 });
			} else {
				const submitted = await this.submitPaper();
				if (submitted) {
					$message.success({ content: '已自动交卷，请留意成绩页面。', duration: 0 });
				} else {
					$message.warn({ content: '自动交卷失败，请手动点击「交卷」。', duration: 0 });
				}
			}
		} else {
			$message.info({ content: '答题完成，请核对后手动点击「交卷」。', duration: 0 });
		}
	}

	/** 点击交卷并确认。交卷不可逆，仅在配置开启且无漏题时调用 */
	private async submitPaper() {
		const submitBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
			(btn) => (btn.innerText || '').replace(/\s+/g, '') === '交卷' && !btn.disabled
		);
		if (!submitBtn) return false;

		submitBtn.click();
		await $.sleep(1200);

		// 确认弹窗由易盾组件承载，按钮文案可能是「确定 / 确认 / 确认交卷」
		const dialogButtons = Array.from(document.querySelectorAll<HTMLElement>('button, [class*="btn"]')).filter((el) =>
			/^(确定|确认|确认交卷|交卷)$/.test((el.innerText || '').replace(/\s+/g, ''))
		);
		const confirmBtn = dialogButtons[dialogButtons.length - 1];
		if (!confirmBtn) {
			$console.warn('[易班] 未找到交卷确认按钮，请手动确认');
			return false;
		}

		confirmBtn.click();
		await $.sleep(2000);
		return true;
	}
}

const workNotes = $ui.notes([
	'易班优课考试页（地址含 /take）会自动逐题作答，其余页面仅提示。',
	'脚本内置题库优先：命中过的题目直接按「正确选项文本」作答，不再请求 AI；未命中的题目才走题库配置里的 AI / 题库接口。',
	'设置里的「启用学生手册题库」可一键关掉内置题库 —— 关掉后所有题目都交给 AI，适合换用别的卷子时避免被题库串题。',
	'题库只记正确答案文本，不记选项位置 —— 易班每场都会重新洗牌选项，记位置下次必错。',
	'考试进行中服务端不下发答案，题库未命中且未配置 AI 时该题会留空。',
	'交卷后可在解析页运行 `node scripts/collect-yooc-bank.js`，把这场官方答案抓进题库，下次同卷可满分。',
	'交卷不可逆，默认不会自动交卷；确认无误后自行点击「交卷」。'
]).outerHTML;

export const YoocProject = Project.create({
	name: '易班优课',
	domains: ['yooc.me', 'yiban.cn'],
	scripts: {
		guide: new Script({
			name: '使用提示',
			matches: [
				['易班优课-考试列表', /yooc\.me\/group\/\d+\/exams/],
				['易班优课-考试详情', /yooc\.me\/group\/\d+\/exam\/\d+(\/|$)/],
				['易班优课-成绩页', /yooc\.me\/group\/\d+\/exam\/\d+\/(result|review)/]
			],
			namespace: 'yooc.exam.guide',
			configs: {
				notes: { defaultValue: workNotes }
			},
			oncomplete() {
				CommonProject.scripts.render.methods.pin(this);
				$message.info({
					content: '请点击「开始考试」进入答题页，进入后脚本会自动运行。',
					duration: 0
				});
			}
		}),

		exam: new Script({
			name: '易班优课-考试自动答题',
			matches: [['易班优课-在线考试答题页', /yooc\.me\/group\/\d+\/exam\/\d+\/take/]],
			namespace: 'yooc.exam.work',
			configs: {
				notes: { defaultValue: workNotes },
				workDelay: {
					label: '开始答题延迟（秒）',
					defaultValue: 3,
					attrs: { type: 'number', min: 1, step: 1, max: 10 }
				},
				useBank: {
					label: '启用学生手册题库',
					defaultValue: true,
					attrs: {
						type: 'checkbox',
						title: '开启后优先用内置题库（466 题）直接作答，未命中才请求 AI；关闭则全部题目交给 AI / 题库接口'
					}
				},
				skipAnswered: {
					label: '跳过已作答的题目',
					defaultValue: true,
					attrs: {
						type: 'checkbox',
						title: '开启后不会覆盖页面上已有选择的答案；关闭则全部重新作答'
					}
				},
				autoSubmit: {
					label: '考试自动交卷',
					// 交卷不可逆，默认关闭
					defaultValue: false,
					attrs: {
						type: 'checkbox',
						title: '仅在全部题目都匹配到答案时自动交卷，有漏题会停下等待手动处理'
					}
				}
			},
			async oncomplete() {
				CommonProject.scripts.render.methods.pin(this);

				await waitForElement('main', { timeout_seconds: 30 });
				await waitFor(() => readPosition() !== undefined, { timeout_seconds: 20, check_period_ms: 200 });

				// 清空上一次的搜索结果与统计
				CommonProject.scripts.workResults.methods.init();

				commonWork(this, {
					enable_control_panel: true,
					start_delay_seconds: Number(this.cfg.workDelay ?? 3),
					workerProvider: (opts) => {
						const worker = new YoocExamWorker({
							...opts,
							autoSubmit: !!this.cfg.autoSubmit,
							skipAnswered: this.cfg.skipAnswered !== false,
							// configs 的 checkbox 默认值在未写过盘时可能为 undefined，按"默认开启"处理
							useBank: this.cfg.useBank !== false
						});
						return worker;
					},
					onWorkerCreated: (worker) => {
						void (worker as YoocExamWorker).doWork();
					}
				});
			}
		})
	}
});
