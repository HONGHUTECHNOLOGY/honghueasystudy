<template>
	<div class="title ps-2">
		<span
			class="logo"
			style="cursor: pointer; -webkit-app-region: no-drag"
			@click="shell.openExternal('https://easystudy.honghutech.eu.org')"
		>
			<img
				width="18"
				class="me-3"
				src="../../public/favicon.png"
			/>
		</span>
		<a-dropdown
			class="tittle-dropdown"
			trigger="hover"
			:popup-max-height="false"
		>
			<span class="title-item"> 工具 </span>
			<template #content>
				<a-doption style="width: 200px"> </a-doption>

				<a-doption @click="store.render.state.setup = true"> <Icon type="settings">初始化设置</Icon> </a-doption>
				<a-doption
					class="border-bottom"
					@click="checkBrowserCaches"
				>
					<Icon type="delete">清除浏览器缓存</Icon>
				</a-doption>

				<a-doption @click="exportData"> <Icon type="save">导出数据</Icon> </a-doption>
				<a-doption
					class="border-bottom"
					@click="importData"
				>
					<Icon type="upload">导入数据</Icon>
				</a-doption>
				<a-doption @click="relaunch"> <Icon type="sync">重启软件</Icon> </a-doption>
				<a-doption @click="openLog"> <Icon type="folder">日志目录</Icon> </a-doption>
				<a-doption @click="openDevTools"> <Icon type="code">开发者工具</Icon> </a-doption>
			</template>
		</a-dropdown>

		<span
			class="title-item mode-switch"
			@click="toggleMode"
		>
			<Icon
				:type="isSimpleMode ? 'arrow_back' : 'arrow_forward'"
				style="font-size: 14px; vertical-align: middle"
			></Icon>
			{{ isSimpleMode ? '专业模式' : '简洁模式' }}
		</span>

		<StatusBar />
	</div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { date } from '../utils';
import { remote } from '../utils/remote';
import { Message, Modal } from '@arco-design/web-vue';
import { store } from '../store/index';
import { router } from '../route';
import { electron } from '../utils/node';
import { currentBrowser, currentFolder, currentEntities, currentSearchedEntities } from '../fs/index';
import { Folder, root } from '../fs/folder';
import { FolderOptions, FolderType } from '../fs/interface';
import { Browser } from '../fs/browser';
import { checkBrowserCaches } from '../utils/browser';
import Icon from './Icon.vue';
import StatusBar from './StatusBar.vue';

const { shell } = electron;

const isSimpleMode = computed(() => router.currentRoute.value.path === '/simple');

/** 切换模式 */
function toggleMode() {
	if (isSimpleMode.value) {
		store.render.setting.mode = 'professional';
		router.push('/browsers');
	} else {
		store.render.setting.mode = 'simple';
		router.push('/simple');
	}
}

// 重启
function relaunch() {
	remote.app.call('relaunch');
	remote.app.call('quit');
}

// 打开日志目录
async function openLog() {
	const path = await remote.path.call('join', await remote.app.call('getPath', 'logs'), date(Date.now()));
	shell.openPath(path);
}

