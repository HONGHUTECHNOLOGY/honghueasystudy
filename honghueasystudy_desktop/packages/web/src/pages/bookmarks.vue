<template>
	<div class="home-page">
		<div class="ambient" aria-hidden="true">
			<div class="ambient__wash ambient__wash--one"></div>
			<div class="ambient__wash ambient__wash--two"></div>
			<div class="ambient__grid"></div>
			<div class="ambient__grain"></div>
		</div>

		<a-spin class="page-spin" :loading="state.loading">
			<template #element>
				<div class="loading-state">
					<div class="loading-mark"><span></span><span></span><span></span></div>
					<p>正在准备你的学习空间</p>
					<div v-for="(tip, index) of state.tips" :key="index" class="loading-tip">{{ tip }}</div>
				</div>
			</template>

			<header class="topbar page-width">
				<a class="brand" href="#top" aria-label="鸿鹄易学首页">
					<span class="brand__mark">
						<img src="/favicon.png" alt="" />
					</span>
					<span class="brand__type">
						<strong>鸿鹄易学</strong>
						<small>HONGHU EASYSTUDY</small>
					</span>
				</a>

				<nav class="topnav" aria-label="页面导航">
					<a class="is-active" href="#platforms">学习平台</a>
					<a href="#official">官方站点</a>
					<a href="#/guide">使用指南</a>
					<a href="#/about">关于鸿鹄易学</a>
				</nav>

				<div class="topbar__actions">
					<div class="ready-pill" :class="{ 'is-warning': state.warn }">
						<span class="ready-pill__dot"></span>
						<span>{{ state.warn ? '环境待检查' : '学习空间已就绪' }}</span>
					</div>
					<button class="app-button" type="button" :disabled="opening" @click="openInApp">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect x="3" y="4" width="18" height="16" rx="3" />
							<path d="M3 9h18M8 4v5" />
						</svg>
						<span>{{ opening ? '正在唤起' : '在软件中显示' }}</span>
					</button>
				</div>
			</header>

			<main id="top">
				<section class="hero page-width" aria-labelledby="hero-title">
					<div class="hero__copy">
						<div class="eyebrow reveal reveal--one">
							<span class="eyebrow__line"></span>
							<span>A BETTER WAY TO LEARN</span>
						</div>
						<h1 id="hero-title" class="reveal reveal--two">
							一个入口，<br />
							<span>开启高效学习。</span>
						</h1>
						<p class="hero__intro reveal reveal--three">
							聚合常用网课平台，让课程、任务与学习工具自然连接。<br class="desktop-break" />
							少一点重复操作，多一点专注时间。
						</p>

						<div class="search-wrap reveal reveal--four">
							<label class="search-box" for="platform-search">
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<circle cx="11" cy="11" r="6.5" />
									<path d="m16 16 4 4" />
								</svg>
								<input
									id="platform-search"
									ref="searchInput"
									v-model="searchQuery"
									type="search"
									placeholder="搜索学习平台，如：超星、智慧树…"
									autocomplete="off"
									@keydown.esc="clearSearch"
								/>
								<kbd v-if="!searchQuery">/</kbd>
								<button v-else type="button" aria-label="清空搜索" @click="clearSearch">
									<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
								</button>
							</label>
							<div class="quick-search">
								<span>快速直达</span>
								<button v-for="word in hotKeywords" :key="word" type="button" @click="applyKeyword(word)">{{ word }}</button>
							</div>
						</div>

						<div class="hero__assurance reveal reveal--five">
							<span><i></i>七大主流平台</span>
							<span><i></i>智能答题辅助</span>
							<span><i></i>独立浏览器环境</span>
						</div>
					</div>

					<div
						class="hero__visual reveal reveal--visual"
						@pointermove="handlePointerMove"
						@pointerleave="resetPointer"
					>
						<div class="orbit orbit--outer" aria-hidden="true"></div>
						<div class="orbit orbit--inner" aria-hidden="true"></div>
						<div class="visual-dots" aria-hidden="true"></div>

						<div class="session-card">
							<div class="session-card__top">
								<div>
									<span class="session-kicker">YOUR LEARNING DASHBOARD</span>
									<h2>今天，继续向前</h2>
								</div>
								<span class="session-date">{{ currentDate }}</span>
							</div>

							<div class="session-journey">
								<div class="journey-line" aria-hidden="true"><span></span></div>
								<div class="journey-step is-current">
									<span class="journey-step__number">01</span>
									<div><strong>选择学习平台</strong><small>从下方导航进入你的课程</small></div>
									<span class="journey-step__state">开始</span>
								</div>
								<div class="journey-step">
									<span class="journey-step__number">02</span>
									<div><strong>登录并进入课程</strong><small>像平常一样打开学习内容</small></div>
								</div>
								<div class="journey-step">
									<span class="journey-step__number">03</span>
									<div><strong>使用鸿鹄易学面板</strong><small>按需选择学习与答题功能</small></div>
								</div>
							</div>

							<div class="session-card__bottom">
								<div class="browser-avatar">
									<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" />
									</svg>
								</div>
								<div class="browser-session-copy">
									<span>当前学习浏览器</span>
									<strong id="browser-name">{{ browser.name }}</strong>
								</div>
								<span class="session-live"><i></i>运行中</span>
							</div>
						</div>

						<div class="floating-note floating-note--top" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" /></svg>
							<span>脚本环境已装载</span>
						</div>
						<div class="floating-metric" aria-hidden="true">
							<strong>All-in-one</strong>
							<span><i></i>学习平台，一站直达</span>
						</div>
					</div>
				</section>

				<aside
					v-if="noticeVisible && (visibleStatusTips.length || browser.tags.length || browser.notes)"
					class="browser-float"
					aria-label="浏览器状态"
				>
					<button class="browser-float__close" type="button" aria-label="关闭状态提示" @click="noticeVisible = false">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
					</button>
					<div class="browser-float__top">
						<span class="context-icon">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 4 7v5c0 4.6 3.2 7.8 8 9 4.8-1.2 8-4.4 8-9V7l-8-4Z" /><path d="m9 12 2 2 4-5" /></svg>
						</span>
						<div class="browser-float__heading">
							<strong>{{ state.warn ? '请留意当前环境状态' : '独立环境，安心学习' }}</strong>
							<span><i></i>{{ state.warn ? '待检查' : '运行正常' }}</span>
						</div>
					</div>
					<p id="browser-notes">{{ visibleStatusTips[0] || browser.notes || '浏览器初始化完成后，进入课程页面即可使用鸿鹄易学。' }}</p>
					<div class="browser-float__bottom">
						<div id="browser-tags" class="browser-tags">
							<span v-for="tag in browser.tags" :key="tag.name" :style="{ backgroundColor: tag.color }">{{ tag.name }}</span>
						</div>
						<a href="#/guide">使用指南 <span>↗</span></a>
					</div>
				</aside>

				<section id="platforms" class="platform-section page-width section-reveal" aria-labelledby="platform-title">
					<div class="section-heading">
						<div>
							<span class="section-index">01 / LEARNING PLATFORMS</span>
							<h2 id="platform-title">下一站，去哪里学习？</h2>
							<p>从公共课到专业课，常用学习平台都在这里。</p>
						</div>
						<div class="section-meta">
							<div class="section-count"><strong>{{ totalVisible }}</strong><span>个平台</span></div>
						</div>
					</div>

					<div class="platform-toolbar">
						<div class="platform-filter-summary">
							<span class="summary-dot"></span>
							<span>{{ searchQuery ? `“${searchQuery}” 的搜索结果` : '全部学习平台' }}</span>
							<span class="summary-count">{{ totalVisible }} / {{ platforms.length }}</span>
						</div>
						<div class="platform-toolbar__right">
							<button v-if="searchQuery" type="button" class="reset-search" @click="resetFilters">清除搜索</button>
							<span class="filter-hint">点击卡片，在新标签页打开</span>
						</div>
					</div>

					<div class="platform-grid">
					<a
						v-for="(bookmark, index) in filteredPlatforms"
						:key="`${bookmark.name}-${bookmark.url}`"
						class="platform-card"
						:href="bookmark.url"
						target="_blank"
						rel="noopener noreferrer"
						:style="cardStyle(bookmark, index)"
						@pointermove="handleCardPointerMove"
						@pointerleave="handleCardPointerLeave"
					>
						<div class="platform-card__top">
							<div class="platform-logo">
								<span v-if="showFallbackIcon(bookmark)">{{ bookmark.name.slice(0, 1) }}</span>
								<img
									v-else
									:src="iconUrl(bookmark.icon)"
									:alt="`${bookmark.name}图标`"
									loading="lazy"
									@error="hideBrokenIcon(bookmark)"
								/>
							</div>
							<span class="platform-arrow">
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
							</span>
						</div>
						<div class="platform-card__body">
							<span class="platform-category">{{ platformLabel(bookmark) }}</span>
							<h3>{{ bookmark.name }}</h3>
							<p>{{ bookmark.description }}</p>
						</div>
						<div class="platform-card__footer">
							<span>进入平台</span>
						</div>
					</a>
				</div>

					<div v-if="!totalVisible" class="empty-state">
						<div class="empty-state__icon">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4M8.5 11h5" /></svg>
						</div>
						<h3>暂时没有找到相关平台</h3>
						<p>试试“超星”“智慧树”，或清除搜索查看全部平台。</p>
						<button type="button" @click="resetFilters">查看全部平台</button>
					</div>
				</section>

				<section id="official" class="official-section page-width section-reveal" aria-labelledby="official-title">
					<div class="official-heading">
						<div>
							<span class="section-index">02 / OFFICIAL & OPEN SOURCE</span>
							<h2 id="official-title">官方与开源</h2>
							<p>产品官网、代码仓库与团队动态。</p>
						</div>
						<span class="official-tag">SEPARATE CHANNEL</span>
					</div>
					<div class="official-grid">
						<a
							v-for="(site, index) in officialSites"
							:key="site.name"
							class="official-card"
							:href="site.url"
							target="_blank"
							rel="noopener noreferrer"
							:style="{ '--official-index': index }"
						>
							<div class="official-card__identity">
								<span class="official-icon">
									<span v-if="showFallbackIcon(site)" class="official-icon__fallback">{{ site.name.slice(0, 1) }}</span>
									<img v-else :src="iconUrl(site.icon)" alt="" @error="hideBrokenIcon(site)" />
								</span>
								<div>
									<span class="official-kind">{{ index < 1 ? 'OFFICIAL' : 'OPEN SOURCE' }}</span>
									<h3>{{ site.name }}</h3>
								</div>
							</div>
							<p>{{ site.description }}</p>
							<span class="official-arrow" aria-hidden="true">↗</span>
						</a>
					</div>
				</section>

				<section id="guide" class="guide-section page-width section-reveal" aria-labelledby="guide-title">
					<div class="guide-intro">
						<span class="section-index section-index--light">03 / A SIMPLE START</span>
						<h2 id="guide-title">三步，进入学习状态。</h2>
						<p>无需复杂设置。鸿鹄易学会在合适的课程页面出现，把繁琐留在幕后。</p>
						<a href="#/guide">
							查看完整使用指南
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>
						</a>
					</div>
					<ol class="guide-steps">
						<li>
							<span class="guide-step__number">01</span>
							<div><h3>进入平台</h3><p>从上方选择网课平台，完成账号登录。</p></div>
						</li>
						<li>
							<span class="guide-step__number">02</span>
							<div><h3>打开课程</h3><p>进入具体课程或任务页面，等待脚本初始化。</p></div>
						</li>
						<li>
							<span class="guide-step__number">03</span>
							<div><h3>按需使用</h3><p>通过页面悬浮面板选择功能，并遵循平台规则。</p></div>
						</li>
					</ol>
				</section>

				<section id="about" class="about-section page-width section-reveal">
					<div class="about-quote">
						<span class="quote-mark">↗</span>
						<p>Less friction.<br />More focus.</p>
					</div>
					<div class="about-copy">
						<span class="section-index">04 / ABOUT HONGHU EASYSTUDY</span>
						<h2>少一点重复，多一点专注。</h2>
						<p>鸿鹄易学将主流网课平台、课程学习与作业辅助能力整合到同一个工作流中。技术负责减少繁琐，你负责保持好奇、理解与思考。</p>
						<a class="about-link" href="#/about">了解鸿鹄易学 <span>↗</span></a>
					</div>
					<div class="about-badge"><strong>EASYSTUDY</strong><span>让技术服务于学习</span></div>
				</section>
			</main>

			<footer class="footer page-width">
				<div class="footer__brand"><img src="/favicon.png" alt="" /><span>鸿鹄易学</span><small>专注每一步成长</small></div>
				<div class="footer__links">
					<a href="https://easystudy.honghutech.eu.org" target="_blank" rel="noopener noreferrer">官方网站</a>
					<a href="https://gitcode.com/honghutech/honghueasystudy" target="_blank" rel="noopener noreferrer">GitCode</a>
					<a href="https://github.com/HONGHUTECHNOLOGY/honghueasystudy" target="_blank" rel="noopener noreferrer">GitHub</a>
				</div>
				<span class="footer__copyright">© {{ currentYear }} HONGHU EASYSTUDY</span>
			</footer>
		</a-spin>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { HonghuApi } from '@honghu-desktop/common/src/api';
