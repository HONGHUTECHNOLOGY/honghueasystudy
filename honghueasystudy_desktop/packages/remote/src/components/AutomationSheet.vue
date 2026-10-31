<template>
	<div
		class="mask"
		@click.self="emit('close')"
	>
		<section
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label="登录选课脚本与自动化定时刷课"
		>
			<span class="grabber"></span>

			<header class="head">
				<span class="head__icon">
					<Icon
						name="auto"
						:size="17"
					/>
				</span>
				<div class="head__text">
					<h2>登录/选课 · 刷课 · 定时</h2>
					<p class="faint ellipsis">{{ browser?.name }} · 临时点一次 或 自动执行</p>
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

			<!-- 两个概念必须分开：点一次跑一次的「临时操作」 vs 保存下来的「每次启动都跑」 -->
			<div class="tabs">
				<button
					type="button"
					class="tab"
					:class="{ on: tab === 'now' }"
					@click="tab = 'now'"
				>
					临时操作
				</button>
				<button
					type="button"
					class="tab"
					:class="{ on: tab === 'auto' }"
					@click="tab = 'auto'"
				>
					自动执行
					<span class="tab__dot"></span>
				</button>
			</div>

			<div class="body">
				<!-- ============================ 自动执行（落盘） ============================ -->
				<template v-if="tab === 'auto'">
					<p class="note">
						这里的配置会保存到桌面端，<b>每次启动浏览器都会自动执行</b>；关掉应用也仍然有效。
					</p>

					<!-- ① 自动化脚本：登录等 -->
					<section class="block">
						<p class="block__title">
							<span>① 启动时自动运行的脚本</span>
							<button
								type="button"
								class="mini"
								@click="showAdd = !showAdd"
							>
								<Icon
									:name="showAdd ? 'close' : 'down'"
									:size="12"
								/>
								{{ showAdd ? '收起' : '添加脚本' }}
							</button>
						</p>

						<div
							v-if="showAdd"
							class="picker"
						>
							<button
								v-for="item in addableScripts"
								:key="item.name"
								type="button"
								class="picker__item"
								@click="addScript(item)"
							>
								<b class="ellipsis">{{ item.name }}</b>
								<small class="faint ellipsis">{{ fieldsHint(item) }}</small>
							</button>
							<p
								v-if="!addableScripts.length"
								class="empty"
							>
								{{ scripts.length ? '脚本都已添加' : scriptsError || '正在读取脚本目录…' }}
							</p>
						</div>

						<div
							v-if="formScripts.length"
							class="scripts"
						>
							<div
								v-for="(item, index) in formScripts"
								:key="item.name"
								class="script-card"
							>
								<div class="script-card__head">
									<span class="script__avatar">{{ item.name.slice(0, 1) }}</span>
									<b class="ellipsis">{{ item.name }}</b>
									<button
										type="button"
										class="remove"
										aria-label="移除"
										@click="removeScript(index)"
									>
										<Icon
											name="close"
											:size="13"
										/>
									</button>
								</div>

								<label
									v-for="field in fieldsOf(item.name)"
									:key="field.key"
									class="field"
								>
									<span class="field__label">
										{{ field.label }}
										<em v-if="field.required">*</em>
										<span
											v-if="field.type === 'password'"
											class="faint"
										>
											（留空=不修改已保存的密码）
										</span>
									</span>

									<textarea
										v-if="field.type === 'textarea'"
										v-model="item.values[field.key]"
										class="input"
										rows="2"
									></textarea>

									<select
										v-else-if="field.type === 'select'"
										v-model="item.values[field.key]"
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
										:class="{ on: !!item.values[field.key] }"
										@click="item.values[field.key] = !item.values[field.key]"
									>
										<span></span>
										{{ item.values[field.key] ? '已开启' : '未开启' }}
									</button>

									<input
										v-else
										v-model="item.values[field.key]"
										class="input"
										:type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
										:placeholder="field.placeholder || ''"
										autocomplete="off"
										spellcheck="false"
									/>
								</label>
							</div>
						</div>
						<p
							v-else
							class="empty"
						>
							还没有脚本。没有脚本也能用：手动登录一次后，自动刷课照样会进课程。
						</p>
					</section>

					<!-- ② 自动刷课 -->
					<section class="block">
						<p class="block__title">
							<span>② 自动刷课</span>
							<button
								type="button"
								class="mini"
								:disabled="busyState.courses"
								@click="pickCourses"
							>
								<span
									v-if="busyState.courses"
									class="spinner"
								></span>
								<Icon
									v-else
									name="refresh"
									:size="12"
								/>
								{{ busyState.courses ? '读取中…' : '读取课程' }}
							</button>
						</p>

						<div class="line">
							<span class="line__label">启动后进入课程</span>
							<button
								type="button"
								class="switch"
								:class="{ on: formStudy.enabled }"
								:disabled="!formStudy.course"
								@click="formStudy.enabled = !formStudy.enabled"
							>
								<span></span>
								{{ formStudy.enabled ? '已开启' : '未开启' }}
							</button>
						</div>

						<div
							v-if="formStudy.course"
							class="course-chip"
						>
							<span
								v-if="formStudy.course.label"
								class="course__label"
								>{{ formStudy.course.label }}</span
							>
							<span class="ellipsis">{{ formStudy.course.name }}</span>
							<button
								type="button"
								class="remove"
								aria-label="清除"
								@click="formStudy.course = null"
							>
								<Icon
									name="close"
									:size="12"
								/>
							</button>
						</div>
						<p
							v-else
							class="empty"
						>
							还没有记住课程。点右上角「读取课程」，从列表里选一门即可（之后每次启动都进这门）。
						</p>

						<div
							v-if="courseList.length"
							class="courses"
						>
							<button
								v-for="course in courseList"
								:key="course.id"
								type="button"
								class="course"
								:class="{ on: formStudy.course && formStudy.course.name === course.name }"
								@click="chooseCourse(course)"
							>
								<span
									v-if="course.label"
									class="course__label"
									>{{ course.label }}</span
								>
								<span class="course__name ellipsis">{{ course.name }}</span>
								<Icon
									v-if="formStudy.course && formStudy.course.name === course.name"
									name="check"
									:size="13"
								/>
							</button>
						</div>
						<p
							v-else-if="courseHint"
							class="empty"
						>
							{{ courseHint }}
						</p>

						<div
							v-if="studyTargetVisible"
							class="line"
						>
							<span class="line__label">进课后</span>
							<select
								v-model="formStudy.target"
								class="input"
								:disabled="!formStudy.course"
							>
								<option
									v-for="item in TARGET_OPTIONS"
									:key="item.value"
									:value="item.value"
								>
									{{ item.label }}
								</option>
							</select>
						</div>
						<p
							v-else-if="formStudy.course"
							class="faint"
						>
							这门课没有「章节 / 作业 / 考试」目录（只有超星有），进课后会停在课程页。
						</p>

						<div class="line">
							<span class="line__label">立即执行</span>
							<div class="line__actions">
								<button
									type="button"
									class="btn btn-ghost"
									:disabled="!formStudy.course || planBusy"
									@click="runNow"
								>
									<Icon
										name="play"
										:size="14"
									/>
									执行一次
								</button>
								<button
									type="button"
									class="btn btn-ghost"
									:disabled="!browserReady || planBusy"
									@click="stopNow"
								>
									<Icon
										name="pause"
										:size="14"
									/>
									暂停
								</button>
							</div>
						</div>

						<p
							v-if="summary && summary.message"
							class="status"
							:class="summary.state"
						>
							{{ summary.message }}
						</p>
					</section>

					<!-- ③ 每日定时 -->
					<section class="block">
						<p class="block__title">
							<span>③ 每日定时</span>
							<button
								type="button"
								class="switch"
								:class="{ on: formSchedule.enabled }"
								@click="formSchedule.enabled = !formSchedule.enabled"
							>
								<span></span>
								{{ formSchedule.enabled ? '已开启' : '未开启' }}
							</button>
						</p>

						<div class="line">
							<span class="line__label">启动时间</span>
							<div class="line__actions">
								<input
									v-model="formSchedule.startTime"
									class="input input--time"
									type="time"
								/>
							</div>
						</div>

						<div class="line line--days">
							<span class="line__label">星期</span>
							<div class="line__actions day-group">
								<button
									v-for="(label, index) in WEEK_LABELS"
									:key="index"
									type="button"
									class="day"
									:class="{ on: formSchedule.days.indexOf(index) !== -1 }"
									@click="toggleDay(index)"
								>
									{{ label }}
								</button>
							</div>
						</div>

						<div class="line">
							<span class="line__label">结束后</span>
							<select
								v-model="formSchedule.endAction"
								class="input"
							>
								<option value="pause">暂停刷课</option>
								<option value="pause-close">暂停并关闭浏览器</option>
								<option value="close">直接关闭浏览器</option>
								<option value="none">不处理</option>
							</select>
						</div>

						<div class="line">
							<span class="line__label">单次最长</span>
							<div class="line__actions">
								<input
									v-model.number="formSchedule.maxMinutes"
									class="input input--num"
									type="number"
									min="0"
									max="1440"
									step="10"
								/>
								<span class="faint">分钟（0=不限）</span>
							</div>
						</div>

						<p class="faint schedule-tip">
							{{ scheduleHead }}
							<template v-if="scheduleTail">
								<br />{{ scheduleTail }}
							</template>
							<template v-if="formSchedule.enabled && summary && summary.schedule.nextRunAt">
								<br />下次自动启动：{{ formatNext(summary.schedule.nextRunAt) }}
							</template>
						</p>
					</section>

					<div class="save-bar">
						<span
							v-if="dirty"
							class="faint"
							>有未保存的修改</span
						>
						<span
							v-else
							class="faint"
							>配置已保存</span
						>
						<button
							type="button"
							class="btn btn-primary"
							:disabled="!dirty || planBusy"
							@click="save"
						>
							<span
								v-if="busyState.save"
								class="spinner"
							></span>
							{{ busyState.save ? '保存中…' : '保存方案' }}
						</button>
					</div>
				</template>

				<!-- ============================ 临时操作（不保存） ============================ -->
				<template v-else>
					<p class="note note--warn">
						这里的操作<b>只执行这一次</b>，不会保存、以后开机也不会自动跑。要长期生效请用「自动执行」。
					</p>

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

					<section class="block">
						<p class="block__title">
							<span>② 选择课程（进一次）</span>
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
								<span
									v-if="course.label"
									class="course__label"
									>{{ course.label }}</span
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

					<section
						v-if="catalogVisible"
						class="block"
					>
						<p class="block__title">
							<span>③ 课程内容</span>
							<button
								type="button"
								class="mini"
								:disabled="catalogLoading || !catalogReady"
								@click="reloadCatalog"
							>
								<span
									v-if="catalogLoading"
									class="spinner"
								></span>
								<Icon
									v-else
									name="refresh"
									:size="12"
								/>
								{{ catalogLoading ? '读取中…' : '读取' }}
							</button>
						</p>

						<div class="kinds">
							<button
								v-for="item in CATALOG_KINDS"
								:key="item.kind"
								type="button"
								class="kind"
								:class="{ on: catalogKind === item.kind, off: !catalogReady }"
								:disabled="!catalogReady"
								@click="switchCatalog(item.kind)"
							>
								{{ item.label }}
							</button>
						</div>

						<!-- 没进课程页：三个目录在课程页里才有入口，先置灰并说清怎么放开 -->
						<p
							v-if="!catalogReady"
							class="empty"
						>
							{{ catalogLockedText }}
						</p>

						<!-- 章节的主操作：往下刷，而不是挑某一节 -->
						<button
							v-if="catalogKind === 'chapter' && catalogReady"
							type="button"
							class="advance"
							:disabled="advancing || catalogLoading"
							@click="doAdvance"
						>
							<span
								v-if="advancing"
								class="spinner"
							></span>
							<span v-else>从当前进度继续刷</span>
						</button>

						<p
							v-if="catalogReady && currentCatalog && currentCatalog.summary"
							class="faint catalog__sum"
						>
							{{ currentCatalog.summary }}
						</p>

						<div
							v-if="catalogLoading"
							class="catalog__wait"
						>
							<span class="spinner"></span>
							正在读取{{ catalogMeta.label }}…
						</div>

						<div
							v-else-if="catalogReady && catalogRows.length"
							class="catalog"
						>
							<div
								v-for="row in catalogRows"
								:key="row.key"
								class="catalog__row"
								:class="['state-' + row.status, { group: row.status === 'group' }]"
								:style="{ paddingLeft: 10 + Math.max(0, row.depth - 1) * 13 + 'px' }"
								:title="row.hint || ''"
							>
								<span
									v-if="row.no"
									class="catalog__no"
									>{{ row.no }}</span
								>
								<span class="catalog__title ellipsis">{{ row.title }}</span>
								<span
									v-if="row.badge"
									class="catalog__badge"
									>{{ row.badge }}</span
								>
								<button
									v-if="row.openable"
									type="button"
									class="mini mini--go"
									:disabled="!!catalogOpening || !catalogReady"
									@click="doOpenCatalog(row)"
								>
									<span
										v-if="catalogOpening === row.id"
										class="spinner"
									></span>
									<template v-else>{{ row.action }}</template>
								</button>
							</div>
						</div>

						<p
							v-else-if="catalogReady"
							class="empty"
						>
							{{ catalogEmptyText }}
						</p>

						<!-- 推进成功后课程页已被学习页顶掉，这时再点「读取」必然报错，所以直接说清楚 -->
						<p
							v-if="advanceNote && !currentCatalog"
							class="empty"
						>
							刷课脚本已在电脑端接着往下推。想看最新进度，先在电脑上回到课程页，再点上面的「读取」。
						</p>

						<p
							v-if="catalogError && catalogReady && catalogRows.length"
							class="empty"
						>
							{{ catalogError }}
						</p>
					</section>

					<p
						v-if="catalogVisible"
						class="tip"
					>
						三个目录只有进入课程页之后才能读；「从当前进度继续刷」会自动找到第一个未完成的章节并进入，之后电脑端的刷课脚本按顺序往下推。
					</p>
				</template>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Icon from './Icon.vue';
