/**
 * 易班优课题库匹配（纯函数，零外部依赖）
 *
 * 设计原则：**题库只存「题干 + 正确选项文本」，不存选项集合**。
 *
 * 原因：
 * - 易班每次开考都会重排选项顺序，位置无意义；
 * - 系统还会**随机增删干扰项**，把某一轮的选项集当"标准答案范围"会导致漏选/多选；
 * - 只有「正确答案文本」是跨场次稳定的，干扰项永远不会出现在答案池里，天然被排除。
 *
 * 一个题干可能对应多组答案文本（换排版、选项被截短、选项池抽题），因此存 `versions`；
 * 题干属于「应包含且不限于」型的全选题，则用 `all` 池表示——页面选项凡属池内即选中。
 *
 * 本文件被 `yooc.ts`（运行时）与离线压测脚本共用，**改动请同步跑压测**。
 */

/** 题库条目：只有题干与正确答案文本，没有任何"选项集合"概念 */
export type YoocBankEntry = {
	/** 归一化后的题干，作为匹配键 */
	q: string;
	/** 原始题干，便于人工核对 */
	stem: string;
	/** 精确答案版本：每版是一组「正确选项文本」，版本之间是同一题的不同排版 */
	versions?: string[][];
	/** 全选池：题干为「应包含且不限于」类，页面选项凡属池内即全选 */
	all?: string[];
};

export type PickResult = {
	/** 命中的选项下标（对应传入的 domTexts） */
	indices: number[];
	/** 命中方式，用于日志 */
	reason: 'all' | 'all-partial' | 'exact' | 'fuzzy' | 'none';
	/** 置信度 0~1 */
	score: number;
};

