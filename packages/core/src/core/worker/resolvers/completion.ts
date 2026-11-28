import { splitAnswer, stripAnswerDecoration } from '../utils';

/** 填空题匹配结果 */
export interface CompletionResolveResult {
	finish: boolean;
	answers?: string[];
}

/**
 * 填空题匹配算法
 *
 * 遍历题库答案，找到答案数量与填空框数量一致的答案组，
 * 或者填空框只有一个时将所有答案合并。
 *
 * @param answerGroups  每个题库的答案列表
 * @param blankCount    填空框数量
 * @param separators    答案分隔符
 */
export function resolveCompletion(
	answerGroups: string[][],
	blankCount: number,
	separators?: string[]
): CompletionResolveResult {
	for (const answers of answerGroups) {
		/**
		 * 只剥代码块和「答案：」前缀
		 *
		 * 模型常把填空答成 `` ```光合作用``` `` 或 `答案：光合作用`，
		 * 原样打进答题框就是错的；但填空题答案是要原样使用的文本，
		 * 括号/大小写/结尾标点一概不能动（见 stripAnswerDecoration 的 fillBlank 说明）。
		 */
		let ans = (answers || []).map((a) => stripAnswerDecoration(a, { fillBlank: true })).filter((a) => a);
		if (ans.length === 1) {
			ans = splitAnswer(ans[0], separators);
		}

		if (ans.length !== 0 && (ans.length === blankCount || blankCount === 1)) {
			if (ans.length === blankCount) {
				return { finish: true, answers: ans };
			} else if (blankCount === 1) {
				return { finish: true, answers: [ans.join(' ')] };
			}
		}
	}

	return { finish: false };
}
