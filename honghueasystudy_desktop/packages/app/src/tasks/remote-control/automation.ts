import { isKnownScript, listRemoteScripts, RemoteScriptInfo } from './script-catalog';

/** 远程自动化任务（登录 → 选课）的实时状态 */
export interface AutomationJob {
	uid: string;
	/** 脚本名称（登录脚本） */
	name: string;
	state: 'idle' | 'running' | 'done' | 'error';
	/** 给人看的一句话状态 */
	message: string;
	startedAt: number;
	finishedAt: number;
	updatedAt: number;
	/** 登录完成后识别到的课程 */
	courses: { id: string; name: string; url: string }[];
	/** 识别到的平台（chaoxing / zhihuishu / zjy / icve，空串表示未识别） */
	platform: string;
	/** 当前所在页面 */
	pageUrl: string;
	/** 取不到课程时的指引 */
	hint: string;
}

/** 命令下行：实际由 CommandBridge 实现，单测里可注入假实现 */
export type AutomationDispatch = (action: string, payload: any) => Promise<any>;

function errorText(e: any): string {
	if (!e) return '未知错误';
	return String(e && e.message ? e.message : e);
}

/**
 * 「登录 → 选课」编排
 *
 * 单独放一个模块（不碰 electron），这样业务时序可以在 Node 里直接跑单测：
 *   start()  → script.run（长耗时，后台执行）→ course.list（自动拉课程）
 *   refresh() → course.list
 *   enter()   → course.enter
 *
 * 之所以不在 HTTP 请求里干等登录：登录要过滑块验证码、等跳转，
 * 手机锁屏/切后台就会掐断请求；这里立刻返回 running，
 * 结果通过 notify（SSE automation 事件）推给远程端。
 */
export class AutomationRunner {
	private jobs = new Map<string, AutomationJob>();

	constructor(private dispatch: AutomationDispatch, private notify: (job: AutomationJob) => void = () => {}) {}

	listScripts(): RemoteScriptInfo[] {
		return listRemoteScripts();
	}

	get(uid: string): AutomationJob | undefined {
		return this.jobs.get(uid);
	}

	/** 浏览器已关闭：丢掉旧结果，避免远程端看到已失效的课程列表 */
	forget(uid: string): void {
		this.jobs.delete(uid);
	}

	/**
	 * 触发登录脚本
	 *
	 * `browserStatus` 由调用方从最新快照里取：runner 不持有浏览器状态，
	 * 才能保持纯逻辑、可测试。
	 */
	start(opts: {
		uid: string;
		name: string;
		configs?: Record<string, any>;
		browserStatus?: string;
	}): AutomationJob {
		const uid = String((opts && opts.uid) || '');
		const name = String((opts && opts.name) || '');

		if (!uid) throw new Error('缺少浏览器实例');
		if (opts && opts.browserStatus && opts.browserStatus !== 'launched') {
			throw new Error('浏览器尚未就绪，请先启动浏览器');
		}
		if (!isKnownScript(name)) throw new Error('未知的自动化脚本');

		const current = this.jobs.get(uid);
		if (current && current.state === 'running') throw new Error('已有自动化任务在执行，请稍候');

		const job: AutomationJob = {
			uid,
			name,
			state: 'running',
			message: '正在执行脚本…',
			startedAt: Date.now(),
			finishedAt: 0,
			updatedAt: Date.now(),
			courses: [],
			platform: '',
			pageUrl: '',
			hint: ''
		};
		this.jobs.set(uid, job);
		this.notify(job);

		void (async () => {
			try {
				await this.dispatch('script.run', { uid, name, configs: (opts && opts.configs) || {} });
				job.message = '登录脚本已完成，正在读取课程列表…';
				job.updatedAt = Date.now();
				this.notify(job);

				try {
					const result = await this.dispatch('course.list', { uid, refresh: true });
					this.applyCourses(job, result);
					job.state = 'done';
					job.message = job.courses.length
						? `登录完成，识别到 ${job.courses.length} 门课程`
						: '登录完成，但没识别到课程';
				} catch (e) {
					/** 登录成功、选课失败：必须让用户知道「登录其实成了」，否则会反复重登 */
					job.state = 'done';
					job.message = '登录完成，但读取课程列表失败：' + errorText(e);
					job.hint = '可以点「刷新课程列表」重试';
				}
			} catch (e) {
				job.state = 'error';
				job.message = errorText(e);
			} finally {
				job.finishedAt = Date.now();
				job.updatedAt = Date.now();
				this.notify(job);
			}
		})();

		return job;
	}

	/** 重新读取课程列表 */
	async refresh(opts: { uid: string; refresh?: boolean }): Promise<AutomationJob> {
		const uid = String((opts && opts.uid) || '');
		if (!uid) throw new Error('缺少浏览器实例');

		const job = this.ensure(uid);
		if (job.state === 'running') throw new Error('自动化任务执行中，请稍候');

		const result = await this.dispatch('course.list', {
			uid,
			refresh: !(opts && opts.refresh === false)
		});

		this.applyCourses(job, result);
		job.state = 'done';
		job.message = job.courses.length ? `识别到 ${job.courses.length} 门课程` : '没有识别到课程';
		job.updatedAt = Date.now();
		job.finishedAt = job.finishedAt || Date.now();
		this.notify(job);
		return job;
	}

	/** 进入课程（进入后由桌面端扩展里的刷课脚本接管） */
	async enter(opts: { uid: string; id: string; name?: string }): Promise<{ url: string; title: string }> {
		const uid = String((opts && opts.uid) || '');
		const id = String((opts && opts.id) || '');
		if (!uid || !id) throw new Error('缺少参数');

		const result: { url: string; title: string } = await this.dispatch('course.enter', {
			uid,
			id,
			name: (opts && opts.name) || ''
		});

		const job = this.jobs.get(uid);
		if (job) {
			job.pageUrl = (result && result.url) || job.pageUrl;
			job.message = `已进入课程：${(result && (result.title || result.url)) || ''}`;
			job.updatedAt = Date.now();
			this.notify(job);
		}
		return result;
	}

	private applyCourses(job: AutomationJob, result: any): void {
		job.courses = (result && result.courses) || [];
		job.platform = (result && result.platform) || '';
		job.pageUrl = (result && result.pageUrl) || '';
		job.hint = (result && result.hint) || '';
	}

	private ensure(uid: string): AutomationJob {
		const existing = this.jobs.get(uid);
		if (existing) return existing;

		const job: AutomationJob = {
			uid,
			name: '',
			state: 'idle',
			message: '',
			startedAt: 0,
			finishedAt: 0,
			updatedAt: Date.now(),
			courses: [],
			platform: '',
			pageUrl: '',
			hint: ''
		};
		this.jobs.set(uid, job);
		return job;
	}
}
