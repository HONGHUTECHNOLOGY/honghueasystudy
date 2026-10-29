<template>
	<a-space
		v-if="instance"
		:size="4"
		class="justify-content-end align-items-center browser-operators"
	>
		<template v-if="process === undefined || process.status === 'closed'">
			<a-tooltip
				:position="tooltipPosition"
				mini
			>
				<template #content>
					启动浏览器 <br />
					- 并自动安装脚本 <br />
					- 以及执行自动化程序等一系列操作。
				</template>

				<a-button
					size="mini"
					type="text"
					@click.stop="instance?.launch()"
				>
					<Icon
						type="play_circle"
						color="#165dff"
						:class="iconClass"
					/>
					<span class="ms-1">启动</span>
				</a-button>
			</a-tooltip>
		</template>

		<template v-else-if="process.status === 'launched'">
			<a-tooltip
				v-if="devEnabled"
				content="导出当前网页信息（HTML / 截图 / 结构摘要），用于排查识别不到课程、元素点不到等问题"
				:position="tooltipPosition"
			>
				<a-button
					type="text"
					size="mini"
					@click.stop="dumpPageInfo"
				>
					<Icon
						type="bug_report"
						:class="iconClass"
						color="#165dff"
					/>
				</a-button>
			</a-tooltip>

			<a-tooltip
				content="置顶"
				:position="tooltipPosition"
			>
				<a-button
					type="text"
					size="mini"
					@click.stop="instance?.bringToFront()"
				>
					<Icon
						type="push_pin"
						:class="iconClass"
						color="#165dff"
					/>
				</a-button>
			</a-tooltip>

			<a-tooltip
				content="重启"
				:position="tooltipPosition"
			>
				<a-button
					type="text"
					size="mini"
					@click.stop="instance?.relaunch()"
				>
					<Icon
						type="sync"
						:class="iconClass"
						color="#165dff"
					/>
				</a-button>
			</a-tooltip>

			<a-tooltip
				content="关闭"
				:position="tooltipPosition"
			>
				<a-button
					type="text"
					size="mini"
					@click.stop="instance?.close()"
				>
					<Icon
						type="cancel"
						:class="iconClass"
						color="#ff0000db"
					/>
				</a-button>
			</a-tooltip>
		</template>

		<!-- 加载中 -->
		<template v-else-if="process.status === 'launching' || process.status === 'closing'">
			<a-button
				type="text"
				size="mini"
				style="color: gray"
			>
				<icon-loading :class="iconClass" />
			</a-button>
		</template>

		<slot name="extra"></slot>
	</a-space>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';
import { Process } from '../../utils/process';
import { computed } from 'vue';
import { Browser } from '../../fs/browser';
import { BrowserOptions } from '../../fs/interface';
import { Message } from '@arco-design/web-vue';
import { remote } from '../../utils/remote';
import { store } from '../../store';

const props = withDefaults(
	defineProps<{
		browser: BrowserOptions;
		tooltipPosition?: 'top' | 'br';
		iconClass?: string;
	}>(),
	{
		tooltipPosition: 'top',
		iconClass: 'fs-6'
	}
);
const instance = Browser.from(props.browser.uid);
const process = computed(() => Process.from(props.browser.uid));

/** 只有开了开发者调试才显示「导出网页信息」入口 */
const devEnabled = computed(() => !!store.render.setting.dev?.enabled);

/**
 * 导出当前页面信息
 *
 * 由 worker 直接落到日志目录（HTML 可能几 MB，不适合走 IPC 回传），
 * 这里负责给出目录并把文件夹打开，方便直接发给技术支持或贴进对话里。
 */
async function dumpPageInfo() {
	const current = process.value;
	if (!current) return;

	const loading = Message.loading({ content: '正在导出当前网页信息…', duration: 0 });
	try {
		const result = await current.dumpPage();
		loading.close();
		Message.success({
			content: `已导出 ${result.files.map((item) => item.name).join(' / ')}（${result.containerCount} 组候选容器）到：${result.dir}`,
			duration: 10 * 1000,
			closable: true
		});
		remote.methods.call('openFolder', result.dir).catch(() => {});
	} catch (err) {
		loading.close();
		Message.error('导出失败：' + String(err instanceof Error ? err.message : err));
	}
}
</script>

<style scoped lang="less">
.browser-operators {
	.arco-space-item {
		cursor: pointer;
	}
}
</style>
