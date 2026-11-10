<template>
	<div class="signin">
		<section class="lead card fade-up">
			<div class="lead__main">
				<p class="lead__eyebrow">
					<i></i>
					超星签到
				</p>
				<div class="lead__value">
					<strong class="num">{{ accounts.length }}</strong>
					<span class="num">个账号</span>
				</div>
				<p class="lead__desc faint">自动签到默认关闭：关闭后只检测提醒，不会自动提交；手动签到随时可用。</p>

				<div class="lead__metrics">
					<div class="metric">
						<span class="metric__label">监听中</span>
						<strong class="num">{{ monitoringCount }}</strong>
					</div>
					<div class="metric">
						<span class="metric__label">自动签到</span>
						<strong class="num">{{ autoCount }}</strong>
					</div>
				</div>
			</div>

			<button
				type="button"
				class="btn btn-sm btn-ghost lead__refresh"
				:disabled="loading"
				@click="load()"
			>
				<Icon
					name="refresh"
					:size="13"
				/>
				刷新
			</button>
		</section>

		<div
			v-if="!loaded"
			class="empty card fade-up"
		>
			<span class="empty__icon">
				<Icon
					name="refresh"
					:size="24"
				/>
			</span>
			<p class="empty__title">正在读取签到账号…</p>
			<p class="empty__desc faint">账号数据来自电脑端的签到助手</p>
		</div>

		<div
			v-else-if="!accounts.length"
			class="empty card fade-up"
		>
			<span class="empty__icon">
				<Icon
					name="check"
					:size="24"
				/>
			</span>
			<p class="empty__title">还没有签到账号</p>
			<p class="empty__desc faint">先在电脑端「签到助手」里添加超星账号，这里就能远程检测与签到。</p>
		</div>

		<div
			v-else
			class="list"
		>
			<article
				v-for="item in accounts"
				:key="item.id"
				class="account card fade-up"
			>
				<header class="account__head">
					<span
						class="dot"
						:class="item.monitoring ? 'ok' : 'off'"
					></span>
					<h3 class="account__name ellipsis">{{ item.name }}</h3>
					<span
						class="chip"
						:class="{ on: item.config.autoSign }"
					>
						{{ item.config.autoSign ? '自动签到' : '仅检测' }}
					</span>
					<span
						class="chip chip--state"
						:class="item.monitoring ? 'is-on' : 'is-off'"
					>
						{{ item.monitoring ? '监听中' : '未监听' }}
					</span>
				</header>

				<p class="account__meta faint num">
					<span>{{ item.phone }}</span>
					<span>检测 {{ item.lastCheckTime ? formatAgo(item.lastCheckTime, now) : '—' }}</span>
					<span>签到 {{ item.lastSignTime ? formatAgo(item.lastSignTime, now) : '—' }}</span>
				</p>

				<p
					v-if="item.lastResult"
					class="account__result"
					:class="{ bad: !successText(item.lastResult) }"
				>
					{{ item.lastResult }}
				</p>

				<div
					v-if="activityOf(item)"
					class="activity"
				>
					<div class="activity__head">
						<strong class="ellipsis">{{ activityName(item) }}</strong>
						<span class="chip on">{{ activityType(item) }}</span>
						<span
							v-if="activitySigned(item)"
							class="chip chip--state is-on"
						>
							已签到
						</span>
					</div>
					<p class="activity__meta faint">
						活动 ID：{{ activityId(item) }}
						<template v-if="activitySigned(item)"> · 签到时间 {{ activitySignedTime(item) }} </template>
					</p>
				</div>
				<p
					v-else-if="checks[item.id]"
					class="account__check"
					:class="'is-' + checks[item.id].code"
				>
					{{ checks[item.id].message }}
				</p>

				<div class="account__actions">
					<button
						type="button"
						class="btn btn-sm btn-primary"
						:disabled="!!busy[item.id]"
						@click="check(item)"
					>
						<Icon
							name="search"
							:size="14"
						/>
						{{ busy[item.id] === 'check' ? '检测中…' : '检测活动' }}
					</button>
					<button
						type="button"
						class="btn btn-sm"
						:disabled="!!busy[item.id] || activitySigned(item)"
						@click="sign(item)"
					>
						<Icon
							name="check"
							:size="14"
						/>
						{{ busy[item.id] === 'sign' ? '签到中…' : activitySigned(item) ? '已签到' : '立即签到' }}
					</button>
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						:disabled="!!busy[item.id]"
						@click="toggleMonitor(item)"
					>
						<Icon
							:name="item.monitoring ? 'stop' : 'play'"
							:size="14"
						/>
						{{ item.monitoring ? '停止监听' : '开始监听' }}
					</button>
				</div>

				<div class="account__switch">
					<button
						type="button"
						class="toggle"
						:class="{ on: item.config.autoSign }"
						:disabled="!!busy[item.id]"
						role="switch"
						:aria-checked="item.config.autoSign"
						@click="toggleAuto(item)"
					>
						<span></span>
						<em>自动签到</em>
					</button>
					<span class="hint faint">
						{{
							item.config.autoSign
								? `监听中检测到活动会延迟 ${item.config.delay} 秒自动签到`
								: '关闭：只记录提醒，手动签到不受影响'
						}}
					</span>
				</div>

				<p class="account__hint faint">
					轮询 {{ item.config.interval }} 秒 · 时长 {{ durationText(item) }} · IM {{ imText(item) }} ·
					{{ configText(item) }}
				</p>

				<div class="account__logs">
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						@click="toggleEditor(item)"
					>
						<Icon
							name="sliders"
							:size="13"
						/>
						{{ editingId === item.id ? '收起设置' : '位置与参数' }}
					</button>
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						@click="toggleLogs(item)"
					>
						<Icon
							name="logs"
							:size="13"
						/>
						{{ logsOpen[item.id] ? '收起日志' : '最近日志' }}
					</button>
					<button
						v-if="logsOpen[item.id]"
						type="button"
						class="btn btn-sm btn-ghost"
						@click="loadLogs(item)"
					>
						<Icon
							name="refresh"
							:size="13"
						/>
						刷新
					</button>
				</div>

				<section
					v-if="editingId === item.id"
					class="editor"
				>
					<div class="sf-grid">
						<div class="sf-field sf-field--wide">
							<span>位置地址</span>
							<div class="sf-row">
								<input
									v-model="editForm.address"
									class="sf-input"
									placeholder="例如：北京市朝阳区xx路xx号"
								/>
								<button
									type="button"
									class="btn btn-sm btn-primary sf-pick"
									@click="openPicker('main')"
								>
									<Icon
										name="pin"
										:size="13"
									/>
									地图选点
								</button>
							</div>
						</div>
						<label class="sf-field">
							<span>经度</span>
							<input
								v-model="editForm.lon"
								class="sf-input"
								inputmode="decimal"
								placeholder="116.397428"
							/>
						</label>
						<label class="sf-field">
							<span>纬度</span>
							<input
								v-model="editForm.lat"
								class="sf-input"
								inputmode="decimal"
								placeholder="39.909230"
							/>
						</label>
						<label class="sf-field">
							<span>轮询间隔（秒）</span>
							<input
								v-model.number="editForm.interval"
								class="sf-input"
								type="number"
								min="10"
								max="600"
							/>
						</label>
						<label class="sf-field">
							<span>监听时长（分钟，0 不限）</span>
							<input
								v-model.number="editForm.duration"
								class="sf-input"
								type="number"
								min="0"
								max="1440"
							/>
						</label>
						<label class="sf-field">
							<span>检测后延迟（秒）</span>
							<input
								v-model.number="editForm.delay"
								class="sf-input"
								type="number"
								min="0"
								max="60"
							/>
						</label>
						<div class="sf-field">
							<span>IM 实时监听</span>
							<button
								type="button"
								class="toggle"
								:class="{ on: editForm.im }"
								@click="editForm.im = !editForm.im"
							>
								<span></span>
								<em>{{ editForm.im ? '开启' : '关闭' }}</em>
							</button>
						</div>
						<label class="sf-field sf-field--wide">
							<span>二维码 enc（二维码签到用）</span>
							<input
								v-model="editForm.qrcodeEnc"
								class="sf-input"
								placeholder="从二维码链接中提取 enc 参数"
							/>
						</label>
						<label class="sf-field sf-field--wide">
							<span>拍照图片路径（电脑本机绝对路径）</span>
							<input
								v-model="editForm.photoPath"
								class="sf-input"
								placeholder="例如 D:\图片\签到.jpg"
							/>
						</label>
						<div class="sf-field sf-field--wide">
							<span>备用位置（上方单地址留空时依次尝试）</span>
							<div
								v-for="(preset, index) in editForm.presetAddress"
								:key="index"
								class="sf-preset"
							>
								<input
									v-model="preset.lon"
									class="sf-input sf-preset__coord"
									inputmode="decimal"
									placeholder="经度"
								/>
								<input
									v-model="preset.lat"
									class="sf-input sf-preset__coord"
									inputmode="decimal"
									placeholder="纬度"
								/>
								<input
									v-model="preset.address"
									class="sf-input sf-preset__addr"
									placeholder="详细地址"
								/>
								<button
									type="button"
									class="btn btn-sm btn-ghost sf-preset__pick"
									@click="openPicker(index)"
								>
									<Icon
										name="pin"
										:size="12"
									/>
									选点
								</button>
								<button
									type="button"
									class="btn btn-sm btn-ghost"
									@click="removePreset(index)"
								>
									删除
								</button>
							</div>
							<button
								type="button"
								class="btn btn-sm btn-ghost sf-preset__add"
								@click="addPreset"
							>
								添加位置
							</button>
						</div>
					</div>

					<div class="editor__foot">
						<button
							type="button"
							class="btn btn-sm btn-primary"
							:disabled="savingId === item.id"
							@click="saveEditor(item)"
						>
							{{ savingId === item.id ? '保存中…' : '保存设置' }}
						</button>
						<span class="hint faint">
							坐标可用「地图选点」换算回填，经纬度需要同时填写；坐标类型以选点时选择的为准。
						</span>
					</div>
				</section>

				<div
					v-if="logsOpen[item.id]"
					class="logbox"
				>
					<p
						v-for="log in logs[item.id] || []"
						:key="log.id"
						class="log"
						:class="log.level"
					>
						<span class="log__time num">{{ formatTime(log.time) }}</span>
						<span class="log__text">{{ log.message }}</span>
					</p>
					<p
						v-if="!(logs[item.id] || []).length"
						class="logbox__empty faint"
					>
						暂无日志
					</p>
				</div>
			</article>
		</div>

		<p class="foot faint">检测与签到都在电脑端执行，手机页面只负责下发指令；账号密码与登录凭证不会传到手机。</p>

		<LocationPicker
			v-if="picker.visible"
			:visible="picker.visible"
			:lon="picker.lon"
			:lat="picker.lat"
			:address="picker.address"
			@update:visible="picker.visible = $event"
			@confirm="onPickLocation"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Icon from './Icon.vue';