import type { AutomationPlan, AutomationTarget, CatalogItem, CatalogKind, RemoteCourse, RemoteScript } from '../api';
import {
	advanceCatalog,
	catalogKey,
	enterCourseById,
	fetchAutomation,
	launchBrowser,
	loadCatalog,
	loadPlan,
	loadPlanCourses,
	loadScripts,
	openCatalogItem,
	probeCourses,
	refreshCatalogReady,
	refreshCourseList,
	runLoginScript,
	runPlanNow,
	savePlan,
	state,
	stopPlanNow,
	toast,
	ui
} from '../store';

const emit = defineEmits<{ (e: 'close'): void }>();

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/** `HH:mm` / `HH:mm:ss` → 当天分钟数，非法返回 -1 */
function timeToMinutes(value: string): number {
	const parts = String(value || '').split(':');
	const hour = Number(parts[0]);
	const minute = Number(parts[1]);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
	return hour * 60 + minute;
}

/** 两个时间点之间的跨度（终点更早就当跨天，加 24 小时） */
function minutesBetween(start: string, end: string): number {
	const from = timeToMinutes(start);
	const to = timeToMinutes(end);
	if (from < 0 || to < 0) return 0;
	return to > from ? to - from : to + 24 * 60 - from;
}

const uid = computed(() => ui.detailUid);
const browser = computed(() => state.browsers.find((item) => item.uid === ui.detailUid));
const scripts = computed<RemoteScript[]>(() => state.scripts);
const job = computed(() => state.automation[uid.value]);
/** 快照里的方案摘要（定时是否开启、正在刷哪门课） */
const summary = computed(() => browser.value && browser.value.automation);