import { iconUrl } from '../utils/index';
import { buildCatalog, OFFLINE_OFFICIAL_SITES, OFFLINE_PLATFORMS } from './bookmarks.data';
import type { CatalogEntry } from './bookmarks.data';

type BrowserTag = { color: string; name: string };

const hotKeywords = ['超星学习通', '智慧树', '职教云'];
const platforms = ref<CatalogEntry[]>(OFFLINE_PLATFORMS.map((entry) => ({ ...entry })));
const officialSites = ref<CatalogEntry[]>(OFFLINE_OFFICIAL_SITES.map((entry) => ({ ...entry })));
const failedIcons = reactive(new Set<string>());
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const opening = ref(false);
const noticeVisible = ref(true);
let revealObserver: IntersectionObserver | undefined;

const state = reactive({ loading: false, warn: false, tips: [''] });
const browser = reactive<{ name: string; notes: string; tags: BrowserTag[] }>({
	name: '鸿鹄易学浏览器',
	notes: '浏览器初始化完成后，进入课程页面即可使用鸿鹄易学。',
	tags: []
});

const currentDate = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
const currentYear = new Date().getFullYear();

const visibleStatusTips = computed(() => state.tips.map((tip) => tip?.trim()).filter(Boolean));
const filteredPlatforms = computed(() => {
	const keyword = searchQuery.value.trim().toLocaleLowerCase();
	if (!keyword) return platforms.value;
	return platforms.value.filter((item) => `${item.name} ${item.description || ''}`.toLocaleLowerCase().includes(keyword));
});
const totalVisible = computed(() => filteredPlatforms.value.length);