/** 题干归一化：去空白、去通用标点、统一括号。**必须与采集脚本完全一致** */
export function normalizeStem(input: string) {
	return String(input)
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&')
		.replace(/[\s\u3000]+/g, ' ')
		.trim()
		.replace(/[\s\u3000]+/g, '')
		.replace(/[（(]\s*[）)]/g, '()')
		.replace(/[，,、；;：:。.？?！!“”"'‘’·…—\-_]/g, '')
		.toLowerCase();
}

/** 选项文本归一化：去掉 "A." / "A、" 前缀与所有空白 */
export function normalizeOptionText(input: string) {
	return String(input)
		.replace(/^[A-Za-z][.、．]\s*/, '')
		.replace(/^[A-Za-z]\s{2,}/, '')
		.replace(/[\s\u3000]+/g, '')
		.trim();
}

/** 软匹配的最低相似度：截短/补长比例低于此值视为不同选项 */
const FUZZY_MIN_RATIO = 0.6;

/**
 * 两个选项文本的相似度。
 * - 完全相同 → 1
 * - 一方是另一方的子串 → 0.5 + 0.5 * 短/长（越长越接近越可信）
 * - 否则 0
 */
function pairScore(a: string, b: string) {
	if (!a || !b) return 0;
	if (a === b) return 1;
	if (a.includes(b) || b.includes(a)) {
		const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
		if (ratio < FUZZY_MIN_RATIO) return 0;
		return 0.5 + 0.5 * ratio;
	}
	return 0;
}

function uniqueNormalized(list: string[]) {
	return [...new Set((list || []).map(normalizeOptionText).filter(Boolean))];
}

/**
 * 从一个「答案文本集合」里挑出页面命中的选项下标。
 *
 * 要求集合内每一项都能在页面上找到对应（否则该版本不适用于当前这轮的排版），
 * 返回的分数是该版本的平均相似度；同时记录精确命中数，用于版本之间比大小。
 */
function matchVersion(wanted: string[], domTexts: string[]) {
	const used = new Set<number>();
	const indices: number[] = [];
	let sum = 0;
	let exact = 0;

	for (const w of wanted) {
		let bestIdx = -1;
		let bestScore = 0;
		for (let i = 0; i < domTexts.length; i++) {
			if (used.has(i)) continue;
			const s = pairScore(domTexts[i], w);
			if (s > bestScore) {
				bestScore = s;
				bestIdx = i;
			}
		}
		if (bestIdx < 0) return null; // 这个版本有项在页面上找不到，不适用
		used.add(bestIdx);
		indices.push(bestIdx);
		sum += bestScore;
		if (bestScore === 1) exact++;
	}

	return { indices, avg: sum / wanted.length, exact };
}

/**
 * 核心匹配：给定题库条目与页面选项文本，返回应点击的选项下标。
 *
 * 优先级：
 * 1. `all` 池——页面选项全部落在池内（或部分落在池内）→ 全选命中的那些；
 * 2. 精确版本——某个版本的答案文本全部精确命中 → 取该版本（多版命中取更具体的一版）；
 * 3. 软匹配——排版被截短/补长时按相似度兜底，要求平均相似度达标且精确命中更多。
 */
export function pickAnswerTexts(entry: YoocBankEntry | undefined, domTexts: string[]): PickResult {
	if (!entry) return { indices: [], reason: 'none', score: 0 };

	const dom = (domTexts || []).map(normalizeOptionText);

	// 1) 全选池
	const allPool = uniqueNormalized(entry.all || []);
	if (allPool.length) {
		const pool = new Set(allPool);
		const indices: number[] = [];
		for (let i = 0; i < dom.length; i++) {
			if (!dom[i]) continue;
			if (pool.has(dom[i])) {
				indices.push(i);
				continue;
			}
			// 池内文本被页面截短/补长时也认
			if (allPool.some((w) => pairScore(dom[i], w) >= 0.8)) indices.push(i);
		}
		if (indices.length) {
			const nonEmpty = dom.filter(Boolean).length;
			return {
				indices,
				reason: indices.length >= nonEmpty ? 'all' : 'all-partial',
				score: indices.length / Math.max(1, allPool.length)
			};
		}
	}

	// 2) / 3) 版本匹配
	const versions = (entry.versions || []).map(uniqueNormalized).filter((v) => v.length);
	let best: { indices: number[]; avg: number; exact: number; size: number } | null = null;

	for (const wanted of versions) {
		const hit = matchVersion(wanted, dom);
		if (!hit) continue;
		if (!best) {
			best = { ...hit, size: wanted.length };
			continue;
		}
		// 先比平均相似度，再比精确命中数，最后偏好更大的版本（答案更完整）
		const better =
			hit.avg > best.avg + 1e-6 ||
			(Math.abs(hit.avg - best.avg) <= 1e-6 &&
				(hit.exact > best.exact || (hit.exact === best.exact && wanted.length > best.size)));
		if (better) best = { ...hit, size: wanted.length };
	}

	if (!best) return { indices: [], reason: 'none', score: 0 };

	return {
		indices: best.indices,
		reason: best.exact === best.size ? 'exact' : 'fuzzy',
		score: best.avg
	};
}

/** 题干索引：精确键 → 条目 */
export function buildBankIndex(items: YoocBankEntry[]) {
	const map = new Map<string, YoocBankEntry>();
	for (const it of items) {
		const key = it.q || normalizeStem(it.stem);
		if (key) map.set(key, it);
	}
	return map;
}

/**
 * 查题库：先精确匹配；未命中再容忍少量差异（跨场次题干偶有细微改动）。
 * 长度差阈值 8 是经验值，太大会把相近的两道题搞混。
 */
export function findBankEntry(index: Map<string, YoocBankEntry>, items: YoocBankEntry[], title: string) {
	const q = normalizeStem(title);
	if (!q) return undefined;
	const exact = index.get(q);
	if (exact) return exact;
	for (const it of items) {
		const key = it.q || normalizeStem(it.stem);
		if (!key || Math.abs(key.length - q.length) > 8) continue;
		if (key.includes(q) || q.includes(key)) return it;
	}
	return undefined;
}
