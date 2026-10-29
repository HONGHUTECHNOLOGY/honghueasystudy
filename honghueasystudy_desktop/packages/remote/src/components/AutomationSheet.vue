<template>
	<div
		class="mask"
		@click.self="emit('close')"
	>
		<section
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label="自动登录与选课"
		>
			<span class="grabber"></span>

			<header class="head">
				<span class="head__icon">
					<Icon
						name="wand"
						:size="17"
					/>
				</span>
				<div class="head__text">
					<h2>自动登录 · 选课</h2>
					<p class="faint ellipsis">{{ browser?.name }} · 在电脑上的浏览器里执行</p>
				</div>
				<button
					type="button"
					class="close-btn"
					aria-label="关闭"
					@click="emit('close')"
				>
					<Icon
						name="close"
						:size="17"
					/>
				</button>
			</header>

			<div class="body">
				<!-- ① 登录 -->
				<section class="block">
					<p class="block__title">
						<span>① 运行登录脚本</span>
						<span class="faint">账号只在本次执行时下发</span>
					</p>

					<div class="scripts">
						<button
							v-for="item in scripts"
							:key="item.name"
							type="button"
							class="script"
							:class="{ on: item.name === scriptName }"
							@click="pickScript(item)"
						>
							<span class="script__avatar">{{ item.name.slice(0, 1) }}</span>
							<span class="script__text">
								<b class="ellipsis">{{ item.name }}</b>
								<small class="faint ellipsis">{{ fieldsHint(item) }}</small>
							</span>
							<Icon
								v-if="item.name === scriptName"
								name="check"
								:size="14"
							/>
						</button>
						<p
							v-if="!scripts.length"
							class="empty"
						>
							{{ scriptsError || '正在读取脚本目录…' }}
						</p>
					</div>

					<div
						v-if="current"
						class="form"
					>
						<label
							v-for="field in current.fields"
							:key="field.key"
							class="field"
						>
							<span class="field__label">
								{{ field.label }}
								<em v-if="field.required">*</em>
							</span>

							<textarea
								v-if="field.type === 'textarea'"
								v-model="form[field.key]"
								class="input"
								rows="3"
								:placeholder="field.placeholder || ''"
							></textarea>

							<select
								v-else-if="field.type === 'select'"
								v-model="form[field.key]"
								class="input"
							>
								<option
									v-for="opt in field.options || []"
									:key="String(opt.value)"
									:value="opt.value"
								>
									{{ opt.label }}
								</option>
							</select>

							<button
								v-else-if="field.type === 'switch'"
								type="button"
								class="switch"
								:class="{ on: !!form[field.key] }"
								@click="form[field.key] = !form[field.key]"
							>
								<span></span>
								{{ form[field.key] ? '已开启' : '未开启' }}
							</button>

							<input
								v-else
								v-model="form[field.key]"
								class="input"
								:type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
								:placeholder="field.placeholder || ''"
								:maxlength="field.type === 'number' ? undefined : field.max"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
							/>
						</label>
					</div>

					<button
						type="button"
						class="btn btn-primary run"
						:disabled="!canRun"
						@click="doRun"
					>
						<span
							v-if="running"
							class="spinner"
						></span>
						<Icon
							v-else
							name="key"
							:size="15"
						/>
						{{ running ? '正在登录，请稍候…' : '运行登录脚本' }}
					</button>

					<p
						v-if="job && job.message"
						class="status"
						:class="job.state"
					>
						{{ job.message }}
					</p>
					<p
						v-if="job && job.hint && job.state !== 'running'"
						class="hint faint"
					>
						{{ job.hint }}
					</p>
				</section>

				<!-- ② 选课 -->
				<section class="block">
					<p class="block__title">
						<span>② 选择课程</span>
						<button
							type="button"
							class="mini"
							:disabled="refreshing || running"
							@click="doRefresh"
						>
							<span
								v-if="refreshing"
								class="spinner"
							></span>
							<Icon
								v-else
								name="refresh"
								:size="12"
							/>
							{{ refreshing ? '读取中…' : '刷新' }}
						</button>
					</p>

					<div
						v-if="courses.length"
						class="courses"
					>
						<button
							v-for="course in courses"
							:key="course.id"
							type="button"
							class="course"
							:disabled="!!entering"
							@click="doEnter(course)"
						>
							<span class="course__name ellipsis">{{ course.name }}</span>
							<span
								v-if="entering === course.id"
								class="spinner"
							></span>
							<Icon
								v-else
								name="chevron"
								:size="14"
							/>
						</button>
					</div>

					<p
						v-else
						class="empty"
					>
						{{ emptyText }}
					</p>
				</section>

				<p class="tip">
					进入课程后，电脑端浏览器里的刷课脚本会自动接管，这里不用再操作。
				</p>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Icon from './Icon.vue';
