<template>
	<div class="logs">
		<div
			v-if="state.browsers.length"
			class="chips"
		>
			<button
				v-for="browser in state.browsers"
				:key="browser.uid"
				class="chip"
				:class="{ active: current === browser.uid }"
				@click="current = browser.uid"
			>
				<span
					class="dot"
					:class="browser.status === 'launched' ? 'ok' : 'off'"
				></span>
				<span class="ellipsis">{{ browser.name }}</span>
			</button>
		</div>

		<div
			ref="boxRef"
			class="console card fade-up"
		>
			<p
				v-for="(line, index) in lines"
				:key="index"
				class="line"
			>
				{{ line }}
			</p>

			<p
				v-if="lines.length === 0"
				class="empty faint"
			>
				{{ current ? '该实例暂未产生日志' : '请选择一个浏览器实例' }}
			</p>
		</div>

		<div class="footer">
			<span class="faint num">{{ lines.length }} 行</span>
			<button
				class="btn btn-sm"
				@click="toBottom"
			>
				回到最新
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { state } from '../store';

const current = ref('');
const boxRef = ref<HTMLElement | null>(null);

const lines = computed(() => {
	if (!current.value) return [];
	const raw = state.logs[current.value] || [];
	/** 日志是按块累积的字符串，这里拆成行便于阅读 */
	const result: string[] = [];
	raw.forEach((chunk) => {
		String(chunk)
			.split(/\r?\n/)
			.filter((line) => line.trim().length > 0)
			.forEach((line) => result.push(line));
	});
	return result.slice(-400);
});

function atBottom() {
	const box = boxRef.value;
	if (!box) return true;
	return box.scrollHeight - box.scrollTop - box.clientHeight < 60;
}

function toBottom() {
	nextTick(() => {
		const box = boxRef.value;
		if (box) box.scrollTop = box.scrollHeight;
	});
}

watch(
	() => state.browsers,
	(list) => {
		if (!current.value && list.length > 0) {
			const running = list.find((b) => b.status === 'launched');
			current.value = (running || list[0]).uid;
		}
	},
	{ immediate: true, deep: false }
);

watch(
	() => lines.value.length,
	(_value, oldValue) => {
		if (oldValue !== undefined && atBottom()) {
			toBottom();
		}
	}
);

onMounted(toBottom);
</script>

<style scoped>
.logs {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 0 16px 24px;
	height: calc(100vh - var(--safe-top) - 210px);
}

.chips {
	display: flex;
	gap: 8px;
	overflow-x: auto;
	padding-bottom: 2px;
	flex: none;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 34px;
	padding: 0 12px;
	border-radius: 999px;
	background: var(--card);
	border: 1px solid var(--line);
	font-size: 13px;
	color: var(--text-2);
	white-space: nowrap;
	max-width: 60vw;
	flex: none;
	transition: color 0.16s var(--ease), border-color 0.16s var(--ease);
}

.chip.active {
	color: var(--text-1);
	border-color: rgba(79, 140, 255, 0.5);
	background: rgba(79, 140, 255, 0.1);
}

.console {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 12px 14px;
	font-family: 'SF Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace;
	font-size: 12px;
	line-height: 1.65;
	-webkit-overflow-scrolling: touch;
}

.line {
	margin: 0 0 2px;
	white-space: pre-wrap;
	word-break: break-all;
	color: rgba(242, 245, 250, 0.78);
}

.empty {
	margin: 0;
	padding: 24px 0;
	text-align: center;
	font-family: inherit;
}

.footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex: none;
}

.footer .faint {
	font-size: 12px;
}
</style>
