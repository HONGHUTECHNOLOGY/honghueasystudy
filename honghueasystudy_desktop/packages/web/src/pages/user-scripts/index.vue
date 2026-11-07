<!-- eslint-disable vue/no-v-html -->
<template>
	<div class="page-narrow">
		<!-- 脚本页同时承载「定时脚本」：用户找脚本时最先想知道的就是「它什么时候会自动跑」 -->
		<ScriptsPage />
	</div>
</template>

<script setup lang="ts">
import ScriptsPage from '../../components/ScriptsPage.vue';
</script>

<style scoped lang="less">
/** 滚动由父级 .app-page 负责，避免嵌套滚动导致滚轮"卡住" */
.page-narrow {
	max-width: 880px;
	margin: 0 auto;
	padding: 24px 20px 40px;
}
</style>
