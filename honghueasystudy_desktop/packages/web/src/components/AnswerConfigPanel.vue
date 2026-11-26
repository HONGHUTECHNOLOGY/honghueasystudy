<template>
	<div class="ac-wrap">
		<!-- 题库配置 -->
		<a-card title="题库配置">
			<div class="ac-tip">
				题库以 JSON 数组形式提供，支持多个题库（按顺序尝试）。留空表示不使用题库，仅靠 AI 答题。
				<br />
				AI 答题的调用配置（接口 / Key / 提示词）由下方「AI 配置」维护，不在此处显示。
			</div>

			<a-form layout="vertical">
				<a-form-item label="题库配置（JSON）">
					<a-textarea
						v-model="form.wrappersText"
						:auto-size="{ minRows: 8, maxRows: 18 }"
						placeholder='粘贴题库配置，形如 [{"contentType":"json","data":{"messages":[...]}}]'
					/>
					<template #extra>
						<span class="ac-extra">{{ wrappersHint }}</span>
					</template>
				</a-form-item>
			</a-form>

			<a-space>
				<a-button
					type="primary"
					@click="saveAll('题库配置')"
				>
					保存题库
				</a-button>
				<a-button @click="clearWrappers">清空题库</a-button>
			</a-space>
		</a-card>

		<!-- AI 配置 -->
		<a-card
			title="AI 配置"
			class="ac-card"
		>
			<div class="ac-tip">
				兼容 OpenAI 接口格式（DeepSeek / 智谱 GLM / Kimi / 硅基流动等）。保存时会连同题库一起下发，两者始终一致。
			</div>

			<a-form layout="vertical">
				<a-form-item label="AI 接口地址">
					<a-input
						v-model="form.endpoint"
						placeholder="https://api.deepseek.com"
						allow-clear
					/>
					<template #extra>
						<span class="ac-extra">可只填域名，会自动补全 /v1/chat/completions</span>
					</template>
				</a-form-item>

				<a-form-item label="AI 模型">
					<a-input
						v-model="form.model"
						placeholder="deepseek-flash"
						allow-clear
					/>
				</a-form-item>

				<a-form-item label="API Key">
					<a-input-password
						v-model="form.apiKey"
						placeholder="sk-..."
						allow-clear
					/>
					<template #extra>
						<span class="ac-extra">仅保存在本机 config.json（AES-GCM 加密），不会上传到任何服务器</span>
					</template>
				</a-form-item>
			</a-form>

			<a-space>
				<a-button
					type="primary"
					@click="saveAll('AI 配置')"
				>
					保存 AI 配置
				</a-button>
				<a-button
					:loading="testing"
					@click="testConnection"
				>
					测试连接
				</a-button>
			</a-space>
		</a-card>

		<div class="ac-foot">保存后重启浏览器生效：客户端启动时会把这套配置注入扩展，扩展面板不再单独编辑。</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { store } from '../store';

/** 桌面端统一配置的扁平键（与扩展 chrome.storage 里的键完全一致） */
const KEYS = {
	wrappers: 'common.settings.answererWrappers',
	endpoint: 'common.ai-settings.aiEndpoint',
	model: 'common.ai-settings.aiModel',
	apiKey: 'common.ai-settings.aiApiKey'
} as const;

/** 拿到 hh.answerStore，没有就建一个空对象 */
function bucket(): Record<string, any> {
	const hh = store.render.setting.hh as any;
	if (!hh.answerStore || typeof hh.answerStore !== 'object') hh.answerStore = {};
	return hh.answerStore as Record<string, any>;
}

const form = reactive({
	endpoint: '',
	model: '',
	apiKey: '',
	wrappersText: ''
});

/** AI 答题对应的 wrapper 名称（不是题库，是 AI 的调用配置） */
const AI_WRAPPER_NAME = 'AI答题';

/** 从当前存储里取出 AI wrapper，没有则返回 null（用户没启用 AI 答题） */
function getAiWrapper(): any | null {
	const list = bucket()[KEYS.wrappers];
	if (!Array.isArray(list)) return null;
	return list.find((w: any) => w?.name === AI_WRAPPER_NAME) || null;
}

