import { AnswererWrapper, SearchInformation, Result } from './interface';
import { request } from '../utils/request';
import { $ } from '../../utils';

export const AnswerWrapperHandlerConfig = {
	// 超时时间，单位毫秒
	timeout_seconds: 60
};

let _sizeErrorRetryHandler: ((error: any, data: any) => Promise<any | undefined>) | undefined;

export function setSizeErrorRetryHandler(fn: ((error: any, data: any) => Promise<any | undefined>) | undefined) {
	_sizeErrorRetryHandler = fn;
}

function isSizeError(error: any): boolean {
	const msg = typeof error === 'string' ? error : error?.message || error?.toString?.() || String(error || '');
	return /413|too large|too long|payload|entity|size.*limit|max.*size|request.*large|body.*limit/i.test(msg);
}

/**
 * 题目图片解析器：把题目里的图片地址转成 base64 data URL（由宿主注册）
 *
 * 宿主要负责下载 + 压缩，核心层只做「拼进题干」这一步，
 * 这样 core 不依赖 DOM/画布，脚本管理器环境也能跑。
 */
let _questionImageResolver: ((urls: string[]) => Promise<string[]>) | undefined;

export function setQuestionImageResolver(fn: ((urls: string[]) => Promise<string[]>) | undefined) {
	_questionImageResolver = fn;
}

/** 题库请求进度：宿主据此在面板上显示「AI 思考中…」这类实时状态 */
export interface AnswerProgressEvent {
	phase: 'start' | 'end';
	/** 题库名（AI 答题固定为「AI答题」） */
	name: string;
}

let _answerProgressListener: ((event: AnswerProgressEvent) => void) | undefined;

export function setAnswerProgressListener(fn: ((event: AnswerProgressEvent) => void) | undefined) {
	_answerProgressListener = fn;
}

function emitAnswerProgress(event: AnswerProgressEvent) {
	try {
		_answerProgressListener?.(event);
	} catch (err) {
		// 进度 UI 出错绝不能影响答题
		console.log('答题进度回调异常', err);
	}
}

/**
 * 去掉题干里被 `optimizationElementWithImage` 换进去的图片地址
 *
 * 只删我们自己注入的那几条（精确匹配），避免误伤题目正文里的链接。
 */
function stripInjectedImageUrls(text: string, urls: string[]): string {
	let out = text;
	for (const url of urls) {
		if (url && out.includes(url)) out = out.split(url).join('');
	}
	return out;
}

/**
 * 把题目图片以 base64 文本拼到题干末尾
 *
 * 不用多模态 `content` 数组：各家网关对数组结构支持参差不齐，
 * 一个 400 就让整道题失败。纯文本里带 `data:image/...;base64,...`
 * 是最保守的形式，发不出去至少不会报错。
 */
function attachInlineImages(requestData: any, originalUrls: string[], dataUrls: string[]): boolean {
	const messages = requestData?.messages;
	if (!Array.isArray(messages) || dataUrls.length === 0) return false;
	let target: any;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i] && messages[i].role === 'user') {
			target = messages[i];
			break;
		}
	}
	if (!target) return false;

	const block =
		`\n\n【题目图片】共 ${dataUrls.length} 张，均为 base64 编码：\n` +
		dataUrls.map((url, i) => `[图片${i + 1}]\n${url}`).join('\n');

	/** 参考资料里也可能有数组形式的 content，找到第一段文本往里追加 */
	if (Array.isArray(target.content)) {
		const textPart = target.content.find((part: any) => part && part.type === 'text' && typeof part.text === 'string');
		if (textPart) {
			textPart.text = stripInjectedImageUrls(textPart.text, originalUrls) + block;
		} else {
			target.content.unshift({ type: 'text', text: block.trim() });
		}
	} else {
		target.content = stripInjectedImageUrls(String(target.content ?? ''), originalUrls) + block;
	}
	return true;
}

/**
 * 只取最终结果。
 *
 * reasoning_content 是模型的思考过程，把它当答案会直接污染作答，
 * 因此这里只做一件事：当 content 为空、却存在思考内容时给出可操作的错误，
 * 而不是静默返回空答案或退而使用思考过程。
 */
function assertFinalAnswerPresent(responseData: any, results: Result[]): void {
	const answered = results.some((item) => String(item.answer ?? '').trim().length > 0);
	if (answered) return;
	const message = responseData?.choices?.[0]?.message;
	if (!message) return;
	const content = String(message.content ?? '').trim();
	const reasoning = String(message.reasoning_content ?? '').trim();
	if (!content && reasoning) {
		throw new Error(
			'模型只返回了思考过程（reasoning_content），没有给出最终答案。请改用非思考模式（DeepSeek 现行模型为 deepseek-flash，可在请求里加 thinking:{type:"disabled"}），或调小思考强度后重试。'
		);
	}
	if (!content) {
		throw new Error('模型返回了空内容（content 为空），请检查模型名是否正确、或稍后重试。');
	}
}

