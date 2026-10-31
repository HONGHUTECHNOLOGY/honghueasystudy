<template>
	<a-card class="plan-card">
		<template #title>
			<div class="d-flex align-items-center gap-2">
				<Icon
					type="smart_toy"
					:size="18"
				/>
				<span>自动刷课</span>
				<a-tag
					v-if="plan.schedule.enabled"
					size="small"
					color="arcoblue"
				>
					定时中
				</a-tag>
			</div>
		</template>

		<template #extra>
			<a-tooltip
				content="自动刷课会在每次启动浏览器（含定时启动）后，等登录脚本跑完，自动进入下面记住的课程；进课后按「进课后」那一项打开章节 / 作业 / 考试。真正的学习与作答由扩展里的脚本接管。"
				position="left"
			>
				<Icon
					type="help"
					class="text-secondary"
				/>
			</a-tooltip>
		</template>

		<!-- ① 自动进入课程 -->
		<div class="row">
			<div class="row-label">
				<span>进课后自动学习</span>
				<a-switch
					v-model="plan.study.enabled"
					size="small"
					:disabled="!plan.study.course"
				/>
			</div>
			<div class="row-body">
				<template v-if="plan.study.course">
					<div class="course">
						<a-tag
							v-if="plan.study.course?.label"
							size="small"
							color="arcoblue"
						>
							{{ plan.study.course?.label }}
						</a-tag>
						<span
							class="course-name"
							:title="plan.study.course?.name"
						>{{ plan.study.course?.name }}</span>
						<a-button
							size="mini"
							type="text"
							@click="clearCourse"
						>
							清除
						</a-button>
					</div>
				</template>
				<div
					v-else
					class="text-secondary"
					style="font-size: 12px"
				>
					还没有选择课程。浏览器登录后点下面的按钮选一门，之后每次启动都会自动进入。
				</div>

				<a-space class="mt-2">
					<a-button
						size="mini"
						type="outline"
						:loading="picking || launching"
						@click="openPicker"
					>
						<template #icon><icon-book /></template>
						{{ plan.study.course ? '重新选择课程' : '选择要刷的课程' }}
					</a-button>
					<a-button
						size="mini"
						:disabled="!plan.study.course || busy"
						:loading="busy"
						@click="runNow"
					>
						<template #icon><icon-play-arrow /></template>
						立即执行一次
					</a-button>
					<a-button
						size="mini"
						status="warning"
						:disabled="!running || busy"
						@click="pause"
					>
						<template #icon><icon-pause /></template>
						暂停
					</a-button>
				</a-space>

				<!-- 进课后做什么：只有超星有章节/作业/考试三套目录 -->
				<div
					v-if="catalogVisible"
					class="d-flex align-items-center gap-2 mt-2"
				>
					<span style="font-size: 12px">进课后</span>
					<a-select
						v-model="plan.study.target"
						size="small"
						style="width: 210px"
						:disabled="!plan.study.course"
					>
						<a-option value="none">只进课程</a-option>
						<a-option value="chapter">章节：自动往下刷</a-option>
						<a-option value="work">作业：打开第一份待做</a-option>
						<a-option value="exam">考试：打开第一场可考</a-option>
					</a-select>
				</div>
			</div>
		</div>

		<!-- ② 每日定时 -->
		<a-divider class="mt-3 mb-2" />

		<div class="row">
			<div class="row-label">
				<span>每日定时</span>
				<a-switch
					v-model="plan.schedule.enabled"
					size="small"
				/>
			</div>
			<div class="row-body">
				<div class="d-flex align-items-center gap-2 flex-wrap">
					<span style="font-size: 12px">每天</span>
					<a-time-picker
						v-model="plan.schedule.startTime"
						size="small"
						format="HH:mm"
						:allow-clear="false"
						style="width: 96px"
					/>
					<span
						class="text-secondary"
						style="font-size: 11px"
					>
						启动
					</span>
				</div>

				<div class="mt-2">
					<a-checkbox-group
						:model-value="plan.schedule.days"
						size="small"
						@change="(value) => (plan.schedule.days = (value as number[]).slice().sort((a, b) => a - b))"
					>
						<a-checkbox
							v-for="(label, index) of WEEK_LABELS"
							:key="index"
							:value="index"
						>
							{{ label }}
						</a-checkbox>
					</a-checkbox-group>
					<div
						class="text-secondary mt-1"
						style="font-size: 11px"
					>
						不勾选=每天
					</div>
				</div>

				<div class="d-flex align-items-center gap-2 mt-2 flex-wrap">
					<span style="font-size: 12px">结束后</span>
					<a-select
						v-model="plan.schedule.endAction"
						size="small"
						style="width: 148px"
					>
						<a-option value="pause">暂停刷课</a-option>
						<a-option value="pause-close">暂停并关闭浏览器</a-option>
						<a-option value="close">直接关闭浏览器</a-option>
						<a-option value="none">不处理</a-option>
					</a-select>

					<span style="font-size: 12px">单次最多</span>
					<a-input-number
						v-model="plan.schedule.maxMinutes"
						size="small"
						:min="0"
						:max="1440"
						:step="10"
						style="width: 100px"
					/>
					<span class="text-secondary">分钟（0=不限）</span>
				</div>

				<div
					class="text-secondary mt-2"
					style="font-size: 11px; line-height: 1.6"
				>
					{{ scheduleSummary(plan.schedule) }}
					<template v-if="plan.schedule.enabled">
						<br />
						下次自动启动：{{ nextText }}
					</template>
				</div>
			</div>
		</div>

		<!-- ③ 课程内容（只有超星有这套三栏目录） -->
		<template v-if="catalogVisible">
			<div class="d-flex align-items-center justify-content-between mt-3 mb-2">
				<span class="d-flex align-items-center gap-2">
					课程内容
					<a-tag
						v-if="!courseReady"
						size="small"
						color="gray"
					>
						未进入课程
					</a-tag>
				</span>
				<a-button
					size="mini"
					:disabled="!courseReady"
					:loading="catalogLoading"
					@click="reloadCatalog"
				>
					读取
				</a-button>
			</div>

			<a-radio-group
				v-model="catalogKind"
				type="button"
				size="mini"
				:disabled="!courseReady"
				@change="onKindChange"
			>
				<a-radio value="chapter"> 章节 </a-radio>
				<a-radio value="work"> 作业 </a-radio>
				<a-radio value="exam"> 考试 </a-radio>
			</a-radio-group>

			<!-- 没进课程页：三个目录在课程页里才有入口，先置灰并说清怎么放开 -->
			<p
				v-if="!courseReady"
				class="text-secondary"
				style="font-size: 12px; margin: 8px 0 0"
			>
				{{ catalogLockedText }}
			</p>

			<!-- 章节的主操作：往下刷，而不是挑某一节 -->
			<a-button
				v-if="catalogKind === 'chapter' && courseReady"
				long
				type="primary"
				size="small"
				style="margin-top: 8px"
				:loading="advancing"
				@click="doAdvance"
			>
				从当前进度继续刷
			</a-button>

			<p
				v-if="courseReady && catalogSummary"
				class="text-secondary"
				style="font-size: 12px; margin: 8px 0 0"
			>
				{{ catalogSummary }}
			</p>

		<div
			v-if="courseReady && catalogRows.length"
			class="catalog"
		>
			<div
				v-for="row in catalogRows"
				:key="row.key"
				class="catalog-row"
				:class="[row.status, { group: row.status === 'group' }]"
				:style="{ paddingLeft: 8 + Math.max(0, row.depth - 1) * 12 + 'px' }"
				:title="row.hint"
			>
				<span class="catalog-no">{{ row.no }}</span>
				<span class="catalog-title">{{ row.title }}</span>
				<a-tag
					v-if="row.badge"
					size="small"
					:color="row.tagColor"
				>
					{{ row.badge }}
				</a-tag>
				<a-button
					v-if="row.openable"
					size="mini"
					type="text"
					:loading="opening === row.id"
					@click="openItem(row)"
				>
					{{ row.action }}
				</a-button>
			</div>
		</div>
		<p
			v-else-if="courseReady"
			class="text-secondary"
			style="font-size: 12px; margin: 8px 0 0"
		>
			{{ catalogNote }}
		</p>
		<!-- 推进成功后课程页已被学习页顶掉，这时再点「读取」必然报错，所以直说 -->
		<p
			v-if="advanceNote && !catalog"
			class="text-secondary"
			style="font-size: 12px; margin: 4px 0 0"
		>
			刷课脚本正在接着往下推。想看最新进度，先在浏览器里回到课程页，再点「读取」。
		</p>
		</template>

		<!-- ④ 状态 -->
		<div
			v-if="status.message"
			class="status"
			:class="status.state"
		>
			{{ status.message }}
		</div>
	</a-card>

	<!-- 选课弹窗 -->
	<a-modal
		v-model:visible="state.showPicker"
		:footer="false"
		:width="520"
		unmount-on-close
	>
		<template #title> 选择要自动学习的课程 </template>

		<div style="max-height: 60vh; overflow: overlay">
			<a-spin
				v-if="picking"
				style="width: 100%"
				tip="正在读取课程列表…"
			/>
			<template v-else>
				<p
					v-if="!courses.length"
					class="text-secondary"
					style="font-size: 13px"
				>
					{{ pickerError || '没有读到课程。请确认浏览器已登录，然后重试。' }}
				</p>
				<div
					v-for="course in courses"
					:key="course.id"
					class="pick-item"
					@click="choose(course)"
				>
					<a-tag
						v-if="course.label"
						size="small"
						color="arcoblue"
					>
						{{ course.label }}
					</a-tag>
					<span class="course-name">{{ course.name }}</span>
				</div>
			</template>
		</div>

		<div class="d-flex justify-content-end gap-2 mt-3">
			<a-button
				size="small"
				:loading="picking"
				@click="loadCourses"
			>
				重新读取
			</a-button>
			<a-button
				size="small"
				@click="state.showPicker = false"
			>
				取消
			</a-button>
		</div>
	</a-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import Icon from '../Icon.vue';
