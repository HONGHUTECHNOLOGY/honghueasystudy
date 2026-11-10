<template>
	<div class="scripts-page reveal-stack">
		<!--
			脚本页同时装着两类东西，用分段按钮摊开，别再靠「一长条往下滚」去猜：
			定时脚本 = 按实例的到点自动刷课；用户脚本 = 打开网课时注入的增强脚本。
		-->
		<div class="switcher">
			<a-radio-group
				v-model="tab"
				type="button"
				size="small"
			>
				<a-radio value="auto"> 定时脚本 </a-radio>
				<a-radio value="users"> 用户脚本 </a-radio>
			</a-radio-group>

			<span class="switcher__hint text-secondary">
				{{
					tab === 'auto' ? '到点自动启动浏览器并按方案刷课，改完立即生效' : '打开网课时自动注入的增强脚本，可增删与更新'
				}}
			</span>
		</div>

		<AutomationScheduleBoard v-if="tab === 'auto'" />
		<UserScriptListPage v-else />
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AutomationScheduleBoard from './automation-scripts/AutomationScheduleBoard.vue';
import UserScriptListPage from './UserScriptListPage.vue';

/**
 * 默认落在「定时脚本」
 *
 * 这一页原先只有用户脚本，用户找「什么时候会自动跑」时在脚本列表里翻不到，
 * 所以新的定时面板放在第一屏；要管用户脚本点一下分段按钮即可。
 */
const tab = ref<'auto' | 'users'>('auto');
</script>

<style scoped lang="less">
.switcher {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
	margin-bottom: 10px;
}

.switcher__hint {
	font-size: 12px;
	line-height: 1.5;
	min-width: 0;
}
</style>