/**
 *
 * 默认题库配置解析器
 *
 * @example
 *
 * ```js
 *
 * // 假设有一个接口 : https://example.com/search?title=1+2,2+3
 * // 此接口返回 {code: 1, data: { answers: [3 , 5] , title:'1+2' }, msg:'成功'}
 *
 * defaultAnswerWrapperHandler({
 *      titleElements: Array.from(document.querySelector('.title'))
 * },
 * [
 *  // 可以有多个构造器，最终通过 answerPath 一起合并到一个列表并返回
 *  {
 *      url: 'https://example.com/search',
 *      method: 'get',
 *      answerPath: 'data.answers',
 *      data:{
 *          title: 'titleElements[0]' // 1+2,2+3
 *      }
 *  }
 * ]) // [3 , 5]
 *
 *
 * ```
 *
 * @param elements 题目元素
 * @param answererWrappers 题库配置器数组
 * @returns
 */
export async function defaultAnswerWrapperHandler(
	answererWrappers: AnswererWrapper[],
	// 上下文解析环境
	env: {
		title?: string;
		options?: string;
		type?: string;
		[x: string]: any;
	}
): Promise<SearchInformation[]> {
	const searchInfos: SearchInformation[] = [];
	const temp: AnswererWrapper[] = JSON.parse(JSON.stringify(answererWrappers));
	if (temp.length === 0) {
		throw new Error('题库配置不能为空，请配置后重新开始自动答题。');
	}
	// 多线程请求
	await Promise.all(
		temp.map(async (wrapper) => {
			// 解构数据，并赋初始值
			const {
				name = '未知题库',
				homepage = '#',
				method = 'get',
				type = 'fetch',
				contentType = 'json',
				headers = {},
				data: wrapperData = {},
				handler = 'return (res)=> [JSON.stringify(res), undefined]'
			} = wrapper;
			// 请求数据
			let requestData: any;
			// 请求地址
			let url: URL | undefined;
			/** 通知宿主：开始请求（面板显示实时状态） */
			emitAnswerProgress({ phase: 'start', name });
			try {
				// 答案列表
				let results: Result[] = [];
				if (method.toLocaleLowerCase() === 'get') {
					url = new URL(resolvePlaceHolder(wrapper.url, { encodeURI: true }));
					/**
					 * 如果 data 存在数据并且 method 为 get，则将 data 数据拼接到 url 上，覆盖原有的  url 同名参数
					 * data 参数的优先级高于 url 参数
					 */
					Object.keys(wrapperData).forEach((key) => {
						// searchParams.set 方法会自动编码，所以不需要 encodeURI: true
						url!.searchParams.set(key, resolvePlaceHolder(wrapperData[key]));
					});
					// get 的请求数据为空
					requestData = {};
				} else if (method.toLocaleLowerCase() === 'post') {
					url = new URL(wrapper.url);
					// 构造请求数据
					const data: Record<string, string> = Object.create({});
					/** 构造一个请求数据 */
					Object.keys(wrapperData).forEach((key) => {
						// 如果存在字段解析器
						if (typeof (wrapperData as any)[key] === 'object' && Reflect.has((wrapperData as any)[key], 'handler')) {
							// eslint-disable-next-line no-new-func
							const handler = Function(Reflect.get((wrapperData as any)[key], 'handler'))();
							if (typeof handler !== 'function') {
								throw new Error('data 字段解析器必须返回一个函数');
							}
							const result = handler(env);
							Reflect.set(data, key, result);
						} else {
							// 解析data数据
							Reflect.set(data, key, resolvePlaceHolder(wrapperData[key]));
						}
					});

					requestData = data;
				} else {
					throw new Error('不支持的请求方式');
				}

				/**
				 * 题目里带图片时，把图片的 base64 拼进题干
				 *
				 * 输出预算不设：不写 max_tokens，交给服务端按模型默认上限处理。
				 */
				const sourceImages: string[] = Array.isArray(env?.images)
					? (env.images as any[]).filter((u) => typeof u === 'string' && u).slice(0, 4)
					: [];
				let imagesAttached = false;
				if (wrapper.inlineImages === true && sourceImages.length > 0 && Array.isArray(requestData?.messages)) {
					try {
						const resolved = _questionImageResolver ? await _questionImageResolver(sourceImages) : sourceImages;
						if (resolved && resolved.length) {
							imagesAttached = attachInlineImages(requestData, sourceImages, resolved);
						}
					} catch (err) {
						console.log('题目图片处理失败，按纯文本发送', err);
					}
				}
				if (imagesAttached) {
					console.log(`已把 ${sourceImages.length} 张题目图片以 base64 拼进题干`);
				}

				/** 发一次请求，超时返回 undefined */
				const send = (data: any) =>
					Promise.race([
						request(url!.toString(), {
							method,
							// 历史遗留的命名问题
							responseType: contentType,
							data,
							type,
							headers: JSON.parse(JSON.stringify(headers || {}))
						}),
						$.sleep((AnswerWrapperHandlerConfig.timeout_seconds ?? 60) * 1000)
					]);

				/** 从 handler 获取搜索到的题目和回答 */
				const collect = (responseData: any, sentData: any) => {
					// eslint-disable-next-line no-new-func
					const responseHandler = Function(handler)();
					if (typeof responseHandler !== 'function') {
						throw new Error('handler 响应处理器必须返回一个函数');
					}
					/** 先攒在局部变量里：解析失败（推理模型只回思考）时不能把半成品答案留下 */
					let parsed: Result[] = [];
					const info = responseHandler(responseData);
					if (info && Array.isArray(info)) {
						/** 如果返回一个二维数组 */
						if (info.every((item: any) => Array.isArray(item))) {
							parsed = info.map((item: any) => ({
								question: item[0],
								answer: item[1],
								extra_data: item[2] || {}
							}));
						} else {
							parsed.push({
								question: info[0],
								answer: info[1],
								extra_data: info[2] || {}
							});
						}
					}

					// 只认最终结果：思考过程不能当答案
					assertFinalAnswerPresent(responseData, parsed);

					results = results.concat(parsed);
					searchInfos.push({
						url: wrapper.url,
						name,
						homepage,
						results,
						response: responseData,
						data: sentData
					});
				};

				// 发送请求
				const responseData = await send(requestData);
				if (responseData === undefined) {
					throw new Error('题库请求超时，可能是题库问题，或者请检查网络或者重试。');
				}

				collect(responseData, requestData);
			} catch (error) {
				// 大小错误自动重试（如压缩图片后重发）
				if (_sizeErrorRetryHandler && isSizeError(error) && url && requestData) {
					try {
						const newData = await _sizeErrorRetryHandler(error, JSON.parse(JSON.stringify(requestData)));
						if (newData) {
							const retryResponse = await Promise.race([
								request(url.toString(), {
									method,
									responseType: contentType,
									data: newData,
									type,
									headers: JSON.parse(JSON.stringify(headers || {}))
								}),
								$.sleep((AnswerWrapperHandlerConfig.timeout_seconds ?? 60) * 1000)
							]);
							if (retryResponse !== undefined) {
								let retryResults: Result[] = [];
								// eslint-disable-next-line no-new-func
								const retryHandlerFn = Function(handler)();
								if (typeof retryHandlerFn === 'function') {
									const retryInfo = retryHandlerFn(retryResponse);
									if (retryInfo && Array.isArray(retryInfo)) {
										if (retryInfo.every((item: any) => Array.isArray(item))) {
											retryResults = retryResults.concat(
												retryInfo.map((item: any) => ({
													question: item[0],
													answer: item[1],
													extra_data: item[2] || {}
												}))
											);
										} else {
											retryResults.push({
												question: retryInfo[0],
												answer: retryInfo[1],
												extra_data: retryInfo[2] || {}
											});
										}
									}
								}
								searchInfos.push({
									url: wrapper.url,
									name,
									homepage,
									results: retryResults,
									response: retryResponse,
									data: newData
								});
								return;
							}
						}
					} catch (retryError) {
						console.error('大小错误重试失败', retryError);
					}
				}
				console.error(error);
				searchInfos.push({
					url: wrapper.url,
					name,
					homepage,
					results: [],
					response: undefined,
					data: undefined,
					error: (error as any)?.message || '题库连接失败'
				});
			} finally {
				/** 成功 / 失败 / 超时都要配对结束，否则面板会一直停在「思考中」 */
				emitAnswerProgress({ phase: 'end', name });
			}
		})
	);

	// 替换占位符
	function resolvePlaceHolder(data: any, options?: { encodeURI?: boolean }) {
		if (typeof data === 'string') {
			const matches = data.match(/\${(.*?)}/g) || [];
			matches.forEach((placeHolder) => {
				/** 获取占位符的值 */
				const value: any = env[placeHolder.replace(/\${(.*)}/, '$1')];
				const text = options?.encodeURI ? encodeURIComponent(value) : String(value ?? '');
				/**
				 * 用 split/join 而不是 `replace(placeHolder, text)`
				 *
				 * 两个坑：① `String.prototype.replace` 会把替换文本里的 `$&`、`$'`、`` $` ``
				 * 当成替换模式 —— 题目里带 LaTeX（`$\frac{1}{2}$`）时整段题干会被替换成
				 * 别的内容甚至重复一遍；② replace 只换第一处，占位符出现多次时后面全留着。
				 */
				data = data.split(placeHolder).join(text);
			});
		} else if (typeof data === 'object') {
			// 递归替换
			const keys = Object.keys(data);
			for (const key of keys) {
				data[key] = resolvePlaceHolder(data[key], options);
			}
		}
		return data;
	}

	return searchInfos;
}
