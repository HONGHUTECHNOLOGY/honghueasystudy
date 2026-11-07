<template>
	<div v-if="!closed">
		<a-tooltip
			:content="collapse ? '点击展开' : '点击收起'"
			position="bottom"
		>
			<a-alert
				class="alert-collapse usage-alert-top"
				:banner="banner ?? false"
				:center="center ?? false"
				:type="type || 'info'"
				@click="toggle"
			>
				<template #icon>
					<icon-exclamation-circle-fill />
				</template>

				<template #action>
					<!--
						方向语义：收起时箭头朝下（提示"可以展开"），展开时箭头朝上（提示"可以收起"）。
						原来用 v-if 在两个图标间硬切，既写反了方向，切换时也是瞬间跳变。
						改成单个箭头 + 旋转，方向正确且带过渡。
					-->
					<IconDown
						class="collapse-arrow"
						:class="{ 'is-open': !collapse }"
					/>
				</template>

				{{ title }}
			</a-alert>

			<!--
				展开收起的高度动画
				用 `height: 0 ↔ auto` + `interpolate-size: allow-keywords`（见 tokens.less）。
				之前用 grid 的 0fr→1fr，实测插值不连续：320ms 的过渡在 160ms 就到位了，
				看起来像瞬间弹开。allow-keywords 让 auto 也能连续插值，不需要 JS 预测量高度。
			-->
			<div
				class="usage-body"
				:class="{ 'is-open': !collapse }"
			>
				<a-alert
					class="border-top usage-alert-bottom"
					:banner="banner ?? false"
					:center="center ?? false"
					:type="type || 'info'"
					:show-icon="false"
					closable
					@close="closed = true"
				>
					<div
						v-if="html"
						v-html="html"
					></div>
					<div v-if="text">{{ text }}</div>
				</a-alert>
			</div>
		</a-tooltip>
	</div>
</template>

<script lang="ts" setup>
import { AlertInstance } from '@arco-design/web-vue';
import { ref } from 'vue';

const closed = ref(false);

const props = defineProps<{
	title: string;
	/** 是否折叠（true = 内容已收起） */
	collapse: boolean;
	html?: string;
	text?: string;
	type?: AlertInstance['type'];
	banner?: boolean;
	center?: boolean;
}>();

const emits = defineEmits<{
	(e: 'update:collapse', val: boolean): void;
}>();

function toggle() {
	emits('update:collapse', !props.collapse);
}
</script>

<style scoped lang="less">
.alert-collapse {
	cursor: pointer;
	/* 箭头旋转与卡片底色一起过渡，hover 时不会出现"箭头先动、底色后到" */
	transition: background-color var(--dur-2) var(--ease-std);
}

.usage-alert-top {
	border-top-left-radius: var(--border-radius-small);
	border-top-right-radius: var(--border-radius-small);
}

/* ------------------------------------------------------------ 折叠箭头 */

.collapse-arrow {
	font-size: 14px;
	color: var(--text-tertiary);
	/* 收起（默认）朝下；展开时旋转 180° 朝上 */
	transform: rotate(0deg);
	transition: transform var(--dur-3) var(--ease-dec), color var(--dur-2) var(--ease-std);
}

.alert-collapse:hover .collapse-arrow {
	color: var(--text-secondary);
}

.collapse-arrow.is-open {
	transform: rotate(180deg);
}

/* ------------------------------------------------------------ 展开区 */

/**
 * 折叠容器
 *
 * height 从 0 过渡到 auto，靠 tokens.less 里的 `interpolate-size: allow-keywords`
 * 让 `auto` 参与插值。overflow: hidden 负责裁切 a-alert 的 padding 与边框，
 * 否则收起后会残留一条 18px 的空条。
 *
 * margin-bottom 常驻而不参与过渡：收起时下方内容不会因为间距突然消失而上跳。
 */
.usage-body {
	height: 0;
	overflow: hidden;
	margin-bottom: 12px;
	transition: height var(--dur-3) var(--ease-dec);
}

.usage-body.is-open {
	height: auto;
}

/** 内容淡入比高度动画晚一点起步，避免"边撑开边浮现"的糊感 */
.usage-body > * {
	opacity: 0;
	transition: opacity var(--dur-2) var(--ease-std);
}

.usage-body.is-open > * {
	opacity: 1;
	transition: opacity var(--dur-3) var(--ease-dec) 80ms;
}

.usage-alert-bottom {
	border-bottom-left-radius: var(--border-radius-small);
	border-bottom-right-radius: var(--border-radius-small);
}

code {
	background-color: rgb(224, 106, 106) !important;
}
</style>
