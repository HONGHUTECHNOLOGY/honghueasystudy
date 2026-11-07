<template>
	<CommonEditActionDropdown
		trigger="contextMenu"
		align-point
		position="bl"
		:style="{ display: 'block' }"
	>
		<!-- .app-page 提供 flex:1 与纵向滚动；页签贴顶靠 sticky -->
		<div
			ref="scroller"
			class="app-page simple-page"
		>
			<!--
				页签：自己实现的胶囊分段，不用 a-tabs type="rounded"。
				原因是要精确控制「容器凹陷 + 选中浮起」的两层关系，
				Arco 的 rounded 变体在暗色下的底色与边框会各剩一半，很难覆写干净。
			-->
			<div class="simple-tabbar">
				<div class="tab-group">
					<button
						v-for="tab in tabs"
						:key="tab.key"
						class="tab-pill"
						:class="{ 'is-active': state.activeTab === tab.key }"
						type="button"
						@click="state.activeTab = tab.key"
					>
						<Icon
							class="tab-pill__icon"
							:type="tab.icon"
						/>
						<span>{{ tab.label }}</span>
						<span
							v-if="tab.badge"
							class="tab-pill__badge"
						>
							{{ tab.badge }}
						</span>
					</button>
				</div>
			</div>

			<div class="simple-body">
				<!-- 浏览器面板 -->
				<div
					v-show="state.activeTab === 'browsers'"
					class="panel-in"
				>
					<!-- 环境检测提示 -->
					<EnvironmentAlert class="mb-3" />

					<UsageAlertCollapse
						v-model:collapse="store.render.state.read_record.browser_usage"
						class="mb-3"
						banner
						title="使用提示"
						:html="lang('simple_mode_index_browser_usage', '启动浏览器、打开任意网课后即可自动执行脚本。')"
					/>

					<div class="cards-area entities">
						<template v-if="allBrowsers.length === 0">
							<div class="empty-browser">
								<EmptyBrowserCard />
							</div>
						</template>
						<template v-else>
							<div class="cards-grid">
								<!-- 浏览器卡片 -->
								<template
									v-for="(browser, idx) in allBrowsers"
									:key="browser.uid"
								>
									<div
										:data-uid="browser.uid"
										:style="{ '--i': idx }"
										class="browser-card entity"
										@click="selectBrowser(browser)"
									>
										<div class="browser-card__head">
											<div class="browser-card__title">
												<Icon type="web" />
												<!-- 重命名状态 -->
												<template v-if="getBrowserInstance(browser.uid)?.renaming">
													<a-input
														v-model="renameValue"
														size="mini"
														@click.stop
														@blur="handleRenameFinish(browser)"
														@keyup.enter="handleRenameFinish(browser)"
													/>
												</template>
												<template v-else>
													<span class="browser-card__name">{{ browser.name }}</span>
												</template>
											</div>

											<div
												class="browser-card__ops"
												@click.stop
											>
												<BrowserOperators
													:browser="browser"
													icon-class="fs-5"
												/>
											</div>
										</div>

										<!-- 标签 -->
										<div
											v-if="browser.tags.length"
											class="browser-card__tags"
										>
											<Tags
												:tags="browser.tags"
												:read-only="true"
												size="small"
											/>
										</div>

										<!-- 备注/描述：只有真的有备注时才占一行 -->
										<div
											v-if="browser.notes?.trim()"
											class="browser-card__notes"
										>
											{{ browser.notes }}
										</div>
									</div>
								</template>

								<!-- 新增浏览器卡片 -->
								<button
									class="browser-card browser-card--add"
									type="button"
									@click="handleAddBrowser"
								>
									<Icon
										type="add"
										class="browser-card__add-icon"
									/>
									<span class="browser-card__add-text">新建浏览器</span>
									<span class="browser-card__add-hint">数据隔离 · 账号多开</span>
								</button>
							</div>
						</template>
					</div>
				</div>

				<!-- 签到助手 -->
				<div
					v-show="state.activeTab === 'signin'"
					class="panel-in"
				>
					<SigninPanel />
				</div>

				<!-- 脚本面板：定时脚本 / 用户脚本 两类，用分段按钮切换 -->
				<div
					v-show="state.activeTab === 'scripts'"
					class="panel-in"
				>
					<ScriptsPage />
				</div>

				<!-- 软件设置面板 -->
				<div
					v-show="state.activeTab === 'setting'"
					class="panel-in"
				>
					<SettingPanel simple />
				</div>
			</div>
		</div>
	</CommonEditActionDropdown>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import Icon from '../../components/Icon.vue';
