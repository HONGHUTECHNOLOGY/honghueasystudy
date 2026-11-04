<template>
	<div class="plans">
		<!-- 概览：定时与刷课都是「落盘配置」，和浏览器在不在跑无关 -->
		<section class="lead card fade-up">
			<div class="lead__main">
				<p class="lead__eyebrow">
					<i></i>
					自动执行
				</p>
				<div class="lead__value">
					<strong class="num">{{ enabledCount }}</strong>
					<span class="num">/ {{ state.browsers.length || 0 }}</span>
				</div>
				<p class="lead__desc faint">
					个实例已开启定时。这里看的是电脑端的配置，浏览器没启动也能改，到点会自动拉起。
				</p>

				<div class="lead__metrics">
					<div class="metric">
						<span class="metric__label">已配刷课</span>
						<strong class="num">{{ studyCount }}</strong>
					</div>
					<div class="metric">
						<span class="metric__label">下次启动</span>
						<strong class="num">{{ nearestText }}</strong>
					</div>
				</div>
			</div>
		</section>

		<div
			v-if="state.browsers.length"
			class="list"
		>
			<article
				v-for="item in state.browsers"
				:key="item.uid"
				class="plan card fade-up"
			>
				<header class="plan__head">
					<span
						class="dot"
						:class="item.status === 'launched' ? 'ok' : item.status === 'closed' ? 'off' : 'warn'"
					></span>
					<h3 class="plan__name ellipsis">{{ item.name }}</h3>
					<span
						class="chip"
						:class="{ on: !!item.automation?.schedule.enabled }"
					>
						{{ item.automation?.schedule.enabled ? '定时中' : '未定时' }}
					</span>
				</header>

				<!-- 方案原文由桌面端拼接，两端只认同一份 scheduleSummary，避免各写一遍文案 -->
				<p class="plan__sum">{{ scheduleText(item) }}</p>
				<p class="plan__next faint">{{ nextText(item) }}</p>

				<div class="tags">
					<span class="tag">课程：{{ courseName(item) || '未选择' }}</span>
					<span class="tag">{{ statusText(item.status) }}</span>
					<span
						v-if="item.automation && item.automation.study.enabled && !item.automation.study.courseName"
						class="tag warn"
						>刷课已开但没选课</span
					>
				</div>

				<p
					v-if="item.automation && item.automation.message"
					class="plan__msg"
					:class="item.automation.state"
				>
					{{ item.automation.message }}
				</p>

				<div class="plan__actions">
					<button
						type="button"
						class="btn btn-sm btn-primary"
						@click="ui.automationUid = item.uid"
					>
						<Icon
							name="wand"
							:size="14"
						/>
						配置方案
					</button>
					<button
						type="button"
						class="btn btn-sm"
						:disabled="!courseName(item) || !!state.planBusy[item.uid]"
						@click="runNow(item.uid)"
					>
						<Icon
							name="play"
							:size="14"
						/>
						立即执行
					</button>
					<button
						v-if="item.status === 'closed'"
						type="button"
						class="btn btn-sm btn-ghost"
						:disabled="!!state.pending[item.uid]"
						@click="start(item.uid)"
					>
						<Icon
							name="power"
							:size="14"
						/>
						启动浏览器
					</button>
				</div>
			</article>
		</div>

		<div
			v-else
			class="empty card fade-up"
		>
			<span class="empty__icon">
				<Icon
					name="clock"
					:size="24"
				/>
			</span>
			<p class="empty__title">还没有浏览器实例</p>
			<p class="empty__desc faint">定时是「每个浏览器一套」的配置，先在电脑端新建一个实例，这里就会出现它的方案。</p>
		</div>

		<p class="foot faint">
			定时、启动时脚本、自动刷课都在「配置方案」里；保存的是电脑端存档，关掉手机页面也不会丢。
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import Icon from './Icon.vue';
import type { BrowserSnapshot } from '../api';
import { launchBrowser, refresh, runPlanNow, state, toast, ui } from '../store';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const enabledCount = computed(
	() => state.browsers.filter((item) => item.automation && item.automation.schedule.enabled).length
);

const studyCount = computed(
	() =>
		state.browsers.filter((item) => item.automation && item.automation.study.enabled && item.automation.study.courseName)
			.length
);

/** 最近的一次自动启动：让人一眼知道「下次什么时候会自己动」 */
const nearestText = computed(() => {
	let at = 0;
	state.browsers.forEach((item) => {
		const plan = item.automation;
		if (!plan || !plan.schedule.enabled || !plan.schedule.nextRunAt) return;
		if (!at || plan.schedule.nextRunAt < at) at = plan.schedule.nextRunAt;
	});
	if (!at) return '—';
	const date = new Date(at);
	const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	const today = new Date();
	if (date.toDateString() === today.toDateString()) return `今天 ${time}`;
	const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
	if (date.toDateString() === tomorrow.toDateString()) return `明天 ${time}`;
	return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
});

function scheduleText(item: BrowserSnapshot): string {
	const plan = item.automation;
	if (!plan) return '桌面端没上报方案（版本较旧），升级电脑端后这里才会显示';
	return plan.schedule.enabled ? plan.schedule.summary : '没开定时：只在你手动启动浏览器时自动刷课';
}

function courseName(item: BrowserSnapshot): string {
	return (item.automation && item.automation.study.courseName) || '';
}