import { Browser } from '../../fs/browser';
import { Process } from '../../utils/process';
import {
	catalogSupport,
	courseReady as courseReadyMap,
	enterNextChapter,
	fetchCatalog,
	fetchCourseList,
	openCatalog,
	pauseStudy,
	readPlan,
	refreshCourseReady,
	rememberCourse,
	runStudyNow,
	studyStatus,
	writePlan,
	type CatalogItem,
	type CatalogKind,
	type CourseCatalog
} from '../../utils/automationPlan';
import { WEEK_LABELS, nextRunAt, scheduleSummary } from '@honghu-desktop/app/src/scripts/plan';

const props = defineProps<{
	browser: Browser;
}>();

/** 本地镜像：直接改这里，deep watch 写回实体（写回会触发存档持久化） */
const plan = reactive(readPlan(props.browser));

watch(
	plan,
	() => {
		writePlan(props.browser, plan);
	},
	{ deep: true }
);

/** 浏览器被切换/重新加载时同步一次（侧边栏会复用组件实例） */
watch(
	() => props.browser.uid,
	() => Object.assign(plan, readPlan(props.browser))
);

/**
 * 课程页就绪探测
 *
 * 用户在浏览器里随时可能进退课程页，三个目录的灰/亮要跟着变。
 * 只在面板打开期间问，关掉就不打扰子进程。
 */
let readyTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
	refreshCourseReady(props.browser.uid).catch(() => {});
	readyTimer = setInterval(() => {
		if (!running.value) return;
		refreshCourseReady(props.browser.uid).catch(() => {});
	}, 5000);
});

onBeforeUnmount(() => {
	if (readyTimer) {
		clearInterval(readyTimer);
		readyTimer = undefined;
	}
});

const state = reactive({
	showPicker: false
});

const courses = reactive<{ id: string; name: string; url: string; label?: string }[]>([]);
const busyState = reactive({ picking: false, launching: false, running: false });
const pickerError = ref('');
/** 课程列表来自哪个平台（选课时写进方案） */
const coursePlatform = ref('');

const picking = computed(() => busyState.picking);
const launching = computed(() => busyState.launching);

const status = computed(
	() => studyStatus[props.browser.uid] || { state: 'idle' as const, message: '', courseName: '', updatedAt: 0, enteredAt: 0 }
);

const running = computed(() => {
	const proc = Process.from(props.browser.uid);
	return !!proc && proc.status === 'launched';
});

const busy = computed(() => status.value.state === 'waiting' || status.value.state === 'running');

// ---------------------------------------------------------------- 课程内容（章节 / 作业 / 考试）

interface CatalogRow {
	key: string;
	id: string;
	title: string;
	no: string;
	depth: number;
	badge: string;
	tagColor: string;
	status: string;
	openable: boolean;
	action: string;
	hint: string;
}

