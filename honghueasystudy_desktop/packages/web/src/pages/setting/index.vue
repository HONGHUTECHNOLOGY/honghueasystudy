<template>
	<div class="page-narrow">
		<SettingPanel />
	</div>
</template>

<script setup lang="ts">
import SettingPanel from '../../components/SettingPanel.vue';
</script>

<style scoped lang="less">
/**
 * 滚动由父级 .app-page 负责，这里不再套一层 overflow-auto。
 * 双层滚动容器会让滚轮滚到内层边界时"卡住"，鼠标停在设置项上时尤其明显。
 */
.page-narrow {
	max-width: 880px;
	margin: 0 auto;
	padding: 24px 20px 40px;
}
</style>
