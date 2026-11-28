import { QuestionTypes, WorkContext } from './interface';

/** 默认题目类型解析器 */
export function defaultWorkTypeResolver(ctx: WorkContext<any>): QuestionTypes | undefined {
	function count(selector: string) {
		let c = 0;
		for (const option of ctx.elements.options || []) {
			if (option?.querySelector(selector) !== null) {
				c++;
			}
		}
		return c;
	}
	return count('[type="radio"]') === 2
		? 'judgement'
		: count('[type="radio"]') > 2
		? 'single'
		: count('[type="checkbox"]') > 2
		? 'multiple'
		: count('textarea') >= 1
		? 'completion'
		: undefined;
}

/** 判断答案是否为A-Z的文本, 并且字符序号依次递增, 并且 每个字符是否都只出现了一次 */
export function isPlainAnswer(answer: string) {
	answer = answer.trim();
	if (answer.length > 8 || !/[A-Z]/.test(answer)) {
		return false;
	}
	const counter: any = {};
	let min = 0;
	for (let i = 0; i < answer.length; i++) {
		if (answer.charCodeAt(i) < min) {
			return false;
		}
		min = answer.charCodeAt(i);
		counter[min] = (counter[min] || 0) + 1;
	}
	// 判断每个字符是否都只出现了一次
	for (const key in counter) {
		if (counter[key] !== 1) {
			return false;
		}
	}

	return true;
}

/**
 * 去掉答案外层的「装饰」，还原成题库答案本来的样子
 *
 * 大模型（尤其 `deepseek-flash` 这类带思考的模型）几乎不会老老实实只回一个字母：
 * 常见 `答案：A`、```` ```text\nA\n``` ````、`（A）`、`正确的是A。`、`所以选 A`
 * 这类写法。这些文本进到匹配器里既不能归一化命中、也不是纯字母，
 * 最终 `finish=false` —— 用户看到的现象就是「AI 明明答了，题却没选上」。
 *
 * 这里只做**无歧义的剥离**，不做任何猜测：
 * - 去掉 markdown 代码块与行内反引号
 * - 去掉「答案 / 正确答案 / 所以 / 因此 / 应选」这类前缀（可叠加，最多剥 3 层）
 * - 去掉包裹的括号引号（内部不再嵌套时）
 * - 去掉结尾的标点
 * - 单个小写字母统一大写（`a` → `A`）
 *
 * 猜测性的提取放在 {@link pickLabelledLetter} 里，只有在前面的阶段都失败后才启用。
 *
 * @param options.fillBlank 填空题模式：只剥代码块和「答案：」前缀
 *
 * 填空题的答案是**要原样打进答题框的文本**，不能做「去括号 / 改大小写 / 去结尾标点」：
 * 题库里存在「答案一」这种正常答案，也存在以 `;` 结尾的代码答案，
 * 多剥一刀就把答案本身改坏了（`tests/resolver.test.ts` 里有用例守着）。
 */