/** 章节行的按钮只是「跳到这一节」，往前推进靠上面的主按钮 */
const CATALOG_ACTION: Record<CatalogKind, string> = { chapter: '跳转', work: '做题', exam: '开考' };

const catalogKind = ref<CatalogKind>('chapter');
const catalog = ref<CourseCatalog | null>(null);
const catalogBusy = reactive({ loading: false });
const catalogError = ref('');
/**
 * 上一次「继续刷」的结果
 *
 * 推进成功后章节缓存会被清空（状态已变），但课程页这时已被学习页顶掉，
 * 再点「读取」只会报「还没有进入课程页」。所以把结果留作空态文案。
 */
const advanceNote = ref('');
const opening = ref('');
const advancing = ref(false);

/**
 * 课程内容区块要不要显示
 *
 * 只有超星有「章节 / 作业 / 考试」三栏，其它平台课程页结构完全不同。
 * 优先用本次运行进入课程时实测的结果，其次看记住的课程平台；
 * 都没有（还没进过课）就先显示，内容区会提示先进入课程。
 */
const catalogVisible = computed(() => {
	const measured = catalogSupport[props.browser.uid];
	if (measured !== undefined) return measured;
	const platform = plan.study.course && plan.study.course.platform;
	if (platform) return platform === 'chaoxing';
	return true;
});

const catalogLoading = computed(() => catalogBusy.loading);
const catalogSummary = computed(() => (catalog.value ? catalog.value.summary : ''));

/**
 * 三个目录能不能点
 *
 * 只有课程页里才有这套菜单：没进课时把它们点亮，用户点下去只会收到一句
 * 「还没有进入课程页」。所以由 `refreshCourseReady` 去问子进程，问到才放开。
 */
const courseReady = computed(() => !!courseReadyMap[props.browser.uid]);

/** 置灰时给一句「怎么才能放开」，比单纯的灰色按钮有用 */
const catalogLockedText = computed(() => {
	if (!running.value) return '浏览器没运行。先启动浏览器并进入课程，这里才能读章节 / 作业 / 考试。';
	if (!plan.study.course) return '还没选课。先点「选择要刷的课程」，进去之后这三个目录才会放开。';
	return '课程页没开着。可以点「立即执行一次」进课，或在浏览器里回到课程页，这里会自动放开。';
});

/** 摊平成界面行：分组行不给按钮，状态归一成三种徽标 */
const catalogRows = computed<CatalogRow[]>(() => {
	const data = catalog.value;
	if (!data || !Array.isArray(data.items)) return [];

	const action = CATALOG_ACTION[catalogKind.value];
	return data.items.map((item: CatalogItem, index: number) => {
		const isGroup = !item.id && item.status === 'unknown';
		let badge = '';
		let tagColor = 'orange';
		if (!isGroup) {
			badge = item.status === 'done' ? '已完成' : item.status === 'locked' ? '未解锁' : item.state || '待完成';
			tagColor = item.status === 'done' ? 'green' : item.status === 'locked' ? 'gray' : 'orange';
		}
		return {
			key: (item.id || 'g' + index) + '-' + index,
			id: item.id,
			title: item.title,
			no: item.no,
			depth: item.depth,
			badge,
			tagColor,
			status: isGroup ? 'group' : item.status,
			openable: !isGroup && item.clickable && item.status !== 'locked',
			action,
			hint: item.hint
		};
	});
});

