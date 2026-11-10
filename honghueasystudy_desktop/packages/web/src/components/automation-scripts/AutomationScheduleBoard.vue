<template>
	<a-card class="schedule-board">
		<template #title>
			<div class="d-flex align-items-center gap-2">
				<Icon
					type="schedule"
					:size="18"
				/>
				<span>定时脚本</span>
				<a-tag
					v-if="enabledCount"
					size="small"
					color="arcoblue"
				>
					{{ enabledCount }} 个已开启
				</a-tag>
			</div>
		</template>

		<template #extra>
			<a-tooltip
				content="每个浏览器一套定时：到点自动启动浏览器并执行「自动刷课」与启动时脚本，到点收尾。改的是电脑端存档，浏览器没启动也能设置。"
				position="left"
			>
				<Icon
					type="help"
					class="text-secondary"
				/>
			</a-tooltip>
		</template>

		<div
			v-if="!browsers.length"
			class="empty text-secondary"
		>
			还没有浏览器实例。先在「浏览器」里新建一个，定时是按实例分别配置的。
		</div>

		<div
			v-else
			class="rows"
		>
			<div
				v-for="browser in browsers"
				:key="browser.uid"
				class="row"
				:class="{ on: planOf(browser).schedule.enabled }"
			>
				<div class="row__head">
					<!-- 开关直接落盘：定时是「到点自动拉起」的总闸，不该还要再点一次保存 -->
					<a-tooltip content="开启后到点自动启动浏览器并按方案刷课；这里是总闸，改完立即生效">
						<a-switch
							size="small"
							:model-value="planOf(browser).schedule.enabled"
							@change="(value) => commit(browser, (plan) => (plan.schedule.enabled = !!value))"
						/>
					</a-tooltip>
					<span
						class="dot"
						:class="statusOf(browser)"
					></span>
					<span
						class="name"
						:title="browser.name"
						>{{ browser.name }}</span
					>
					<a-tag
						v-if="planOf(browser).schedule.enabled"
						size="small"
						color="arcoblue"
					>
						定时中
					</a-tag>

					<span class="summary text-secondary">{{ scheduleSummary(planOf(browser).schedule) }}</span>

					<a-button
						class="ms-auto"
						size="mini"
						type="text"
						@click="toggle(browser.uid)"
					>
						{{ expanded === browser.uid ? '收起' : '设置' }}
					</a-button>
				</div>

				<div class="row__sub text-secondary">
					<span>课程：{{ courseName(browser) || '未选择' }}</span>
					<span>启动脚本：{{ scriptCount(browser) }} 个</span>
					<span v-if="nextText(browser)">{{ nextText(browser) }}</span>
					<span
						v-if="planOf(browser).schedule.enabled && !courseName(browser)"
						class="warn"
					>
						到点只会打开浏览器，不会自动刷课
					</span>
				</div>

				<div
					v-if="expanded === browser.uid"
					class="editor"
				>
					<div class="field">
						<span class="field__label">启动时间</span>
						<a-time-picker
							size="small"
							format="HH:mm"
							:allow-clear="false"
							:model-value="planOf(browser).schedule.startTime"
							style="width: 104px"
							@change="(value) => commit(browser, (plan) => (plan.schedule.startTime = String(value || '08:00')))"
						/>
					</div>

					<div class="field field--wide">
						<span class="field__label">星期</span>
						<a-checkbox-group
							size="small"
							:model-value="planOf(browser).schedule.days"
							@change="(value) => commit(browser, (plan) => (plan.schedule.days = (value as number[]).slice().sort((a, b) => a - b)))"
						>
							<a-checkbox
								v-for="(label, index) of WEEK_LABELS"
								:key="index"
								:value="index"
							>
								{{ label }}
							</a-checkbox>
						</a-checkbox-group>
						<span class="field__hint">不勾选=每天</span>
					</div>

					<div class="field">
						<span class="field__label">结束后</span>
						<a-select
							size="small"
							:model-value="planOf(browser).schedule.endAction"
							style="width: 168px"
							@change="(value) => commit(browser, (plan) => (plan.schedule.endAction = value as any))"
						>
							<a-option value="pause">暂停刷课</a-option>
							<a-option value="pause-close">暂停并关闭浏览器</a-option>
							<a-option value="close">直接关闭浏览器</a-option>
							<a-option value="none">不处理</a-option>
						</a-select>
					</div>

					<div class="field">
						<span class="field__label">单次最长</span>
						<a-input-number
							size="small"
							:min="0"
							:max="1440"
							:step="10"
							:model-value="planOf(browser).schedule.maxMinutes"
							style="width: 108px"
							@change="(value) => commit(browser, (plan) => (plan.schedule.maxMinutes = Number(value) || 0))"
						/>
						<span class="field__hint">分钟（0=不限，不限就没有收尾）</span>
					</div>

					<div class="field field--wide">
						<span class="field__label">错过补执行</span>
						<a-checkbox
							size="small"
							:model-value="planOf(browser).schedule.catchUp"
							@change="(value) => commit(browser, (plan) => (plan.schedule.catchUp = !!value))"
						>
							过了开始时间也补跑
						</a-checkbox>
						<span class="field__hint">关闭时只在开始后 {{ SCHEDULE_GRACE_MINUTES }} 分钟内启动，再晚跳过当天</span>
					</div>

					<div
						v-if="scriptNames(browser)"
						class="field field--wide"
					>
						<span class="field__label">启动时脚本</span>
						<span class="field__hint">{{ scriptNames(browser) }}</span>
					</div>

					<div class="field field--actions">
						<a-button
							size="mini"
							@click="openFull(browser.uid)"
						>
							<template #icon><icon-settings /></template>
							完整设置（课程 / 启动脚本）
						</a-button>
						<a-button
							v-if="statusOf(browser) === 'closed'"
							size="mini"
							type="outline"
							@click="launch(browser)"
						>
							<template #icon><icon-play-arrow /></template>
							启动浏览器
						</a-button>
					</div>
				</div>
			</div>
		</div>
	</a-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { IconSettings, IconPlayArrow } from '@arco-design/web-vue/es/icon';
