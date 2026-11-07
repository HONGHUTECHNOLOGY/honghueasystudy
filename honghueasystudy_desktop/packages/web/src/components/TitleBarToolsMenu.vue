<template>
	<a-dropdown
		trigger="click"
		position="bl"
		:popup-max-height="false"
	>
		<span class="title-item">工具</span>

		<template #content>
			<!--
				13 个操作按「用途」分 4 组，而不是原来平铺一长列 + 靠 border-bottom 硬分隔。
				分组标题本身就是分隔线，既省像素又能被扫读；破坏性操作（清除缓存）
				被夹在「数据」组里，不会紧挨着「重启软件」被误点。
			-->
			<a-dgroup title="应用">
				<a-doption @click="store.render.state.setup = true">
					<Icon type="settings">初始化设置</Icon>
				</a-doption>
				<a-doption @click="handleCheckUpdate">
					<Icon :type="checkingUpdate ? 'sync' : 'refresh'">
						{{ checkingUpdate ? '正在检查更新…' : '检查更新' }}
					</Icon>
				</a-doption>
				<a-doption @click="relaunch">
					<Icon type="restart_alt">重启软件</Icon>
				</a-doption>
			</a-dgroup>

			<a-dgroup title="数据">
				<a-doption @click="importData">
					<Icon type="upload">导入数据</Icon>
				</a-doption>
				<a-doption @click="exportData">
					<Icon type="save">导出数据</Icon>
				</a-doption>
				<a-doption @click="checkBrowserCaches">
					<Icon type="delete_sweep">清除浏览器缓存</Icon>
				</a-doption>
			</a-dgroup>

			<a-dgroup title="诊断">
				<a-doption @click="openLog">
					<Icon type="folder_open">打开日志目录</Icon>
				</a-doption>
				<a-doption @click="openDevTools">
					<Icon type="terminal">开发者工具</Icon>
				</a-doption>
			</a-dgroup>

			<a-dgroup title="关于">
				<a-doption @click="openExternal(OFFICIAL_SITE)">
					<Icon type="public">官方网站</Icon>
				</a-doption>
				<a-doption @click="openExternal(GITHUB_REPO)">
					<Icon type="code">GitHub 仓库</Icon>
				</a-doption>
				<a-doption @click="openExternal(GITCODE_REPO)">
					<Icon type="hub">GitCode 镜像</Icon>
				</a-doption>
			</a-dgroup>
		</template>
	</a-dropdown>
</template>

<script setup lang="ts">
import { ref, h } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import { store } from '../store';
import { remote } from '../utils/remote';
import { electron } from '../utils/node';
import { date } from '../utils';
import { currentBrowser, currentFolder, currentEntities, currentSearchedEntities } from '../fs/index';
import { root } from '../fs/folder';
import { Folder } from '../fs/folder';
import { FolderOptions, FolderType } from '../fs/interface';
import { Browser } from '../fs/browser';
import { checkBrowserCaches } from '../utils/browser';
import { checkAppUpdate } from '../utils/ipc';
import Icon from './Icon.vue';

const { shell } = electron;

/** 官网与源码仓库：与扩展首页、关于页保持一致 */
const OFFICIAL_SITE = 'https://easystudy.honghutech.eu.org';
const GITHUB_REPO = 'https://github.com/HONGHUTECHNOLOGY/honghueasystudy';
const GITCODE_REPO = 'https://gitcode.com/honghutech/honghueasystudy';

function openExternal(url: string) {
	shell.openExternal(url);
}

function relaunch() {
	remote.app.call('relaunch');
	remote.app.call('quit');
}

/** 手动检查更新：启动时只在后台静默检测，网络抖动时用户无从察觉 */
const checkingUpdate = ref(false);
async function handleCheckUpdate() {
	if (checkingUpdate.value) return;
	checkingUpdate.value = true;
	try {
		await checkAppUpdate();
	} finally {
		checkingUpdate.value = false;
	}
}

/** 打开日志目录（按日期分子目录） */
async function openLog() {
	const path = await remote.path.call('join', await remote.app.call('getPath', 'logs'), date(Date.now()));
	shell.openPath(path);
}

/**
 * 导入数据
 *
 * 磁盘上的 render 可能是加密字符串，必须先解密再合并，否则导入后设置面板读到
 * 字符串形式的 render 会整块渲染失败。
 */
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

					if (typeof _store.render === 'string') {
						const renderStr = _store.render as string;
						const data = JSON.parse(remote.methods.callSync('decryptRenderString' as any, renderStr) as string);
						(_store as any).render = data;
					}

					const rootFolder = _store.render.browser.root;
					// 遍历文件夹，把每个浏览器的缓存路径解析为用户数据目录下的文件夹
					const folders: FolderOptions<any, Folder<FolderType> | Browser>[] = [rootFolder];
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

						const rootFolder = _store.render.browser.root;
						// 导出前把缓存路径改成相对路径，换机器后导入才能重新解析
						const folders: FolderOptions<any, Folder<FolderType> | Browser>[] = [rootFolder];
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

						// 导出前加密 render，防止明文泄露
						if (typeof _store.render !== 'string') {
							(_store as any).render = remote.methods.callSync(
								'encryptRenderString' as any,
								JSON.stringify(_store.render)
							) as string;
						}

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
	// @ts-ignore 挂到 window 上便于在控制台里直接查数据
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
/**
 * 这里刻意没有菜单项样式。
 *
 * Arco 的下拉通过 teleport 挂到 body 上，组件内的 scoped 选择器
 * （编译后是 .parent[data-v-x] .target）命中不到它——写了也是死代码，
 * 还会让人误以为改这里有效。菜单项、分组标题、图标的排版全部在
 * styles/arco-override.less 里统一定义。
 *
 * 该文件只负责结构与交互逻辑。
 */
</style>