const tab = ref<'auto' | 'now'>('now');
const showAdd = ref(false);
const scriptsError = ref('');
const courseHint = ref('');

const busyState = reactive({ courses: false, save: false });

// ------------------------------------------------------------------ 课程内容（章节 / 作业 / 考试）

const CATALOG_KINDS: { kind: CatalogKind; label: string; action: string }[] = [
	/** 章节行的按钮只是「跳到这一节」，往前推进靠上面的主按钮 */
	{ kind: 'chapter', label: '章节', action: '跳转' },
	{ kind: 'work', label: '作业', action: '做题' },
	{ kind: 'exam', label: '考试', action: '开考' }
];

/** 「进课后」可选项：和桌面端 plan.ts 的 TARGET_LABELS 一一对应 */
const TARGET_OPTIONS: { value: AutomationTarget; label: string }[] = [
	{ value: 'none', label: '只进课程' },
	{ value: 'chapter', label: '章节：自动往下刷' },
	{ value: 'work', label: '作业：打开第一份待做' },
	{ value: 'exam', label: '考试：打开第一场可考' }
];

interface CatalogRow {
	key: string;
	id: string;
	title: string;
	no: string;
	depth: number;
	badge: string;
	status: string;
	openable: boolean;
	action: string;
	hint: string;
}

const catalogKind = ref<CatalogKind>('chapter');
const catalogOpening = ref('');
const catalogError = ref('');
/**
 * 上一次「继续刷」的结果
 *
 * 推进成功后章节缓存会被清掉（状态已经变了），但此时课程页已被学习页顶掉，
 * 再点「读取」只会报「还没有进入课程页」。所以把结果留作空态文案，
 * 而不是让界面退回一句会把用户带进死路的「点读取」。
 */
const advanceNote = ref('');
const advancing = ref(false);

