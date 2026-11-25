<template>
	<div class="page-narrow">
		<AnswerConfigPanel />
	</div>
</template>

<script setup lang="ts">
import AnswerConfigPanel from '../../components/AnswerConfigPanel.vue';
</script>

<style scoped lang="less">
/** 与软件设置页保持一致的窄栏布局 */
.page-narrow {
	max-width: 880px;
	margin: 0 auto;
	padding: 24px 20px 40px;
}
</style>