export function stripAnswerDecoration(answer: any, options: { fillBlank?: boolean } = {}): string {
	let text = String(answer ?? '').trim();
	if (!text) return '';

	/**
	 * markdown 代码块：` ```text\nA\n``` `、` ```A``` `
	 *
	 * 不能只写一个 `/^```[^\n]*\n?([\s\S]*?)```$/` —— 调用方常常已经把换行去掉
	 * （`StringUtils.nowrap`），` ```A``` ` 会被当成「语言标记是 A、内容为空」，
	 * 整段答案被剥成空串。
	 */
	if (/^```/.test(text)) {
		const firstLineEnd = text.indexOf('\n');
		if (firstLineEnd === -1) {
			/** 单行代码块 ` ```A``` `：首行没有换行，整段都是内容 */
			text = text.replace(/^```/, '').replace(/```$/, '').trim();
		} else {
			/** 多行代码块：首行是语言标记，丢掉 */
			text = text
				.slice(firstLineEnd + 1)
				.replace(/```\s*$/, '')
				.trim();
		}
	}
	/** 行内反引号：`A` */
	text = text.replace(/^`+|`+$/g, '').trim();

	/**
	 * 前缀可能叠加：`答案是：选A`
	 *
	 * 「答案」后面必须跟分隔符或「是/为/应该」才剥：
	 * 填空题里有「答案一」这种正常答案，无脑剥会把首字吃掉。
	 */
	for (let i = 0; i < 3; i++) {
		let next = text.replace(/^(?:正确|参考|我的)?\s*答案\s*(?:[:：]|是|为|应该|应当|\s)+/i, '');
		/** 填空题只剥「答案：」前缀：它可能是句子的开头，不是选项标注 */
		if (!options.fillBlank) {
			next = next
				.replace(/^(?:所以|因此|故|综上|最后|结论)\s*[:：]?\s*/i, '')
				.replace(/^(?:应|应该|应当)?\s*(?:选|选择)\s*(?:是|为|[:：])?\s*(?=[（(【[]?\s*[A-Ha-h])/i, '');
		}
		next = next.trim();
		if (next === text) break;
		text = next;
	}

	if (options.fillBlank) return text;

	/** 包裹的括号 / 引号：只在内部不含同类符号时剥离，避免吃掉答案本身的括号 */
	const wrapped = text.match(/^[（(【[「『"']\s*([^（()）【[\]】「」『』"']{1,12})\s*[)）】\]」』"']$/);
	if (wrapped) text = wrapped[1].trim();

	/** 结尾标点 */
	text = text.replace(/[。．.，,、;；:：\s]+$/, '').trim();

	/** 单个小写字母 */
	if (/^[a-h]$/.test(text)) text = text.toUpperCase();

	return text;
}

/**
 * 从一段自然语言答案里取出「被标注出来的选项字母」
 *
 * 只有字母**紧跟在**「答案 / 选 / 是 / 括号」这类标记后面才算数，
 * 并且全文出现的不同字母必须唯一 —— 这样 `所以选 A` 能取到 A，
 * 而 `选项A和C都不对`、`TCP/IP` 这种带多个字母或英文单词的文本一律放弃，
 * 宁可判失败也不瞎猜（猜错比不答更糟）。
 *
 * @returns 单个字母答案（如 `A`），无把握时返回 undefined
 */
export function pickLabelledLetter(answer: any): string | undefined {
	const text = stripAnswerDecoration(String(answer ?? '').replace(/\n/g, ' '));
	if (!text) return undefined;
	/** 已经是纯字母答案的，交给原有逻辑，不在这里重复处理 */
	if (/^[A-H]{1,8}$/.test(text)) return undefined;

	const labelled = text.match(
		/(?:答案|选|选择|应为|应该是|应该选|是|为|[:：])\s*[（(【[]?\s*([A-Ha-h])\s*(?![A-Za-z0-9])/
	);
	if (!labelled) return undefined;

	/** 全文不同字母必须唯一，否则可能有歧义（「A和C都对」这种） */
	const distinct = new Set(text.toUpperCase().match(/[A-H]/g) || []);
	if (distinct.size !== 1) return undefined;

	return labelled[1].toUpperCase();
}

/**
 * 判断是否为纯ABCD多选答案，但是中间存在分隔符
 * @param answer  答案
 */
export function resolvePlainAnswer(answer: string) {
	const resolve = stripAnswerDecoration(answer)
		.replace(/[,，.。．、 #]/g, '')
		.trim();
	if (isPlainAnswer(resolve)) {
		return resolve;
	}
}

/**
 * 检测答案是否为一段程序代码
 *
 * 程序题的题库答案是一段代码，其中的 `;` `|` `；` 是代码语法（语句终止符、按位或运算符），
 * 而非答案分隔符。本函数通过代码关键字、运算符、语句终止符等特征综合判定，
 * 命中则在 {@link splitAnswer} 中取消 `;` `|` `；` 作为分隔符，避免代码被错误拆分。
 *
 * 仅当答案中存在 `;` `|` `；` 时才需要判定（否则无需取消任何分隔符），以此降低误判。
 *
 * @param answer 答案文本
 */
export function isProgramAnswer(answer: string): boolean {
	const code = (answer ?? '').trim();
	if (!code) return false;
	// 不含 ; | ； 时无需取消分隔符，直接返回
	if (!/[;|；]/.test(code)) return false;

	let score = 0;

	// 强特征：单独命中即可判定为程序
	const strong: RegExp[] = [
		/#include\s*[<"]/,
		/#define\s+\w/,
		/#!\//,
		/\b(?:int|void|float|double|char|long|short)\s+main\s*\(/,
		/\bfunction\s+\w+\s*\(/,
		/\bdef\s+\w+\s*\(/,
		/\bpublic\s+(?:class|static|void|int|float|double|String|final)\b/,
		/\bprivate\s+(?:class|static|void|int|float|double|String|final)\b/,
		/\bprotected\s+(?:class|static|void|int|float|double|String|final)\b/,
		/\bprintf\s*\(/,
		/\bscanf\s*\(/,
		/\bcout\s*<</,
		/\bcin\s*>>/,
		/System\.out\./,
		/console\.log\s*\(/,
		/\bpackage\s+[\w.]+\s*;/,
		/\bimport\s+[\w.*]+\s*;/,
		/\bclass\s+\w+\s*\{/,
		/\bstruct\s+\w+\s*\{/
	];
	for (const re of strong) if (re.test(code)) score += 2;

	// 中等特征
	const medium: RegExp[] = [
		/=>/,
		/->/,
		/::/,
		/\+\+/,
		/--/,
		/[+\-*/%]=/,
		/\bnew\s+\w+\s*\(/,
		/\bfor\s*\(/,
		/\bwhile\s*\(/,
		/\bif\s*\(/,
		/\bswitch\s*\(/,
		/\btypedef\s+/,
		/\b(?:int|float|double|char|void|bool|boolean|long|short|String|auto|const|let|var)\s+\w+/,
		/\bsizeof\s*\(/,
		/\bmalloc\s*\(/,
		/\bfree\s*\(/,
		/\bcout\b/,
		/\bcin\b/
	];
	for (const re of medium) if (re.test(code)) score += 1;

	// 结构特征：花括号块
	if (/\{/.test(code) && /\}/.test(code)) score += 1;
	// 语句终止符 ; 至少 1 个
	if (/;/.test(code)) score += 1;

	return score >= 2;
}

/** 分割答案 */
export function splitAnswer(answer: string, separators = ['===', '#', '---', '###', '|', ';', '；']) {
	/** 模型返回 `content: null` 时答案是 undefined，直接 .trim() 会抛 TypeError，这里统一成空串 */
	answer = String(answer ?? '').trim();
	if (answer.length === 0) {
		return [];
	}
	separators = separators.length === 0 ? ['===', '#', '---', '###', '|', ';', '；'] : separators;
	separators = separators.filter((el) => el.trim().length > 0);

	// 程序题答案：; | ； 是代码语法而非答案分隔符，检测到程序时取消这些分隔符
	if (isProgramAnswer(answer)) {
		separators = separators.filter((el) => el !== ';' && el !== '|' && el !== '；');
	}

	try {
		// 如果是 json 格式的多选答案
		const json = JSON.parse(answer);
		if (Array.isArray(json)) {
			return json
				.map(String)
				.map((el) => el.trim())
				.filter((el) => el.length > 0);
		}
	} catch {
		for (const sep of separators) {
			if (answer.split(sep).length > 1) {
				return answer
					.split(sep)
					.map((el) => el.trim())
					.filter((el) => el.length > 0);
			}
		}
	}

	return [answer];
}
