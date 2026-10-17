import { reactive, watch } from 'vue';
import { Environment } from '../utils/environment';
import type { ValidBrowser } from '@ocs-desktop/common/lib/src/interface';
import { store } from '../store';

const state = reactive({
	/** 环境是否就绪 */
	isReady: true,
	/** 当前浏览器是否受支持 */
	isCurrentBrowserSupported: true,
	/** 检测到的可用浏览器 */
	supportedBrowser: null as ValidBrowser | undefined | null,
	/** 检测到的鸿鹄易学扩展 */
	supportedExtension: null as any | undefined | null,
	/** 修复弹窗是否可见 */
	envSetupFixVisible: false,
	/** 修复弹窗是否可见 */
	setupTitle: '',
	/** 是否正在检测中 */
	isLoading: true
});

async function updateEnvironmentDetect() {
	state.isLoading = true;
	await Environment.init();
	const [isCurrentBrowserSupported, supportedBrowser, supportedExtension] = await Promise.all([
		Environment.isCurrentBrowserSupported(),
		Environment.getSupportedBrowser(),
		Environment.getSupportedExtension()
	]);
	state.isCurrentBrowserSupported = isCurrentBrowserSupported;
	state.supportedBrowser = supportedBrowser;
	state.supportedExtension = supportedExtension;
	state.isReady = isCurrentBrowserSupported && !!supportedBrowser && !!supportedExtension;
	state.isLoading = false;
}

watch(
	() => [store.render.setting.launchOptions.executablePath],
	() => {
		updateEnvironmentDetect();
	}
);

export function useEnvironmentDetect() {
	return {
		state,
		updateEnvironmentDetect,
		openSetupModal: (setupTitle: string) => {
			state.envSetupFixVisible = true;
			state.setupTitle = setupTitle;
		}
	};
}
