<template>
	<div class="d-flex w-100 align-items-center justify-content-end flex-wrap gap-2">
		<div style="flex: 1 1 auto">
			<template v-if="state.renaming">
				<a-input
					ref="renameRef"
					v-model="name"
					size="mini"
					@blur="onBlur"
				></a-input>
			</template>
			<template v-else>
				<span class="fw-bold">{{ browser.name }}</span>
				<a-tooltip
					content="重命名"
					position="bottom"
				>
					<a-button
						type="text"
						size="mini"
						class="ms-2"
						@click="rename"
					>
						<IconEdit />
					</a-button>
				</a-tooltip>
			</template>
		</div>
		<div
			style="flex: 0 0 auto"
			class="d-flex justify-content-end"
		>
			<BrowserOperators
				:browser="browser"
				tooltip-position="br"
				icon-class="fs-5"
				class="ps-2"
			>
				<template #split>
					<a-divider direction="vertical" />
				</template>

				<template #extra>
					<a-divider direction="vertical" />
					<a-tooltip position="br">
						<template #content>
							仅打开浏览器，不执行其他操作。<br />
							此方法可以防止各种浏览器环境问题：<br />
							- 无法打开特殊的超星网页<br />
							- 弹窗自动被关闭等等问题 <br />
							如果你并没有遇到这些问题，可以不使用此方法，可以直接使用蓝色的启动按钮。
						</template>

						<a-button
							size="mini"
							@click="browser.onlyLaunch()"
						>
							<Icon type="web" />
						</a-button>
					</a-tooltip>
					<a-tooltip
						content="删除浏览器"
						position="br"
					>
						<a-popconfirm
							content="是否删除该浏览器?"
							@ok="browser.remove()"
						>
							<!--
								删除是破坏性操作，必须是实心红而不是「白底红字」：
								工具条上一排同尺寸按钮里，只有描边红的那个看起来仍然像普通按钮，
								误点的概率明显更高。实心 + 白图标是唯一在视觉上「退后一步」的写法。
							-->
							<a-button
								size="mini"
								status="danger"
								type="primary"
								class="delete-browser-btn"
							>
								<Icon type="delete" />
							</a-button>
						</a-popconfirm>
					</a-tooltip>
				</template>
			</BrowserOperators>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue';
import { Browser } from '../fs/browser';
import BrowserOperators from './browsers/BrowserOperators.vue';
import Icon from './Icon.vue';
import { nextTick } from 'process';

const props = defineProps<{
	browser: Browser;
}>();

const name = defineModel<string>({ default: '' });

const state = reactive({
	renaming: false
});

const renameRef = ref();

function rename() {
	state.renaming = true;
	name.value = props.browser.name;
	nextTick(() => {
		renameRef.value?.focus();
	});
}

function onBlur() {
	props.browser?.rename(name.value);
	state.renaming = false;
}
</script>

<style scoped lang="less">
/**
 * 删除按钮：实心危险色
 *
 * Arco 的 `status="danger"` 只换色相，背景仍是白的，在密集工具条里读起来像「普通按钮」。
 * 这里显式给实心底 + 白色图标，并把 hover/active 一起接管，避免和全局
 * `.arco-btn-primary:hover` 的品牌色投影打架。
 */
:deep(.arco-btn.delete-browser-btn) {
	background: var(--danger);
	border-color: var(--danger);
	color: #fff;
	box-shadow: none;
	transition: background-color var(--dur-2) var(--ease-std), border-color var(--dur-2) var(--ease-std),
		transform var(--dur-1) var(--ease-std);

	&:hover,
	&:focus-visible {
		background: color-mix(in srgb, var(--danger) 86%, #000);
		border-color: color-mix(in srgb, var(--danger) 86%, #000);
		color: #fff;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--danger) 26%, transparent);
	}

	&:active {
		background: color-mix(in srgb, var(--danger) 78%, #000);
		border-color: color-mix(in srgb, var(--danger) 78%, #000);
		transform: scale(0.98);
	}

	.material-icons {
		color: #fff;
	}
}
</style>
