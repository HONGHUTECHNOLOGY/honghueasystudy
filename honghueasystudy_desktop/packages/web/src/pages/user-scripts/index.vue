<!-- eslint-disable vue/no-v-html -->
<template>
	<div class="container-md h-100 overflow-auto pt-3">
		<!-- 脚本页同时承载「定时脚本」：用户找脚本时最先想知道的就是「它什么时候会自动跑」 -->
		<AutomationScheduleBoard />

		<a-divider style="margin: 4px 0 14px">用户脚本</a-divider>

		<UserScriptListPage />
	</div>
</template>

<script setup lang="ts">
import UserScriptListPage from '../../components/UserScriptListPage.vue';
import AutomationScheduleBoard from '../../components/automation-scripts/AutomationScheduleBoard.vue';
</script>

<style scoped lang="less"></style>