/**
 * 三栏目录要不要显示
 *
 * 只有超星有「章节 / 作业 / 考试」这套菜单，别的平台（智慧树/职教云）课程页
 * 结构完全不同，显示出来只会让人点了报错。`catalog` 为 `false` 时整块隐藏；
 * 还没进过课程（`undefined`）时照常显示，只是里面提示「先进入课程」。
 */
const catalogVisible = computed(() => {
	const s = summary.value;
	if (!s) return true;
	return s.catalog !== false;
});

/**
 * 「进课后做什么」这一行要不要显示
 *
 * 非超星平台没有章节/作业/考试，给个选不了的下拉只会让人以为坏了。
 * `catalog === false` 是确认没有；`undefined`（还没进过课）时先显示。
 */
const studyTargetVisible = computed(() => {
	const s = summary.value;
	if (!s) return true;
	return s.catalog !== false;
});

const catalogMeta = computed(() => CATALOG_KINDS.find((item) => item.kind === catalogKind.value) || CATALOG_KINDS[0]);
const currentCatalog = computed(() => state.catalogs[catalogKey(uid.value, catalogKind.value)]);
const catalogLoading = computed(() => !!state.catalogBusy[catalogKey(uid.value, catalogKind.value)]);

/**
 * 三个目录能不能点
 *
 * 只有课程页里才有这套菜单。没进课（或已经点到学习页、课程页被顶掉）时置灰，
 * 免得用户点了才收到一句「还没有进入课程页」。本地探测值最新，其次看快照摘要。
 */
const catalogReady = computed(() => {
	if (!browserReady.value) return false;
	const local = state.catalogReady[uid.value];
	if (local !== undefined) return local;
	const s = summary.value;
	return !!(s && s.courseReady);
});

/** 置灰时给一句「怎么才能放开」，比单纯的灰色按钮有用 */
const catalogLockedText = computed(() => {
	if (!browser.value || browser.value.status !== 'launched') {
		return '浏览器没运行，三个目录读不到。先在详情里启动浏览器并进入课程。';
	}
	const courseName =
		(summary.value && summary.value.study.courseName) || (formStudy.value.course && formStudy.value.course.name);
	if (!courseName) {
		return '还没选课。先在上面选一门课，进去之后这三个目录才会放开。';
	}
	return '课程页没开着。三个目录只在课程页里才有入口——在电脑上回到课程页，或点上面「执行一次」，这里会自动放开。';
});

/**
 * 把平台条目摊平成界面行
 *
 * 三件事在这里一次算完，模板里只负责画：
 * - 分组行（"1 必修部分"这种只有标题没有 id 的）不给按钮；
 * - 状态归一成「已完成 / 待完成 / 未解锁」三种徽标；
 * - 动作文案按目录类型变（章节→刷课，作业→做题，考试→开考）。
 */
/**
 * 列表为空时显示什么
 *
 * 优先级：报错 > 目录自带说明 > 上一次「继续刷」的结果 > 引导去读取。
 * 中间两项都很重要：推进成功后课程页已被学习页顶掉，这时候还在提示「点读取」
 * 会让人白点一次并收到「还没有进入课程页」。
 */
const catalogEmptyText = computed(() => {
	if (catalogError.value) return catalogError.value;
	const data = currentCatalog.value;
	if (data) return data.message || '这个目录是空的';
	if (advanceNote.value) return advanceNote.value;
	return '点右上角「读取」加载章节 / 作业 / 考试';
});

const catalogRows = computed<CatalogRow[]>(() => {
	const data = currentCatalog.value;
	if (!data || !Array.isArray(data.items)) return [];

	const action = catalogMeta.value.action;
	return data.items.map((item: CatalogItem, index: number) => {
		const isGroup = !item.id && item.status === 'unknown';
		let badge = '';
		if (!isGroup) {
			badge = item.status === 'done' ? '已完成' : item.status === 'locked' ? '未解锁' : item.state || '待完成';
		}
		return {
			key: (item.id || 'g' + index) + '-' + index,
			id: item.id,
			title: item.title,
			no: item.no,
			depth: item.depth,
			badge,
			status: isGroup ? 'group' : item.status,
			openable: !isGroup && item.clickable && item.status !== 'locked',
			action,
			hint: item.hint
		};
	});
});

/** 读目录；读失败时把原因留在面板上（「还没进课程」是最常见的一种） */
async function ensureCatalog(refresh: boolean): Promise<void> {
	if (catalogLoading.value) return;
	catalogError.value = '';
	/** 用户重新读目录了，上一次「继续刷」的结果就该让位给真实数据 */
	advanceNote.value = '';
	try {
		await loadCatalog(uid.value, catalogKind.value, refresh);
	} catch (e) {
		catalogError.value = e instanceof Error ? e.message : String(e);
	}
}

async function switchCatalog(kind: CatalogKind): Promise<void> {
	if (catalogKind.value === kind && currentCatalog.value) return;
	catalogKind.value = kind;
	await ensureCatalog(false);
}

async function reloadCatalog(): Promise<void> {
	await ensureCatalog(true);
}

async function doOpenCatalog(row: CatalogRow): Promise<void> {
	if (!row.openable || catalogOpening.value) return;
	catalogOpening.value = row.id;
	catalogError.value = '';
	try {
		await openCatalogItem(uid.value, catalogKind.value, {
			id: row.id,
			title: row.title,
			no: row.no,
			depth: row.depth,
			status: 'todo',
			state: '',
			hint: '',
			clickable: true,
			onclick: ''
		});
	} catch (e) {
		catalogError.value = e instanceof Error ? e.message : String(e);
	} finally {
		catalogOpening.value = '';
	}
}

/**
 * 从当前进度继续刷
 *
 * 用户要的是「一直往下刷」，所以主入口是这一个：桌面端自己去找第一个
 * 还没刷完、且已经解锁的章节，进去之后由超星脚本按闯关顺序接着推。
 */
async function doAdvance(): Promise<void> {
	if (advancing.value) return;
	advancing.value = true;
	catalogError.value = '';
	advanceNote.value = '';
	try {
		catalogKind.value = 'chapter';
		const result = await advanceCatalog(uid.value);
		advanceNote.value =
			(result && result.message) ||
			(result && result.entered ? '已进入下一节' : '没有可以继续的章节了');
	} catch (e) {
		catalogError.value = e instanceof Error ? e.message : String(e);
	} finally {
		advancing.value = false;
	}
}

