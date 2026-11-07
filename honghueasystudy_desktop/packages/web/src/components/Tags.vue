<template>
	<a-space
		v-if="readOnly === false || tags.length > 0"
		class="flex-wrap"
		:size="1"
	>
		<template
			v-for="(tag, index) in tags"
			:key="index"
		>
			<a-tag
				class="tag"
				:closable="!readOnly"
				:color="tag.color"
				:size="props.size"
				@close="handleClose(tag)"
			>
				<a-tooltip
					v-if="tag.name.length > 8"
					class="tag"
					:content="tag.name"
					mini
				>
					<span> {{ `${tag.name.slice(0, 8)}...` }} </span>
				</a-tooltip>
				<span v-else>
					{{ tag.name }}
				</span>
			</a-tag>
		</template>

		<a-tag
			v-if="!readOnly"
			class="tag-add"
			:size="props.size"
			@click="showModel"
		>
			添加 <icon-plus />
		</a-tag>
	</a-space>

	<a-modal
		v-model:visible="state.modalVisible"
		align-center
		ok-text="确认"
		cancel-text="取消"
		title="添加新标签"
		@ok="handleInputConfirm"
	>
		<div class="form-row">
			<span class="form-row__label">标签名</span>
			<a-auto-complete
				ref="inputRef"
				v-model="state.inputValue"
				placeholder="输入标签名"
				size="small"
				style="width: 100%"
				:data="options"
				@search="handleSearch"
			>
				<template
					#option="{
						data: {
							raw: { value, count, color }
						}
					}"
				>
					<a-tag :color="color"> {{ value }} </a-tag>
					<span class="option-count"> {{ count }} </span>
				</template>
			</a-auto-complete>
		</div>
		<div class="form-row">
			<span class="form-row__label">标签颜色</span>
			<template v-if="store.render.browser.tags[state.inputValue]">
				<div
					class="color-preview is-locked"
					:style="{
						backgroundColor: store.render.browser.tags[state.inputValue].color
					}"
					@click.prevent
				></div>
			</template>
			<template v-else>
				<!--
					取色器用 Arco 原生，不再用 colorpicker-v3：
					第三方那个浮层是白底 + 2px 圆角 + 15px 小色块，自带一套独立视觉，
					在暗色下完全不跟着变。换成 Arco 后圆角、边框、阴影、暗色全部走同一套 token。
					disabled-alpha：标签是纯色语义，留个透明度滑杆只会让人调出看不清的标签。
				-->
				<a-color-picker
					v-model="state.color"
					size="small"
					:disabled-alpha="true"
					:show-history="false"
					:show-preset="true"
					:preset-colors="presetColors"
					:trigger-props="{ position: 'br' }"
				/>
			</template>
		</div>
	</a-modal>
</template>
<script setup lang="ts">
import { ref, reactive } from 'vue';
import { store } from '../store';
import { Tag } from '../fs/interface';
const object = Object;

/**
 * 标签配色预设
 *
 * 取值来自设计系统的语义色与常用分类色：用户 90% 的情况是在这几个里挑一个，
 * 每次开调色盘手调既慢又容易调出不协调的颜色。调色盘仍然保留，需要精调时可用。
 */
const presetColors = [
	'#165DFF', // 品牌蓝
	'#3491FA', // 浅蓝
	'#0FC6C2', // 青
	'#00B42A', // 成功绿
	'#F7BA1E', // 琥珀
	'#FF7D00', // 警告橙
	'#D93F3F', // 危险红
	'#EB0AA4', // 洋红
	'#722ED1', // 紫
	'#86909C', // 中灰
	'#4E5969', // 深灰
	'#1D2129' // 近黑
];

const props = withDefaults(
	defineProps<{
		tags: Tag[];
		size: 'medium' | 'large' | 'small' | undefined;
		readOnly?: boolean;
		defaultColor?: string;
	}>(),
	{
		readOnly: false,
		size: 'small',
		defaultColor: '#808080'
	}
);
const emits = defineEmits<{
	(e: 'update:tags', tags: Tag[]): void;
	(e: 'remove', tag: Tag): void;
	(e: 'create', tag: Tag): void;
}>();

const getOptions = () =>
	object
		.keys(store.render.browser.tags)
		.map((key) => ({ value: key, label: key, ...store.render.browser.tags[key] }))
		.sort((a, b) => b.count - a.count);

const options = ref(getOptions());

const inputRef = ref();
const state = reactive({
	modalVisible: false,
	inputValue: '',
	color: props.defaultColor
});

const handleSearch = (val: string) => {
	options.value = getOptions().filter((opt) => RegExp(val).test(opt.value));
};

const handleClose = (removeTag: Tag) => {
	const tags = props.tags.filter((tag) => tag.name !== removeTag.name);
	emits('update:tags', tags);
	emits('remove', removeTag);
};

const showModel = () => {
	state.modalVisible = true;
	// 弹窗动作完成后，自动聚焦
	setTimeout(() => {
		inputRef.value.focus();
	}, 300);
};

const handleInputConfirm = () => {
	const inputValue = state.inputValue;
	let tags = props.tags;

	if (inputValue && tags.map((t) => t.name).findIndex((n) => n === inputValue) === -1) {
		const origin_tag = store.render.browser.tags[state.inputValue];
		let newTag;
		// 使用原有标签颜色
		if (origin_tag && origin_tag.color !== state.color) {
			newTag = { name: inputValue, color: origin_tag.color };
		} else {
			newTag = { name: inputValue, color: state.color };
		}
		tags = [...tags, newTag];
		emits('create', newTag);
	}
	// 重置状态
	Object.assign(state, {
		modalVisible: false,
		inputValue: '',
		color: props.defaultColor
	});

	emits('update:tags', tags);
};
</script>

<style scoped lang="less">
/**
 * 标签本体
 *
 * 高度必须压到 18px 并与字号一起收：标签是行内的次要标记，
 * 一旦按默认尺寸渲染，浏览器列表每行的基准高度就会被它撑高，
 * 行列节奏立刻散掉。这里保持紧凑，但颜色仍由用户自选。
 */
.tag {
	height: 18px !important;
	margin: 2px;
	padding: 0 6px;
	font-size: var(--fs-11);
	line-height: 18px;
	border-radius: var(--r-pill);
}

/**
 * 「添加」标签：虚线 + 透明底
 *
 * 它是「还没有的标签」，所以不能有实底——实底会让它和已有标签抢同一层视觉。
 * hover 才用品牌色描边，提示这里可以点。
 */
.tag-add {
	cursor: pointer;
	color: var(--text-tertiary);
	background: transparent;
	border: 1px dashed var(--border-strong);
	border-radius: var(--r-pill);
	transition: color var(--dur-2) var(--ease-std), border-color var(--dur-2) var(--ease-std),
		background-color var(--dur-2) var(--ease-std);

	&:hover {
		color: var(--accent);
		background: var(--accent-subtle);
		border-color: var(--accent);
	}
}

/* ============================================================ 弹窗表单 */

.form-row {
	display: flex;
	align-items: center;
	gap: 12px;

	& + .form-row {
		margin-top: 14px;
	}
}

.form-row__label {
	flex: 0 0 56px;
	font-size: var(--fs-12);
	color: var(--text-tertiary);
	user-select: none;
}

.option-count {
	float: right;
	color: var(--text-tertiary);
	font-variant-numeric: tabular-nums;
}

.color-preview {
	width: 52px;
	height: 24px;
	border-radius: var(--r-sm);
	box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.color-preview.is-locked {
	cursor: not-allowed;
	opacity: 0.6;
}
</style>
