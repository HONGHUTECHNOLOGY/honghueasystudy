<template>
	<div class="profile reveal-stack">
		<!-- ============================================================ 标签与备注 -->
		<section
			v-if="instance"
			class="panel-section"
		>
			<div class="field">
				<span class="field__label">标签分类</span>
				<div class="field__body">
					<Tags
						v-model:tags="instance.tags"
						size="small"
						@create="createTag"
						@remove="removeTag"
					></Tags>
				</div>
			</div>

			<div class="field">
				<span class="field__label">备注描述</span>
				<div class="field__body">
					<a-textarea
						v-model="instance.notes"
						class="notes-input"
						placeholder="备注为空~"
						allow-clear
					/>
				</div>
			</div>
		</section>

		<!-- ============================================================ 自动程序 -->
		<section
			v-if="instance"
			class="panel-section"
		>
			<header class="panel-section__head">
				<span class="panel-section__title">
					<Icon type="smart_toy" />
					自动程序
				</span>

				<a-tooltip position="br">
					<template #content>
						启动浏览器后会自动运行 <code>自动程序</code><br />
						根据不同配置运行例如：自动登录、自动点击等。
						<a-divider class="mt-1 mb-1" />
						提示1：自动化程序拥有操控页面的所有权限，与用户脚本不同的是，用户脚本是运行在页面中，权限比较少。<br />
						提示2：通常用来辅助用户脚本一起配合运行。<br />
						提示3：输入的配置例如账号密码将由软件加密存储，以保证数据安全。
					</template>

					<a-button
						type="text"
						size="mini"
						class="head-action"
						@click="state.showAutomationScriptSelector = true"
					>
						<icon-plus />
						<span>添加</span>
					</a-button>
				</a-tooltip>
			</header>

			<UsageAlertCollapse
				v-model:collapse="store.render.state.read_record.automation_script_usage"
				class="mb-2"
				banner
				title="使用提示"
				:html="
					lang(
						'simple_mode_index_automation_script_usage',
						'启动浏览器后会自动运行 <code>自动程序</code><br />根据不同配置运行例如：自动登录、自动点击等。'
					)
				"
			>
				启动浏览器后会自动运行 <code>自动程序</code><br />
				根据不同配置运行例如：自动登录、自动点击等。
			</UsageAlertCollapse>

			<AutomationScripts v-model:automation-scripts="instance.automationScripts"></AutomationScripts>

			<div class="mt-2">
				<AutomationPlan :browser="instance" />
			</div>
		</section>

		<!-- ============================================================ 运行与记录 -->
		<section
			v-if="instance"
			class="panel-section panel-section--flush"
		>
			<a-collapse
				:default-active-key="['1']"
				:bordered="false"
			>
				<a-collapse-item key="1">
					<template #header>
						<span class="collapse-title">
							<Icon type="info" />
							基础信息
						</span>
					</template>

					<div class="info-list">
						<div class="info-row">
							<span class="info-row__label">创建时间</span>
							<span class="info-row__value">{{ datetime(instance.createTime) }}</span>
						</div>

						<div class="info-row">
							<span class="info-row__label">文件位置</span>
							<span class="info-row__value">
								{{
									Folder.from(instance.parent)
										?.flatParents()
										.map((f) => f.name)
										.join(' / ')
								}}
								<a-button
									type="text"
									size="mini"
									class="inline-action"
									@click="instance?.location()"
								>
									跳转到该目录
								</a-button>
							</span>
						</div>

						<div
							v-if="state.cachePathExists"
							class="info-row"
						>
							<span class="info-row__label">缓存路径</span>
							<span class="info-row__value">
								<span
									class="info-link"
									@click="open(instance.cachePath)"
								>
									{{ instance.cachePath }}
									<IconFolder />
								</span>
							</span>
						</div>

						<div class="info-row">
							<span class="info-row__label">文件数据</span>
							<span class="info-row__value">
								<a-button
									type="text"
									size="mini"
									class="inline-action"
									@click="state.showCode = true"
								>
									查看原始数据
								</a-button>
							</span>
						</div>
					</div>

					<a-modal
						v-model:visible="state.showCode"
						:footer="false"
						:simple="true"
						:width="600"
						modal-class="p-0 m-0"
					>
						<div
							class="m-3"
							style="height: 70vh; overflow: overlay"
						>
							<a-textarea
								:auto-size="true"
								:disabled="true"
								:model-value="JSON.stringify(instance, null, 4)"
							></a-textarea>
						</div>
					</a-modal>
				</a-collapse-item>

				<a-collapse-item key="2">
					<template #header>
						<span class="collapse-title">
							<Icon type="terminal" />
							日志输出
						</span>
					</template>
					<XTerm :uid="instance.uid"></XTerm>
				</a-collapse-item>

				<a-collapse-item key="3">
					<template #header>
						<span class="collapse-title">
							<Icon type="history" />
							操作历史
						</span>
					</template>

					<div class="histories">
						<template v-if="instance.histories.length">
							<div class="histories__head">
								<span class="histories__count">共 {{ instance.histories.length }} 条</span>
								<a-button
									type="text"
									size="mini"
									class="clear-history-btn"
									@click="clearHistory"
								>
									<Icon type="delete" />
									<span>清空</span>
								</a-button>
							</div>

							<div class="table-wrap">
								<a-table
									size="small"
									:bordered="false"
									:data="instance.histories.sort((a, b) => b.time - a.time)"
									:pagination="{
										pageSizeOptions: [10, 20, 50, 100],
										showPageSize: true,
										size: 'mini'
									}"
									:scroll="{
										x: 800
									}"
									:columns="[
										{
											title: '操作',
											dataIndex: 'action',
											width: 100
										},
										{
											title: '备注',
											dataIndex: 'content',
											slotName: 'content'
										},
										{
											dataIndex: 'time',
											title: '时间',
											slotName: 'time',
											width: 160
										}
									]"
								>
									<template #time="{ record }">
										{{ datetime(record.time) }}
									</template>
									<template #content="{ record }">
										<a-tooltip :content="record.content || '无备注'">
											<div class="history-content">
												{{ record.content || '-' }}
											</div>
										</a-tooltip>
									</template>
								</a-table>
							</div>
						</template>

						<div
							v-else
							class="empty-hint"
						>
							暂无操作记录
						</div>
					</div>
				</a-collapse-item>
			</a-collapse>
		</section>

		<a-modal
			v-model:visible="state.showAutomationScriptSelector"
			:footer="false"
			unmount-on-close
		>
			<template #title> 选择自动化程序 </template>
			<AutomationScriptSelector
				:automation-scripts="instance.automationScripts"
				@confirm="
					(as) => {
						instance.automationScripts = as;
						state.showAutomationScriptSelector = false;
					}
				"
			></AutomationScriptSelector>
		</a-modal>
	</div>