// ------------------------------------------------------------------ 方案表单

const emptyPlan = (): AutomationPlan => ({
	version: 1,
	study: { enabled: false, course: null, target: 'chapter' },
	schedule: {
		enabled: false,
		startTime: '08:00',
		endTime: '11:30',
		days: [],
		endAction: 'pause-close',
		maxMinutes: 0
	}
});

const formPlan = reactive<AutomationPlan>(emptyPlan());
const formScripts = reactive<{ name: string; icon?: string; values: Record<string, any> }[]>([]);
const loaded = ref(false);

const formStudy = computed(() => formPlan.study);
const formSchedule = computed(() => formPlan.schedule);

/** 与已保存内容比对：有差异才允许点保存，避免「点了没反应」的错觉 */
const dirty = computed(() => {
	if (!loaded.value) return false;
	const saved = state.plans[uid.value];
	if (!saved) return true;
	return canonical(formPlan, formScripts) !== canonical(normalizePlan(saved.plan), saved.scripts);
});

/**
 * 规范化成固定结构的字符串
 *
 * 不能直接 JSON.stringify 整对象：服务端返回的字段顺序、脚本 values 的键顺序
 * 都可能和本地不一样，字符串不等就变成「一打开面板就显示未保存」。
 */
function canonical(plan: AutomationPlan, scripts: { name: string; values: Record<string, any> }[]): string {
	const schedule = plan.schedule;
	const course = plan.study.course;
	return JSON.stringify({
		study: {
			enabled: !!plan.study.enabled,
			target: plan.study.target || 'chapter',
			course: course
				? { id: course.id || '', name: course.name || '', label: course.label || '', url: course.url || '' }
				: null
		},
		schedule: {
			enabled: !!schedule.enabled,
			start: schedule.startTime,
			days: (schedule.days || []).slice().sort((a, b) => a - b),
			action: schedule.endAction,
			max: Number(schedule.maxMinutes) || 0
		},
		scripts: scripts.map((item) => {
			const values: Record<string, any> = {};
			Object.keys(item.values || {})
				.sort()
				.forEach((key) => {
					values[key] = item.values[key] === undefined ? '' : item.values[key];
				});
			return { name: item.name, values };
		})
	});
}

const planBusy = computed(() => !!state.planBusy[uid.value]);
/** 浏览器是否已经跑起来（暂停/执行都要求它在运行） */
const browserReady = computed(() => {
	const item = browser.value;
	return !!item && item.status === 'launched';
});

/** 正在执行登录脚本（临时操作页） */
const running = computed(() => state.automationBusy[uid.value] === 'run' || !!(job.value && job.value.state === 'running'));

const canRun = computed(() => !!current.value && !running.value && !state.automationBusy[uid.value]);
const refreshing = computed(() => state.automationBusy[uid.value] === 'courses');
const courses = computed<RemoteCourse[]>(() => (job.value ? job.value.courses : []));
const courseList = computed<RemoteCourse[]>(() => {
	const cache = state.planCourses[uid.value];
	return cache ? cache.courses : [];
});

const addableScripts = computed(() => scripts.value.filter((item) => !formScripts.some((s) => s.name === item.name)));

/**
 * 定时的描述文案（拆两句，用 <br> 断开）
 *
 * 现在只配「一个启动时间点」，结束由「单次最长 + 结束后动作」决定：
 * 时间段（比如 08:00–11:30）在手机上要填两个时间且很容易跨天填错，
 * 而用户真正关心的是「几点开始、跑多久」。
 * 不写成一个长句是因为它在 11px 的提示行里会在「浏览器」中间折行，很难看。
 */
const scheduleHead = computed(() => {
	const schedule = formSchedule.value;
	if (!schedule.enabled) return '未开启定时：只会在你手动启动浏览器时自动刷课。';
	const days =
		schedule.days.length === 0
			? '每天'
			: schedule.days
					.slice()
					.sort((a, b) => a - b)
					.map((d) => '周' + WEEK_LABELS[d])
					.join('、');
	return `${days} ${schedule.startTime} 自动启动`;
});

const scheduleTail = computed(() => {
	const schedule = formSchedule.value;
	if (!schedule.enabled) return '';
	const action =
		schedule.endAction === 'pause'
			? '暂停刷课'
			: schedule.endAction === 'pause-close'
				? '暂停并关闭浏览器'
				: schedule.endAction === 'close'
					? '关闭浏览器'
					: '不做处理';
	return schedule.maxMinutes > 0
		? `学习 ${schedule.maxMinutes} 分钟后${action}`
		: `不限时长，不会自动收尾（要自动${action}请填写单次最长）`;
});

/** 兜底：服务端返回的方案可能缺字段（老版本桌面端），统一补一次 */
function normalizePlan(plan: AutomationPlan): AutomationPlan {
	const base = emptyPlan();
	if (!plan) return base;

	const startTime = plan.schedule?.startTime || base.schedule.startTime;
	const savedEnd = plan.schedule?.endTime || base.schedule.endTime;
	let maxMinutes = Number(plan.schedule?.maxMinutes) || 0;

	/**
	 * 老方案用「起止时间段」表达（08:00–11:30）。
	 * 现在界面只留一个启动时间点，这里把原来的窗口长度折算成「单次最长」，
	 * 语义完全等价（原来也是到结束时刻就收尾），用户存下来的习惯不会被改掉。
	 */
	if (!maxMinutes) {
		const span = minutesBetween(startTime, savedEnd);
		if (span > 0 && span < 24 * 60) maxMinutes = span;
	}

	return {
		version: plan.version || 1,
		study: {
			enabled: !!plan.study?.enabled,
			/** 旧方案没有这个字段：按 `chapter` 处理，与桌面端 normalize 的默认值一致 */
			target: (plan.study?.target as AutomationTarget) || 'chapter',
			course: plan.study?.course
				? {
						id: plan.study.course.id || '',
						name: plan.study.course.name || '',
						url: plan.study.course.url || '',
						label: plan.study.course.label || '',
						platform: plan.study.course.platform || '',
						savedAt: plan.study.course.savedAt || Date.now()
					}
				: null
		},
		schedule: {
			enabled: !!plan.schedule?.enabled,
			startTime,
			/** 起止相同 = 全天窗口，收尾交给「单次最长」 */
			endTime: startTime,
			days: Array.isArray(plan.schedule?.days) ? plan.schedule!.days.slice() : [],
			endAction: plan.schedule?.endAction || 'pause-close',
			maxMinutes,
			lastRunDate: plan.schedule?.lastRunDate || '',
			lastStopDate: plan.schedule?.lastStopDate || '',
			runStartedAt: Number(plan.schedule?.runStartedAt) || 0
		}
	};
}