import Tags from '../../components/Tags.vue';
import BrowserOperators from '../../components/browsers/BrowserOperators.vue';
import CommonEditActionDropdown from '../../components/CommonEditActionDropdown.vue';
import { store } from '../../store';
import { root } from '../../fs/folder';
import { Browser } from '../../fs/browser';
import { BrowserOptions } from '../../fs/interface';
import { newBrowserOrInit } from '../../utils/browser';
import EmptyBrowserCard from '../../components/EmptyBrowserCard.vue';
import SettingPanel from '../../components/SettingPanel.vue';
import { lang } from '../../store/index';
import UsageAlertCollapse from '../../components/UsageAlertCollapse.vue';
import ScriptsPage from '../../components/ScriptsPage.vue';
import SigninPanel from '../../components/signin/SigninPanel.vue';
import EnvironmentAlert from '../../components/EnvironmentAlert.vue';

const state = reactive({
	activeTab: 'browsers'
});

/**
 * 页签定义
 *
 * 浏览器项的计数做成 badge 后缀，而不是把「浏览器 - 3」写进文字里：
 * 数字经常变，混在文字里会让按钮宽度跳动，页签位置随之左右移动。
 */
const tabs = computed(() => [
	{ key: 'browsers', label: '浏览器', icon: 'web', badge: allBrowsers.value.length || '' },
	{ key: 'signin', label: '签到', icon: 'fact_check', badge: '' },
	{ key: 'scripts', label: '脚本', icon: 'code', badge: '' },
	{ key: 'setting', label: '软件设置', icon: 'settings', badge: '' }
]);

/** 滚动容器（.simple-page 自己滚，不是里面那个 div） */
const scroller = ref<HTMLElement>();

/**
 * 切换页签后回到顶部
 *
 * 三个面板共用一个滚动位置：从滚到底的浏览器列表切到「脚本」，
 * 页面会停在半截，顶部的「定时脚本 / 用户脚本」分段按钮直接被顶出视野——
 * 看起来就像没有这个切换入口。
 */
watch(
	() => state.activeTab,
	() => {
		scroller.value?.scrollTo({ top: 0 });
	}
);

/** 获取所有浏览器（递归） */
const allBrowsers = computed(() => {
	return root().findAll((e) => e.type === 'browser') as BrowserOptions[];
});

/** 获取浏览器实例 */
function getBrowserInstance(uid: string): Browser | undefined {
	return Browser.from(uid);
}

/** 选中浏览器，显示操作面板 */
function selectBrowser(browser: BrowserOptions) {
	store.render.browser.currentBrowserUid = browser.uid;
}

/** 新增浏览器 */
function handleAddBrowser() {
	newBrowserOrInit();
}

/** 重命名临时值 */
const renameValue = ref('');

/** 处理重命名完成 */
function handleRenameFinish(browser: BrowserOptions) {
	const instance = Browser.from(browser.uid);
	if (instance) {
		instance.rename(renameValue.value || browser.name);
	}
}

/** 监听重命名状态，初始化值并自动聚焦输入框 */
watch(
	() => allBrowsers.value.find((b) => getBrowserInstance(b.uid)?.renaming),
	(renamingBrowser) => {
		if (renamingBrowser) {
			renameValue.value = renamingBrowser.name;
			nextTick(() => {
				const input = document.querySelector('.browser-card .arco-input') as HTMLInputElement;
				if (input) {
					input.focus();
					input.select();
				}
			});
		}
	}
);

