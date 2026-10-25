// @ts-check

const { ScriptWorker } = require('./lib/src/worker/index');

const worker = new ScriptWorker();

// 监听消息
process.on(
	'message',
	async (
		/** @type {{event: any, args: any, replyId?: string}} */
		message
	) => {
		const { event, args, replyId } = message;

		try {
			/** 根据 event 名直接调用方法 */
			const result = await worker[event](...(args || []));
			/** 需要返回值时回传（远程控制截图/页面列表等） */
			if (replyId && process.send) {
				process.send({ event: '__reply__', args: [replyId, { data: result === undefined ? null : result }] });
			}
		} catch (error) {
			if (replyId && process.send) {
				process.send({ event: '__reply__', args: [replyId, { error: String(error && error.message ? error.message : error) }] });
			} else {
				console.error(error);
			}
		}
	}
);