async function loadAll(): Promise<void> {
	/** 强制拉取：桌面端也可能改过方案，缓存只在同一会话内复用没有意义 */
	const data = await loadPlan(uid.value, true);
	loaded.value = true;
	if (!data) return;

	const plan = normalizePlan(data.plan);
	Object.assign(formPlan, plan);
	formPlan.study = plan.study;
	formPlan.schedule = plan.schedule;

	formScripts.splice(0, formScripts.length);
	(data.scripts || []).forEach((item) => {
		formScripts.push({ name: item.name, icon: item.icon, values: { ...(item.values || {}) } });
	});
}

// ------------------------------------------------------------------ 脚本编辑

function fieldsOf(name: string): RemoteScript['fields'] {
	const def = scripts.value.find((item) => item.name === name);
	return def ? def.fields : [];
}

function fieldsHint(script: RemoteScript): string {
	const labels = script.fields.map((field) => field.label);
	return labels.length ? labels.join(' · ') : '无参数';
}

function addScript(script: RemoteScript): void {
	const values: Record<string, any> = {};
	script.fields.forEach((field) => {
		values[field.key] = field.type === 'switch' ? !!field.value : field.value !== undefined ? field.value : '';
	});
	formScripts.push({ name: script.name, icon: script.icon, values });
	showAdd.value = false;
}

function removeScript(index: number): void {
	formScripts.splice(index, 1);
}

// ------------------------------------------------------------------ 选课

async function pickCourses(): Promise<void> {
	if (busyState.courses) return;
	busyState.courses = true;
	courseHint.value = '';
	try {
		/** 浏览器没开就先拉起来：读课程必须有真实页面，否则用户只会看到「请先启动浏览器」 */
		if (browser.value && browser.value.status === 'closed') {
			courseHint.value = '正在启动浏览器…';
			await launchBrowser(uid.value);
			const ready = await waitBrowserReady(90 * 1000);
			if (!ready) {
				courseHint.value = '浏览器启动较慢，请稍后再点一次「读取课程」';
				return;
			}
			courseHint.value = '';
		}

		const data = await loadPlanCourses(uid.value, true);
		if (!data.courses.length) {
			courseHint.value = data.hint || '没有读到课程。若浏览器还没登录，请先在「临时操作」里跑一次登录脚本。';
		}
	} catch (e) {
		courseHint.value = e instanceof Error ? e.message : String(e);
	} finally {
		busyState.courses = false;
	}
}

/** 等浏览器就绪（状态靠 SSE 更新，这里只轮询本地 state） */
async function waitBrowserReady(timeout: number): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const item = state.browsers.find((b) => b.uid === uid.value);
		if (item && item.status === 'launched') return true;
		await new Promise((resolve) => setTimeout(resolve, 1200));
	}
	return false;
}

function chooseCourse(course: RemoteCourse): void {
	formStudy.value.course = {
		id: course.id,
		name: course.name,
		url: course.url,
		label: course.label || '',
		platform: state.planCourses[uid.value]?.platform || '',
		savedAt: Date.now()
	};
	formStudy.value.enabled = true;
	toast(`已选择：${course.name}，记得点「保存方案」`, 'info');
}

function toggleDay(index: number): void {
	const days = formSchedule.value.days.slice();
	const at = days.indexOf(index);
	if (at === -1) days.push(index);
	else days.splice(at, 1);
	formSchedule.value.days = days.sort((a, b) => a - b);
}

