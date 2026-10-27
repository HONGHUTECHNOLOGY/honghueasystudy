<template>
	<CommonEditActionDropdown
		trigger="contextMenu"
		align-point
		position="bl"
		:style="{ display: 'block' }"
	>
		<div class="h-100 w-100 p-0 m-0 d-flex flex-wrap overflow-auto">
			<div
				:style="{ width: state.sideBarWidth + 'px' }"
				class="h-100"
			>
				<!-- 侧边栏图标 -->
				<div class="col-auto sider h-100">
					<div
						v-if="routes.find((r) => r.name === 'index')"
						:style="{
							width: state.sideBarWidth + 'px',
							flex: `0 0 ${state.sideBarWidth}px`
						}"
						class="sider-items"
					>
						<template
							v-for="(item, index) in (routes.find((r) => r.name === 'index')?.children as CustomRouteType[])"
							:key="index"
						>
							<div
								class="sider-item"
								:class="{ active: item.name === currentRoute.name }"
								@click="clickMenu(item)"
							>
								<component
									:is="store.render.setting.showSideBarText ? 'div' : Tooltip"
									style="height: 28px"
									:content="item.meta.title"
									position="right"
								>
									<Icon
										class="icon"
										:type="item.meta.icon"
										theme="outlined"
									/>
								</component>

								<div
									v-if="store.render.setting.showSideBarText"
									class="ms-2 sider-item-title text-secondary"
								>
									{{ item.meta.title }}
								</div>
							</div>
						</template>
					</div>

					<div class="text-secondary version mb-1 ms-2" @click="handleCheckUpdate">
						{{ checking ? '检查中…' : version }}
					</div>
				</div>
			</div>
			<div
				:style="{ width: `calc(100% - ${state.sideBarWidth}px)` }"
				class="h-100 overflow-auto"
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
import { ref, reactive, computed } from 'vue';
import { RouteRecordRaw, useRouter } from 'vue-router';
import { routes, CustomRouteType, router } from '../route';
import { store } from '../store';
import { remote } from '../utils/remote';
import { checkAppUpdate } from '../utils/ipc';
import Icon from '../components/Icon.vue';
import { Tooltip } from '@arco-design/web-vue';
import CommonEditActionDropdown from '../components/CommonEditActionDropdown.vue';

// 当前路由
const currentRoute = useRouter().currentRoute;

const state = reactive({
	sideBarWidth: computed(() => (store.render.setting.showSideBarText ? 142 : 56))
});

const version = ref('');

/** 获取版本号 */
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
	router.push(route.path);
	remote.win.call('setTitle', `鸿鹄易学 - ${route.meta.title}`);
}
</script>

<style lang="less">
.sider {
	-webkit-app-region: no-drag;
	user-select: none;
	padding: 4px 16px 4px 0px;
	text-align: center;
	display: flex;
	justify-content: left;
	border-right: 1px solid var(--micro-border-light);
	background: transparent;
	transition: border-color 0.3s var(--ease-precise);

	.sider-items {
		padding-top: 12px;

		.sider-item {
			padding: 8px 8px 8px 12px;
			display: flex;
			cursor: pointer;
			align-items: center;
			border-radius: var(--border-radius-small);
			position: relative;
			transition: all 0.25s var(--ease-precise);
			border-left: none;

			&::before {
				content: '';
				position: absolute;
				left: 0;
				top: 50%;
				transform: translateY(-50%) scaleY(0);
				width: 3px;
				height: 60%;
				border-radius: 0 3px 3px 0;
				background: linear-gradient(180deg, var(--glow-indigo), var(--glow-blue));
				transition: transform 0.3s var(--ease-precise);
			}

			&:hover {
				background-color: rgba(99, 102, 241, 0.06);
				.icon {
					transform: scale(1.08);
					color: var(--glow-indigo);
				}
			}
		}

		.sider-item.active {
			background-color: rgba(99, 102, 241, 0.08);
			box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.12);

			&::before {
				transform: translateY(-50%) scaleY(1);
			}

			.icon {
				color: var(--glow-indigo);
			}
		}

		.sider-item-title {
			font-size: 13px;
			transition: color 0.2s var(--ease-snappy);
		}

		.sider-item + .sider-item {
			margin-top: 6px;
		}

		.icon {
			width: 28px;
			height: 28px;
			font-size: 22px;
			cursor: pointer;
			transition: all 0.25s var(--ease-precise);
			color: #86909c;
		}
	}

	.version {
		font-size: 11px;
		position: absolute;
		bottom: 0px;
		opacity: 0.5;
		cursor: pointer;
		user-select: none;
		transition: opacity 0.2s var(--ease-precise);

		&:hover {
			opacity: 1;
		}
	}
}

body[arco-theme='dark'] {
	.sider {
		border-right-color: var(--micro-border-dark);

		.sider-items {
			.sider-item {
				&:hover {
					background-color: rgba(99, 102, 241, 0.1);
				}
			}

			.sider-item.active {
				background-color: rgba(99, 102, 241, 0.12);
			}

			.icon {
				color: #8a8f98;
			}
		}
	}
}

.app-container {
	flex: 0 0 auto;
}
</style>
