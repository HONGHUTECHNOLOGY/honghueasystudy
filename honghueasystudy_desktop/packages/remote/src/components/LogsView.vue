<template>
	<div class="logs">
		<div
			v-if="state.browsers.length"
			class="chips"
		>
			<button
				v-for="browser in state.browsers"
				:key="browser.uid"
				type="button"
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

		<div class="console card fade-up">
			<div class="console__head">
				<span class="console__title">
					<Icon
						name="logs"
						:size="14"
					/>
					<span class="ellipsis">{{ currentName || '日志' }}</span>
				</span>

				<span class="console__search">
					<Icon
						name="search"
						:size="13"
					/>
					<input
						v-model="keyword"
						type="text"
						placeholder="筛选关键字"
						aria-label="筛选日志关键字"
					/>
					<button
						v-if="keyword"
						type="button"
						class="console__clear"
						aria-label="清空筛选"
						@click="keyword = ''"
					>
						<Icon
							name="close"
							:size="12"
						/>
					</button>
				</span>
			</div>

			<div
				ref="boxRef"
				class="console__body"
				@scroll="onScroll"
			>
				<p
					v-for="(line, index) in lines"
					:key="index"
					class="line"
					:class="toneOf(line)"
				>
					{{ line }}
				</p>

				<p
					v-if="lines.length === 0"
					class="empty faint"
				>
					{{ emptyText }}
				</p>
			</div>

			<div class="console__foot">
				<span class="faint num">{{ lines.length }} / {{ total }} 行</span>
				<div class="console__tools">
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						:class="{ 'is-on': tail }"
						@click="toggleTail"
					>
						<Icon
							:name="tail ? 'pause' : 'play'"
							:size="13"
						/>
						{{ tail ? '自动滚动' : '已暂停' }}
					</button>
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						@click="toBottom"
					>
						<Icon
							name="down"
							:size="13"
						/>
						回到最新
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store';

const current = ref('');
const keyword = ref('');
const tail = ref(true);
const boxRef = ref<HTMLElement | null>(null);

const currentName = computed(() => {
	const target = state.browsers.find((b) => b.uid === current.value);
	return target ? target.name : '';
});

const allLines = computed(() => {
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
	return result.slice(-500);
});

const total = computed(() => allLines.value.length);

const lines = computed(() => {
	const word = keyword.value.trim().toLowerCase();
	if (!word) return allLines.value;
	return allLines.value.filter((line) => line.toLowerCase().indexOf(word) !== -1);
});

const emptyText = computed(() => {
	if (!current.value) return '请选择一个浏览器实例';
	if (total.value === 0) return '该实例暂未产生日志';
	return '没有匹配的日志行';
});

/** 按常见日志级别上色，便于快速定位异常 */
function toneOf(line: string): string {
	if (/(\berror\b|\bfail(ed|ure)?\b|错误|失败|异常|超时)/i.test(line)) return 'is-error';
	if (/(\bwarn(ing)?\b|警告)/i.test(line)) return 'is-warn';
	if (/(\bdebug\b|\btrace\b)/i.test(line)) return 'is-dim';
	return '';
}

function atBottom() {
	const box = boxRef.value;
	if (!box) return true;
	return box.scrollHeight - box.scrollTop - box.clientHeight < 60;
}

function toBottom() {
	tail.value = true;
	nextTick(() => {
		const box = boxRef.value;
		if (box) box.scrollTop = box.scrollHeight;
	});
}

function toggleTail() {
	if (tail.value) {
		tail.value = false;
		return;
	}
	toBottom();
}

function onScroll() {
	/** 用户手动上滑时暂停自动滚动，下滑回底部时恢复 */
	if (!boxRef.value) return;
	if (atBottom()) {
		tail.value = true;
	}
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
		if (oldValue !== undefined && tail.value) {
			nextTick(() => {
				const box = boxRef.value;
				if (box) box.scrollTop = box.scrollHeight;
			});
		}
	}
);