function nextText(item: BrowserSnapshot): string {
	const plan = item.automation;
	if (!plan) return '';
	if (!plan.schedule.enabled) return '';
	if (!plan.schedule.nextRunAt) return '下次自动启动：计算中';
	const date = new Date(plan.schedule.nextRunAt);
	const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	const today = new Date();
	const day =
		date.toDateString() === today.toDateString()
			? '今天'
			: `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
	/** 星期几一并带上：只写日期时，跨周的计划很难核对 */
	return `下次自动启动：${day} ${time}（周${WEEK_LABELS[date.getDay()]}）`;
}

function statusText(status: BrowserSnapshot['status']): string {
	if (status === 'launched') return '运行中';
	if (status === 'launching') return '启动中';
	if (status === 'closing') return '关闭中';
	return '未启动';
}

async function runNow(uid: string) {
	try {
		await runPlanNow(uid);
	} catch {
		/* 提示已在 store 里统一处理 */
	}
}

async function start(uid: string) {
	try {
		await launchBrowser(uid);
		toast('已开始启动浏览器', 'success');
	} catch {
		/* 提示已在 store 里统一处理 */
	}
}

onMounted(() => {
	/** 进入本页补一次全量，避免 SSE 尚未推送时看到空列表 */
	refresh();
});
</script>

<style scoped>
.plans {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 0 16px 20px;
}

/* ------------------------------------------------------------------ 概览 */

.lead {
	padding: 20px 18px;
	position: relative;
	overflow: hidden;
}

.lead::after {
	content: '';
	position: absolute;
	width: 200px;
	height: 200px;
	right: -100px;
	top: -120px;
	border-radius: 50%;
	background: radial-gradient(circle, var(--glow-a), transparent 68%);
	pointer-events: none;
}

.lead__main {
	position: relative;
	z-index: 1;
}

.lead__eyebrow {
	display: flex;
	align-items: center;
	gap: 7px;
	margin: 0 0 8px;
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.16em;
	color: var(--text-3);
	text-transform: uppercase;
}

.lead__eyebrow i {
	width: 14px;
	height: 2px;
	border-radius: 2px;
	background: var(--brand);
}

.lead__value {
	display: flex;
	align-items: baseline;
	gap: 5px;
	line-height: 1;
}

.lead__value strong {
	font-size: 38px;
	font-weight: 650;
	letter-spacing: -0.04em;
	background: linear-gradient(135deg, var(--text) 20%, var(--brand-text));
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.lead__value span {
	font-size: 14px;
	font-weight: 500;
	color: var(--text-3);
}

.lead__desc {
	margin: 8px 0 0;
	font-size: 11.5px;
	line-height: 1.55;
	max-width: 30em;
}

.lead__metrics {
	display: flex;
	gap: 24px;
	margin-top: 14px;
}

.metric {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.metric__label {
	font-size: 10.5px;
	color: var(--text-3);
}

.metric strong {
	font-size: 13px;
	font-weight: 550;
}

/* ------------------------------------------------------------------ 列表 */

.list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.plan {
	padding: 14px 15px 13px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.plan__head {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.plan__name {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	flex: 1;
	min-width: 0;
}

.chip {
	flex: none;
	height: 21px;
	padding: 0 8px;
	display: inline-flex;
	align-items: center;
	border-radius: 999px;
	border: 1px solid var(--line);
	background: var(--surface-2);
	color: var(--text-3);
	font-size: 10.5px;
	font-weight: 550;
	white-space: nowrap;
}

.chip.on {
	border-color: var(--line-brand);
	background: var(--brand-soft);
	color: var(--brand-text);
}

.plan__sum {
	margin: 0;
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--text-2);
}

.plan__next {
	margin: -2px 0 0;
	font-size: 11px;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.tag {
	max-width: 100%;
	padding: 2px 7px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--surface-2);
	font-size: 10.5px;
	color: var(--text-2);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tag.warn {
	border-color: rgba(255, 182, 72, 0.4);
	color: var(--warn);
}

.plan__msg {
	margin: 0;
	font-size: 11.5px;
	line-height: 1.5;
	color: var(--text-3);
	word-break: break-word;
}

.plan__msg.running,
.plan__msg.waiting {
	color: var(--brand-text);
}

.plan__msg.done {
	color: var(--ok);
}

.plan__msg.error {
	color: var(--danger);
}

.plan__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 2px;
}

.plan__actions .btn {
	flex: 1;
	min-width: 108px;
	min-height: 38px;
	font-size: 12.5px;
}

/* ------------------------------------------------------------------ 空态 */

.empty {
	padding: 38px 22px;
	text-align: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}

.empty__icon {
	width: 50px;
	height: 50px;
	border-radius: 16px;
	display: grid;
	place-items: center;
	background: var(--surface-2);
	color: var(--text-3);
	margin-bottom: 8px;
}

.empty__title {
	margin: 0;
	font-size: 14px;
	font-weight: 550;
}

.empty__desc {
	margin: 0;
	font-size: 12px;
	max-width: 300px;
	line-height: 1.6;
}

.foot {
	margin: 0;
	font-size: 11px;
	line-height: 1.6;
	padding: 0 2px;
}

/* ------------------------------------------------------------------ 自适应 */

@media (min-width: 560px) {
	.plans {
		padding: 0 20px 24px;
	}

	.lead {
		padding: 22px 22px;
	}
}

@media (min-width: 720px) {
	.plans {
		padding: 0 24px 26px;
		gap: 16px;
	}

	.list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}
}

@media (min-width: 1024px) {
	.plans {
		padding: 0 32px 32px;
	}

	.list {
		grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
	}
}
</style>