onMounted(() => {
	// 确保专业模式的面板已关闭
	store.render.browser.currentBrowserUid = '';
});
</script>

<style lang="less" scoped>
/**
 * 简洁模式
 *
 * 结构：滚动容器 = .simple-page 自己（sticky 页签要靠它作为滚动上下文），
 * 内容居中在 .simple-body 里。不再用 calc(100vh - var(--title-height))：
 * 父级 #app 已经是 flex 列，flex:1 + min-height:0 就能正确分配剩余高度，
 * 而且改标题栏高度时不用再回来改这里。
 */

.simple-page {
	display: flex;
	flex-direction: column;
	/**
	 * 顶部一层极淡的品牌色环境光。
	 * 纯色底（#F7F8FA）在 1120×720 的窗口里会显得很平，
	 * 加一层 4% 的径向渐变就有了「空气感」——说不出哪里不一样，但去掉会觉得闷。
	 */
	background:
		radial-gradient(ellipse 90% 32% at 50% 0%, var(--surface-glow), transparent 70%),
		var(--surface-page);
}

/* ============================================================== 页签 */

.simple-tabbar {
	position: sticky;
	top: 0;
	z-index: 20;
	display: flex;
	justify-content: center;
	padding: 18px 24px 14px;
	/**
	 * 粘顶页签用「玻璃」而不是纯色底：
	 * 滚动时卡片会从下方经过并被模糊掉，既有层次又不会在页签处形成一条生硬的白带。
	 * 底色仍要够实（80%）——粘顶元素如果太透，下面的内容会透上来干扰阅读。
	 */
	background: color-mix(in srgb, var(--surface-page) 80%, transparent);
	backdrop-filter: blur(14px) saturate(160%);
	-webkit-backdrop-filter: blur(14px) saturate(160%);
	border-bottom: 1px solid transparent;
	/**
	 * 从上方淡入
	 *
	 * 这里**只能动 opacity**：页签是 position: sticky，
	 * 任何带 transform 的 animation 在播放期间都会让它退出 sticky 行为，
	 * 表现为「页面刚出来时页签跟着滚了一下」。
	 */
	animation: tabbar-in var(--dur-3) var(--ease-dec) backwards;
}

@keyframes tabbar-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.tab-group {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 3px;
	/* 外容器与内选中项都走胶囊，避免选中项的四角从容器弧线里探出来 */
	border-radius: var(--r-pill);
	background: var(--surface-sunken);
}

.tab-pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 28px;
	padding: 0 14px;
	border: none;
	border-radius: var(--r-pill);
	background: transparent;
	color: var(--text-tertiary);
	font-family: inherit;
	font-size: var(--fs-12);
	font-weight: var(--fw-medium);
	cursor: pointer;
	white-space: nowrap;
	transition: background-color var(--dur-2) var(--ease-std), color var(--dur-2) var(--ease-std),
		box-shadow var(--dur-2) var(--ease-std);

	&:hover {
		color: var(--text-primary);
	}

	&.is-active {
		background: var(--surface-panel);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}
}

.tab-pill__icon {
	font-size: 16px;
	line-height: 1;
}

/** 计数徽标：等宽数字，数量变化时按钮宽度不变 */
.tab-pill__badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 17px;
	height: 17px;
	padding: 0 5px;
	border-radius: var(--r-pill);
	background: var(--surface-active);
	color: var(--text-tertiary);
	font-size: 10px;
	font-variant-numeric: tabular-nums;
}

.tab-pill.is-active .tab-pill__badge {
	background: var(--accent-subtle);
	color: var(--accent);
}

/* ============================================================== 内容 */

.simple-body {
	width: 100%;
	max-width: 880px;
	margin: 0 auto;
	padding: 4px 24px 48px;
}

.cards-area {
	padding: 0;
}

.cards-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
}

@media (max-width: 720px) {
	.cards-grid {
		grid-template-columns: 1fr;
	}
}

