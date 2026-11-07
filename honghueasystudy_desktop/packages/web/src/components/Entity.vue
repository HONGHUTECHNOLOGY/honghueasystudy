<template>
	<div
		v-if="instance"
		class="entity align-items-center d-flex"
		:class="{
			active: store.render.browser.currentBrowserUid === instance.uid,
			'is-context': contextUid === instance.uid,
			'is-dragging': isDragging,
			'drop-before': isDropTarget && dropPosition === 'before',
			'drop-after': isDropTarget && dropPosition === 'after',
			'drop-inside': isDropTarget && dropPosition === 'inside'
		}"
		:data-uid="instance.uid"
		@click="instance?.select()"
	>
		<div style="cursor: pointer; flex: auto">
			<div
				style="cursor: pointer; flex: auto"
				class="text-secondary entity-name align-items-center d-flex"
			>
				<div
					v-if="slots.prefix"
					style="cursor: pointer; flex: 0 0 auto"
				>
					<slot name="prefix"></slot>
				</div>

				<!-- 图标 -->
				<span
					v-if="slots.icon"
					class="d-inline-flex align-items-center"
					style="cursor: pointer; padding: 0px 4px; font-size: 16px"
					@click="instance?.select()"
				>
					<slot name="icon"></slot>
				</span>

				<!-- 名字 -->

				<a-tooltip
					:content="
						dragCount > 0 ? `正在拖入${dragCount}个文件` : instance.type === 'folder' ? '返回上一级' : '右键打开菜单'
					"
				>
					<span class="ms-2">
						<a-input
							v-show="instance.renaming"
							ref="renameInput"
							v-model="renameValue"
							size="mini"
							@click.stop
							@blur="instance?.rename(renameValue)"
						></a-input>
						<span v-show="!instance.renaming">
							{{ instance.name }}
						</span>
					</span>

					<div style="flex: 1 1 auto">
						<slot name="suffix"></slot>
					</div>
				</a-tooltip>
			</div>

			<div
				v-if="slots.extra"
				class="d-flex align-items-center"
				style="margin-left: 32px"
			>
				<slot name="extra"></slot>
			</div>
		</div>

		<!-- 操作按钮 -->
		<div
			v-if="slots.actions"
			style="flex: 0 0 auto"
			class="text-secondary text-nowrap d-flex justify-content-end ps-1 pe-2"
			@click.stop
		>
			<a-space
				:size="0"
				class="actions justify-content-end"
			>
				<template #split>
					<a-divider
						class="ms-1 me-1"
						direction="vertical"
					/>
				</template>

				<slot name="actions"></slot>
			</a-space>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, watch, useSlots } from 'vue';
import { store } from '../store';
import { FolderOptions, BrowserOptions, FolderType } from '../fs/interface';
import { Browser } from '../fs/browser';
import { Folder } from '../fs/folder';
import type { DropPosition } from '../composables/useEntityDrag';
import { Entity } from '../fs/entity';
import { contextUid } from '../fs';

const slots = useSlots();

const props = withDefaults(
	defineProps<{
		entity: BrowserOptions | FolderOptions<FolderType, Browser | Folder>;
		isDragging?: boolean;
		isDropTarget?: boolean;
		dropPosition?: DropPosition;
		dragCount?: number;
	}>(),
	{
		isDragging: false,
		isDropTarget: false,
		dropPosition: null,
		dragCount: 0
	}
);

const renameInput = ref<any>();
const renameValue = ref(props.entity.name);

const instance: Entity =
	props.entity.uid === '__parent_back__'
		? ({
				type: 'folder',
				uid: '__parent_back__',
				name: '...',
				select: () => {},
				rename: () => {},
				remove: () => {},
				location: () => {}
		  } as any)
		: props.entity.type === 'browser'
		? Browser.from(props.entity.uid)
		: Folder.from(props.entity.uid);

watch(
	() => props.entity.renaming,
	() => {
		if (props.entity.renaming) {
			nextTick(active);
		}
	}
);

onMounted(() => {
	nextTick(active);
});

function active() {
	const input: HTMLInputElement = renameInput.value.$el.querySelector('input');
	input.focus();
	input.select();
}
</script>
<style scoped lang="less">
/**
 * 列表项
 *
 * 这是专业模式下出现频率最高的元素，任何一点粗糙都会被放大：
 * 所以这里不用分割线（每行一条线 + hover 变圆角，线与圆角会打架），
 * 改成「整行小圆角 + hover 底色」，靠留白和底色区分行。
 */

.entity-drop-menu {
	min-width: 180px;
}

.entity-name {
	text-overflow: ellipsis;
	white-space: nowrap;
	overflow: hidden;
	font-size: var(--fs-13);
	color: var(--text-primary) !important;
	user-select: none;
}

.entity {
	position: relative;
	border-radius: var(--r-sm);
	border-bottom: none;
	padding: 5px 8px;
	transition: background-color var(--dur-1) var(--ease-std);

	/**
	 * 入场：从左侧 4px 处淡入，按 --i 错峰。
	 *
	 * 只动 opacity + transform（走合成器）；用 translateX 而不是 translateY，
	 * 因为列表项的阅读方向是从左往右，横向滑入与「逐条列出来」的动作一致。
	 * backwards 让动画结束后把 transform 交还给 CSS，不影响拖拽与 hover。
	 */
	animation: entity-in var(--dur-3) var(--ease-dec) backwards;
	animation-delay: calc(min(var(--i, 0), 8) * 32ms);

	&:hover {
		background-color: var(--surface-hover);
	}

	&.active {
		background-color: var(--surface-selected);
	}

	// 右键选中样式
	&.is-context {
		background-color: var(--accent-subtle);
	}

	// 拖拽中的项目样式
	&.is-dragging {
		opacity: 0.4;
	}

	/**
	 * 放置位置指示线
	 *
	 * 原来用 `box-shadow: inset 0 2px 0 0`，被 common.css 里
	 * `body[arco-theme='dark'] * { box-shadow: none !important }` 一刀切掉，
	 * 结果是暗色主题下拖拽完全没有落点提示（功能还在，只是看不见）。
	 * 改用伪元素画线，与 box-shadow 彻底解耦。
	 */
	&.drop-before::before,
	&.drop-after::after {
		content: '';
		position: absolute;
		left: 6px;
		right: 6px;
		height: 2px;
		background: var(--accent);
		border-radius: 2px;
		z-index: 1;
	}

	&.drop-before::before {
		top: -1px;
	}

	&.drop-after::after {
		bottom: -1px;
	}

	// 文件夹接收拖入样式
	&.drop-inside {
		background-color: var(--accent-subtle);
		box-shadow: inset 0 0 0 1px var(--accent-border);
	}
}

@keyframes entity-in {
	from {
		opacity: 0;
		transform: translateX(-4px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}
</style>