function formatNext(at: number): string {
	const date = new Date(at);
	const now = new Date();
	const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
	return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`;
}

// ------------------------------------------------------------------ 保存 / 执行

async function save(): Promise<void> {
	busyState.save = true;
	try {
		/** 密码留空 = 保持原值，由桌面端合并；这里原样提交即可 */
		const scriptsPayload = formScripts.map((item) => ({
			name: item.name,
			icon: item.icon,
			values: item.values
		}));
		/**
		 * 打开面板时读到的那份作为三路合并基线：
		 * 这期间在电脑上新增的脚本不在表单里，桌面端靠基线区分「没提交」和「用户删了」。
		 */
		const baseline = (state.plans[uid.value]?.scripts || []).map((item) => ({
			name: item.name,
			icon: item.icon,
			values: { ...(item.values || {}) }
		}));
		await savePlan(uid.value, normalizePlan(formPlan), scriptsPayload, baseline);
		await loadAll();
	} catch {
		/* 提示已在 store 里统一处理 */
	} finally {
		busyState.save = false;
	}
}

async function runNow(): Promise<void> {
	if (!formStudy.value.course) {
		toast('请先选择要刷的课程', 'error');
		return;
	}
	/** 未保存的课程也要生效：先存一次，否则点了执行还是跑旧配置 */
	if (dirty.value) {
		await save();
	}
	try {
		await runPlanNow(uid.value);
	} catch {
		/* 已提示 */
	}
}

async function stopNow(): Promise<void> {
	try {
		await stopPlanNow(uid.value);
	} catch {
		/* 已提示 */
	}
}

// ------------------------------------------------------------------ 临时操作（原有逻辑）

const scriptName = ref('');
const current = computed<RemoteScript | undefined>(() => scripts.value.find((item) => item.name === scriptName.value));

const form = reactive<Record<string, any>>({});
const entering = ref('');
const probing = ref(false);


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
		/**
		 * 进来就把章节读出来
		 *
		 * 用户的下一步一定是「看看有哪些章节 / 作业 / 考试」，
		 * 让他再点一次「读取」纯属多余。失败也不吵，面板上会显示原因。
		 */
		catalogKind.value = 'chapter';
		await ensureCatalog(true);
	} catch {
		/* 已提示 */
	} finally {
		entering.value = '';
	}
}

// ------------------------------------------------------------------ 生命周期

/** 兜底轮询：SSE 断线（移动网络常见）时也能看到登录结果 */
let pollTimer: ReturnType<typeof setInterval> | undefined;
/**
 * 课程页就绪探测
 *
 * 用户在电脑上随时可能进退课程页，三个目录的灰/亮要跟着变；SSE 只在状态变化时推，
 * 而「当前标签页是不是课程页」不在快照指纹里，所以面板开着时自己隔一会儿问一次。
 */
let readyTimer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
	const list = await loadScripts();
	if (list.length === 0) {
		scriptsError.value = '暂时读不到脚本目录，请确认桌面端已更新到支持远程自动化的版本';
	} else if (!scriptName.value) {
		const login = list.find((item) => item.name.indexOf('登录') !== -1) || list[0];
		pickScript(login);
	}

	await loadAll();
	await fetchAutomation(uid.value);

	/** 进去先问一次：现在是不是停在课程页上（决定三个目录灰不灰） */
	await refreshCatalogReady(uid.value);

	/**
	 * 浏览器开着「启动后自动运行自动程序」时，课程页通常早就打开了：
	 * 进来静默探一次（不导航、不弹提示），能读就直接列出来，省一步「刷新」。
	 */
	if (!job.value || !job.value.courses.length) {
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

	readyTimer = setInterval(() => {
		/** 浏览器没起来就不必问了（问也只会回 false，白跑一趟局域网） */
		if (!browserReady.value) return;
		refreshCatalogReady(uid.value);
	}, 10000);
});

onBeforeUnmount(() => {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = undefined;
	}
	if (readyTimer) {
		clearInterval(readyTimer);
		readyTimer = undefined;
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
	margin-bottom: 12px;
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

/* ---------------------------------------------------------------- 分段控件 */

.tabs {
	display: flex;
	gap: 4px;
	padding: 3px;
	border-radius: 11px;
	background: var(--surface-2);
	margin-bottom: 12px;
}

.tab {
	flex: 1;
	position: relative;
	padding: 7px 10px;
	border-radius: 9px;
	border: none;
	background: transparent;
	color: var(--text-3);
	font: inherit;
	font-size: 12.5px;
	font-weight: 550;
}

.tab.on {
	background: var(--surface);
	color: var(--text);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tab__dot {
	display: inline-block;
	width: 5px;
	height: 5px;
	margin-left: 4px;
	border-radius: 50%;
	background: var(--ok);
	vertical-align: middle;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.note {
	margin: 0;
	padding: 8px 11px;
	border-radius: 10px;
	background: var(--brand-soft);
	color: var(--text-2);
	font-size: 11.5px;
	line-height: 1.6;
}

.note--warn {
	background: rgba(255, 184, 76, 0.14);
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
	border: none;
}

.mini:disabled {
	opacity: 0.6;
}

.line {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 6px 12px;
}

.line__label {
	font-size: 11.5px;
	color: var(--text-3);
	flex: none;
}

.line__actions {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

/* ---------------------------------------------------------------- 脚本 */

.scripts {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 0 8px;
	max-height: 320px;
	overflow-y: auto;
}

.script-card {
	border: 1px solid var(--line);
	border-radius: 11px;
	padding: 8px 9px 9px;
	background: var(--inset);
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.script-card__head {
	display: flex;
	align-items: center;
	gap: 7px;
	font-size: 12.5px;
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

.remove {
	width: 22px;
	height: 22px;
	border-radius: 7px;
	display: grid;
	place-items: center;
	border: none;
	background: transparent;
	color: var(--text-3);
	flex: none;
}

.remove:hover {
	background: var(--surface-2);
	color: var(--danger);
}

.picker {
	display: flex;
	flex-direction: column;
	gap: 3px;
	margin: 0 8px 10px;
	padding: 6px;
	border-radius: 10px;
	border: 1px dashed var(--line-strong);
	max-height: 200px;
	overflow-y: auto;
}

.picker__item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	width: 100%;
	padding: 8px;
	border: none;
	border-radius: 8px;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
}

.picker__item:hover {
	background: var(--surface-2);
}

.picker__item b {
	font-size: 12.5px;
	font-weight: 550;
}

.picker__item small {
	font-size: 10.5px;
	flex: none;
	max-width: 55%;
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
	flex-wrap: wrap;
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
	transition:
		border-color 0.16s var(--ease),
		box-shadow 0.16s var(--ease);
}

.input:focus {
	border-color: var(--line-brand);
	box-shadow: 0 0 0 3px var(--brand-soft);
}

.input--time {
	width: 104px;
	padding: 7px 9px;
	font-size: 12.5px;
}

.input--num {
	width: 82px;
	padding: 7px 9px;
	font-size: 12.5px;
}

.line .input {
	flex: 1;
}

/**
 * 下拉框不给 flex:1
 *
 * 其余行是「标签 + 右侧定宽控件」，如果下拉框铺满整行，它的左边缘会顶到标签后面，
 * 一行一个样，看起来就像没对齐。定宽后所有行都是右对齐的同一列。
 */
.line select.input {
	flex: 0 0 auto;
	width: 200px;
}

textarea.input {
	resize: vertical;
	min-height: 56px;
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

.switch:disabled {
	opacity: 0.5;
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

/**
 * 星期按钮
 *
 * 必须显式居中：`<button>` 默认按行盒居中，30px 方块里只有一个汉字时，
 * 字体基线一变（不同机型、不同缩放）文字就往左上飘，看起来像「错位」。
 */
.day-group {
	gap: 4px;
}

.day {
	width: 27px;
	height: 27px;
	padding: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	line-height: 1;
	border-radius: 8px;
	border: 1px solid var(--line);
	background: var(--inset);
	color: var(--text-3);
	font-size: 11.5px;
}

.day.on {
	background: var(--brand);
	border-color: var(--brand);
	color: #fff;
}

.schedule-tip {
	margin: 8px 12px 0;
	font-size: 11px;
	line-height: 1.6;
}

/* ---------------------------------------------------------------- 按钮 */

.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	padding: 9px 14px;
	border-radius: 11px;
	border: 1px solid transparent;
	font-size: 13px;
	font-weight: 550;
	font-family: inherit;
}

.btn:disabled {
	opacity: 0.5;
}

.btn-primary {
	background: var(--brand);
	color: #fff;
}

.btn-ghost {
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 12px;
	padding: 7px 11px;
	border-radius: 9px;
}

.run {
	width: calc(100% - 24px);
	margin: 12px 12px 0;
}

.save-bar {
	position: sticky;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 13px;
	border: 1px solid var(--line);
	background: var(--sheet-bg);
	box-shadow: 0 -6px 16px rgba(0, 0, 0, 0.06);
}

/* ---------------------------------------------------------------- 状态与列表 */

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

.status.running,
.status.waiting {
	color: var(--brand-text);
}

.hint {
	margin: 6px 12px 0;
	font-size: 11px;
	line-height: 1.5;
}

.courses {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 4px 6px 0;
	max-height: 260px;
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

.course.on {
	box-shadow: inset 0 0 0 1px var(--line-brand);
	background: var(--brand-soft);
}

.course:disabled {
	opacity: 0.6;
}

.course__label {
	flex: none;
	padding: 1px 6px;
	border-radius: 6px;
	border: 1px solid var(--line-brand);
	background: var(--brand-soft);
	color: var(--brand-text);
	font-size: 10px;
	line-height: 1.6;
	white-space: nowrap;
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

.course-chip {
	display: flex;
	align-items: center;
	gap: 7px;
	margin: 4px 12px 0;
	padding: 8px 10px;
	border-radius: 10px;
	background: var(--brand-soft);
	font-size: 12.5px;
}

.course-chip .remove {
	margin-left: auto;
}

.empty {
	margin: 4px 12px;
	font-size: 11.5px;
	line-height: 1.6;
	color: var(--text-3);
}

/* ---------------------------------------------------- 课程内容（章节 / 作业 / 考试） */

.kinds {
	display: flex;
	gap: 6px;
	padding: 0 12px 8px;
}

.kind {
	flex: 1;
	height: 30px;
	border-radius: 9px;
	border: 1px solid var(--line);
	background: var(--inset);
	color: var(--text-3);
	font-size: 12px;
}

.kind.on {
	background: var(--brand);
	border-color: var(--brand);
	color: #fff;
}

/* 没进课程页：整排置灰，点了也不理（cursor 也收掉，别给「能点」的错觉） */
.kind.off,
.kind:disabled {
	opacity: 0.45;
	cursor: default;
	border-style: dashed;
}

/* 章节的主操作：整行宽的实心按钮，和下面「跳转」那种小按钮拉开层级 */
.advance {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: calc(100% - 24px);
	margin: 0 12px 8px;
	height: 34px;
	border-radius: 9px;
	border: 0;
	background: var(--brand);
	color: #fff;
	font-size: 12.5px;
	font-weight: 500;
}

.advance:disabled {
	opacity: 0.6;
}

.catalog__sum {
	margin: 0 12px 6px;
	font-size: 10.5px;
}

.catalog__wait {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 2px 12px;
	font-size: 11.5px;
	color: var(--text-3);
}

.catalog {
	margin: 0 12px;
	border: 1px solid var(--line);
	border-radius: 10px;
	overflow: hidden;
}

.catalog__row {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 42px;
	padding: 6px 10px;
	border-top: 1px solid var(--line);
	font-size: 12px;
}

.catalog__row:first-child {
	border-top: 0;
}

/* 分组标题（"1 必修部分"）：不缩进、不加按钮，只当分隔 */
.catalog__row.group {
	background: var(--inset);
	font-weight: 600;
	min-height: 32px;
	padding-top: 4px;
	padding-bottom: 4px;
}

.catalog__no {
	flex: none;
	min-width: 34px;
	font-size: 11px;
	font-variant-numeric: tabular-nums;
	color: var(--text-3);
}

/**
 * 章节名放两行
 *
 * 只给一行时「在总体国家安全观指导下全面认识国家安全」会被截成
 * 「在总体国家安全观指导下全面…」，几节标题开头一样就分不清了。
 */
.catalog__title {
	flex: 1;
	min-width: 0;
	line-height: 1.35;
	white-space: normal;
	word-break: break-word;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.catalog__row.state-locked .catalog__title {
	color: var(--text-3);
}

.catalog__badge {
	flex: none;
	padding: 1px 5px;
	border-radius: 5px;
	font-size: 10px;
}

.catalog__row.state-done .catalog__badge {
	color: #3ecf8e;
	background: rgba(62, 207, 142, 0.12);
}

.catalog__row.state-todo .catalog__badge {
	color: #f0a020;
	background: rgba(240, 160, 32, 0.12);
}

.catalog__row.state-locked .catalog__badge {
	color: var(--text-3);
	background: var(--inset);
}

.mini--go {
	flex: none;
	color: var(--brand);
	border-color: currentColor;
}

.mini--go:disabled {
	opacity: 0.5;
}

.tip {
	margin: 0 2px;
	font-size: 11px;
	line-height: 1.6;
	color: var(--text-3);
}

.spinner {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 1.6px solid currentColor;
	border-top-color: transparent;
	animation: spin 0.8s linear infinite;
	display: inline-block;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