function getCurrentUid(): string | null {
	const searchUid = new URLSearchParams(location.search).get('uid');
	if (searchUid) return searchUid;
	const hashQuery = location.hash.split('?')[1];
	return hashQuery ? new URLSearchParams(hashQuery).get('uid') : null;
}

function platformLabel(bookmark: CatalogEntry): string {
	const labels: [string, string][] = [
		['超星', '综合课程'],
		['智慧树', '共享课程'],
		['智慧职教', '职业教育'],
		['职教云', '职业教育'],
		['MOOC', '开放课程'],
		['雨课堂', '智慧课堂'],
		['U校园', '外语学习']
	];
	return labels.find(([keyword]) => bookmark.name.includes(keyword))?.[1] || '课程平台';
}

function cardStyle(bookmark: CatalogEntry, index: number) {
	const accents = ['#635bff', '#2f80ed', '#0d9f84', '#a762c4', '#ef7b55', '#4d6b82'];
	// 主题色按平台在完整目录中的位置取值，避免搜索结果变化时卡片颜色跳变。
	const baseIndex = platforms.value.indexOf(bookmark);
	return {
		'--card-accent': accents[(baseIndex < 0 ? index : baseIndex) % accents.length],
		'--card-order': index
	};
}

function showFallbackIcon(entry: CatalogEntry): boolean {
	return !entry.icon || failedIcons.has(entry.url);
}

function hideBrokenIcon(entry: CatalogEntry) {
	failedIcons.add(entry.url);
}

function applyKeyword(keyword: string) {
	searchQuery.value = keyword;
	void nextTick(() => document.querySelector('#platforms')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function clearSearch() {
	searchQuery.value = '';
	searchInput.value?.focus();
}

function resetFilters() {
	searchQuery.value = '';
}

function handleGlobalKeydown(event: KeyboardEvent) {
	const target = event.target as HTMLElement;
	if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
		event.preventDefault();
		searchInput.value?.focus();
	}
}

function handlePointerMove(event: PointerEvent) {
	const element = event.currentTarget as HTMLElement;
	const rect = element.getBoundingClientRect();
	const offsetX = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
	const offsetY = ((event.clientY - rect.top) / rect.height - 0.5) * 10;
	element.style.setProperty('--pointer-x', `${offsetX}px`);
	element.style.setProperty('--pointer-y', `${offsetY}px`);
	element.style.setProperty('--pointer-reverse-x', `${offsetX * -0.6}px`);
	element.style.setProperty('--pointer-reverse-y', `${offsetY * -0.6}px`);
}

function resetPointer(event: PointerEvent) {
	const element = event.currentTarget as HTMLElement;
	element.style.setProperty('--pointer-x', '0px');
	element.style.setProperty('--pointer-y', '0px');
	element.style.setProperty('--pointer-reverse-x', '0px');
	element.style.setProperty('--pointer-reverse-y', '0px');
}

function handleCardPointerMove(event: PointerEvent) {
	const element = event.currentTarget as HTMLElement;
	const rect = element.getBoundingClientRect();
	element.style.setProperty('--card-pointer-x', `${event.clientX - rect.left}px`);
	element.style.setProperty('--card-pointer-y', `${event.clientY - rect.top}px`);
}

function handleCardPointerLeave(event: PointerEvent) {
	const element = event.currentTarget as HTMLElement;
	element.style.setProperty('--card-pointer-x', '50%');
	element.style.setProperty('--card-pointer-y', '50%');
}

async function openInApp() {
	const uid = getCurrentUid();
	if (!uid || opening.value) return;
	opening.value = true;
	try {
		const port = location.port || '15319';
		await fetch(`http://localhost:${port}/api/bookmark/show-browser-in-app?uid=${uid}`);
	} catch (error) {
		console.error('唤起软件失败', error);
	} finally {
		window.setTimeout(() => (opening.value = false), 800);
	}
}

// @ts-ignore 暴露给 Playwright 初始化脚本
window.setBookmarkLoadingState = (_state) => Object.assign(state, _state);

function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T | null> {
	return new Promise((resolve) => {
		let settled = false;
		const timer = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(null);
		}, timeout);

		promise
			.then((value) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				resolve(value);
			})
			.catch(() => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				resolve(null);
			});
	});
}

