<template>
	<div class="hh-empty">
		<div class="hh-empty__mark">
			<Icon type="language" />
		</div>

		<h3 class="hh-empty__title">还没有浏览器</h3>
		<p class="hh-empty__desc">
			创建一个独立的浏览器环境，登录网课后会自动开始学习。每个浏览器拥有独立缓存，可以同时登录不同账号。
		</p>

		<div class="hh-empty__actions">
			<a-button
				type="primary"
				@click="newBrowserOrInit()"
			>
				新建浏览器
			</a-button>
			<a-button
				type="text"
				@click="goto('https://easystudy.honghutech.eu.org')"
			>
				查看使用指南
			</a-button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { goto } from '../utils';
import { newBrowserOrInit } from '../utils/browser';
import Icon from './Icon.vue';
</script>

<style scoped lang="less">
/**
 * 空状态
 *
 * 原来用的是 a-result status="404"（盒子插画 + 404 语义），
 * 但空状态不是错误，用错误页的视觉语言会让人以为软件坏了。
 * 改成「标记 + 标题 + 一句说明 + 主次操作」的中性表达。
 */
.hh-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	padding: 28px 20px 12px;
	max-width: 420px;
	margin: 0 auto;
}

/**
 * 空状态分层入场：标记 → 标题 → 说明 → 操作
 *
 * 空状态是「用户第一次打开软件时看到的唯一内容」，
 * 它值得一次完整的入场：四块依次浮现，比整块淡入更像在「介绍这个页面怎么用」。
 * 起始延迟 60ms，让外层容器的边框先到位，内容再浮上来。
 */
.hh-empty > * {
	animation: hh-reveal-up var(--dur-3) var(--ease-dec) backwards;
}

.hh-empty > *:nth-child(1) {
	animation-delay: 60ms;
}
.hh-empty > *:nth-child(2) {
	animation-delay: 96ms;
}
.hh-empty > *:nth-child(3) {
	animation-delay: 132ms;
}
.hh-empty > *:nth-child(4) {
	animation-delay: 168ms;
}

.hh-empty__mark {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 44px;
	border-radius: var(--r-lg);
	background: var(--surface-sunken);
	color: var(--text-secondary);
	margin-bottom: 14px;

	.material-icons {
		font-size: 22px;
	}
}

.hh-empty__title {
	margin: 0 0 6px;
	font-size: var(--fs-14);
	font-weight: var(--fw-semibold);
	letter-spacing: -0.01em;
	color: var(--text-primary);
}

.hh-empty__desc {
	margin: 0 0 18px;
	font-size: var(--fs-12);
	line-height: 1.65;
	color: var(--text-tertiary);
}

.hh-empty__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}
</style>