import LocationPicker from './LocationPicker.vue';
import {
	api,
	type RemoteSigninAccount,
	type RemoteSigninCheck,
	type RemoteSigninConfigPatch,
	type RemoteSigninLog
} from '../api';
import { toast } from '../store';
import { formatAgo, formatTime } from '../utils';

/** 账号列表自动刷新间隔：监听状态、最近签到时间都在电脑端推进 */
const REFRESH_INTERVAL = 12000;

const accounts = ref<RemoteSigninAccount[]>([]);
const loaded = ref(false);
const loading = ref(false);
const now = ref(Date.now());

const checks = reactive<Record<string, RemoteSigninCheck>>({});
const logs = reactive<Record<string, RemoteSigninLog[]>>({});
const logsOpen = reactive<Record<string, boolean>>({});
/** 每个账号当前进行中的操作，避免连点重复提交 */
const busy = reactive<Record<string, 'check' | 'sign' | 'monitor' | 'auto' | ''>>({});

/** 同一时间只展开一个账号的设置面板 */
const editingId = ref('');
const savingId = ref('');

const editForm = reactive({
	address: '',
	lon: '',
	lat: '',
	qrcodeEnc: '',
	photoPath: '',
	interval: 30,
	duration: 240,
	delay: 5,
	im: true,
	presetAddress: [] as Array<{ lon: string; lat: string; address: string }>
});