import type { RemoteCourse, RemoteScript } from '../api';
import {
	enterCourseById,
	fetchAutomation,
	loadScripts,
	probeCourses,
	refreshCourseList,
	runLoginScript,
	state,
	toast,
	ui
} from '../store';

const emit = defineEmits<{ (e: 'close'): void }>();

const uid = computed(() => ui.detailUid);
const browser = computed(() => state.browsers.find((item) => item.uid === ui.detailUid));
const scripts = computed<RemoteScript[]>(() => state.scripts);
const job = computed(() => state.automation[uid.value]);

const scriptName = ref('');
const current = computed<RemoteScript | undefined>(() => scripts.value.find((item) => item.name === scriptName.value));

const form = reactive<Record<string, any>>({});
const scriptsError = ref('');
const entering = ref('');
/** 打开面板时静默读一次课程：有反馈，用户才不会以为「一门课都没有」 */
const probing = ref(false);

/** 正在执行登录（本地请求在途，或后端任务处于 running） */
const running = computed(() => state.automationBusy[uid.value] === 'run' || job.value?.state === 'running');
const refreshing = computed(() => state.automationBusy[uid.value] === 'courses');
const courses = computed<RemoteCourse[]>(() => (job.value ? job.value.courses : []));

const canRun = computed(() => !!current.value && !running.value && !state.automationBusy[uid.value]);

/** 表单在切换脚本时重建：先用本机缓存（账号），密码永远不落盘 */
const FORM_CACHE_PREFIX = 'hh-remote:auto:';

