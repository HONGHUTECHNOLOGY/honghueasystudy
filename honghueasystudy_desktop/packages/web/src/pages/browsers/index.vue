<template>
	<div
		id="browsers"
		class="browsers-page"
	>
		<!--
			工具栏：粘顶。
			原来这里是 a-card + 内部 flex + 列表独立滚动；
			现在改成「整个页面一起滚 + 工具栏 sticky」，
			好处是滚到深处时工具栏仍在，且不再需要 absolute 定位的那套容器。
		-->
		<div class="browsers-toolbar">
			<!-- 路径栏 / 统计栏 -->
			<FileBreadcrumb
				v-if="currentSearchedEntities === undefined && currentFolder.type !== 'root'"
				:key="currentFolder.uid"
			></FileBreadcrumb>
			<div
				v-else-if="currentSearchedEntities === undefined && currentFolder.type === 'root'"
				class="stats-bar"
			>
				<span class="stat"
					><IconDesktop /> <b>{{ stats.browsers }}</b> 浏览器</span
				>
				<span class="stat"
					><IconCode /> <b>{{ stats.scripts }}</b> 脚本</span
				>
				<span class="stat"
					><IconFolder /> <b>{{ stats.folders }}</b> 文件夹</span
				>
				<span class="stat"
					><IconTag /> <b>{{ stats.tags }}</b> 标签</span
				>
			</div>

			<div class="flex-grow-1"></div>

			<!-- 文件筛选 -->
			<FileFilters></FileFilters>

			<!-- 搜索时禁止文件操作 -->
			<a-button
				v-if="currentSearchedEntities"
				size="mini"
				@click="resetSearch"
			>
				<Icon type="restart_alt">重置</Icon>
			</a-button>
		</div>

		<!-- 文件操作 -->
		<div class="browsers-operators">
			<FileMultipleOperators></FileMultipleOperators>
		</div>

		<div class="browsers-body">
			<EnvironmentAlert class="mb-2" />

			<a-empty
				v-if="currentSearchedEntities !== undefined && currentSearchedEntities.length === 0"
				class="py-5"
				description="没有匹配的浏览器或文件夹"
			/>

			<Transition
				name="entities-slide"
				appear
			>
				<div
					:key="currentFolder.uid"
					class="entities"
				>
					<BrowserList
						:entities="currentSearchedEntities ? currentSearchedEntities : currentEntities || []"
					></BrowserList>

					<div class="text-end mt-2">
						<RightClickOpenMenuTip />
					</div>
				</div>
			</Transition>
		</div>
	</div>
</template>

<script setup lang="ts">
import Icon from '../../components/Icon.vue';
import { resetSearch } from '../../utils/entity';
import FileFilters from '../../components/browsers/FileFilters.vue';
import FileBreadcrumb from '../../components/browsers/FileBreadcrumb.vue';
import { currentEntities, currentSearchedEntities, currentFolder } from '../../fs';
import { root } from '../../fs/folder';
import FileMultipleOperators from '../../components/browsers/FileMultipleOperators.vue';
import BrowserList from '../../components/BrowserList.vue';
import { computed } from 'vue';
import { IconDesktop, IconTag, IconCode, IconFolder } from '@arco-design/web-vue/es/icon';
import { store } from '../../store';
import RightClickOpenMenuTip from '../../components/RightClickOpenMenuTip.vue';
import EnvironmentAlert from '../../components/EnvironmentAlert.vue';

const stats = computed(() => {
	const r = root();
	const allBrowsers = r.findAll((e) => e.type === 'browser');
	const allFolders = r.findAll((e) => e.type === 'folder');

	const tagSet = new Set<string>();
	for (const b of allBrowsers) {
		if (b.type === 'browser') {
			b.tags.forEach((t) => tagSet.add(t.name));
		}
	}
	return {
		browsers: allBrowsers.length,
		folders: allFolders.length,
		tags: tagSet.size,
		scripts: store.render.scripts.length
	};
});
</script>

<style scoped lang="less">
/**
 * 滚动由父级 .app-page 负责，这里只做内容排布。
 * 不再用 h-100 + flex column + absolute 容器：那套是为了让列表在卡片内独立滚动，
 * 代价是工具栏与列表的滚动上下文分离，滚到深处工具栏就消失了。
 */

.browsers-page {
	display: flex;
	flex-direction: column;
	min-height: 100%;
}

/* ============================================================ 工具栏 */

.browsers-toolbar {
	position: sticky;
	top: 0;
	z-index: 15;
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 40px;
	padding: 10px 20px;
	/**
	 * 粘顶工具栏用玻璃而不是纯白：
	 * 列表向上滚时会在工具栏下方被模糊掉，形成「内容在玻璃后面走」的层次，
	 * 比一条实心白带自然得多。80% 不透明保证文字仍有足够对比。
	 */
	background: color-mix(in srgb, var(--surface-panel) 80%, transparent);
	backdrop-filter: blur(14px) saturate(160%);
	-webkit-backdrop-filter: blur(14px) saturate(160%);
	border-bottom: 1px solid var(--border-subtle);
	overflow-x: auto;
	overflow-y: hidden;
	white-space: nowrap;
}

.browsers-operators {
	display: flex;
	align-items: center;
	padding: 8px 20px 0;
	background: var(--surface-panel);
}

.browsers-body {
	flex: 1 1 auto;
	padding: 12px 20px 28px;
	/* 与简洁模式一致：顶部一层极淡品牌色环境光，避免大面积纯色底显得平 */
	background: radial-gradient(ellipse 90% 30% at 50% 0%, var(--surface-glow), transparent 70%), var(--surface-page);
}

/* ============================================================ 统计 */

.stats-bar {
	display: flex;
	align-items: center;
	gap: 16px;
	font-size: var(--fs-12);
	color: var(--text-tertiary);
	user-select: none;

	.stat {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	/** 数字用等宽 + 主文字色：数量才是信息，单位是注脚 */
	b {
		font-weight: var(--fw-medium);
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.arco-icon {
		font-size: 13px;
		opacity: 0.7;
	}
}

/* ============================================================ 列表 */

.entities {
	display: flex;
	flex-direction: column;
	gap: 1px;
}

/* 列表切换过渡：只动 opacity 与 transform */
.entities-slide-enter-active {
	transition: opacity var(--dur-3) var(--ease-dec) var(--dur-1), transform var(--dur-3) var(--ease-dec) var(--dur-1);
}

.entities-slide-leave-active {
	transition: opacity var(--dur-1) var(--ease-acc), transform var(--dur-1) var(--ease-acc);
}

.entities-slide-enter-from {
	opacity: 0;
	transform: translateY(6px);
}

.entities-slide-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}
</style>