/** 地图选点：main 回填主位置，preset 回填对应备用位置 */
const picker = reactive({
	visible: false,
	target: 'main' as 'main' | 'preset',
	index: -1,
	lon: '',
	lat: '',
	address: ''
});

const monitoringCount = computed(() => accounts.value.filter((item) => item.monitoring).length);
const autoCount = computed(() => accounts.value.filter((item) => item.config.autoSign).length);

let timer: ReturnType<typeof setInterval> | undefined;
let inFlight = false;

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** 结果里带「成功」才算正常，其余按警告色展示 */
function successText(text: string): boolean {
	return String(text || '').indexOf('成功') !== -1;
}

function activityOf(item: RemoteSigninAccount) {
	return checks[item.id] ? checks[item.id].activity || null : null;
}

function activityName(item: RemoteSigninAccount): string {
	const activity = activityOf(item);
	return activity ? activity.name : '';
}

function activityType(item: RemoteSigninAccount): string {
	const activity = activityOf(item);
	return (activity && activity.typeName) || '签到';
}

function activityId(item: RemoteSigninAccount): string {
	const activity = activityOf(item);
	return activity ? activity.activeId : '';
}

/** 电脑端台账里是否已有该活动的成功签到 */
function activitySigned(item: RemoteSigninAccount): boolean {
	const activity = activityOf(item);
	return !!(activity && activity.signed);
}