function readCache(name: string): Record<string, any> {
	try {
		const raw = localStorage.getItem(FORM_CACHE_PREFIX + name);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function writeCache(name: string, script: RemoteScript): void {
	const data: Record<string, any> = {};
	script.fields.forEach((field) => {
		/** 密码只存在内存里，不写 localStorage */
		if (field.type !== 'password') data[field.key] = form[field.key];
	});
	try {
		localStorage.setItem(FORM_CACHE_PREFIX + name, JSON.stringify(data));
	} catch {
		/* 隐私模式写入失败可忽略 */
	}
}

function fillForm(script: RemoteScript | undefined): void {
	Object.keys(form).forEach((key) => delete form[key]);
	if (!script) return;

	const cache = readCache(script.name);
	script.fields.forEach((field) => {
		const cached = Object.prototype.hasOwnProperty.call(cache, field.key) ? cache[field.key] : undefined;
		form[field.key] = cached !== undefined && cached !== '' ? cached : field.value !== undefined ? field.value : '';
	});
}

function pickScript(script: RemoteScript): void {
	if (running.value) return;
	scriptName.value = script.name;
	fillForm(script);
}

function fieldsHint(script: RemoteScript): string {
	const labels = script.fields.map((field) => field.label);
	return labels.length ? labels.join(' · ') : '无参数';
}

const emptyText = computed(() => {
	if (!browser.value || browser.value.status !== 'launched') return '浏览器未运行，请先在详情里启动浏览器';
	if (running.value) return '登录完成后会自动读取课程列表…';
	if (probing.value) return '正在读取课程列表…';
	if (job.value && job.value.state === 'error') return '登录未完成，课程列表暂不可用';
	if (job.value && job.value.hint) return job.value.hint;
	return '还没有课程列表。登录完成后会自动读取，也可以点右上角「刷新」。';
});

async function doRun(): Promise<void> {
	const script = current.value;
	if (!script || running.value) return;

	const missing = script.fields.filter((field) => field.required && !String(form[field.key] ?? '').trim());
	if (missing.length) {
		toast(`请填写：${missing.map((field) => field.label).join('、')}`, 'error');
		return;
	}

	writeCache(script.name, script);
	const configs: Record<string, any> = {};
	script.fields.forEach((field) => {
		configs[field.key] = form[field.key];
	});

	try {
		await runLoginScript(uid.value, script.name, configs);
	} catch {
		/* 错误提示已在 store 里统一处理 */
	}
}

async function doRefresh(): Promise<void> {
	if (refreshing.value || running.value) return;
	try {
		await refreshCourseList(uid.value);
	} catch {
		/* 已提示 */
	}
}

async function doEnter(course: RemoteCourse): Promise<void> {
	if (entering.value) return;
	entering.value = course.id;
	try {
		await enterCourseById(uid.value, course.id, course.name);
	} catch {
		/* 已提示 */
	} finally {
		entering.value = '';
	}
}

/** 兜底轮询：SSE 断线（移动网络常见）时也能看到登录结果 */
let pollTimer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
	const list = await loadScripts();
	if (list.length === 0) {
		scriptsError.value = '暂时读不到脚本目录，请确认桌面端已更新到支持远程自动化的版本';
	} else if (!scriptName.value) {
		/** 默认选第一个登录脚本：新建页面这类通用脚本不适合当默认 */
		const login = list.find((item) => item.name.indexOf('登录') !== -1) || list[0];
		pickScript(login);
	}

	await fetchAutomation(uid.value);

	/**
	 * 浏览器开着「启动后自动运行自动程序」时，课程页通常早就打开了：
	 * 进来静默探一次（不导航、不弹提示），能读就直接列出来，省一步「刷新」。
	 */
	if (!job.value || !job.value.courses.length) {
		/**
		 * 状态同步有延迟，不能只认 `launched`：只要浏览器还没关就探一次。
		 * 探测本身有 catch，浏览器没起来时静默失败，不影响面板。
		 */
		if (browser.value && browser.value.status !== 'closed') {
			probing.value = true;
			try {
				await probeCourses(uid.value);
			} finally {
				probing.value = false;
			}
		}
	}

	pollTimer = setInterval(() => {
		if (job.value && job.value.state === 'running') fetchAutomation(uid.value);
	}, 3000);
});

onBeforeUnmount(() => {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = undefined;
	}
});
</script>

