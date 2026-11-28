import { removeRedundant, clearString } from '../../utils/string';
import { stripAnswerDecoration } from '../utils';

/** 判断题匹配结果 */
export interface JudgementResolveResult {
	finish: boolean;
	option?: string;
}

const CORRECT_WORDS = ['是', '对', '正确', '确定', '√', '对的', '是的', '正确的', 'true', 'True', 'T', 'yes', '1'];

const INCORRECT_WORDS = [
	'非',
	'否',
	'错',
	'错误',
	'×',
	'X',
	'错的',
	'不对',
	'不正确的',
	'不正确',
	'不是',
	'不是的',
	'false',
	'False',
	'F',
	'no',
	'0'
];

/**
 * 判断题匹配算法
 *
 * 遍历题库答案，判断答案文本是否包含正确/错误关键词，
 * 然后在选项中匹配对应关键词的选项。
 *
 * @param answerGroups  每个题库的答案列表
 * @param options        选项文本列表
 */
export function resolveJudgement(answerGroups: string[][], options: string[]): JudgementResolveResult {
	for (const rawAnswers of answerGroups) {
		const answers = (rawAnswers || []).map((a) => normalizeJudgementAnswer(a, options));
		const answerShowCorrect = answers.find((a) => matches(a, CORRECT_WORDS));
		const answerShowIncorrect = answers.find((a) => matches(a, INCORRECT_WORDS));

		if (answerShowCorrect || answerShowIncorrect) {
			for (const option of options) {
				const textShowCorrect = matches(option, CORRECT_WORDS);
				const textShowIncorrect = matches(option, INCORRECT_WORDS);

				if (answerShowCorrect && textShowCorrect) {
					return { finish: true, option };
				}
				if (answerShowIncorrect && textShowIncorrect) {
					return { finish: true, option };
				}
			}

			return { finish: false };
		}
	}

	return { finish: false };
}

function matches(target: string, words: string[]) {
	return words.some(
		(word) => clearString(removeRedundant(word), '√', '×') === clearString(removeRedundant(target), '√', '×')
	);
}

/**
 * 判断题答案归一化
 *
 * 原有的 `matches` 是**全等**比较，所以下面这些写法以前一条都认不出来：
 * - `答案：对`（前缀）
 * - `A` / `B`（模型按单选习惯回了字母）
 *
 * 字母按选项序号映射成选项文本（`A` → 第一个选项），再交给关键词匹配；
 * 判断类题目的选项本身就只有两个，序号映射不存在歧义。
 */
function normalizeJudgementAnswer(answer: any, options: string[]): string {
	const text = stripAnswerDecoration(answer);
	if (/^[A-H]$/.test(text)) {
		const index = text.charCodeAt(0) - 65;
		if (options[index] !== undefined) return options[index];
	}
	return text;
}

/** 检测选项是否为判断题性质（仅有两个选项，且分别为"对"和"错"性质） */
export function isJudgementOptions(options: string[]): boolean {
	if (options.length !== 2) return false;
	const hasCorrect = options.some((opt) => matches(opt, CORRECT_WORDS));
	const hasIncorrect = options.some((opt) => matches(opt, INCORRECT_WORDS));
	return hasCorrect && hasIncorrect;
}