onMounted(() => {
	const data = bucket();
	form.endpoint = data[KEYS.endpoint] ?? '';
	form.model = data[KEYS.model] ?? '';
	form.apiKey = data[KEYS.apiKey] ?? '';

	/**
	 * 题库区只展示真正的题库
	 *
	 * `answererWrappers` 里除了题库还夹着一项 `AI答题`（url / Authorization / messages），
	 * 那是 AI 调用配置，由上面的 AI 配置区和扩展的 syncWrapper 维护。
	 * 混在题库 JSON 里既容易误删，也让人误以为它是题库。
	 */
	const list = data[KEYS.wrappers];
	const plain = Array.isArray(list) ? list.filter((w: any) => w?.name !== AI_WRAPPER_NAME) : [];
	form.wrappersText = plain.length ? JSON.stringify(plain, null, 4) : '';
});

/** 题库数量提示（解析失败时给出原因，不阻断输入） */
const wrappersHint = computed(() => {
	const text = form.wrappersText.trim();
	if (!text) return '留空表示不使用题库（仅靠 AI 答题）';
	try {
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return '格式不对：最外层必须是数组';
		return `已识别 ${parsed.length} 个题库配置`;
	} catch (e: any) {
		return 'JSON 解析失败：' + (e?.message || e);
	}
});

/** 解析题库 JSON；返回 null 表示解析失败（已弹提示） */
function parseWrappers(): any[] | null {
	const text = form.wrappersText.trim();
	if (!text) return [];
	try {
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) throw new Error('最外层必须是数组');
		return parsed;
	} catch (e: any) {
		Message.error('题库 JSON 解析失败：' + (e?.message || e));
		return null;
	}
}

/**
 * 保存
 *
 * 题库和 AI 总是同时写：两者在下发时是配套使用的（题库里夹带了 AI 的提示词），
 * 只存一半会出现「模型换了但提示词还是旧的」这种错配。所以任一卡片点保存，
 * 都是把当前表单的完整状态同步过去。
 */
function saveAll(from: string) {
	const wrappers = parseWrappers();
	if (wrappers === null) return;

	const data = bucket();
	data[KEYS.endpoint] = form.endpoint.trim();
	data[KEYS.model] = form.model.trim();
	data[KEYS.apiKey] = form.apiKey.trim();
	/** AI wrapper 原样保留在最前面，题库区只负责真的题库 */
	const ai = getAiWrapper();
	data[KEYS.wrappers] = ai ? [ai, ...wrappers] : wrappers;

	/** store.render 有深度 watch，改完会自动加密落盘 */
	Message.success(`${from}已保存（题库与 AI 已同步），重启浏览器后生效`);
}

function clearWrappers() {
	form.wrappersText = '';
	const data = bucket();
	/** 只清题库，AI wrapper 保留，否则 AI 答题会被一起关掉 */
	const ai = getAiWrapper();
	data[KEYS.wrappers] = ai ? [ai] : [];
	Message.success('已清空题库配置（AI 答题配置保留）');
}

const testing = ref(false);

/**
 * 测试 AI 连接
 *
 * 请求由主进程代发（`/api/test-ai`）：渲染进程直接打第三方 API 会被 CORS 拦。
 * 用当前表单里的值测，不必先保存。
 */
async function testConnection() {
	const endpoint = form.endpoint.trim();
	const apiKey = form.apiKey.trim();
	const model = form.model.trim();
	if (!endpoint || !apiKey || !model) {
		Message.warning('请先填写完整的接口地址、API Key、模型名称');
		return;
	}

	testing.value = true;
	try {
		const r = await fetch(`http://localhost:${store.server?.port || 15319}/api/test-ai`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint, apiKey, model })
		}).then((x) => x.json());

		if (r.ok) {
			Message.success(`AI 连接成功（模型 ${model}）`);
		} else if (r.status === 0) {
			Message.error('连接失败：' + (r.error || '网络错误'));
		} else {
			Message.error(`连接失败 [HTTP ${r.status}]：${String(r.body || '').slice(0, 200)}`);
		}
	} catch (e: any) {
		Message.error('连接失败：' + (e?.message || e));
	} finally {
		testing.value = false;
	}
}
</script>

<style scoped lang="less">
.ac-card {
	margin-top: 16px;
}

.ac-tip {
	color: var(--color-text-3);
	font-size: 13px;
	line-height: 1.7;
	margin-bottom: 16px;
}

.ac-extra {
	color: var(--color-text-3);
	font-size: 12px;
}

.ac-foot {
	margin-top: 16px;
	color: var(--color-text-3);
	font-size: 12px;
	line-height: 1.6;
}
</style>