<style scoped>
.mask {
	position: fixed;
	inset: 0;
	z-index: 70;
	background: var(--overlay);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	animation: fade-in 0.2s var(--ease);
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.sheet {
	width: 100%;
	max-width: 660px;
	max-height: 92vh;
	overflow-y: auto;
	background: var(--sheet-bg);
	border: 1px solid var(--line);
	border-bottom: none;
	border-radius: 22px 22px 0 0;
	padding: 8px 16px calc(var(--safe-bottom) + 18px);
	animation: slide-up 0.3s var(--ease);
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
}

@keyframes slide-up {
	from {
		transform: translateY(26px);
		opacity: 0.5;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}

.grabber {
	width: 34px;
	height: 4px;
	border-radius: 999px;
	background: var(--line-strong);
	margin: 2px auto 12px;
}

.head {
	display: flex;
	align-items: flex-start;
	gap: 9px;
	margin-bottom: 14px;
}

.head__icon {
	width: 30px;
	height: 30px;
	border-radius: 10px;
	display: grid;
	place-items: center;
	background: var(--brand-soft);
	color: var(--brand-text);
	flex: none;
	margin-top: 2px;
}

.head__text {
	flex: 1;
	min-width: 0;
}

.head h2 {
	margin: 0;
	font-size: 16.5px;
	font-weight: 650;
	letter-spacing: -0.01em;
}

.head p {
	margin: 2px 0 0;
	font-size: 11.5px;
}

.close-btn {
	width: 32px;
	height: 32px;
	border-radius: 10px;
	display: grid;
	place-items: center;
	background: var(--surface-2);
	color: var(--text-2);
	flex: none;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.block {
	border-radius: 14px;
	border: 1px solid var(--line);
	background: var(--surface);
	overflow: hidden;
	padding-bottom: 12px;
}

.block__title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin: 0 0 10px;
	padding: 9px 12px;
	font-size: 11.5px;
	font-weight: 550;
	color: var(--text-2);
	border-bottom: 1px solid var(--line);
}

.mini {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 8px;
	border-radius: 999px;
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 10.5px;
}

.mini:disabled {
	opacity: 0.6;
}

/* ---------------------------------------------------------------- 脚本列表 */

.scripts {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0 6px;
	max-height: 190px;
	overflow-y: auto;
}

.script {
	display: flex;
	align-items: center;
	gap: 9px;
	width: 100%;
	padding: 8px;
	border: none;
	border-radius: 10px;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
}

.script:hover {
	background: var(--surface-2);
}

.script.on {
	background: var(--brand-soft);
	box-shadow: inset 0 0 0 1px var(--line-brand);
}

.script__avatar {
	width: 26px;
	height: 26px;
	border-radius: 9px;
	display: grid;
	place-items: center;
	flex: none;
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 12px;
	font-weight: 600;
}

.script.on .script__avatar {
	background: var(--brand);
	color: #fff;
}

.script__text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.script__text b {
	font-size: 12.5px;
	font-weight: 550;
}

.script__text small {
	font-size: 10.5px;
}

/* ---------------------------------------------------------------- 表单 */

.form {
	display: flex;
	flex-direction: column;
	gap: 9px;
	padding: 10px 12px 0;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 5px;
}

.field__label {
	font-size: 11px;
	color: var(--text-3);
	display: flex;
	align-items: center;
	gap: 3px;
}

.field__label em {
	color: var(--danger);
	font-style: normal;
}

.input {
	width: 100%;
	padding: 9px 11px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--inset);
	color: var(--text);
	font-size: 13px;
	outline: none;
	transition: border-color 0.16s var(--ease), box-shadow 0.16s var(--ease);
}

.input:focus {
	border-color: var(--line-brand);
	box-shadow: 0 0 0 3px var(--brand-soft);
}

textarea.input {
	resize: vertical;
	min-height: 64px;
}

.switch {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	padding: 7px 11px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--inset);
	color: var(--text-3);
	font-size: 12px;
	width: fit-content;
}

.switch span {
	width: 26px;
	height: 15px;
	border-radius: 999px;
	background: var(--line-strong);
	position: relative;
	transition: background 0.18s var(--ease);
}

.switch span::after {
	content: '';
	position: absolute;
	top: 2px;
	left: 2px;
	width: 11px;
	height: 11px;
	border-radius: 50%;
	background: #fff;
	transition: transform 0.18s var(--ease);
}

.switch.on {
	color: var(--ok);
	border-color: rgba(53, 211, 154, 0.4);
}

.switch.on span {
	background: var(--ok);
}

.switch.on span::after {
	transform: translateX(11px);
}

.run {
	width: calc(100% - 24px);
	margin: 12px 12px 0;
}

.status {
	margin: 9px 12px 0;
	font-size: 11.5px;
	line-height: 1.5;
	color: var(--text-2);
	word-break: break-word;
}

.status.done {
	color: var(--ok);
}

.status.error {
	color: var(--danger);
}

.hint {
	margin: 6px 12px 0;
	font-size: 11px;
	line-height: 1.5;
}

/* ---------------------------------------------------------------- 课程 */

.courses {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0 6px;
	max-height: 300px;
	overflow-y: auto;
}

.course {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 10px;
	border: none;
	border-radius: 10px;
	background: var(--surface-2);
	color: inherit;
	font: inherit;
	text-align: left;
}

.course:disabled {
	opacity: 0.6;
}

.course__name {
	flex: 1;
	min-width: 0;
	font-size: 12.5px;
	line-height: 1.4;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.empty {
	margin: 4px 12px;
	font-size: 11.5px;
	line-height: 1.6;
	color: var(--text-3);
}

.tip {
	margin: 0 2px;
	font-size: 11px;
	line-height: 1.6;
	color: var(--text-3);
}
</style>
