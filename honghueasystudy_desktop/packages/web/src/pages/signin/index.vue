<template>
	<div class="page-narrow">
		<SigninPanel />
	</div>
</template>

<script setup lang="ts">
import SigninPanel from '../../components/signin/SigninPanel.vue';
</script>

<style scoped lang="less">
/** 滚动由父级 .app-page 负责，避免嵌套滚动导致滚轮"卡住" */
.page-narrow {
	max-width: 880px;
	margin: 0 auto;
	padding: 24px 20px 40px;
}
</style>