function activitySignedTime(item: RemoteSigninAccount): string {
	const activity = activityOf(item);
	return activity && activity.signedTime ? formatTime(activity.signedTime) : '';
}

function durationText(item: RemoteSigninAccount): string {
	return item.config.duration > 0 ? `${item.config.duration} 分钟` : '不限';
}

function imText(item: RemoteSigninAccount): string {
	if (!item.config.im) return '关闭';
	if (item.imStatus === 'opened') return '已连接';
	if (item.imStatus === 'connecting') return '连接中';
	if (item.imStatus === 'failed') return '失败（仅轮询）';
	return '未连接';
}

function configText(item: RemoteSigninAccount): string {
	const parts = [item.config.hasAddress ? '位置已配' : '位置未配'];
	if (item.config.hasQrcodeEnc) parts.push('二维码 enc 已配');
	if (item.config.hasPhoto) parts.push('拍照图片已配');
	return parts.join(' · ');
}

/** 用最新视图替换列表中的同一账号 */
function replace(account: RemoteSigninAccount) {
	const index = accounts.value.findIndex((item) => item.id === account.id);
	if (index === -1) accounts.value.push(account);
	else accounts.value[index] = account;
}

async function load(silent = false) {
	if (inFlight) return;
	inFlight = true;
	if (!silent) loading.value = true;
	try {
		const data = await api.signinAccounts();
		accounts.value = data.accounts || [];
		loaded.value = true;
	} catch (e) {
		if (!silent) toast('读取签到账号失败：' + errorText(e), 'error');
	} finally {
		inFlight = false;
		loading.value = false;
	}
}

