<template>
	<div class="setting container-md reveal-stack">
		<a-card title="脚本设置">
			<Description class="pt-2 pb-2">
				<template #label>
					<img
						src="../../public/favicon.png"
						width="32px"
					/>
					<span class="fw-bold"> 鸿鹄易学脚本配置 </span>
				</template>
				<!-- 这里tooltip不删除、兼容旧版浏览器的提示 setting_browser_hh_config_sync_tip -->
				<!-- <a-tooltip
					:content="
						lang('setting_browser_hh_config_sync_tip', '开启后，修改鸿鹄易学配置后会同步到全部由鸿鹄易学桌面端启动的浏览器中')
					"
				>
					<a-switch v-model="store.render.setting.hh.openSync">
						<template #checked> 同步到各浏览器 </template>
						<template #unchecked> 同步到各浏览器 </template>
					</a-switch>
				</a-tooltip> -->

				<a-button
					type="primary"
					@click="state.show = true"
				>
					点击配置网页鸿鹄易学脚本设置
				</a-button>

				<div v-if="state.show">
					<a-modal
						v-model:visible="state.show"
						title="鸿鹄易学配置"
						width="auto"
						:top="5"
						:align-center="false"
						modal-class="p-0 m-0"
						:mask-closable="false"
						closable
						body-style="padding: 0"
						:footer="state.configs.error === '' && state.configs.loading === false"
						ok-text="保存并同步配置到各浏览器"
						cancel-text="取消同步"
						@cancel="syncNote"
						@ok="
							() => {
								store.render.setting.hh.openSync = true;
							}
						"
					>
						<div
							id="hh-global-configs"
							class="m-2"
						>
							<HonghuConfigs
								v-model:store="store.render.setting.hh.store"
								@error="(err) => (state.configs.error = err)"
								@loading="() => (state.configs.loading = true)"
								@loaded="() => (state.configs.loading = false)"
							></HonghuConfigs>
						</div>
					</a-modal>
				</div>
			</Description>
		</a-card>

		<a-card title="浏览器设置">
			<BrowserPath></BrowserPath>

			<Description label="开发者调试">
				<a-tooltip
					content="开启后启动浏览器会额外开放本机调试端口（DevTools / 调试工具 / AI 可直接连入查看真实页面），并在浏览器操作栏提供「导出网页信息」。排查识别不到课程、元素点不到这类问题时使用。"
				>
					<a-switch
						v-model="store.render.setting.dev.enabled"
						size="small"
					/>
				</a-tooltip>
			</Description>

			<template v-if="store.render.setting.dev.enabled">
				<Description label="调试端口">
					<a-input-number
						v-model="store.render.setting.dev.port"
						:min="1024"
						:max="65535"
						:step="1"
						style="width: 150px"
					/>
					<a-button
						size="mini"
						type="text"
						class="ms-2"
						@click="copyDevAddress"
					>
						<Icon
							type="content_copy"
							class="me-1"
						/>
						复制地址
					</a-button>
				</Description>
				<Description label="调试地址">
					<span class="text-secondary">http://127.0.0.1:{{ store.render.setting.dev.port }}/json</span>
				</Description>
				<Description label="说明">
					<span class="text-secondary" style="font-size: 12px">
						只监听本机，不会暴露到局域网。修改端口后需重启浏览器生效；关闭开关同样需要重启浏览器才会收回端口。
					</span>
				</Description>
			</template>

			<Description label="原生弹窗">
				<a-tooltip content="启用后，浏览器中的原版弹窗可能会影响脚本运行">
					<a-switch
						v-model="store.render.setting.browser.enableDialog"
						size="small"
					/>
				</a-tooltip>
			</Description>

			<Description label="强制安装脚本">
				<a-tooltip content="启用后，启动浏览器时将跳过版本检查，强制安装所有启用的脚本">
					<a-switch
						v-model="store.render.setting.browser.forceUpdateScript"
						size="small"
					/>
				</a-tooltip>
			</Description>

			<Description label="新建浏览器自动初始化">
				<a-tooltip
					content="启用后，点击新建浏览器将自动打开初始化弹窗并执行（新建浏览器、添加自动化程序），关闭则直接创建空浏览器"
				>
					<a-switch
						v-model="store.render.setting.browser.autoInitNewBrowser"
						size="small"
					/>
				</a-tooltip>
			</Description>
		</a-card>

		<RemoteControl />

		<a-card title="签到助手">
			<Description label="客户端特征伪装">
				<a-tooltip
					content="开启后，签到请求会伪装成手机端学习通：使用 Android 浏览器 UA，并让签到提交里的 useragent 与 appType=15 保持一致，降低被识别为脚本的概率。登录与课程查询仍使用桌面 UA，不影响课程识别。默认关闭。"
				>
					<a-switch
						v-model="store.render.setting.signin.spoofClient"
						size="small"
					/>
				</a-tooltip>
			</Description>
		</a-card>

		<a-card title="基本设置">
			<Description label="后台托盘运行">
				<a-tooltip
					content="开启后，点击关闭按钮只会把软件收进系统托盘（窗口右下角的小图标），已启动的浏览器与定时自动化任务继续在后台执行。右键托盘图标可显示主界面或彻底退出。"
				>
					<a-switch
						v-model="store.window.tray"
						size="small"
					/>
				</a-tooltip>
			</Description>

			<Description label="开机自启">
				<a-tooltip
					content="开机后自动启动软件（默认开启），到点由定时任务自动拉起浏览器执行脚本。关闭后需要手动打开软件，定时任务才会执行。"
				>
					<a-switch
						v-model="store.window.autoLaunch"
						size="small"
					/>
				</a-tooltip>
			</Description>

			<Description label="窗口置顶">
				<a-switch
					v-model="store.window.alwaysOnTop"
					size="small"
				/>
			</Description>
			<Description label="图形加速">
				<a-tooltip
					content="使用显卡渲染界面，滚动与动画更顺滑。关闭后改用软件渲染，界面会变钝但兼容性最好。连续崩溃 3 次会自动关闭。修改后需重启软件生效。"
				>
					<a-switch
						size="small"
						:model-value="store.window.gpuAcceleration !== false"
						@change="onGpuAccelerationChange"
					/>
				</a-tooltip>
			</Description>
			<Description label="夜间模式">
				<a-switch
					v-model="store.render.setting.theme.dark"
					size="small"
					@click="changeTheme"
				/>
			</Description>
			<Description label="显示侧边栏文字">
				<a-switch
					v-model="store.render.setting.showSideBarText"
					size="small"
					@click="changeTheme"
				/>
			</Description>
		</a-card>

		<a-card title="其他设置">
			<Description label="浏览器缓存预警阈值">
				<a-input-number
					v-model="store.render.setting.browser.cachesSizeWarningPoint"
					style="width: 200px"
				>
					<template #append> GB </template>
				</a-input-number>
				<a-popover>
					<template #content>
						<div>当前浏览器缓存总大小超过此数字时则会弹出警告弹窗。</div>
						<div>也可在左上角工具中找到 "清除浏览器缓存" 功能</div>
					</template>
					<Icon
						class="ms-2"
						type="help_outline"
					/>
				</a-popover>
			</Description>
		</a-card>

		<a-card title="路径设置">
			<Path
				label="浏览器缓存路径"
				name="userDataDirsFolder"
				:setting="true"
				@on-path-change="onUserDataDirsFolderChange"
			/>
			<Path
				label="文件下载路径"
				name="downloadFolder"
			/>
			<Path
				label="软件存储"
				name="user-data-path"
			/>
			<Path
				label="软件路径"
				name="exe-path"
			/>
		</a-card>

		<div class="mt-4">
			<a-popconfirm
				content="确认重置您的设置，并重新启动软件吗？"
				ok-text="确认"
				cancel-text="取消"
				@ok="reset"
			>
				<a-button status="danger"> 重置设置 </a-button>
			</a-popconfirm>
		</div>
	</div>
