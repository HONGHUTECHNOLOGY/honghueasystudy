<template>
	<header class="doc-header">
		<div class="doc-header__inner">
			<a class="doc-brand" href="#/bookmarks" aria-label="返回鸿鹄易学首页">
				<span class="doc-brand__mark"><img src="/favicon.png" alt="" /></span>
				<span class="doc-brand__text">
					<strong>鸿鹄易学</strong>
					<small>HONGHU EASYSTUDY</small>
				</span>
			</a>

			<nav class="doc-nav" aria-label="站点导航">
				<a href="#/bookmarks">学习平台</a>
				<a :class="{ 'is-active': active === 'guide' }" href="#/guide">使用指南</a>
				<a :class="{ 'is-active': active === 'about' }" href="#/about">关于鸿鹄易学</a>
			</nav>

			<a class="doc-back" href="#/bookmarks">
				<span>返回学习空间</span>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>
			</a>
		</div>
	</header>
</template>

<script setup lang="ts">
defineProps<{ active: 'guide' | 'about' }>();
</script>

<style scoped lang="less">
.doc-header {
	position: relative;
	z-index: 5;
	border-bottom: 1px solid rgba(20, 24, 32, 0.08);
	background: rgba(247, 248, 250, 0.82);
	backdrop-filter: blur(18px);
}
.doc-header__inner {
	width: min(1240px, calc(100% - 80px));
	min-height: 86px;
	display: flex;
	align-items: center;
	gap: 34px;
	margin-inline: auto;
}
.doc-brand { display: inline-flex; align-items: center; gap: 11px; color: #171a20; text-decoration: none; }
.doc-brand__mark {
	width: 39px;
	height: 39px;
	display: grid;
	place-items: center;
	border: 1px solid rgba(99, 91, 255, 0.13);
	border-radius: 12px;
	background: #fff;
	box-shadow: 0 7px 20px rgba(31, 35, 48, 0.06);
	img { width: 27px; height: 27px; object-fit: contain; }
}
.doc-brand__text { display: flex; flex-direction: column; gap: 3px; }
.doc-brand__text strong { font-size: 17px; font-weight: 680; letter-spacing: -0.02em; line-height: 1; }
.doc-brand__text small { color: #969ca6; font-size: 7px; font-weight: 650; letter-spacing: 0.16em; }
.doc-nav { display: flex; align-items: center; gap: 30px; margin-left: auto; }
.doc-nav a {
	position: relative;
	padding: 32px 0 29px;
	color: #838a95;
	font-size: 12px;
	font-weight: 500;
	text-decoration: none;
	transition: color 0.22s ease;
	&::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 19px;
		width: 0;
		height: 2px;
		border-radius: 2px;
		background: #635bff;
		transform: translateX(-50%);
		transition: width 0.25s ease;
	}
	&:hover, &.is-active { color: #171a20; }
	&:hover::after, &.is-active::after { width: 17px; }
}
.doc-back {
	height: 36px;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 0 13px;
	border: 1px solid rgba(20, 24, 32, 0.1);
	border-radius: 9px;
	background: rgba(255, 255, 255, 0.8);
	color: #555d69;
	font-size: 10px;
	font-weight: 550;
	text-decoration: none;
	transition: border-color 0.25s, color 0.25s, transform 0.25s;
	svg { width: 14px; stroke: currentColor; stroke-width: 1.5; }
	&:hover { border-color: rgba(99, 91, 255, 0.3); color: #635bff; transform: translateX(2px); }
}
@media (max-width: 1000px) {
	.doc-header__inner { width: calc(100% - 44px); }
	.doc-nav { gap: 20px; }
	.doc-back span { display: none; }
	.doc-back { width: 36px; padding: 0; justify-content: center; }
}
@media (max-width: 720px) {
	.doc-header__inner { min-height: 76px; gap: 14px; width: calc(100% - 30px); }
	.doc-brand__mark { width: 35px; height: 35px; border-radius: 10px; img { width: 24px; height: 24px; } }
	.doc-brand__text strong { font-size: 15px; }
	.doc-brand__text small { display: none; }
	.doc-nav { gap: 16px; margin-left: auto; }
	.doc-nav a { padding: 27px 0 24px; font-size: 10px; &::after { bottom: 14px; } }
	.doc-back { display: none; }
}
@media (max-width: 430px) {
	.doc-nav a:first-child { display: none; }
}
</style>