async function check(item: RemoteSigninAccount) {
	if (busy[item.id]) return;
	busy[item.id] = 'check';
	try {
		const data = await api.signinCheck(item.id);
		checks[item.id] = data.check;
		toast(data.check.message, data.check.code === 'activity' ? 'success' : 'info');
		await load(true);
	} catch (e) {
		toast(errorText(e), 'error');
	} finally {
		busy[item.id] = '';
	}
}

/** 立即签到：不受自动签到开关影响 */
async function sign(item: RemoteSigninAccount) {
	if (busy[item.id]) return;
	busy[item.id] = 'sign';
	try {
		const activity = activityOf(item);
		const data = await api.signinSign(item.id);
		toast(data.result.message, data.result.ok ? 'success' : 'error');
		if (data.result.ok && activity) {
			/** 签完保留活动卡片并标注「已签到」，方便确认结果；活动过期后检测自然消失 */
			checks[item.id] = {
				code: 'activity',
				message: data.result.message,
				activity: { ...activity, signed: true, signedTime: activity.signedTime || Date.now() }
			};
		} else if (!data.result.ok) {
			checks[item.id] = { code: 'error', message: data.result.message };
		}
		await load(true);
	} catch (e) {
		toast(errorText(e), 'error');
	} finally {
		busy[item.id] = '';
	}
}

async function toggleMonitor(item: RemoteSigninAccount) {
	if (busy[item.id]) return;
	const running = !item.monitoring;
	busy[item.id] = 'monitor';
	try {
		const data = await api.signinMonitor(item.id, running);
		if (data.account) replace(data.account);
		toast(data.message || (running ? '已开始监听' : '已停止监听'), data.ok ? 'success' : 'info');
		await load(true);
	} catch (e) {
		toast(errorText(e), 'error');
	} finally {
		busy[item.id] = '';
	}
}

async function toggleAuto(item: RemoteSigninAccount) {
	if (busy[item.id]) return;
	const next = !item.config.autoSign;
	busy[item.id] = 'auto';
	try {
		const data = await api.signinAutoSign(item.id, next);
		if (data.account) replace(data.account);
		toast(next ? '已开启自动签到' : '已关闭自动签到，仍可手动签到', 'success');
	} catch (e) {
		toast(errorText(e), 'error');
	} finally {
		busy[item.id] = '';
	}
}

/** 展开设置面板，并把当前账号的位置与参数填进表单 */
function toggleEditor(item: RemoteSigninAccount) {
	picker.visible = false;
	if (editingId.value === item.id) {
		editingId.value = '';
		return;
	}
	editingId.value = item.id;
	const config = item.config;
	const address = config.address || { lon: '', lat: '', address: '', altitude: '0' };
	editForm.address = address.address || '';
	editForm.lon = address.lon || '';
	editForm.lat = address.lat || '';
	editForm.qrcodeEnc = config.qrcodeEnc || '';
	editForm.photoPath = config.photoPath || '';
	editForm.interval = config.interval;
	editForm.duration = config.duration;
	editForm.delay = config.delay;
	editForm.im = !!config.im;
	editForm.presetAddress = (config.presetAddress || []).map((preset) => ({
		lon: preset.lon || '',
		lat: preset.lat || '',
		address: preset.address || ''
	}));
}

function addPreset() {
	if (editForm.presetAddress.length >= 10) {
		toast('备用位置最多 10 组', 'info');
		return;
	}
	editForm.presetAddress.push({ lon: '', lat: '', address: '' });
}

function removePreset(index: number) {
	editForm.presetAddress.splice(index, 1);
}

/** 打开地图选点：'main' 为主位置，数字为备用位置下标 */
function openPicker(target: 'main' | number) {
	if (target === 'main') {
		picker.target = 'main';
		picker.index = -1;
		picker.lon = editForm.lon;
		picker.lat = editForm.lat;
		picker.address = editForm.address;
	} else {
		const preset = editForm.presetAddress[target];
		if (!preset) return;
		picker.target = 'preset';
		picker.index = target;
		picker.lon = preset.lon;
		picker.lat = preset.lat;
		picker.address = preset.address;
	}
	picker.visible = true;
}