async function hydrateCatalog() {
	try {
		const infos = await withTimeout(HonghuApi.getInfos(), 4500);
		if (!infos?.bookmark?.length) return;
		const catalog = buildCatalog(infos.bookmark);
		platforms.value = catalog.platforms;
		officialSites.value = catalog.officialSites;
	} catch {
		// 远端目录不可用时继续使用页面已呈现的入口。
	}
}

async function hydrateBrowserInfo() {
	const uid = getCurrentUid();
	if (!uid) return;
	try {
		const port = location.port || '15319';
		const response = await fetch(`http://localhost:${port}/api/bookmark/browser-info?uid=${uid}`);
		const info = await response.json();
		if (!info) return;
		browser.name = info.name || browser.name;
		browser.notes = info.notes || browser.notes;
		browser.tags = Array.isArray(info.tags) ? info.tags : [];
	} catch (error) {
		console.error('获取浏览器信息失败', error);
	}
}

function setupRevealObserver() {
	if (!('IntersectionObserver' in window)) return;
	revealObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add('is-visible');
				revealObserver?.unobserve(entry.target);
			}
		},
		{ threshold: 0.08, rootMargin: '0px 0px -50px' }
	);
	document.querySelectorAll('.section-reveal').forEach((element) => revealObserver?.observe(element));
}

onMounted(() => {
	document.title = '鸿鹄易学 · 学习导航';
	window.addEventListener('keydown', handleGlobalKeydown);
	setupRevealObserver();
	void hydrateCatalog();
	void hydrateBrowserInfo();
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', handleGlobalKeydown);
	revealObserver?.disconnect();
});
</script>

