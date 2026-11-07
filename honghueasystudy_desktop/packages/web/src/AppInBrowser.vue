<template>
	<!-- 内容区域 -->
	<router-view v-slot="{ Component }">
		<keep-alive>
			<component :is="Component" />
		</keep-alive>
	</router-view>
</template>

<script setup lang="ts"></script>

<style lang="less">
/**
 * 全局样式已统一在 main.ts 引入（bootstrap / common.css / styles/index.less）。
 * 这里不再重复 @import：重复引入会让同一份 CSS 出现两次，且顺序不可控。
 */
</style>