const catalogNote = computed(() => {
	if (catalogError.value) return catalogError.value;
	if (catalogBusy.loading) return '正在读取…';
	if (catalog.value) return catalog.value.message || '这个目录是空的';
	if (advanceNote.value) return advanceNote.value;
	return '点「读取」加载章节 / 作业 / 考试。需要先进入课程。';
});

async function loadCatalogNow(): Promise<void> {
	if (catalogBusy.loading) return;
	catalogBusy.loading = true;
	catalogError.value = '';
	/** 重新读目录了，上一次「继续刷」的结果让位给真实数据 */
	advanceNote.value = '';
	try {
		catalog.value = await fetchCatalog(props.browser.uid, catalogKind.value);
	} catch (e) {
		catalog.value = null;
		catalogError.value = e instanceof Error ? e.message : String(e);
	} finally {
		catalogBusy.loading = false;
	}
}

async function reloadCatalog(): Promise<void> {
	await loadCatalogNow();
}

async function onKindChange(): Promise<void> {
	/** 换目录要先清掉上一份，否则会短暂显示「章节」的条目配着「作业」的标题 */
	catalog.value = null;
	await loadCatalogNow();
}

async function openItem(row: CatalogRow): Promise<void> {
	if (!row.openable || opening.value) return;
	opening.value = row.id;
	try {
		const result = await openCatalog(props.browser.uid, catalogKind.value, row.id);
		Message.success(result.message || '已进入：' + (result.title || row.title));
		/** 进去之后当前页就不是课程页了，问一次让三个目录如实变灰 */
		refreshCourseReady(props.browser.uid).catch(() => {});
	} catch (e) {
		Message.error(e instanceof Error ? e.message : String(e));
	} finally {
		opening.value = '';
	}
}

/**
 * 从当前进度继续刷
 *
 * 找第一个「已解锁且还有任务点」的章节并进入，之后的章节交给刷课脚本按顺序推。
 * 这才是主要用法——用户不该一节一节挑。
 */
async function doAdvance(): Promise<void> {
	if (advancing.value) return;
	advancing.value = true;
	catalogError.value = '';
	advanceNote.value = '';
	try {
		const result = await enterNextChapter(props.browser.uid);
		advanceNote.value = result.message || (result.entered ? '已进入下一节' : '没有可以继续的章节了');
		if (result.entered) {
			Message.success(result.message || '已进入下一节');
			/** 进去了，章节状态就变了：下次打开重新读 */
			catalog.value = null;
		} else {
			Message.info(result.message || '没有待完成的章节');
		}
		/** 推进成功就跳到学习页了，课程页被顶掉，置灰状态要跟着更新 */
		refreshCourseReady(props.browser.uid).catch(() => {});
	} catch (e) {
		const text = e instanceof Error ? e.message : String(e);
		catalogError.value = text;
		Message.error(text);
	} finally {
		advancing.value = false;
	}
}

const nextText = computed(() => {
	const at = nextRunAt(plan.schedule, new Date());
	if (!at) return '—';
	const date = new Date(at);
	const today = new Date();
	const sameDay = date.toDateString() === today.toDateString();
	const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	return sameDay ? `今天 ${time}` : `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`;
});

function clearCourse(): void {
	plan.study.course = null;
	plan.study.enabled = false;
}

async function openPicker(): Promise<void> {
	state.showPicker = true;
	await loadCourses();
}

