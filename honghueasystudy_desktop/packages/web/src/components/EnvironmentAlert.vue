<template>
	<div v-if="!envState.isReady">
		<div
			v-if="envState.isLoading"
			class="w-100 text-center"
		>
			<a-spin />
		</div>
		<div v-else>
			<a-alert
				title="环境需要修复"
				type="warning"
				show-icon
				banner
				class="env-alert"
			>
				<div class="env-alert__line">
					{{ lang('browser_page_environment_error_notice', '软件环境存在问题，将会影响浏览器的正常启动') }}
				</div>

				<div class="env-alert__reason">
					<template v-if="!envState.isCurrentBrowserSupported">
						当前浏览器版本不受支持
					</template>
					<template v-else-if="!envState.supportedBrowser">
						{{ lang('browser_page_environment_error_no_browser_detected', '未检测到可用的浏览器') }}
					</template>
					<template v-else-if="!envState.supportedExtension">
						未检测到鸿鹄易学扩展，请重新启动软件
					</template>
				</div>

				<!--
					按钮宽度自适应并左对齐，与文字同一起点。
					原来用 w-25 + text-center，220px 宽的蓝块横在提示中间，
					既不像提示也不像主操作，把整块区域的视觉重心都拽偏了。
				-->
				<a-button
					class="env-alert__action"
					type="primary"
					size="small"
					@click="
						() => {
							openSetupModal('环境修复');
						}
					"
				>
					一键修复
				</a-button>
			</a-alert>

			<Setup
				v-model:visible="envState.envSetupFixVisible"
				confirm-text="开始修复"
				cancel-text="稍后再说"
				:title="envState.setupTitle"
				:create-new-browser="false"
				:preset-steps="['show_desc', 'init_env']"
				@close="
					() => {
						updateEnvironmentDetect();
					}
				"
			></Setup>
		</div>
	</div>
</template>

<script setup lang="ts">
import Setup from './Setup.vue';
import { lang } from '../store';
import { useEnvironmentDetect } from '../composables/useEnvironmentDetect';
import { onMounted } from 'vue';

const { state: envState, openSetupModal, updateEnvironmentDetect } = useEnvironmentDetect();

onMounted(() => {
	updateEnvironmentDetect();
});
</script>

<style scoped lang="less">
/**
 * 环境警告
 *
 * Arco 的 banner alert 会把内容撑到整宽，这里收一下行距与层级：
 * 一句说明 + 一行原因 + 一个左对齐的小按钮，信息密度紧凑但不拥挤。
 */
.env-alert {
	padding: 12px 14px;
}

.env-alert__line {
	font-size: var(--fs-12);
	line-height: 1.6;
	color: var(--text-secondary);
}

.env-alert__reason {
	margin-top: 2px;
	font-size: var(--fs-12);
	line-height: 1.6;
	font-weight: var(--fw-medium);
	color: var(--text-primary);
}

.env-alert__action {
	margin-top: 10px;
	width: auto;
}
</style>