</template>

<script setup lang="ts">
import { lang, store } from '../../store';
import { Browser } from '../../fs/browser';
import { datetime } from '../../utils';
import Tags from '../Tags.vue';
import Icon from '../Icon.vue';
import { BrowserOptions, Tag } from '../../fs/interface';
import { Folder } from '../../fs/folder';
import { currentBrowser } from '../../fs/index';
import { reactive, onMounted, nextTick } from 'vue';
import AutomationScriptSelector from '../automation-scripts/AutomationScriptSelector.vue';
import AutomationScripts from '../automation-scripts/AutomationScriptList.vue';
import AutomationPlan from '../automation-scripts/AutomationPlan.vue';
import XTerm from '../XTerm.vue';
import { electron } from '../../utils/node';
import { remote } from '../../utils/remote';
import UsageAlertCollapse from '../UsageAlertCollapse.vue';
import { normalizeBrowserScripts } from '../../utils/automationScripts';

const props = defineProps<{
	browser: BrowserOptions;
}>();

// 这里因为 BrowserPanel 使用的是侧边栏，侧边栏关闭时会自动销毁对象，所以不用做 compute 计算处理
const instance = Browser.from(props.browser.uid);

const state = reactive({
	showCode: false,
	showAutomationScriptSelector: false,
	cachePathExists: false
});

