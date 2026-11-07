<template>
	<!--
		更新弹窗里的「更新了什么」区域。

		数据来自官网 /api/changelog.json（由 CHANGELOG.md 生成，已过滤掉 ci / 构建 /
		发版这类工程条目），这里只负责排版：按版本分组、区域内滚动。
	-->
	<div class="update-notes">
		<div v-if="!versions.length" class="update-notes__empty">
			本次更新包含若干体验改进，完整记录见官网「更新日志」。
		</div>

		<div v-else class="update-notes__box" :class="{ 'is-more': hasMore }">
			<div ref="scrollEl" class="update-notes__scroll" @scroll="onScroll">
				<section v-for="v in versions" :key="v.version" class="ver">
					<div class="ver__head">
						<span class="ver__tag">v{{ v.version }}</span>
						<span v-if="v.date" class="ver__date">{{ v.date }}</span>
					</div>

					<div v-for="s in v.sections" :key="s.title" class="sec">
						<div class="sec__title">{{ s.title }}</div>
						<ul class="sec__list">
							<li v-for="(item, i) in s.items" :key="i">{{ item }}</li>
						</ul>
					</div>
				</section>
			</div>
		</div>

		<div v-if="versions.length" class="update-notes__foot">
			更新不会影响已保存的配置与脚本
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { ChangelogVersion } from '@honghu-desktop/common';

const props = defineProps<{ notes?: ChangelogVersion[] }>();

const versions = computed(() => (Array.isArray(props.notes) ? props.notes : []).filter((v) => v && v.version));

const scrollEl = ref<HTMLElement | null>(null);
/**
 * 底部还有没露出来的内容。
 *
 * 自定义细滚动条只在悬停时才明显，跨版本升级时用户很容易以为「就这几条」——
 * 用一条渐变遮罩给出「下面还有」的视觉暗示，滚到底就撤掉。
 */
const hasMore = ref(false);

function updateHasMore() {
	const el = scrollEl.value;
	if (!el) return;
	hasMore.value = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
}

function onScroll() {
	updateHasMore();
}

onMounted(async () => {
	await nextTick();
	updateHasMore();
});

watch(versions, async () => {
	await nextTick();
	updateHasMore();
});
</script>

<style scoped lang="less">
.update-notes {
	font-size: 13px;
	line-height: 1.65;
	color: var(--color-text-2);
}

/* 固定高度 + 内部滚动：跨版本升级时日志可能很长，弹窗本身不能被撑高 */
.update-notes__box {
	position: relative;

	/* 底部渐变遮罩：暗示下面还有内容 */
	&.is-more::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 28px;
		pointer-events: none;
		/* --color-bg-popup 在 Arco 里是十六进制（var(--color-bg-5)），不能再包 rgb() */
		background: linear-gradient(to bottom, transparent, var(--color-bg-popup));
	}
}

.update-notes__scroll {
	max-height: 300px;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding-right: 8px;
	margin-right: -8px;

	&::-webkit-scrollbar {
		width: 6px;
	}

	&::-webkit-scrollbar-thumb {
		background: var(--color-fill-3);
		border-radius: var(--r-xs);

		&:hover {
			background: var(--color-fill-4);
		}
	}
}

.update-notes__empty {
	color: var(--color-text-3);
}

.ver + .ver {
	margin-top: 14px;
	padding-top: 12px;
	border-top: 1px dashed var(--color-border-2);
}

.ver__head {
	display: flex;
	align-items: baseline;
	gap: 8px;
	margin-bottom: 6px;
}

.ver__tag {
	font-size: 13px;
	font-weight: 600;
	/* Arco 的主题色是 RGB 三元组（如 --primary-6: 22,93,255），必须包一层 rgb() */
	color: rgb(var(--primary-6));
}

.ver__date {
	font-size: 11px;
	color: var(--color-text-4);
}

.sec + .sec {
	margin-top: 6px;
}

.sec__title {
	font-size: 12px;
	font-weight: 600;
	color: var(--color-text-1);
	margin: 4px 0 2px;
}

.sec__list {
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		position: relative;
		padding-left: 12px;
		color: var(--color-text-2);

		&::before {
			content: '';
			position: absolute;
			left: 2px;
			top: 0.68em;
			width: 4px;
			height: 4px;
			border-radius: 50%;
			background: var(--color-text-4);
		}
	}
}

.update-notes__foot {
	margin-top: 10px;
	font-size: 11px;
	color: var(--color-text-4);
}
</style>