<style lang="less">
.home-page {
	--ink: #1f2d29;
	--ink-soft: #52605b;
	--forest: #244d42;
	--forest-deep: #183a32;
	--paper: #f7f6f1;
	--paper-deep: #efeee7;
	--line: rgba(31, 45, 41, 0.12);
	--vermilion: #b65c40;
	position: relative;
	min-height: 100vh;
	overflow: hidden;
	background: var(--paper);
	color: var(--ink);
	font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif;
	-webkit-font-smoothing: antialiased;

	* { box-sizing: border-box; }
	button, input { font: inherit; }
	button, a { -webkit-tap-highlight-color: transparent; }
	a { color: inherit; text-decoration: none; }
	button { color: inherit; }
	::selection { color: #fff; background: var(--forest); }
}

.page-width { width: min(1240px, calc(100% - 80px)); margin-inline: auto; }
.page-spin { position: relative; z-index: 1; width: 100%; }
.ambient { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.ambient__wash { position: absolute; border-radius: 50%; filter: blur(2px); opacity: 0.8; }
.ambient__wash--one { width: 780px; height: 780px; top: -420px; right: -130px; background: radial-gradient(circle, rgba(190, 205, 187, 0.38), rgba(247, 246, 241, 0) 68%); animation: ambient-breathe 12s ease-in-out infinite alternate; }
.ambient__wash--two { width: 620px; height: 620px; top: 380px; left: -360px; background: radial-gradient(circle, rgba(219, 190, 164, 0.2), rgba(247, 246, 241, 0) 70%); }
.ambient__grid { position: absolute; inset: 0; opacity: 0.19; background-image: linear-gradient(rgba(36, 77, 66, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(36, 77, 66, 0.055) 1px, transparent 1px); background-size: 56px 56px; mask-image: linear-gradient(to bottom, black, transparent 72%); }
.ambient__grain { position: absolute; inset: 0; opacity: 0.035; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E"); }

.topbar { min-height: 96px; display: flex; align-items: center; justify-content: space-between; gap: 28px; border-bottom: 1px solid var(--line); }
.brand { display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; }
.brand__mark { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid rgba(36, 77, 66, 0.14); border-radius: 13px; background: rgba(255, 255, 255, 0.58); box-shadow: 0 8px 24px rgba(31, 45, 41, 0.06); }
.brand__mark img { width: 30px; height: 30px; object-fit: contain; }
.brand__type { display: flex; flex-direction: column; gap: 4px; }
.brand__type strong { font-family: 'STSong', 'Songti SC', serif; font-size: 20px; letter-spacing: 0.12em; line-height: 1; }
.brand__type small { color: #78817d; font-size: 8px; font-weight: 600; letter-spacing: 0.18em; }
.topnav { display: flex; align-items: center; gap: 34px; margin-left: auto; margin-right: 24px; }
.topnav a { position: relative; padding: 37px 0 34px; color: #6e7773; font-size: 13px; transition: color 0.25s ease; }
.topnav a::after { content: ''; position: absolute; left: 50%; bottom: 23px; width: 0; height: 1px; background: var(--forest); transform: translateX(-50%); transition: width 0.25s ease; }
.topnav a:hover, .topnav a.is-active { color: var(--forest); }
.topnav a:hover::after, .topnav a.is-active::after { width: 18px; }
.topbar__actions { display: flex; align-items: center; gap: 16px; }
.ready-pill { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 12px; white-space: nowrap; }
.ready-pill__dot { width: 7px; height: 7px; border-radius: 50%; background: #6b9982; box-shadow: 0 0 0 4px rgba(107, 153, 130, 0.12); animation: status-pulse 2.8s ease-in-out infinite; }
.ready-pill.is-warning .ready-pill__dot { background: #c28a48; box-shadow: 0 0 0 4px rgba(194, 138, 72, 0.12); }
.app-button { height: 38px; padding: 0 15px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255, 255, 255, 0.45); font-size: 12px; cursor: pointer; transition: border-color 0.25s ease, background 0.25s ease, transform 0.25s ease; }
.app-button svg { width: 15px; stroke: currentColor; stroke-width: 1.6; }
.app-button:hover { border-color: rgba(36, 77, 66, 0.35); background: #fff; transform: translateY(-1px); }
.app-button:disabled { opacity: 0.6; cursor: wait; }

.hero { min-height: 592px; display: grid; grid-template-columns: 1.02fr 0.98fr; align-items: center; gap: 64px; padding-top: 54px; padding-bottom: 64px; }
.eyebrow { display: flex; align-items: center; gap: 13px; margin-bottom: 25px; color: #6c7d75; font-size: 10px; font-weight: 600; letter-spacing: 0.19em; }
.eyebrow__line { width: 30px; height: 1px; background: var(--vermilion); }
.hero h1 { margin: 0; font-family: 'STSong', 'Songti SC', 'SimSun', serif; font-size: clamp(52px, 4.7vw, 72px); font-weight: 500; line-height: 1.23; letter-spacing: 0.025em; }
.hero h1 span { position: relative; color: var(--forest); }
.hero h1 span::after { content: ''; position: absolute; left: 2px; right: 6px; bottom: -8px; height: 7px; opacity: 0.45; background: url("data:image/svg+xml,%3Csvg width='300' height='8' viewBox='0 0 300 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5.5c70-4 150-5 298-2' stroke='%23b65c40' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
.hero__intro { margin: 30px 0 29px; color: var(--ink-soft); font-size: 15px; line-height: 1.95; letter-spacing: 0.02em; }
.search-wrap { max-width: 520px; }
.search-box { height: 58px; display: flex; align-items: center; gap: 13px; padding: 0 15px 0 18px; border: 1px solid rgba(36, 77, 66, 0.15); border-radius: 14px; background: rgba(255, 255, 255, 0.75); box-shadow: 0 15px 40px rgba(36, 55, 47, 0.07), inset 0 1px rgba(255, 255, 255, 0.9); backdrop-filter: blur(16px); transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease; }
.search-box:focus-within { border-color: rgba(36, 77, 66, 0.48); background: #fff; box-shadow: 0 18px 45px rgba(36, 55, 47, 0.1), 0 0 0 4px rgba(36, 77, 66, 0.05); }
.search-box > svg { width: 21px; flex: 0 0 auto; stroke: #64736d; stroke-width: 1.6; }
.search-box input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 14px; }
.search-box input::placeholder { color: #909792; }
.search-box input::-webkit-search-cancel-button { display: none; }
.search-box kbd { min-width: 25px; height: 25px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 6px; background: #f5f4ef; color: #87908b; font-family: inherit; font-size: 12px; box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04); }
.search-box button { width: 26px; height: 26px; display: grid; place-items: center; flex: 0 0 auto; padding: 0; border: 0; border-radius: 50%; background: #eeeee8; cursor: pointer; }
.search-box button svg { width: 14px; stroke: currentColor; stroke-width: 1.6; }
.quick-search { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-left: 3px; font-size: 11px; }
.quick-search > span { margin-right: 3px; color: #8a918d; }
.quick-search button { padding: 3px 7px; border: 0; border-bottom: 1px solid transparent; background: none; color: #63716b; font-size: 11px; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
.quick-search button:hover { color: var(--vermilion); border-color: rgba(182, 92, 64, 0.35); }
.hero__assurance { display: flex; flex-wrap: wrap; gap: 23px; margin-top: 27px; color: #6f7a75; font-size: 11px; }
.hero__assurance span { display: flex; align-items: center; gap: 7px; }
.hero__assurance i { width: 4px; height: 4px; border-radius: 50%; background: #8a9e91; }

.hero__visual { --pointer-x: 0px; --pointer-y: 0px; --pointer-reverse-x: 0px; --pointer-reverse-y: 0px; position: relative; min-height: 456px; display: flex; align-items: center; justify-content: center; isolation: isolate; }
.orbit { position: absolute; z-index: -2; border: 1px solid rgba(36, 77, 66, 0.09); border-radius: 50%; }
.orbit--outer { width: 440px; height: 440px; animation: orbit-rotate 50s linear infinite; }
.orbit--outer::before, .orbit--outer::after { content: ''; position: absolute; width: 7px; height: 7px; border: 3px solid var(--paper); border-radius: 50%; background: #9bafa1; box-shadow: 0 0 0 1px rgba(36, 77, 66, 0.08); }
.orbit--outer::before { top: 48px; left: 66px; }
.orbit--outer::after { right: 20px; bottom: 125px; background: #c58c70; }
.orbit--inner { width: 340px; height: 340px; border-style: dashed; opacity: 0.65; }
.visual-dots { position: absolute; right: -4px; top: 18px; width: 82px; height: 82px; z-index: -3; opacity: 0.26; background-image: radial-gradient(var(--forest) 1px, transparent 1px); background-size: 10px 10px; }
.session-card { position: relative; width: min(430px, calc(100% - 30px)); padding: 28px; border: 1px solid rgba(255, 255, 255, 0.75); border-radius: 24px; background: linear-gradient(145deg, rgba(255, 255, 255, 0.89), rgba(246, 247, 241, 0.75)); box-shadow: 0 35px 80px rgba(35, 61, 51, 0.13), 0 3px 12px rgba(35, 61, 51, 0.05); backdrop-filter: blur(24px); transform: translate(var(--pointer-x), var(--pointer-y)) rotate(1.2deg); transition: transform 0.7s cubic-bezier(0.2, 0.75, 0.25, 1); }
.session-card::before { content: ''; position: absolute; inset: 10px; pointer-events: none; border: 1px solid rgba(36, 77, 66, 0.05); border-radius: 17px; }
.session-card__top { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
.session-kicker { color: #8c9691; font-size: 8px; font-weight: 600; letter-spacing: 0.18em; }
.session-card h2 { margin: 7px 0 0; font-family: 'STSong', 'Songti SC', serif; font-size: 23px; font-weight: 600; letter-spacing: 0.04em; }
.session-date { padding-top: 5px; color: #8b928e; font-size: 10px; white-space: nowrap; }
.session-journey { position: relative; display: flex; flex-direction: column; gap: 20px; padding: 24px 0; }
.journey-line { position: absolute; left: 16px; top: 40px; bottom: 38px; width: 1px; background: #dcded7; }
.journey-line span { display: block; width: 100%; height: 31%; background: var(--forest); }
.journey-step { position: relative; display: flex; align-items: center; gap: 14px; }
.journey-step__number { width: 33px; height: 33px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid #d8dcd5; border-radius: 50%; background: #f7f7f2; color: #8a928d; font-family: Georgia, serif; font-size: 10px; }
.journey-step.is-current .journey-step__number { border-color: var(--forest); background: var(--forest); color: #fff; box-shadow: 0 0 0 5px rgba(36, 77, 66, 0.06); }
.journey-step div { display: flex; flex-direction: column; gap: 5px; }
.journey-step strong { font-size: 13px; font-weight: 600; }
.journey-step small { color: #87908b; font-size: 10px; }
.journey-step__state { margin-left: auto; padding: 4px 9px; border-radius: 20px; background: rgba(182, 92, 64, 0.09); color: var(--vermilion); font-size: 9px; }
.session-card__bottom { position: relative; display: flex; align-items: center; gap: 11px; margin: 0 -10px -10px; padding: 14px; border-radius: 14px; background: rgba(36, 77, 66, 0.055); }
.browser-avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: #fff; color: var(--forest); box-shadow: 0 3px 10px rgba(36, 77, 66, 0.07); }
.browser-avatar svg { width: 18px; stroke: currentColor; stroke-width: 1.35; }
.browser-session-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.browser-session-copy span { color: #89928d; font-size: 9px; }
.browser-session-copy strong { max-width: 195px; overflow: hidden; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.session-live { display: flex; align-items: center; gap: 6px; margin-left: auto; color: #6f8177; font-size: 9px; }
.session-live i { width: 5px; height: 5px; border-radius: 50%; background: #6e9a80; }
.floating-note { position: absolute; display: flex; align-items: center; gap: 8px; padding: 11px 14px; border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 12px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 12px 30px rgba(35, 61, 51, 0.09); backdrop-filter: blur(12px); color: #5b6b63; font-size: 10px; transform: translate(var(--pointer-reverse-x), var(--pointer-reverse-y)); transition: transform 0.9s cubic-bezier(0.2, 0.75, 0.25, 1); }
.floating-note--top { top: 32px; right: 2px; animation: note-float 5s ease-in-out infinite; }
.floating-note svg { width: 15px; stroke: #6b927c; stroke-width: 1.8; }
.floating-seal { position: absolute; left: 3px; bottom: 40px; width: 68px; height: 76px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px solid rgba(182, 92, 64, 0.28); background: rgba(247, 246, 241, 0.7); color: var(--vermilion); transform: rotate(-6deg); }
.floating-seal::before { content: ''; position: absolute; inset: 4px; border: 1px solid rgba(182, 92, 64, 0.15); }
.floating-seal span { font-family: 'STKaiti', 'KaiTi', serif; font-size: 29px; line-height: 1; }
.floating-seal small { font-family: 'STKaiti', 'KaiTi', serif; font-size: 8px; letter-spacing: 0.13em; }

.context-strip { display: flex; align-items: center; gap: 20px; margin-bottom: 90px; padding: 17px 20px; border: 1px solid rgba(36, 77, 66, 0.1); border-radius: 15px; background: rgba(237, 240, 233, 0.64); }
.context-strip__main { display: flex; align-items: center; gap: 13px; min-width: 0; }
.context-icon { width: 35px; height: 35px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 10px; background: rgba(36, 77, 66, 0.08); color: var(--forest); }
.context-icon svg { width: 19px; stroke: currentColor; stroke-width: 1.5; }
.context-strip strong { font-size: 12px; font-weight: 600; }
.context-strip p { max-width: 650px; margin: 5px 0 0; overflow: hidden; color: #748079; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.browser-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-left: auto; }
.browser-tags span { padding: 4px 8px; border-radius: 5px; color: #fff; font-size: 9px; }
.context-strip > a { margin-left: auto; color: var(--forest); font-size: 11px; white-space: nowrap; }
.context-strip > a span { margin-left: 4px; }
.browser-tags + a { margin-left: 0; }

.platform-section { padding-bottom: 105px; scroll-margin-top: 28px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
.section-index { display: block; margin-bottom: 14px; color: #8b958f; font-size: 9px; font-weight: 600; letter-spacing: 0.19em; }
.section-heading h2, .guide-intro h2, .about-copy h2 { margin: 0; font-family: 'STSong', 'Songti SC', serif; font-size: 34px; font-weight: 600; letter-spacing: 0.025em; }
.section-heading p { margin: 12px 0 0; color: #7a847f; font-size: 13px; }
.section-count { display: flex; align-items: baseline; gap: 8px; padding-bottom: 4px; color: #8b938f; }
.section-count strong { color: var(--forest); font-family: Georgia, serif; font-size: 29px; font-weight: 400; }
.section-count span { font-size: 10px; }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 23px; }
.filter-tabs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.filter-tabs button { height: 34px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: #77817c; font-size: 11px; cursor: pointer; transition: all 0.25s ease; }
.filter-tabs button span { display: grid; min-width: 17px; height: 17px; place-items: center; border-radius: 5px; background: rgba(31, 45, 41, 0.05); font-size: 9px; }
.filter-tabs button:hover { background: rgba(255, 255, 255, 0.55); color: var(--forest); }
.filter-tabs button.is-active { border-color: rgba(36, 77, 66, 0.12); background: var(--forest); color: #fff; box-shadow: 0 6px 16px rgba(36, 77, 66, 0.14); }
.filter-tabs button.is-active span { background: rgba(255, 255, 255, 0.13); }
.filter-hint { color: #939a96; font-size: 10px; }
.platform-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 15px; }
.platform-card { --card-accent: #426e63; position: relative; min-height: 248px; display: flex; flex-direction: column; overflow: hidden; padding: 21px; border: 1px solid rgba(31, 45, 41, 0.1); border-radius: 17px; background: rgba(255, 255, 255, 0.55); box-shadow: 0 2px 2px rgba(31, 45, 41, 0.015); transition: transform 0.4s cubic-bezier(0.2, 0.75, 0.25, 1), box-shadow 0.4s ease, border-color 0.3s ease, background 0.3s ease; animation: card-enter 0.65s both; animation-delay: calc(var(--card-order) * 45ms); }
.platform-card::before { content: ''; position: absolute; top: 0; left: 22px; width: 28px; height: 2px; background: var(--card-accent); transform: scaleX(0.45); transform-origin: left; transition: width 0.35s ease, transform 0.35s ease; }
.platform-card::after { content: ''; position: absolute; right: -50px; top: -60px; width: 140px; height: 140px; border-radius: 50%; background: var(--card-accent); opacity: 0; filter: blur(45px); transition: opacity 0.35s ease; pointer-events: none; }
.platform-card:hover { z-index: 2; border-color: color-mix(in srgb, var(--card-accent) 32%, transparent); background: rgba(255, 255, 255, 0.9); box-shadow: 0 20px 45px rgba(31, 45, 41, 0.09); transform: translateY(-6px); }
.platform-card:hover::before { width: 52px; transform: scaleX(1); }
.platform-card:hover::after { opacity: 0.08; }
.platform-card__top { display: flex; align-items: flex-start; justify-content: space-between; }
.platform-logo { position: relative; width: 48px; height: 48px; display: grid; place-items: center; overflow: hidden; border: 1px solid rgba(31, 45, 41, 0.07); border-radius: 14px; background: #f3f2ec; color: var(--card-accent); font-family: 'STSong', 'Songti SC', serif; font-size: 22px; }
.platform-logo img { position: absolute; inset: 8px; width: 32px; height: 32px; object-fit: contain; }
.platform-arrow { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid transparent; border-radius: 50%; color: #9ca29e; transition: all 0.3s ease; }
.platform-arrow svg { width: 17px; stroke: currentColor; stroke-width: 1.35; }
.platform-card:hover .platform-arrow { border-color: rgba(31, 45, 41, 0.1); background: var(--forest); color: #fff; transform: rotate(5deg); }
.platform-card__body { padding-top: 19px; }
.platform-category { color: var(--card-accent); font-size: 8px; font-weight: 600; letter-spacing: 0.12em; }
.platform-card h3 { margin: 7px 0 8px; overflow: hidden; font-size: 16px; font-weight: 600; letter-spacing: 0.01em; text-overflow: ellipsis; white-space: nowrap; }
.platform-card p { display: -webkit-box; min-height: 34px; margin: 0; overflow: hidden; color: #818983; font-size: 11px; line-height: 1.65; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.platform-card__footer { display: flex; align-items: center; gap: 9px; margin-top: auto; padding-top: 15px; color: #747f79; font-size: 10px; }
.platform-card__footer i { width: 20px; height: 1px; background: #c5cac5; transition: width 0.3s ease, background 0.3s ease; }
.platform-card:hover .platform-card__footer { color: var(--forest); }
.platform-card:hover .platform-card__footer i { width: 34px; background: var(--forest); }
.empty-state { padding: 58px 20px; border: 1px dashed rgba(36, 77, 66, 0.18); border-radius: 18px; text-align: center; background: rgba(255, 255, 255, 0.35); }
.empty-state__icon { width: 48px; height: 48px; display: grid; place-items: center; margin: 0 auto 15px; border-radius: 50%; background: rgba(36, 77, 66, 0.07); color: var(--forest); }
.empty-state__icon svg { width: 23px; stroke: currentColor; stroke-width: 1.4; }
.empty-state h3 { margin: 0; font-size: 16px; }
.empty-state p { margin: 10px 0 18px; color: #84908a; font-size: 12px; }
.empty-state button { padding: 9px 16px; border: 0; border-radius: 8px; background: var(--forest); color: white; font-size: 11px; cursor: pointer; }

.guide-section { position: relative; display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 70px; overflow: hidden; margin-bottom: 96px; padding: 48px 52px; border-radius: 24px; background: var(--forest-deep); color: #f4f3eb; scroll-margin-top: 28px; box-shadow: 0 24px 60px rgba(24, 58, 50, 0.14); }
.guide-section::before { content: ''; position: absolute; width: 400px; height: 400px; left: -170px; bottom: -260px; border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 50%; box-shadow: 0 0 0 45px rgba(255, 255, 255, 0.018), 0 0 0 90px rgba(255, 255, 255, 0.012); }
.section-index--light { color: rgba(236, 240, 231, 0.48); }
.guide-intro { position: relative; }
.guide-intro h2 { color: #fff; font-size: 32px; }
.guide-intro p { max-width: 380px; margin: 17px 0 25px; color: rgba(237, 241, 232, 0.62); font-size: 12px; line-height: 1.9; }
.guide-intro a { display: inline-flex; align-items: center; gap: 10px; padding-bottom: 5px; border-bottom: 1px solid rgba(255, 255, 255, 0.22); color: rgba(255, 255, 255, 0.86); font-size: 11px; transition: border-color 0.25s, gap 0.25s; }
.guide-intro a:hover { gap: 15px; border-color: rgba(255, 255, 255, 0.55); }
.guide-intro a svg { width: 15px; stroke: currentColor; stroke-width: 1.4; }
.guide-steps { position: relative; display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; list-style: none; }
.guide-steps li { display: flex; align-items: center; gap: 19px; padding: 17px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.09); }
.guide-steps li:first-child { padding-top: 3px; }
.guide-steps li:last-child { padding-bottom: 3px; border-bottom: 0; }
.guide-step__number { color: #c79b78; font-family: Georgia, serif; font-size: 24px; font-style: italic; }
.guide-steps h3 { margin: 0 0 6px; font-size: 13px; font-weight: 500; }
.guide-steps p { margin: 0; color: rgba(237, 241, 232, 0.53); font-size: 11px; }

.about-section { display: grid; grid-template-columns: 0.85fr 1.2fr auto; align-items: center; gap: 50px; padding-bottom: 76px; scroll-margin-top: 28px; }
.about-quote { position: relative; padding-left: 28px; border-left: 1px solid rgba(182, 92, 64, 0.38); }
.quote-mark { position: absolute; top: -27px; left: 23px; color: rgba(182, 92, 64, 0.18); font-family: Georgia, serif; font-size: 60px; }
.about-quote p { position: relative; margin: 0; font-family: 'STKaiti', 'KaiTi', serif; font-size: 19px; line-height: 1.8; }
.about-copy h2 { font-size: 25px; }
.about-copy p { max-width: 520px; margin: 14px 0 0; color: #77817b; font-size: 11px; line-height: 1.9; }
.about-badge { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; color: #8e9691; }
.about-badge strong { color: rgba(36, 77, 66, 0.22); font-family: Georgia, serif; font-size: 26px; font-weight: 400; letter-spacing: 0.12em; }
.about-badge span { font-size: 9px; letter-spacing: 0.12em; }
.footer { min-height: 92px; display: flex; align-items: center; gap: 30px; border-top: 1px solid var(--line); color: #838c87; font-size: 10px; }
.footer__brand { display: flex; align-items: center; gap: 9px; }
.footer__brand img { width: 21px; height: 21px; object-fit: contain; opacity: 0.75; }
.footer__brand span { color: var(--ink); font-family: 'STSong', 'Songti SC', serif; font-size: 13px; }
.footer__brand small { padding-left: 9px; border-left: 1px solid var(--line); font-size: 9px; }
.footer__links { display: flex; gap: 22px; margin-left: auto; }
.footer__links a { transition: color 0.2s; }
.footer__links a:hover { color: var(--forest); }
.footer__copyright { margin-left: 15px; font-size: 8px; letter-spacing: 0.08em; }

.loading-state { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--forest); }
.loading-state p { margin: 20px 0 5px; font-family: 'STSong', 'Songti SC', serif; font-size: 18px; letter-spacing: 0.08em; }
.loading-mark { display: flex; align-items: center; gap: 6px; height: 32px; }
.loading-mark span { width: 3px; height: 16px; border-radius: 3px; background: var(--forest); animation: loading-wave 1.1s ease-in-out infinite; }
.loading-mark span:nth-child(2) { height: 28px; animation-delay: 0.12s; }
.loading-mark span:nth-child(3) { animation-delay: 0.24s; }
.loading-tip { color: #85908a; font-size: 11px; }
.reveal { opacity: 0; animation: reveal-up 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }
.reveal--one { animation-delay: 0.08s; }
.reveal--two { animation-delay: 0.16s; }
.reveal--three { animation-delay: 0.25s; }
.reveal--four { animation-delay: 0.34s; }
.reveal--five { animation-delay: 0.43s; }
.reveal--visual { animation: reveal-visual 1.2s 0.25s cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }

@keyframes reveal-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes reveal-visual { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes card-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ambient-breathe { to { transform: translate(-25px, 30px) scale(1.08); } }
@keyframes orbit-rotate { to { transform: rotate(360deg); } }
@keyframes status-pulse { 50% { box-shadow: 0 0 0 7px rgba(107, 153, 130, 0); } }
@keyframes note-float { 50% { margin-top: -7px; } }
@keyframes loading-wave { 50% { height: 8px; opacity: 0.4; } }

@media (min-width: 1500px) {
	.hero { min-height: 650px; }
	.platform-grid { gap: 18px; }
	.platform-card { min-height: 260px; padding: 23px; }
}

@media (max-width: 1100px) {
	.page-width { width: min(100% - 48px, 960px); }
	.topnav { display: none; }
	.hero { grid-template-columns: 1fr 0.9fr; gap: 25px; }
	.hero h1 { font-size: 54px; }
	.session-card { padding: 23px; }
	.floating-note--top { right: -8px; }
	.platform-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	.about-section { grid-template-columns: 0.8fr 1.2fr; }
	.about-badge { display: none; }
}

@media (max-width: 820px) {
	.page-width { width: calc(100% - 36px); }
	.topbar { min-height: 80px; }
	.ready-pill { display: none; }
	.hero { grid-template-columns: 1fr; gap: 30px; padding-top: 58px; }
	.hero__copy { text-align: center; }
	.eyebrow, .hero__assurance { justify-content: center; }
	.search-wrap { margin-inline: auto; }
	.quick-search { justify-content: center; }
	.hero__visual { min-height: 440px; }
	.session-card { width: min(450px, calc(100% - 50px)); }
	.floating-note--top { right: calc(50% - 245px); }
	.floating-seal { left: calc(50% - 245px); }
	.context-strip { margin-bottom: 70px; }
	.context-strip p { max-width: 410px; }
	.browser-tags { display: none; }
	.platform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.guide-section { grid-template-columns: 1fr; gap: 35px; padding: 40px; }
	.guide-intro p { max-width: none; }
	.about-section { grid-template-columns: 1fr; gap: 38px; }
	.about-quote { max-width: 350px; }
	.footer { flex-wrap: wrap; gap: 16px 25px; padding: 25px 0; }
	.footer__links { order: 3; width: 100%; margin-left: 0; }
	.footer__copyright { margin-left: auto; }
}

@media (max-width: 560px) {
	.page-width { width: calc(100% - 28px); }
	.topbar { gap: 12px; }
	.brand__mark { width: 37px; height: 37px; border-radius: 11px; }
	.brand__mark img { width: 27px; height: 27px; }
	.brand__type strong { font-size: 17px; }
	.brand__type small { font-size: 6px; }
	.app-button { width: 38px; padding: 0; justify-content: center; }
	.app-button span { display: none; }
	.hero { min-height: auto; padding-top: 46px; padding-bottom: 45px; }
	.eyebrow { font-size: 8px; letter-spacing: 0.13em; }
	.hero h1 { font-size: 45px; }
	.hero__intro { margin-top: 26px; font-size: 13px; }
	.desktop-break { display: none; }
	.search-box { height: 54px; }
	.search-box input { font-size: 12px; }
	.hero__assurance { gap: 13px; font-size: 9px; }
	.hero__visual { min-height: 395px; }
	.orbit--outer { width: 350px; height: 350px; }
	.orbit--inner { width: 290px; height: 290px; }
	.session-card { width: calc(100% - 18px); padding: 22px 19px; border-radius: 20px; }
	.session-card h2 { font-size: 20px; }
	.session-date { font-size: 8px; }
	.floating-note { display: none; }
	.floating-seal { left: -3px; bottom: 8px; width: 55px; height: 63px; }
	.floating-seal span { font-size: 24px; }
	.journey-step { gap: 11px; }
	.journey-step small { font-size: 9px; }
	.browser-session-copy strong { max-width: 150px; }
	.context-strip { align-items: flex-start; margin-bottom: 62px; padding: 15px; }
	.context-strip p { max-width: 220px; white-space: normal; line-height: 1.6; }
	.context-strip > a { display: none; }
	.section-heading { align-items: flex-start; }
	.section-heading h2 { font-size: 28px; }
	.section-count { padding-top: 29px; }
	.section-count strong { font-size: 24px; }
	.section-count span { display: none; }
	.filter-row { align-items: flex-start; }
	.filter-hint { display: none; }
	.filter-tabs { gap: 5px; }
	.filter-tabs button { padding: 0 10px; }
	.platform-grid { gap: 11px; }
	.platform-card { min-height: 229px; padding: 16px; border-radius: 15px; }
	.platform-logo { width: 42px; height: 42px; border-radius: 12px; }
	.platform-logo img { inset: 7px; width: 28px; height: 28px; }
	.platform-card h3 { font-size: 14px; }
	.platform-card p { font-size: 10px; }
	.platform-arrow { width: 23px; height: 23px; }
	.platform-section { padding-bottom: 75px; }
	.guide-section { width: calc(100% - 28px); gap: 28px; margin-bottom: 70px; padding: 32px 25px; border-radius: 20px; }
	.guide-intro h2 { font-size: 28px; }
	.guide-steps li { gap: 16px; }
	.guide-steps p { line-height: 1.6; }
	.about-section { padding-bottom: 55px; }
	.about-copy h2 { font-size: 23px; }
	.footer__brand small { display: none; }
	.footer__copyright { font-size: 7px; }
}

@media (prefers-reduced-motion: reduce) {
	.home-page *, .home-page *::before, .home-page *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
	.reveal, .reveal--visual { opacity: 1; }
	.session-card, .floating-note { transform: none; }
}
</style>

<style lang="less" src="./bookmarks-modern.less"></style>