function importData() {
	remote.dialog
		.call('showOpenDialog', {
			title: '选择导入的数据文件',
			buttonLabel: '导入',
			filters: [{ extensions: ['honghu', 'hhdata'], name: '鸿鹄易学数据' }]
		})
		.then(async ({ canceled, filePaths }) => {
			if (canceled === false && filePaths.length) {
				try {
					const text = await remote.fs.call('readFileSync', filePaths[0], { encoding: 'utf8' });
					const _store: typeof store = JSON.parse(text.toString());

					// 如果 render 是加密字符串，先解密为明文再导入
					if (typeof _store.render === 'string') {
						const renderStr = _store.render as string;
						const data = JSON.parse(remote.methods.callSync('decryptRenderString' as any, renderStr) as string);
						(_store as any).render = data;
					}

					const root = _store.render.browser.root;
					// 遍历文件夹，将每个浏览器的缓存路径解析为用户数据目录下的文件夹
					const folders: FolderOptions<any, Folder<FolderType> | Browser>[] = [root];
					while (folders.length) {
						const folder = folders.shift();
						if (!folder) continue;
						if (Object.keys(folder.children || {}).length) {
							for (const key in folder.children) {
								if (Object.prototype.hasOwnProperty.call(folder.children, key)) {
									const entity = folder.children[key];
									if (!entity) continue;
									if (entity.type === 'folder') {
										folders.push(entity as any);
									} else if (entity.type === 'browser' && (entity as any).cachePath === '$CACHE_PATH') {
										(entity as any).cachePath = await remote.path.call(
											'join',
											store.paths.userDataDirsFolder,
											entity.uid
										);
									}
								}
							}
						}
					}
					// 导入 store render 数据
					store.render = _store.render;

					Modal.success({
						title: '导入成功',
						content: () =>
							h('div', [
								'数据重启软件后生效。',
								'如果您是导入其他电脑的鸿鹄易学数据，导入后重启软件即可，鸿鹄易学扩展会随软件自动加载。'
							]),
						okText: '重启软件',
						cancelText: '稍后重启',
						hideCancel: false,
						simple: false,
						onOk() {
							remote.app.call('relaunch');
							remote.app.call('exit', 0);
						}
					});
				} catch (err) {
					Message.error('数据有误! : ' + err);
				}
			}
		});
}
function exportData() {
	Modal.confirm({
		title: '导出数据',
		content: '数据中包含自动化程序的配置（例如账号密码），请小心保存防止泄露。导出后可在其他电脑中恢复数据。',
		okText: '确认',
		cancelText: '取消',
		onOk() {
			remote.dialog
				.call('showSaveDialog', {
					title: '选择导出位置',
					buttonLabel: '导出',
					defaultPath: `鸿鹄易学软件数据导出_-${date(Date.now())}`
				})
				.then(async ({ canceled, filePath }) => {
					if (canceled === false && filePath) {
						const _store: typeof store = JSON.parse(JSON.stringify(store));

						const root = _store.render.browser.root;
						// 遍历文件夹，将每个浏览器的缓存路径改成相对路径
						const folders: FolderOptions<any, Folder<FolderType> | Browser>[] = [root];
						while (folders.length) {
							const folder = folders.shift();
							if (!folder) continue;
							if (Object.keys(folder.children || {}).length) {
								for (const key in folder.children) {
									if (Object.prototype.hasOwnProperty.call(folder.children, key)) {
										const entity = folder.children[key];
										if (!entity) continue;
										if (entity.type === 'folder') {
											folders.push(entity as any);
										} else if (entity.type === 'browser') {
											(entity as any).cachePath = '$CACHE_PATH';
										}
									}
								}
							}
						}

						// 导出前加密 render 数据，防止明文泄露
						if (typeof _store.render !== 'string') {
							(_store as any).render = remote.methods.callSync(
								'encryptRenderString' as any,
								JSON.stringify(_store.render)
							) as string;
						}

						// 删除多余数据
						const filter_keys: (keyof typeof _store)[] = ['paths', 'app', 'window', 'server'];
						for (const key of filter_keys) {
							delete _store[key];
						}

						await remote.fs.call('writeFileSync', filePath + '.honghu', JSON.stringify(_store, null, 4));
						Message.success('导出成功！');
					}
				});
		}
	});
}

function openDevTools() {
	// @ts-ignore
	window.hh = {
		currentBrowser,
		currentEntities,
		currentFolder,
		currentSearchedEntities,
		root,
		store
	};

	remote.webContents.call('openDevTools');
}
</script>

<style scoped lang="less">
.title {
	-webkit-app-region: drag;
	width: 100%;
	display: flex;
	align-items: center;
	height: var(--title-height);
	cursor: default;
	border-bottom: 1px solid var(--micro-border-light);

	z-index: 999999;
	position: relative;
	background: var(--glass-bg-light);
	backdrop-filter: blur(var(--glass-blur));
	-webkit-backdrop-filter: blur(var(--glass-blur));
	transition: border-color 0.3s var(--ease-precise);

	.title-item {
		-webkit-app-region: no-drag;
		padding: 0px 10px;
		font-size: 13px;
		cursor: pointer;
		border-radius: var(--border-radius-small);
		transition: all 0.2s var(--ease-snappy);
		color: #4e5969;

		&:hover {
			background-color: rgba(99, 102, 241, 0.08);
			color: var(--glow-indigo);
		}
	}

	.mode-switch {
		color: #86909c;
		font-size: 12px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: var(--border-radius-small);
		transition: all 0.25s var(--ease-precise);

		&:hover {
			color: var(--glow-indigo);
			background-color: rgba(99, 102, 241, 0.06);
			box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
		}
	}

	> span {
		display: flex;
	}

	.logo {
		transition: transform 0.3s var(--ease-precise);
		&:hover {
			transform: scale(1.1);
		}
	}
}
:deep(.ant-dropdown-menu-item) {
	font-size: 12px;
	padding: 2px 24px 2px 12px;
}

:deep(.arco-dropdown-option-content) {
	width: 100%;
	display: block;
}

.tutorial-tooltip {
	padding: 8px 12px 0px 12px !important;
}

body.platform-darwin {
	.title {
		justify-content: center;
	}
}

body[arco-theme='dark'] {
	.title {
		background: var(--glass-bg-dark);
		border-bottom-color: var(--micro-border-dark);

		.title-item {
			color: #8a8f98;
			&:hover {
				background-color: rgba(99, 102, 241, 0.12);
				color: #a5b4fc;
			}
		}

		.mode-switch {
			color: #8a8f98;
			&:hover {
				color: #a5b4fc;
				background-color: rgba(99, 102, 241, 0.1);
			}
		}
	}
}
</style>