import Icon from '../Icon.vue';
import { store } from '../../store';
import { root } from '../../fs/folder';
import { Browser } from '../../fs/browser';
import { Process } from '../../utils/process';
import { readPlan, writePlan } from '../../utils/automationPlan';
import {
	nextRunAt,
	SCHEDULE_GRACE_MINUTES,
	scheduleSummary,
	WEEK_LABELS,
	type BrowserAutomation
} from '@honghu-desktop/app/src/scripts/plan';

/**
 * 定时脚本总览
 *
 * 定时原先只藏在「浏览器面板 → 自动刷课 → 每日定时」里，要逐个实例点开才看得到，
 * 也没法一眼比较「哪几个开着、几点跑」。这里按实例摊开，开关直接落盘。
 *
 * 只改 `schedule`，课程与启动脚本仍在完整设置里：那些字段改动会牵动刷课链路
 * （选课要真页面、脚本要合并密码），放在一行小控件里容易误操作。
 */

const browsers = computed(() => root().findAll((e) => e.type === 'browser') as Browser[]);

/** 本地镜像：控件绑定它，改动经 `commit` 写回实体（实体负责节流落盘） */
const plans = reactive<Record<string, BrowserAutomation>>({});

const expanded = ref('');

function syncPlans(): void {
	browsers.value.forEach((browser) => {
		plans[browser.uid] = readPlan(browser);
	});
}

syncPlans();

/** 实例增删（新建 / 删除 / 移动）后重建镜像 */
watch(
	() => browsers.value.map((browser) => browser.uid).join(','),
	() => syncPlans()
);

function planOf(browser: Browser): BrowserAutomation {
	if (!plans[browser.uid]) plans[browser.uid] = readPlan(browser);
	return plans[browser.uid];
}

/**
 * 改一项就落盘
 *
 * 每次都先 `readPlan(browser)` 取实体里最新的方案，再只改这一项：
 * 镜像可能落后于别处（浏览器面板里刚改过），拿整份旧镜像回写会把别人的改动覆盖掉。
 * 写完把归一化后的结果放回镜像，界面与存档保持一致。
 */