/** 选点确认：地址为空时保留原来填写的地址，只更新坐标 */
function onPickLocation(value: { lon: string; lat: string; address?: string }) {
	if (picker.target === 'main') {
		editForm.lon = value.lon;
		editForm.lat = value.lat;
		if (value.address) editForm.address = value.address;
	} else {
		const preset = editForm.presetAddress[picker.index];
		if (preset) {
			preset.lon = value.lon;
			preset.lat = value.lat;
			if (value.address) preset.address = value.address;
		}
	}
	picker.visible = false;
}

async function saveEditor(item: RemoteSigninAccount) {
	if (savingId.value) return;

	const interval = Number(editForm.interval);
	const duration = Number(editForm.duration);
	const delay = Number(editForm.delay);
	if (!Number.isFinite(interval) || interval < 10 || interval > 600) {
		toast('轮询间隔需在 10-600 秒之间', 'error');
		return;
	}
	if (!Number.isFinite(duration) || duration < 0 || duration > 1440) {
		toast('监听时长需在 0-1440 分钟之间', 'error');
		return;
	}
	if (!Number.isFinite(delay) || delay < 0 || delay > 60) {
		toast('检测后延迟需在 0-60 秒之间', 'error');
		return;
	}

	const lon = String(editForm.lon || '').trim();
	const lat = String(editForm.lat || '').trim();
	if ((!!lon && !lat) || (!lon && !!lat)) {
		toast('经度和纬度需要同时填写', 'error');
		return;
	}
	for (const preset of editForm.presetAddress) {
		const presetLon = String(preset.lon || '').trim();
		const presetLat = String(preset.lat || '').trim();
		if ((!!presetLon && !presetLat) || (!presetLon && !!presetLat)) {
			toast('备用位置的经度和纬度需要同时填写', 'error');
			return;
		}
	}

	savingId.value = item.id;
	try {
		const patch: RemoteSigninConfigPatch = {
			interval,
			duration,
			delay,
			im: !!editForm.im,
			qrcodeEnc: String(editForm.qrcodeEnc || '').trim(),
			photoPath: String(editForm.photoPath || '').trim(),
			address: {
				lon,
				lat,
				address: String(editForm.address || '').trim(),
				altitude: (item.config.address && item.config.address.altitude) || '0'
			},
			presetAddress: editForm.presetAddress
				.map((preset) => ({
					lon: String(preset.lon || '').trim(),
					lat: String(preset.lat || '').trim(),
					address: String(preset.address || '').trim()
				}))
				/** 完全空白的备用位置没有意义，保存时丢掉 */
				.filter((preset) => preset.lon || preset.lat || preset.address)
		};

		const data = await api.signinConfig(item.id, patch);
		if (data.account) replace(data.account);
		toast('签到设置已保存', 'success');
		editingId.value = '';
	} catch (e) {
		toast(errorText(e), 'error');
	} finally {
		savingId.value = '';
	}
}

async function toggleLogs(item: RemoteSigninAccount) {
	logsOpen[item.id] = !logsOpen[item.id];
	if (logsOpen[item.id]) await loadLogs(item);
}

async function loadLogs(item: RemoteSigninAccount) {
	try {
		const data = await api.signinLogs(item.id, 20);
		/** 接口按时间正序返回，展示时最新在上 */
		logs[item.id] = (data.logs || []).slice().reverse();
	} catch (e) {
		toast('读取日志失败：' + errorText(e), 'error');
	}
}

onMounted(() => {
	void load();
	timer = setInterval(() => {
		now.value = Date.now();
		void load(true);
	}, REFRESH_INTERVAL);
});

onBeforeUnmount(() => {
	if (timer) clearInterval(timer);
});
</script>

<style scoped>
.signin {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 0 16px 20px;
}

/* ------------------------------------------------------------------ 概览 */