.empty-browser {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 12px 0;
	background: var(--surface-panel);
	border: 1px solid var(--border-subtle);
	border-radius: var(--r-md);
}

/* ============================================================ 卡片 */

/**
 * 卡片：白底 + 1px 微边框，hover 只加深边框 + 出微影。
 * 不做 translateY 上浮：列表里多张卡片同时 hover 时整片区域会抖。
 */
.browser-card {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-height: 82px;
	padding: 14px 16px;
	/**
	 * 内容垂直居中：卡片高度固定 82px，只有标题时若顶部对齐，
	 * 下方会空出一大块，看起来像渲染漏了内容。居中后是一张「标签卡」，
	 * 有标签/备注时也会自然地从中间向上向下铺开。
	 */
	justify-content: center;
	background: var(--surface-panel);
	border: 1px solid var(--border-subtle);
	border-radius: var(--r-md);
	cursor: pointer;
	text-align: left;
	font-family: inherit;
	transition: border-color var(--dur-2) var(--ease-std), box-shadow var(--dur-2) var(--ease-std),
		transform var(--dur-2) var(--ease-dec);

	/**
	 * 入场错峰
	 *
	 * 用 backwards 而不是 both：动画结束后必须把 transform 的控制权交回 CSS，
	 * 否则 hover 的 translateY(-1px) 会被动画的最终帧（translateY(0)）压住，
	 * 卡片就再也浮不起来了。
	 * 延迟上限 8 项（CSS 里 min() 兜住），长列表尾部不会等到两秒后才出现。
	 */
	animation: card-in var(--dur-3) var(--ease-dec) backwards;
	animation-delay: calc(min(var(--i, 0), 8) * 32ms);

	&:hover {
		border-color: var(--border-default);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	&:active {
		background: var(--surface-page);
		transform: translateY(0);
	}
}

@keyframes card-in {
	from {
		opacity: 0;
		transform: translateY(4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.browser-card__head {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.browser-card__title {
	display: flex;
	align-items: center;
	gap: 7px;
	flex: 1 1 auto;
	min-width: 0;
	font-size: var(--fs-13);
	color: var(--text-primary);

	.material-icons {
		font-size: 16px;
		color: var(--text-tertiary);
		flex: 0 0 auto;
	}
}

.browser-card__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: var(--fw-medium);
}

/** 操作按钮平时不抢视线，hover 卡片才浮现 */
.browser-card__ops {
	flex: 0 0 auto;
	opacity: 0;
	transition: opacity var(--dur-2) var(--ease-std);
}

.browser-card:hover .browser-card__ops {
	opacity: 1;
}

.browser-card__tags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.browser-card__notes {
	font-size: var(--fs-12);
	line-height: 1.5;
	color: var(--text-tertiary);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

/* ------------------------------------------------------------ 新建卡片 */

.browser-card--add {
	align-items: center;
	justify-content: center;
	gap: 2px;
	padding: 10px;
	border-style: dashed;
	background: transparent;
	color: var(--text-tertiary);

	&:hover {
		border-color: var(--accent-border);
		background: var(--accent-subtle);
		box-shadow: none;

		.browser-card__add-icon {
			color: var(--accent);
			transform: scale(1.06);
		}

		.browser-card__add-text {
			color: var(--accent);
		}
	}
}

/**
 * 图标字体的 line-height 必须显式压到 1。
 * material-icons 的每个字形都带一段行高，继承 1.5 时 20px 的图标会占掉 30px，
 * 新建卡片因此比普通卡片高出一大截，网格对不齐。
 */
.browser-card__add-icon {
	font-size: 20px;
	line-height: 1;
	color: var(--text-disabled);
	transition: color var(--dur-2) var(--ease-std), transform var(--dur-2) var(--ease-dec);
}

.browser-card__add-text {
	font-size: var(--fs-12);
	font-weight: var(--fw-medium);
	transition: color var(--dur-2) var(--ease-std);
}

.browser-card__add-hint {
	font-size: var(--fs-11);
	color: var(--text-disabled);
}
</style>