function commit(browser: Browser, mutate: (plan: BrowserAutomation) => void): void {
	const plan = readPlan(browser);
	mutate(plan);
	plans[browser.uid] = writePlan(browser, plan);
}

/** 实体里的方案被别处改过（浏览器面板 / 远程台）时，把镜像同步过来 */
function resync(): void {
	browsers.value.forEach((browser) => {
		const latest = readPlan(browser);
		const mirror = plans[browser.uid];
		if (!mirror || JSON.stringify(mirror.schedule) !== JSON.stringify(latest.schedule)) {
			plans[browser.uid] = latest;
		}
	});
}

watch(
	() => browsers.value.map((browser) => JSON.stringify(browser.automation || null)).join('|'),
	() => resync()
);

function toggle(uid: string): void {
	expanded.value = expanded.value === uid ? '' : uid;
}

function courseName(browser: Browser): string {
	const course = planOf(browser).study.course;
	return course ? course.name : '';
}

function scriptCount(browser: Browser): number {
	return (browser.automationScripts || []).length;
}

/** 启动时脚本名（只读展示；增删仍走完整设置，避免误删） */
function scriptNames(browser: Browser): string {
	return (browser.automationScripts || [])
		.map((item) => item.name)
		.filter(Boolean)
		.join('、');
}

function statusOf(browser: Browser): string {
	const proc = Process.from(browser.uid);
	return proc ? proc.status : 'closed';
}

function nextText(browser: Browser): string {
	const schedule = planOf(browser).schedule;
	if (!schedule.enabled) return '';
	const at = nextRunAt(schedule, new Date());
	if (!at) return '';
	const date = new Date(at);
	const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	const today = new Date();
	const day = date.toDateString() === today.toDateString() ? '今天' : `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
	return `下次启动：${day} ${time}`;
}

/** 完整设置 = 打开全局浏览器面板里的「自动刷课」卡片 */
function openFull(uid: string): void {
	store.render.browser.currentBrowserUid = uid;
}

async function launch(browser: Browser): Promise<void> {
	try {
		await browser.launch();
		Message.success('已开始启动浏览器');
	} catch (e) {
		Message.error(e instanceof Error ? e.message : String(e));
	}
}

const enabledCount = computed(
	() => browsers.value.filter((browser) => !!plans[browser.uid] && plans[browser.uid].schedule.enabled).length
);
</script>

<style scoped lang="less">
.schedule-board {
	margin-bottom: 12px;
}

.empty {
	font-size: 12px;
	line-height: 1.6;
	padding: 6px 2px;
}

.rows {
	display: flex;
	flex-direction: column;
}

.row {
	padding: 10px 0;
	border-top: 1px dashed var(--color-border-2);

	&:first-child {
		border-top: 0;
		padding-top: 2px;
	}
}

.row__head {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--color-text-4);
	flex: none;

	&.launched {
		background: rgb(var(--success-6));
	}

	&.launching,
	&.closing {
		background: rgb(var(--warning-6));
	}
}

.name {
	font-size: 13px;
	font-weight: 550;
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.summary {
	font-size: 11.5px;
	min-width: 0;
}

.row__sub {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 4px;
	padding-left: 2px;
	font-size: 11.5px;
	line-height: 1.5;

	.warn {
		color: rgb(var(--warning-6));
	}
}

.editor {
	margin-top: 8px;
	display: flex;
	flex-wrap: wrap;
	gap: 10px 18px;
	padding: 10px 12px;
	border-radius: var(--r-sm);
	background: var(--color-fill-1);
}

.field {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
}

.field--wide {
	flex-basis: 100%;
}

.field--actions {
	flex-basis: 100%;
	gap: 8px;
	margin-top: 2px;
}

.field__label {
	color: var(--color-text-2);
	white-space: nowrap;
}

.field__hint {
	font-size: 11px;
	color: var(--color-text-3);
}
</style>