.lead {
	position: relative;
	overflow: hidden;
	padding: 20px 18px;
}

.lead::after {
	content: '';
	position: absolute;
	width: 200px;
	height: 200px;
	right: -100px;
	top: -120px;
	border-radius: 50%;
	background: radial-gradient(circle, var(--glow-a), transparent 68%);
	pointer-events: none;
}

.lead__main {
	position: relative;
	z-index: 1;
}

.lead__eyebrow {
	display: flex;
	align-items: center;
	gap: 7px;
	margin: 0 0 8px;
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.16em;
	color: var(--text-3);
	text-transform: uppercase;
}

.lead__eyebrow i {
	width: 14px;
	height: 2px;
	border-radius: 2px;
	background: var(--brand);
}

.lead__value {
	display: flex;
	align-items: baseline;
	gap: 5px;
	line-height: 1;
}

.lead__value strong {
	font-size: 38px;
	font-weight: 650;
	letter-spacing: -0.04em;
	background: linear-gradient(135deg, var(--text) 20%, var(--brand-text));
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.lead__value span {
	font-size: 14px;
	font-weight: 500;
	color: var(--text-3);
}

.lead__desc {
	max-width: 34em;
	margin: 8px 0 0;
	font-size: 11.5px;
	line-height: 1.55;
}

.lead__metrics {
	display: flex;
	gap: 22px;
	margin-top: 14px;
}

.metric {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.metric__label {
	font-size: 10.5px;
	letter-spacing: 0.08em;
	color: var(--text-3);
}

.metric strong {
	font-size: 17px;
	font-weight: 600;
}

.lead__refresh {
	position: absolute;
	top: 16px;
	right: 16px;
	z-index: 2;
}

/* ------------------------------------------------------------------ 账号 */

.list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.chip {
	flex: none;
	height: 21px;
	padding: 0 8px;
	display: inline-flex;
	align-items: center;
	border-radius: 999px;
	border: 1px solid var(--line);
	background: var(--surface-2);
	color: var(--text-3);
	font-size: 10.5px;
	font-weight: 550;
	white-space: nowrap;
}

.chip.on {
	border-color: var(--line-brand);
	background: var(--brand-soft);
	color: var(--brand-text);
}

.chip--state.is-on {
	border-color: rgba(53, 211, 154, 0.32);
	background: var(--ok-soft);
	color: var(--ok);
}

.account {
	display: flex;
	flex-direction: column;
	gap: 9px;
	padding: 15px 16px;
}

.account__head {
	display: flex;
	align-items: center;
	gap: 8px;
}

.account__name {
	margin: 0;
	font-size: 14.5px;
	font-weight: 650;
	flex: 1;
	min-width: 0;
}

.account__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	margin: 0;
	font-size: 11.5px;
}

.account__result {
	margin: 0;
	font-size: 11.5px;
	line-height: 1.5;
	color: var(--ok);
}

.account__result.bad {
	color: var(--warn);
}

.activity {
	padding: 10px 12px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--inset);
}

.activity__head {
	display: flex;
	align-items: center;
	gap: 8px;
}

.activity__head strong {
	font-size: 13px;
	min-width: 0;
}

.activity__meta {
	margin: 5px 0 0;
	font-size: 11px;
}

.account__check {
	margin: 0;
	font-size: 11.5px;
	line-height: 1.5;
	color: var(--text-3);
}

.account__check.is-activity {
	color: var(--brand-text);
}

.account__check.is-error,
.account__check.is-auth-failed {
	color: var(--danger);
}

.account__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.account__switch {
	display: flex;
	align-items: center;
	gap: 9px;
	flex-wrap: wrap;
}

.hint {
	font-size: 11.5px;
	line-height: 1.5;
}

.account__hint {
	margin: 0;
	font-size: 11px;
	line-height: 1.55;
}