onMounted(() => {
	nextTick(() => {
		const box = boxRef.value;
		if (box) box.scrollTop = box.scrollHeight;
	});
});
</script>

<style scoped>
.logs {
	display: flex;
	flex-direction: column;
	gap: 11px;
	padding: 0 16px 12px;
	flex: 1;
	min-height: 0;
	height: 100%;
}

.chips {
	display: flex;
	gap: 7px;
	overflow-x: auto;
	padding-bottom: 1px;
	flex: none;
	scrollbar-width: none;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 32px;
	padding: 0 11px;
	border-radius: 999px;
	background: var(--surface);
	border: 1px solid var(--line);
	font-size: 12.5px;
	color: var(--text-2);
	white-space: nowrap;
	max-width: 56vw;
	flex: none;
	transition: color 0.18s var(--ease), border-color 0.18s var(--ease), background 0.18s var(--ease);
}

.chip.active {
	color: var(--text);
	border-color: var(--line-brand);
	background: var(--brand-soft);
}

/* ------------------------------------------------------------------ 控制台 */

.console {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	padding: 0;
	background: var(--surface-solid);
}

.console__head {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 9px 10px 9px 12px;
	border-bottom: 1px solid var(--line);
	flex: none;
}

.console__title {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 550;
	color: var(--text-2);
	min-width: 0;
	flex: 1;
}

.console__title :deep(svg) {
	color: var(--text-3);
	flex: none;
}

.console__search {
	display: flex;
	align-items: center;
	gap: 5px;
	height: 30px;
	padding: 0 8px;
	border-radius: 9px;
	background: var(--inset);
	border: 1px solid var(--line);
	flex: none;
	width: 132px;
	transition: border-color 0.18s var(--ease), width 0.22s var(--ease);
}

.console__search:focus-within {
	border-color: var(--line-brand);
	width: 168px;
}

.console__search :deep(svg) {
	color: var(--text-3);
	flex: none;
}

.console__search input {
	width: 100%;
	min-width: 0;
	font-size: 11.5px;
}

.console__search input::placeholder {
	color: var(--text-3);
}

.console__clear {
	display: grid;
	place-items: center;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: var(--surface-2);
	color: var(--text-3);
	flex: none;
}

.console__body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 10px 12px;
	font-family: var(--font-mono);
	font-size: 11.5px;
	line-height: 1.65;
	background: var(--inset);
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
}

.line {
	margin: 0 0 2px;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--text-2);
}

.line.is-error {
	color: var(--danger);
}

.line.is-warn {
	color: var(--warn);
}

.line.is-dim {
	color: var(--text-3);
}

.empty {
	margin: 0;
	padding: 30px 0;
	text-align: center;
	font-family: inherit;
	font-size: 12px;
}

.console__foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 7px 10px;
	border-top: 1px solid var(--line);
	flex: none;
}

.console__foot .faint {
	font-size: 11px;
}

.console__tools {
	display: flex;
	gap: 4px;
}

.console__tools .btn {
	min-height: 28px;
	padding: 0 8px;
	font-size: 11.5px;
	color: var(--text-2);
}

.console__tools .btn.is-on {
	color: var(--brand-text);
}

@media (min-width: 560px) {
	.logs {
		padding: 0 20px 14px;
	}

	.console__search {
		width: 160px;
	}

	.console__search:focus-within {
		width: 200px;
	}
}

@media (min-width: 720px) {
	.logs {
		padding: 0 24px 16px;
	}

	.console__body {
		padding: 12px 14px;
		font-size: 12px;
	}
}

@media (min-width: 1024px) {
	.logs {
		padding: 0 32px 20px;
	}

	.chip {
		max-width: none;
	}

	.console__head {
		padding: 11px 12px 11px 14px;
	}

	.console__foot {
		padding: 9px 12px;
	}
}
</style>
