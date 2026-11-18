<template>
	<template
		v-for="(script, index) of automationScripts"
		:key="index"
	>
		<a-card class="as">
			<template #title>
				<div class="d-flex align-items-center gap-2">
					<img
						v-if="script.icon && !failedIcons.has(script.icon)"
						:src="iconUrl(script.icon)"
						class="script-icon"
						@error="failedIcons.add(script.icon!)"
					/>
					<Icon
						v-else
						type="public"
						:size="18"
						class="script-icon-fallback"
					/>
					<span> {{ script.name }} </span>
				</div>
			</template>
			<template #extra>
				<a-button
					size="mini"
					type="outline"
					status="danger"
					@click="remove(index)"
				>
					<template #icon>
						<icon-close />
					</template>
				</a-button>
			</template>
			<div>
				<div
					v-for="(cfg, cfgKey) of script.configs"
					:key="cfgKey"
					class="as"
				>
					<div
						v-if="!cfg.hide && isFieldVisible(script.configs, cfgKey)"
						class="d-flex gap-2"
					>
						<div style="flex: 0 0 100px">
							<span> {{ cfg.label }} </span>
							<span
								v-if="cfg.required"
								class="text-danger"
							>
								*</span
							>
						</div>
						<div style="flex: auto">
							<a-input-password
								v-if="cfg.type === 'password'"
								v-model="cfg.value"
								size="small"
								:max-length="cfg.max"
								:placeholder="cfg.placeholder || `输入 ${cfg.label} ...`"
							/>
							<a-input-number
								v-else-if="cfg.type === 'number'"
								v-model="cfg.value"
								size="small"
								:min="cfg.min"
								:max="cfg.max"
								:placeholder="cfg.placeholder || `输入 ${cfg.label} ...`"
							/>
							<a-textarea
								v-else-if="cfg.type === 'textarea'"
								v-model="cfg.value"
								size="small"
								:max-length="cfg.max"
								:auto-size="{ minRows: 1, maxRows: 3 }"
								:placeholder="cfg.placeholder || `输入 ${cfg.label} ...`"
							/>
							<a-select
								v-else-if="cfg.type === 'select'"
								v-model="cfg.value"
								size="small"
								:options="cfg.options"
								:placeholder="cfg.placeholder || `选择 ${cfg.label} ...`"
							/>
							<a-switch
								v-else-if="cfg.type === 'switch'"
								v-model="cfg.value"
								size="small"
							/>
							<a-input
								v-else
								v-model="cfg.value"
								size="small"
								:max-length="cfg.max"
								:placeholder="cfg.placeholder || `输入 ${cfg.label} ...`"
								@blur="() => (cfg.value = cfg.value.trim())"
							/>
						</div>
					</div>
				</div>
			</div>
		</a-card>
	</template>

	<!-- 一条脚本都没配时给一块大矩形「加号」，比空白区更能说明这里能点 -->
	<div
		v-if="!automationScripts || automationScripts.length === 0"
		class="as-empty"
		role="button"
		tabindex="0"
		@click="emits('add')"
		@keydown.enter.prevent="emits('add')"
		@keydown.space.prevent="emits('add')"
	>
		<span class="as-empty__icon">
			<icon-plus />
		</span>
		<span class="as-empty__title">点击添加自动登录脚本</span>
		<span class="as-empty__hint">从内置平台脚本中选择，配好账号后随浏览器启动自动运行</span>
	</div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { RawAutomationScript } from './index';
import { iconUrl } from '../../utils';
import Icon from '../Icon.vue';

const props = defineProps<{
	automationScripts: RawAutomationScript[];
}>();

const emits = defineEmits<{
	(e: 'update:automationScripts', automationScripts: RawAutomationScript[]): void;
	/** 空态大矩形被点击：由外层负责打开脚本选择器 */
	(e: 'add'): void;
}>();

/** 加载失败的图标地址集合，命中后改用默认地球图标 */
const failedIcons = reactive(new Set<string>());

/**
 * 条件字段是否显示
 *
 * `showIf` 指向同脚本的另一个字段（目前只有「登录方式」这类下拉分支）。
 * 依赖 `cfg.value` 的响应式变化实时重算——切下拉的那一刻，另一套输入框就得跟着消失/出现，
 * 不能等保存后重开面板。
 */
function isFieldVisible(configs: any, key: string) {
	const rule = configs && configs[key] ? configs[key].showIf : null;
	if (!rule || !rule.key) return true;

	const current = configs[rule.key] ? configs[rule.key].value : undefined;
	const want = Array.isArray(rule.value) ? rule.value : [rule.value];
	return want.includes(current);
}

function remove(index: number) {
	const arr = [...props.automationScripts];
	arr.splice(index, 1);
	emits('update:automationScripts', arr);
}
</script>

<style scoped lang="less">
.as + .as {
	margin-top: 8px;
}

.script-icon {
	width: 18px;
	height: 18px;
	object-fit: contain;
	border-radius: var(--r-xs);
}

/**
 * 空态：一块虚线大矩形，中间是加号 + 一句「点击添加自动登录脚本」。
 *
 * 用虚线而不是实线卡，是因为虚线表达「这里还能放东西」；
 * 默认走中性色、只有 hover 才上品牌色——旁边是真的脚本卡，
 * 常亮蓝色会和它们抢注意力。
 */
.as-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 108px;
	padding: 18px 16px;
	text-align: center;
	background: var(--surface-sunken);
	border: 1.5px dashed var(--border-default);
	border-radius: var(--r-md);
	cursor: pointer;
	user-select: none;
	transition: color var(--dur-2) var(--ease-std), border-color var(--dur-2) var(--ease-std),
		background-color var(--dur-2) var(--ease-std);

	&:hover,
	&:focus-visible {
		background: var(--accent-subtle);
		border-color: var(--accent-border);
		outline: none;
	}
}

.as-empty__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	font-size: 20px;
	color: var(--accent);
	background: var(--surface-panel);
	border: 1px solid var(--border-subtle);
	border-radius: var(--r-pill);
	transition: transform var(--dur-2) var(--ease-dec), border-color var(--dur-2) var(--ease-std);
}

.as-empty:hover .as-empty__icon {
	border-color: var(--accent-border);
	transform: scale(1.06);
}

.as-empty__title {
	font-size: var(--fs-13);
	font-weight: var(--fw-medium);
	color: var(--text-secondary);
	transition: color var(--dur-2) var(--ease-std);
}

.as-empty:hover .as-empty__title {
	color: var(--accent);
}

.as-empty__hint {
	font-size: var(--fs-12);
	color: var(--text-tertiary);
	line-height: 1.5;
}
</style>