function createTag(tag: Tag) {
	if (store.render.browser.tags[tag.name]) {
		store.render.browser.tags[tag.name].count += 1;
	} else {
		store.render.browser.tags[tag.name] = {
			color: tag.color,
			count: 1
		};

		currentBrowser.value?.histories.unshift({
			action: '添加标签',
			content: tag.name,
			time: Date.now()
		});
	}
}
function removeTag(tag: Tag) {
	if (store.render.browser.tags[tag.name] && store.render.browser.tags[tag.name].count > 1) {
		store.render.browser.tags[tag.name].count -= 1;
	} else {
		Reflect.deleteProperty(store.render.browser.tags, tag.name);
	}

	currentBrowser.value?.histories.unshift({ action: '删除标签', content: tag.name, time: Date.now() });
}

function clearHistory() {
	if (currentBrowser.value) {
		currentBrowser.value.histories = [];
	}
}

/** 渲染侧边toc跳转栏 */
onMounted(() => {
	/**
	 * 脚本按当前声明归一化后再渲染。
	 *
	 * 旧存档、远程台保存、批量创建留下的 configs 可能缺 type/options，
	 * 直接渲染会让密码框退化成明文输入框。归一化走的是和远程台同一套转换。
	 */
	if (instance) instance.automationScripts = normalizeBrowserScripts(instance.automationScripts);

	nextTick(async () => {
		state.cachePathExists = await remote.fs.call('existsSync', props.browser.cachePath);
	});
});

async function open(p: string) {
	if (await remote.fs.call('existsSync', p)) {
		electron.shell.openPath(p);
	}
}
</script>

<style scoped lang="less">
/**
 * 浏览器详情面板
 *
 * 这里原先是一串 Arco 原生 descriptions / divider / collapse：带表格线、
 * 带灰色块，和重设计后的列表页、简洁模式完全不是一套语言。
 * 现在统一成「分组卡 + 两栏字段 + 细分隔线」：
 *   - 卡用 --surface-raised + 1px 微边框，弹窗玻璃透出来的是卡片而不是表格；
 *   - 字段标签 64px 固定，值列自适应，换行时不会把标签挤走；
 *   - 折叠区自己接管表头，去掉 Arco 的填充底色。
 * 全部走 token，暗色模式不需要单独补丁。
 */

.profile {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 4px 4px 8px;
}

/* ============================================================ 分组卡 */

.panel-section {
	padding: 14px 16px;
	background: var(--surface-raised);
	border: 1px solid var(--border-subtle);
	border-radius: var(--r-lg);
}

/** 折叠区自己就是一组行，外层不再套内边距，避免双层留白 */
.panel-section--flush {
	padding: 4px 16px 8px;
}

.panel-section__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 10px;
}

.panel-section__title {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	font-size: var(--fs-12);
	font-weight: var(--fw-medium);
	color: var(--text-tertiary);
	letter-spacing: 0.02em;
	user-select: none;
}

/* Icon 是子组件，内部节点拿不到本组件的 scopeId，必须显式穿透 */
.panel-section__title :deep(.material-icons) {
	font-size: 15px;
	opacity: 0.8;
}

:deep(.arco-btn.head-action) {
	height: 22px;
	padding: 0 8px;
	gap: 4px;
	color: var(--text-secondary);
	border-radius: var(--r-pill);
	transition: color var(--dur-2) var(--ease-std), background-color var(--dur-2) var(--ease-std);

	&:hover {
		color: var(--accent);
		background: var(--accent-subtle);
	}

	.arco-icon {
		font-size: 12px;
	}
}

/* ============================================================ 字段 */

.field {
	display: flex;
	gap: 12px;

	& + .field {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px dashed var(--border-subtle);
	}
}

