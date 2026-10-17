<template>
	<div class="m-3 ps-5 pe-5">
		<a-result
			class="p-3 m-auto text-center"
			status="404"
		>
			<a-alert>请先创建浏览器，然后启动即可~</a-alert>
		</a-result>

		<div>
			<a-button
				type="text"
				@click="newBrowserOrInit()"
			>
				<Icon type="web">新建浏览器</Icon>
			</a-button>
		</div>

		<div>
			<a-button
				type="text"
				@click="goto('https://easystudy.honghutech.eu.org')"
			>
				<Icon type="home">前往官网</Icon>
			</a-button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { goto } from '../utils';
import { newBrowserOrInit } from '../utils/browser';
import Icon from './Icon.vue';
</script>

<style scoped></style>