</template>

<script setup lang="ts">
import Description from './Description.vue';
import Path from './Path.vue';
import { lang, store } from '../store';
import { remote } from '../utils/remote';
import BrowserPath from './setting/BrowserPath.vue';
import RemoteControl from './setting/RemoteControl.vue';
import HonghuConfigs from './HonghuConfigs.vue';
import { reactive } from 'vue';
import { changeTheme } from '../utils';
import Icon from './Icon.vue';
import { forceClearBrowserCache } from '../utils/browser';
import { Message } from '@arco-design/web-vue';
import { Folder } from '../fs/folder';
import { Browser } from '../fs/browser';

interface SettingPanelProps {
	simple?: boolean;
}

withDefaults(defineProps<SettingPanelProps>(), {
	simple: false
});

const state = reactive({
	show: false,
	configs: {
		error: '',
		loading: true
	}
});

/** 重置设置 */
async function reset() {
	// @ts-ignore
	store.version = undefined;
	remote.app.call('relaunch');
	remote.app.call('exit', 0);
}

/**
 * 图形加速开关
 *
 * 不能直接 v-model 到 store.window：保存 store 时 gpuAcceleration 会被主进程的当前值覆盖
 * （它是机器级、重启生效的设置，崩溃守卫也会写它），所以必须走专用方法落盘，
 * 成功后再把权威值同步回本地用于显示。
 */