/* 自动签到开关：与桌面端一致的小号胶囊开关 */
.toggle {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	height: 30px;
	padding: 0 10px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--inset);
	color: var(--text-3);
	font-size: 11.5px;
	transition: border-color 0.18s var(--ease), color 0.18s var(--ease);
}

.toggle:disabled {
	opacity: 0.5;
}

.toggle span {
	position: relative;
	width: 26px;
	height: 15px;
	border-radius: 999px;
	background: var(--line-strong);
	transition: background 0.18s var(--ease);
	flex: none;
}

.toggle span::after {
	content: '';
	position: absolute;
	top: 2px;
	left: 2px;
	width: 11px;
	height: 11px;
	border-radius: 50%;
	background: #fff;
	transition: transform 0.18s var(--ease);
}

.toggle.on {
	color: var(--brand-text);
	border-color: transparent;
	background: var(--brand-soft);
}

.toggle.on span {
	background: var(--brand);
}

.toggle.on span::after {
	transform: translateX(11px);
}

.account__logs {
	display: flex;
	gap: 8px;
}

.logbox {
	max-height: 220px;
	overflow: auto;
	padding: 8px 10px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--inset);
}

.log {
	display: flex;
	gap: 8px;
	margin: 0 0 4px;
	font-size: 11px;
	line-height: 1.5;
	color: var(--text-2);
	word-break: break-all;
}

.log:last-child {
	margin-bottom: 0;
}

.log__time {
	flex: none;
	color: var(--text-3);
}

.log.success {
	color: var(--ok);
}

.log.warn {
	color: var(--warn);
}

.log.error {
	color: var(--danger);
}

.logbox__empty {
	margin: 0;
	font-size: 11px;
}

/* ------------------------------------------------------------------ 位置与参数编辑 */

.editor {
	padding: 12px;
	border-radius: 12px;
	border: 1px solid var(--line);
	background: var(--inset);
}

.sf-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 10px;
}

.sf-field {
	display: flex;
	flex-direction: column;
	gap: 5px;
	font-size: 11.5px;
	color: var(--text-3);
}

.sf-input {
	width: 100%;
	height: 34px;
	padding: 0 10px;
	border-radius: 9px;
	border: 1px solid var(--line);
	background: var(--surface-solid);
	color: var(--text);
	font-size: 12.5px;
	outline: none;
	transition: border-color 0.18s var(--ease);
}

.sf-input:focus {
	border-color: var(--brand);
}

.sf-input::placeholder {
	color: var(--text-3);
}

/* 地址输入 + 地图选点按钮同一行 */
.sf-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.sf-row .sf-input {
	flex: 1;
	min-width: 0;
}

.sf-pick {
	flex: none;
	height: 34px;
	white-space: nowrap;
}

.sf-preset__pick {
	flex: none;
}

.sf-preset {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-bottom: 6px;
}

.sf-preset__coord {
	width: 90px;
	flex: none;
}

.sf-preset__addr {
	flex: 1;
	min-width: 140px;
}

.sf-preset__add {
	align-self: flex-start;
}

.editor__foot {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 12px;
}

@media (min-width: 620px) {
	.sf-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.sf-field--wide {
		grid-column: span 2;
	}
}

/* ------------------------------------------------------------------ 空态与说明 */

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 34px 20px;
	text-align: center;
}

.empty__icon {
	display: grid;
	place-items: center;
	width: 46px;
	height: 46px;
	margin-bottom: 4px;
	border-radius: 14px;
	background: var(--brand-soft);
	color: var(--brand-text);
}

.empty__title {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
}

.empty__desc {
	max-width: 26em;
	margin: 0;
	font-size: 11.5px;
	line-height: 1.6;
}

.foot {
	margin: 0;
	padding: 0 2px;
	font-size: 11px;
	line-height: 1.6;
}

@media (min-width: 720px) {
	.signin {
		padding: 0 24px 24px;
	}

	.lead {
		padding: 24px 22px;
	}

	.account {
		padding: 18px 20px;
	}
}
</style>