async function loadCourses(): Promise<void> {
	if (busyState.picking) return;
	busyState.picking = true;
	pickerError.value = '';

	try {
		/** 浏览器没起来就先拉起来：读课程必须有真实页面 */
		if (!Process.from(props.browser.uid)) {
			busyState.launching = true;
			await props.browser.launch();
			busyState.launching = false;
			await waitLaunched(2 * 60 * 1000);
			/** 启动会自动跑登录脚本，等它跑完再读，否则列表是空的 */
			await sleep(3000);
		}

		const result = await fetchCourseList(props.browser.uid, { refresh: true });
		courses.splice(0, courses.length, ...(result.courses || []));
		/** 记下这批课程来自哪个平台：选课时要写进方案，决定要不要显示三栏目录 */
		coursePlatform.value = result.platform || '';
		if (!courses.length) {
			pickerError.value = result.hint || '没有读到课程，请确认账号已登录。';
		}
	} catch (e) {
		pickerError.value = e instanceof Error ? e.message : String(e);
	} finally {
		busyState.picking = false;
		busyState.launching = false;
	}
}

function choose(course: { id: string; name: string; url: string; label?: string }): void {
	/** 带上平台：之后按平台决定「课程内容」这一块显示不显示 */
	rememberCourse(props.browser, { ...course, platform: coursePlatform.value });
	Object.assign(plan, readPlan(props.browser));
	plan.study.enabled = true;
	state.showPicker = false;
	Message.success(`已记住课程：${course.name}，之后每次启动都会自动进入`);
}

async function runNow(): Promise<void> {
	if (busyState.running) return;
	busyState.running = true;
	try {
		await runStudyNow(props.browser.uid);
	} catch (e) {
		Message.error(e instanceof Error ? e.message : String(e));
	} finally {
		busyState.running = false;
	}
}

async function pause(): Promise<void> {
	try {
		const message = await pauseStudy(props.browser.uid);
		Message.info(message);
	} catch (e) {
		Message.error(e instanceof Error ? e.message : String(e));
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitLaunched(timeout: number): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const proc = Process.from(props.browser.uid);
		if (proc && proc.status === 'launched') return;
		await sleep(1000);
	}
}
</script>

<style scoped lang="less">
.plan-card {
	margin-bottom: 8px;
}

.row {
	display: flex;
	gap: 10px;
}

.row-label {
	flex: 0 0 96px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 12px;
	color: var(--color-text-2);
}

.row-body {
	flex: 1;
	min-width: 0;
}

.course {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 6px;
	border-radius: 4px;
	background: var(--color-fill-2);
}

.course-name {
	font-size: 12px;
	line-height: 1.4;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pick-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px;
	border-radius: 6px;
	cursor: pointer;
	border: 1px solid var(--color-border-2);
	margin-bottom: 6px;

	&:hover {
		border-color: rgb(var(--primary-6));
		background: var(--color-fill-2);
	}
}

.status {
	margin-top: 10px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--color-text-3);
	word-break: break-word;

	&.error {
		color: rgb(var(--danger-6));
	}

	&.done {
		color: rgb(var(--success-6));
	}

	&.running,
	&.waiting {
		color: rgb(var(--primary-6));
	}
}

/* ---------------------------------------------------- 课程内容 */

.catalog {
	margin-top: 8px;
	max-height: 320px;
	overflow: auto;
	border: 1px solid var(--color-border-2);
	border-radius: 6px;
}

.catalog-row {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 34px;
	padding: 3px 8px;
	border-top: 1px solid var(--color-border-2);
	font-size: 12px;

	&:first-child {
		border-top: 0;
	}

	/* 分组标题（"1 必修部分"） */
	&.group {
		background: var(--color-fill-2);
		font-weight: 600;
		padding-left: 8px !important;
	}

	&.locked .catalog-title {
		color: var(--color-text-3);
	}
}

.catalog-no {
	flex: none;
	min-width: 32px;
	font-size: 11px;
	color: var(--color-text-3);
	font-variant-numeric: tabular-nums;
}

.catalog-title {
	flex: 1;
	min-width: 0;
	line-height: 1.35;
	word-break: break-word;
	/** 两行封顶：一行放不下时截成「在总体国家安全观指导下全面…」，几节开头一样就分不清了 */
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