async function onGpuAccelerationChange(value: any) {
	const enabled = !!value;
	try {
		const res = await remote.methods.call('setGpuAcceleration', enabled);
		store.window.gpuAcceleration = enabled;
		if (res?.restartRequired) {
			Message.info({
				content: enabled ? '已开启图形加速，重启软件后生效。' : '已关闭图形加速，重启软件后生效。',
				duration: 5000
			});
		}
	} catch (e) {
		Message.error('设置图形加速失败：' + e);
	}
}

async function onUserDataDirsFolderChange(previous: string, current: string) {
	// 更改全部浏览器缓存路径
	const browsers = Folder.from(store.render.browser.root.uid).findAll((e) => e.type === 'browser') as Browser[];
	if (browsers.length > 0) {
		for (const browser of browsers) {
			browser.cachePath = await remote.path.call('join', current, browser.uid);
		}
	}

	await forceClearBrowserCache('检测到浏览器缓存路径，正在清空之前的缓存数据...', previous);
}

/** 复制开发者调试地址（本机 CDP 入口） */
async function copyDevAddress() {
	const address = `http://127.0.0.1:${store.render.setting.dev?.port || 9222}/json`;
	try {
		await navigator.clipboard.writeText(address);
		Message.success(`已复制：${address}`);
	} catch {
		Message.warning(`复制失败，请手动复制：${address}`);
	}
}

function syncNote() {
	store.render.setting.hh.openSync = false;
	Message.info({
		content: lang('setting_browser_hh_config_sync_tip_v2', '修改全局设置后并且同步到各浏览器才会生效哦~'),
		duration: 10 * 1000
	});
}
</script>

<style scoped lang="less">
/**
 * 设置面板
 *
 * 卡片本身的外观（白底 / 1px 边框 / 圆角 / 标题字号）由 styles/arco-override.less
 * 统一控制，这里只管布局：宽度上限、卡片间距、内嵌配置区的高度。
 */

.setting {
	min-height: 500px;
	max-width: 800px;
}

#hh-global-configs {
	overflow: auto;
	scrollbar-gutter: stable;
	max-width: 600px;
	/**
	 * 用 vh 而不是 100%：这个容器在 Modal 内，父级没有确定高度，
	 * `100%` 会解析成 auto（等于不限高），配置区会把弹窗顶得很长。
	 */
	max-height: min(520px, 60vh);
}

/**
 * 卡片间距
 *
 * 原来还给每张卡片加了 `animation: linear-fade-up .4s backwards`，
 * 一进设置页 8 张卡片同时上浮，视觉上像整页在抖一下，而且全部同时跑动画。
 * 动画的价值在于「引导注意力」，同时动 8 个就只是噪声。
 */
.arco-card + .arco-card {
	margin-top: 14px;
}
</style>
