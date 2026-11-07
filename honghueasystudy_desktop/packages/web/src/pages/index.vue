<template>
	<CommonEditActionDropdown
		trigger="contextMenu"
		align-point
		position="bl"
		:style="{ display: 'block' }"
	>
		<div class="app-main">
			<!-- 侧栏：与内容同底，靠右边框分隔；折叠只改宽度 -->
			<aside
				class="app-sidebar"
				:class="{ 'is-collapsed': !showText }"
			>
				<nav class="sidebar-nav">
					<!--
						共享指示器：一根蓝条在所有导航项之间滑动。
						替代「每项各自一个 ::before」——后者切换时是"消失 + 出现"两个动作，
						而滑动能让眼睛跟着它走，这是最便宜的「设计感」。
					-->
					<div
						v-if="indicatorY !== null"
						class="sidebar-indicator"
						:style="{ transform: `translateY(${indicatorY}px)` }"
					/>

					<template
						v-for="item in menuItems"
						:key="item.name"
					>
						<div
							class="sidebar-item"
							:class="{ 'is-active': item.name === currentRoute.name }"
							:title="item.meta.title"
							@click="clickMenu(item)"
						>
							<Icon
								class="sidebar-item__icon"
								:type="item.meta.icon"
								theme="outlined"
							/>
							<!--
								文字始终渲染，显隐交给 CSS 控制。
								原来用 v-if 切换 DOM，窗口变窄时 JS 就无法只靠样式收起侧栏，
								只能回头去写持久化偏好（拖一次窗口就改掉用户设置）。
							-->
							<span class="sidebar-item__label">
								{{ item.meta.title }}
							</span>
						</div>
					</template>
				</nav>

				<div class="sidebar-footer">
					<button
						class="sidebar-version"
						:title="checking ? '正在检查更新…' : `当前版本 ${version} · 点击检查更新`"
						@click="handleCheckUpdate"
					>
						<Icon
							:type="checking ? 'sync' : 'refresh'"
							:class="{ spin: checking }"
							:size="13"
						/>
						<span class="sidebar-version__text">{{ checking ? '检查中' : version }}</span>
					</button>
				</div>
			</aside>

			<div
				ref="pageRef"
				class="app-page"
			>
				<router-view v-slot="{ Component }">
					<keep-alive>
						<component :is="Component" />
					</keep-alive>
				</router-view>
			</div>
		</div>
	</CommonEditActionDropdown>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouteRecordRaw, useRouter } from 'vue-router';
import { routes, CustomRouteType, router } from '../route';
import { store } from '../store';
import { remote } from '../utils/remote';
import { checkAppUpdate } from '../utils/ipc';
import Icon from '../components/Icon.vue';
import CommonEditActionDropdown from '../components/CommonEditActionDropdown.vue';

const currentRoute = useRouter().currentRoute;

/** 菜单项来自路由表，保证「加页面只改一处」 */
const menuItems = computed(
	() => (routes.find((r) => r.name === 'index')?.children || []) as (RouteRecordRaw & { meta: any })[]
);

/**
 * 是否显示导航文字
 *
 * 收起时不写回 store：用户手动折叠的偏好应当保留，但窗口变窄导致的临时收起
 * 不该覆盖它（原来 onResize 直接写 store.render.setting.showSideBarText，
 * 每拖一次窗口就触发一次加密写盘，还会把用户的选择改掉）。
 */
const showText = computed(() => store.render.setting.showSideBarText);

/** 滚动容器引用：切页时复位到顶部 */
const pageRef = ref<HTMLElement>();

/**
 * 选中指示器的纵向位置
 *
 * nav 的 padding-top 10 + 每项 (34 高 + 2 间隙) + (34 - 16) / 2 的居中偏移。
 * 用固定几何算而不是读 DOM：这几项尺寸都写死在同一份样式里，
 * 读 DOM 反而要在 nextTick 里等布局，第一次进入时会看到指示器从 0 滑过来。
 */
const indicatorY = computed(() => {
	const items = menuItems.value;
	const idx = items.findIndex((i) => i.name === currentRoute.value.name);
	if (idx < 0) return null;
	return 10 + idx * 36 + 9;
});

const version = ref('');
remote.app.call('getVersion').then((v) => {
	version.value = v;
});

/** 点击版本号手动检查更新：启动时只在静默检测，网络抖动用户无从察觉 */
const checking = ref(false);
async function handleCheckUpdate() {
	if (checking.value) return;
	checking.value = true;
	try {
		await checkAppUpdate();
	} finally {
		checking.value = false;
	}
}

function clickMenu(route: RouteRecordRaw & { meta: { title: string } }) {
	if (route.name === currentRoute.value.name) return;

	router.push(route.path);
	remote.win.call('setTitle', `鸿鹄易学 - ${route.meta.title}`);
	/**
	 * 侧栏切换后回到顶部。
	 *
	 * .app-page 是所有子页面共用的滚动容器，不随路由重建；
	 * 不显式复位的话，从滚到一半的「脚本列表」切到「软件设置」，
	 * 新页面会直接从中途开始显示，看起来像是内容丢了开头。
	 */
	pageRef.value?.scrollTo({ top: 0 });
}
</script>

<style scoped lang="less">
/**
 * 侧栏几何（宽度、折叠、右边框、底色）在 styles/shell.less。
 * 这里只做内部排版：导航项、选中态、底部版本号。
 */