.field__label {
	flex: 0 0 64px;
	padding-top: 5px;
	font-size: var(--fs-12);
	color: var(--text-tertiary);
	user-select: none;
}

.field__body {
	flex: 1 1 auto;
	min-width: 0;
}

.notes-input {
	min-height: 62px;
	font-size: var(--fs-13);
	line-height: 1.6;
}

/* ============================================================ 基础信息 */

.info-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.info-row {
	display: flex;
	gap: 12px;
	font-size: var(--fs-12);
}

.info-row__label {
	flex: 0 0 64px;
	color: var(--text-tertiary);
	user-select: none;
}

.info-row__value {
	flex: 1 1 auto;
	min-width: 0;
	color: var(--text-primary);
	line-height: 1.6;
	word-break: break-all;
}

.info-link {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--text-secondary);
	cursor: pointer;
	border-radius: var(--r-xs);
	transition: color var(--dur-2) var(--ease-std);

	&:hover {
		color: var(--accent);
	}
}

.info-link :deep(.material-icons) {
	font-size: 14px;
}

/** 行内操作按钮：贴着文字走，不要撑出额外行高 */
:deep(.arco-btn.inline-action) {
	height: 20px;
	margin-left: 2px;
	padding: 0 6px;
	color: var(--accent);
	border-radius: var(--r-xs);

	&:hover {
		background: var(--accent-subtle);
		color: var(--accent);
	}
}

/* ============================================================ 折叠面板 */

:deep(.arco-collapse) {
	background: transparent;
	border: none;
	border-radius: 0;
}

:deep(.arco-collapse-item) {
	border-bottom: 1px solid var(--border-subtle);

	&:last-child {
		border-bottom: none;
	}
}

:deep(.arco-collapse-item-header) {
	padding: 12px 0;
	background: transparent;
	border: none;
	font-size: var(--fs-13);
	font-weight: var(--fw-medium);
	color: var(--text-primary);
	transition: color var(--dur-2) var(--ease-std);

	&:hover {
		color: var(--accent);
	}
}

:deep(.arco-collapse-item-header-title) {
	flex: 1 1 auto;
}

:deep(.arco-collapse-item-content) {
	padding: 0;
	background: transparent;
}

:deep(.arco-collapse-item-content-box) {
	padding: 0 0 14px;
}

.collapse-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.collapse-title :deep(.material-icons) {
	font-size: 16px;
	color: var(--text-tertiary);
}

/* ============================================================ 操作历史 */

.histories__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}

.histories__count {
	font-size: var(--fs-12);
	color: var(--text-tertiary);
	font-variant-numeric: tabular-nums;
}

:deep(.arco-btn.clear-history-btn) {
	height: 22px;
	padding: 0 8px;
	gap: 4px;
	color: var(--text-tertiary);
	border-radius: var(--r-pill);

	&:hover {
		color: var(--danger);
		background: var(--danger-subtle);
	}

	.material-icons {
		font-size: 14px;
	}
}

.table-wrap {
	overflow: hidden;
	border: 1px solid var(--border-subtle);
	border-radius: var(--r-md);

	:deep(.arco-table-th) {
		background: var(--surface-sunken);
		font-size: var(--fs-12);
		font-weight: var(--fw-medium);
		color: var(--text-secondary);
	}

	:deep(.arco-table-td) {
		font-size: var(--fs-12);
		color: var(--text-primary);
		border-color: var(--border-subtle);
	}

	:deep(.arco-table-tr:hover .arco-table-td) {
		background: var(--surface-hover);
	}

	:deep(.arco-table-container),
	:deep(.arco-table-content) {
		border-radius: 0;
	}
}

.history-content {
	display: -webkit-box;
	overflow: hidden;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	text-overflow: ellipsis;
}

.empty-hint {
	padding: 18px 0 22px;
	font-size: var(--fs-12);
	color: var(--text-tertiary);
	text-align: center;
}
</style>