.sidebar-nav {
	position: relative;
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 10px 8px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

/**
 * 页面根元素入场
 *
 * 由 styles/motion.less 的 `.app-page > *` 统一提供动画，
 * 这里不再放 scoped 副本——子元素是其他组件的根节点，
 * 用全局规则比依赖 scopeId 边界更稳。
 */

/**
 * 共享指示条
 *
 * 只动 transform，走合成器；切换页面时它会从旧位置平滑滑到新位置。
 * 高度 16px 与 item 的 34px 形成「不满高」的比例，这是侧栏指示器显得克制的关键
 * ——拉满 34px 会变成一条粗色块，把导航切碎。
 */
.sidebar-indicator {
	position: absolute;
	left: 0;
	top: 0;
	width: 2px;
	height: 16px;
	border-radius: 0 2px 2px 0;
	background: var(--accent);
	transition: transform var(--dur-4) var(--ease-dec);
	pointer-events: none;
	z-index: 1;
}

.sidebar-item {
	position: relative;
	display: flex;
	align-items: center;
	gap: 10px;
	height: 34px;
	padding: 0 10px;
	border-radius: var(--r-sm);
	cursor: pointer;
	white-space: nowrap;
	color: var(--text-secondary);
	transition: background-color var(--dur-2) var(--ease-std), color var(--dur-2) var(--ease-std);
	/**
	 * 导航项入场：启动时自上而下依次浮现
	 *
	 * 侧栏常驻（不随路由重建），所以这段只在应用启动时播一次——
	 * 正是要它播在「窗口刚出来」那一下，让侧栏看起来是「展开」而不是「出现」。
	 * 位移 4px 且方向朝上：和内容区的 page-in 同向，整屏读起来是一次整体上浮。
	 */
	animation: nav-in var(--dur-3) var(--ease-dec) backwards;

	&:nth-child(1) {
		animation-delay: 40ms;
	}
	&:nth-child(2) {
		animation-delay: 72ms;
	}
	&:nth-child(3) {
		animation-delay: 104ms;
	}
	&:nth-child(4) {
		animation-delay: 136ms;
	}
	&:nth-child(5) {
		animation-delay: 168ms;
	}
	&:nth-child(n + 6) {
		animation-delay: 200ms;
	}

	&:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	/**
	 * 选中态：白底浮起 + 左侧 2px 品牌条
	 *
	 * 不用原来的「半透明靛紫填充 + 渐变竖条」：填充色在浅灰底上会显得脏，
	 * 渐变竖条是两个颜色硬凑。白底 + 微影才是「浮在侧栏之上」的正确表达，
	 * 也把蓝色的用量压到了 2px 一条线。
	 */
	&.is-active {
		background: var(--surface-panel);
		color: var(--text-primary);
		font-weight: var(--fw-medium);
		box-shadow: var(--shadow-sm);
	}
}

.sidebar-item__icon {
	flex: 0 0 auto;
	font-size: 19px;
	line-height: 1;
	transition: color var(--dur-2) var(--ease-std);
}

.sidebar-item.is-active .sidebar-item__icon {
	color: var(--accent);
}

.sidebar-item__label {
	font-size: var(--fs-13);
	overflow: hidden;
	text-overflow: ellipsis;
}

/**
 * 折叠态
 *
 * 文字用 display:none 隐藏而不是 v-if 移除，这样「用户手动折叠」与
 * 「窗口太窄自动折叠」可以共用同一套样式，后者纯靠媒体查询，不碰 store。
 */
.app-sidebar.is-collapsed {
	.sidebar-item__label,
	.sidebar-version__text {
		display: none;
	}

	.sidebar-nav {
		padding: 10px 6px;
		align-items: center;
	}

	.sidebar-item {
		width: 36px;
		justify-content: center;
		padding: 0;
		gap: 0;
	}

	.sidebar-version {
		justify-content: center;
		padding: 0;
	}
}

.sidebar-footer {
	flex: 0 0 auto;
	padding: 8px;
	border-top: 1px solid var(--border-subtle);
}

.sidebar-version {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	height: 26px;
	padding: 0 10px;
	border: none;
	background: transparent;
	border-radius: var(--r-pill);
	color: var(--text-tertiary);
	font-size: var(--fs-11);
	font-family: inherit;
	cursor: pointer;
	white-space: nowrap;
	overflow: hidden;
	transition: background-color var(--dur-2) var(--ease-std), color var(--dur-2) var(--ease-std);

	&:hover {
		background: var(--surface-hover);
		color: var(--text-secondary);
	}
}

/**
 * 窄窗口自动收起
 *
 * 媒体查询而不是 JS：侧栏宽度与文字显隐本来就是纯样式问题，
 * 用 CSS 处理意味着拖窗口时不需要经过 Vue 的响应式与渲染，
 * 也不会因为一次 resize 触发 store 的 deep watch 而写盘。
 */
@media (max-width: 860px) {
	.app-sidebar {
		width: var(--sidebar-w-collapsed);

		.sidebar-item__label,
		.sidebar-version__text {
			display: none;
		}

		.sidebar-nav {
			padding: 10px 6px;
			align-items: center;
		}

		.sidebar-item {
			width: 36px;
			justify-content: center;
			padding: 0;
			gap: 0;
		}

		.sidebar-version {
			justify-content: center;
			padding: 0;
		}
	}
}

/** 导航项入场：与内容区的 page-in 同向（向上 4px），整屏读起来是一次上浮 */
@keyframes nav-in {
	from {
		opacity: 0;
		transform: translateY(4px);
	}
	to {
		opacity: 1;
		transform: none;
	}
}
</style>
