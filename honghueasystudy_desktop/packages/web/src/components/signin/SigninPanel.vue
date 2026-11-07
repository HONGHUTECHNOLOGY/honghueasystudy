<template>
	<div class="signin-panel">
		<div class="panel-head">
			<a-select
				:model-value="selectedId"
				placeholder="选择账号"
				size="small"
				class="account-select"
				@change="selectAccount"
			>
				<a-option v-for="item in accounts" :key="item.id" :value="item.id">
					{{ item.name }}（{{ item.phone }}）
				</a-option>
			</a-select>
			<a-button size="small" type="primary" @click="showAdd = true">添加账号</a-button>
			<a-button v-if="selected" size="small" status="danger" @click="removeSelected">删除账号</a-button>
			<a-tag v-if="selected" :color="selected.monitoring ? 'green' : 'gray'">
				{{ selected.monitoring ? '监听中' : '未监听' }}
			</a-tag>
		</div>

		<div v-if="!accounts.length" class="panel-card">
			<a-empty description="还没有签到账号，先添加一个超星手机号账号" />
		</div>

		<template v-else-if="selected">
			<div class="panel-card">
				<div class="card-title">签到检测</div>
				<div class="card-row">
					<a-button type="primary" size="small" :loading="checking" @click="checkActivity">
						检测签到活动
					</a-button>
					<a-button v-if="!selected.monitoring" size="small" @click="toggleMonitor(true)">
						开始监听
					</a-button>
					<a-button v-else size="small" status="warning" @click="toggleMonitor(false)">
						停止监听
					</a-button>
					<span class="hint">
						监听中每 {{ selected.config.interval }} 秒检测一次；IM：{{ imText }}
					</span>
				</div>

				<div v-if="activity" class="activity-box">
					<div class="activity-name">{{ activity.name }}</div>
					<div class="activity-meta">
						<a-tag color="arcoblue">{{ activity.typeName || '签到' }}</a-tag>
						<span class="hint">活动 ID：{{ activity.activeId }}</span>
					</div>
					<a-button type="primary" size="small" :loading="signing" @click="signNow">立即签到</a-button>
					<div class="hint">
						位置/拍照/二维码签到会使用下方「自动签到设置」中的坐标、图片和 enc。
					</div>
				</div>
				<div v-else-if="checkMessage" class="hint">{{ checkMessage }}</div>
			</div>

			<div class="panel-card">
				<div class="card-title">自动签到设置</div>
				<div class="form-grid">
					<div class="form-item span-2">
						<label>自动签到（默认关闭）</label>
						<div class="row-inline">
							<a-switch
								v-model="settings.autoSign"
								size="small"
								@change="toggleAutoSign"
							/>
							<span class="hint">
								{{ settings.autoSign ? '检测到签到活动会自动签到' : '关闭：只检测提醒，不自动签到；手动签到不受影响' }}
							</span>
						</div>
					</div>
					<div class="form-item">
						<label>轮询间隔（秒）</label>
						<a-input-number v-model="settings.interval" :min="10" :max="600" size="small" />
					</div>
					<div class="form-item">
						<label>监听时长（分钟，0 为不限）</label>
						<a-input-number v-model="settings.duration" :min="0" :max="1440" size="small" />
					</div>
					<div class="form-item">
						<label>检测后延迟（秒）</label>
						<a-input-number v-model="settings.delay" :min="0" :max="60" size="small" />
					</div>
					<div class="form-item">
						<label>IM 实时监听</label>
						<a-switch v-model="settings.im" size="small" />
					</div>
					<div class="form-item span-2">
						<label>位置地址（位置/二维码签到必填）</label>
						<div class="row-inline">
							<a-input
								v-model="settings.address"
								size="small"
								placeholder="例如：北京市朝阳区xx路xx号"
								class="grow"
							/>
							<a-button
								size="small"
								type="primary"
								@click="openPicker('main')"
							>
								地图选点
							</a-button>
						</div>
					</div>
					<div class="form-item">
						<label>经度</label>
						<a-input v-model="settings.lon" size="small" placeholder="116.397428" />
					</div>
					<div class="form-item">
						<label>纬度</label>
						<a-input v-model="settings.lat" size="small" placeholder="39.90923" />
					</div>
					<div class="form-item span-2">
						<div class="hint">
							位置签到不是只报一个地址：超星服务端会按经纬度与老师设置的签到点算距离，坐标必须落在允许范围内。建议用「地图选点」，默认 BD-09；若签到提示超出范围，可换 GCJ-02 / WGS-84 再试。
						</div>
					</div>
					<div class="form-item span-2">
						<label>二维码 enc（二维码签到必填）</label>
						<a-input v-model="settings.qrcodeEnc" size="small" placeholder="从二维码链接中提取 enc 参数" />
					</div>
					<div class="form-item span-2">
						<label>备用位置（上方单地址留空时，依次尝试这些坐标）</label>
						<div v-for="(item, index) in settings.presetAddress" :key="index" class="preset-row">
							<a-input v-model="item.lon" size="small" placeholder="经度" class="coord" />
							<a-input v-model="item.lat" size="small" placeholder="纬度" class="coord" />
							<a-input v-model="item.address" size="small" placeholder="详细地址" class="grow" />
							<a-button
								size="mini"
								type="primary"
								@click="openPicker(index)"
							>
								地图选点
							</a-button>
							<a-button size="mini" status="danger" @click="removePreset(index)">删除</a-button>
						</div>
						<a-button size="mini" class="preset-add" @click="addPreset">添加位置</a-button>
					</div>
					<div class="form-item span-2">
						<label>拍照签到图片</label>
						<div class="row-inline">
							<a-input
								v-model="settings.photoPath"
								size="small"
								placeholder="本地图片绝对路径"
								class="grow"
							/>
							<a-button size="small" @click="choosePhoto">选择图片</a-button>
						</div>
					</div>
				</div>
				<div class="card-row">
					<a-button size="small" type="primary" :loading="saving" @click="saveSettings">保存设置</a-button>
					<span class="hint">密码已加密保存在本机；凭证过期时会自动重新登录。</span>
				</div>
			</div>

			<div class="panel-card">
				<div class="card-title">
					<span>签到日志</span>
					<a-button size="mini" @click="clearLogs">清空</a-button>
				</div>
				<div class="log-list">
					<div v-for="item in logs" :key="item.id" :class="['log-item', item.level]">
						<span class="log-time">{{ timeText(item.time) }}</span>
						<span class="log-message">{{ item.message }}</span>
					</div>
					<div v-if="!logs.length" class="hint">暂无日志</div>
				</div>
			</div>
		</template>

		<a-modal
			v-model:visible="showAdd"
			title="添加超星账号"
			:ok-loading="logging"
			ok-text="登录"
			@ok="doLogin"
		>
			<div class="form-item">
				<label>手机号</label>
				<a-input v-model="loginForm.phone" size="small" placeholder="超星绑定的手机号" />
			</div>
			<div class="form-item mt-8">
				<label>密码</label>
				<a-input-password v-model="loginForm.password" size="small" placeholder="超星登录密码" />
			</div>
			<div class="hint mt-8">
				密码会使用本机密钥加密保存，用于登录凭证过期后自动重新登录。若账号需要验证码，请到网页端手动登录。
			</div>
		</a-modal>

		<LocationPicker
			:visible="showPicker"
			:lon="pickerLon"
			:lat="pickerLat"
			:address="pickerAddress"
			@update:visible="showPicker = $event"
			@confirm="onPickLocation"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import type {
	CheckResult,
	SigninAccountView,
	SigninActivity,
	SigninLog
} from '@honghu-desktop/app';
import { remote } from '../../utils/remote';
import type { CoordSystem } from '../../utils/coord';
import LocationPicker from './LocationPicker.vue';

const accounts = ref<SigninAccountView[]>([]);
const selectedId = ref('');
const logs = ref<SigninLog[]>([]);
const activity = ref<SigninActivity | null>(null);
const checkMessage = ref('');
const checking = ref(false);
const signing = ref(false);
const saving = ref(false);
const logging = ref(false);
const showAdd = ref(false);
const loginForm = reactive({ phone: '', password: '' });
const showPicker = ref(false);
/** 地图选点当前回填目标：'main' 为单地址，数字为备用位置下标 */
const pickerTarget = ref<'main' | number>('main');

const settings = reactive({
	interval: 30,
	duration: 240,
	delay: 5,
	lon: '',
	lat: '',
	address: '',
	altitude: '0',
	presetAddress: [] as Array<{ lon: string; lat: string; address: string }>,
	photoPath: '',
	qrcodeEnc: '',
	im: true,
	autoSign: false
});

let pollTimer: any = null;

const selected = computed(() => accounts.value.find((item) => item.id === selectedId.value) || null);
const imText = computed(() => {
	const status = selected.value?.imStatus;
	if (status === 'opened') return '已连接';
	if (status === 'connecting') return '连接中';
	if (status === 'failed') return '失败（仅轮询）';
	return '未启用';
});

function timeText(time: number) {
	const date = new Date(time);
	const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function syncSettings(account: SigninAccountView | null) {
	if (!account) return;
	const config = account.config;
	settings.interval = config.interval;
	settings.duration = config.duration;
	settings.delay = config.delay;
	settings.lon = config.address?.lon || '';
	settings.lat = config.address?.lat || '';
	settings.address = config.address?.address || '';
	settings.altitude = config.address?.altitude || '0';
	settings.presetAddress = (config.presetAddress || []).map((item) => ({
		lon: item.lon || '',
		lat: item.lat || '',
		address: item.address || ''
	}));
	settings.photoPath = config.photoPath || '';
	settings.qrcodeEnc = config.qrcodeEnc || '';
	settings.im = !!config.im;
	settings.autoSign = !!config.autoSign;
}

async function refresh() {
	try {
		const list = await remote.methods.call('signinList');
		accounts.value = list;
		if (!selectedId.value || !list.some((item) => item.id === selectedId.value)) {
			selectedId.value = list.length ? list[0].id : '';
			syncSettings(selected.value);
		}
		if (selectedId.value) {
			const result = await remote.methods.call('signinGetLogs', selectedId.value, 40);
			logs.value = result.slice().reverse();
		} else {
			logs.value = [];
		}
	} catch (e) {
		console.error('读取签到账号失败', e);
	}
}

function selectAccount(value: any) {
	selectedId.value = String(value || '');
	activity.value = null;
	checkMessage.value = '';
	syncSettings(selected.value);
	void refresh();
}

async function doLogin() {
	if (!loginForm.phone || !loginForm.password) {
		Message.warning('请填写手机号和密码');
		return;
	}
	logging.value = true;
	try {
		const result = await remote.methods.call('signinLogin', loginForm.phone.trim(), loginForm.password);
		if (!result.ok) {
			Message.error(result.message);
			return;
		}
		Message.success(result.message);
		showAdd.value = false;
		loginForm.phone = '';
		loginForm.password = '';
		if (result.account) selectedId.value = result.account.id;
		await refresh();
		syncSettings(selected.value);
	} catch (e: any) {
		Message.error(String(e || '登录失败'));
	} finally {
		logging.value = false;
	}
}

function removeSelected() {
	if (!selected.value) return;
	Modal.confirm({
		title: '删除签到账号',
		content: `确定删除「${selected.value.name}」吗？同时会停止该账号的监听。`,
		onOk: async () => {
			await remote.methods.call('signinRemove', selectedId.value);
			selectedId.value = '';
			await refresh();
		}
	});
}

async function checkActivity() {
	if (!selected.value) return;
	checking.value = true;
	checkMessage.value = '';
	activity.value = null;
	try {
		const result = await remote.methods.call('signinCheck', selectedId.value);
		const data = result as CheckResult;
		if (data.code === 'activity') {
			activity.value = data.activity;
			Message.success(`检测到签到：${data.typeName}`);
		} else {
			checkMessage.value = data.message;
		}
	} catch (e: any) {
		checkMessage.value = String(e || '检测失败');
	} finally {
		checking.value = false;
		await refresh();
	}
}

async function signNow() {
	if (!selected.value || !activity.value) return;
	signing.value = true;
	try {
		const result = await remote.methods.call('signinSign', selectedId.value, activity.value, { type: 'auto' });
		if (result.ok) {
			Message.success(result.message);
			activity.value = null;
		} else {
			Message.warning(result.message);
		}
	} catch (e: any) {
		Message.error(String(e || '签到失败'));
	} finally {
		signing.value = false;
		await refresh();
	}
}

async function toggleMonitor(start: boolean) {
	if (!selected.value) return;
	try {
		if (start) {
			await saveSettings(true);
			const result = await remote.methods.call('signinStartMonitor', selectedId.value);
			Message.info(result.message);
		} else {
			await remote.methods.call('signinStopMonitor', selectedId.value);
			Message.info('已停止监听');
		}
	} catch (e: any) {
		Message.error(String(e || '操作失败'));
	} finally {
		await refresh();
	}
}

async function choosePhoto() {
	try {
		const filePath = await remote.methods.call('signinChoosePhoto');
		if (filePath) {
			settings.photoPath = filePath;
			await saveSettings(true);
			Message.success('已选择签到图片');
		}
	} catch (e: any) {
		Message.error(String(e || '选择图片失败'));
	}
}

function addPreset() {
	settings.presetAddress.push({ lon: '', lat: '', address: '' });
}

function removePreset(index: number) {
	settings.presetAddress.splice(index, 1);
}

const pickerLon = computed(() => {
	if (pickerTarget.value === 'main') return settings.lon;
	const item = settings.presetAddress[pickerTarget.value];
	return item ? item.lon : '';
});

const pickerLat = computed(() => {
	if (pickerTarget.value === 'main') return settings.lat;
	const item = settings.presetAddress[pickerTarget.value];
	return item ? item.lat : '';
});

const pickerAddress = computed(() => {
	if (pickerTarget.value === 'main') return settings.address;
	const item = settings.presetAddress[pickerTarget.value];
	return item ? item.address : '';
});

function openPicker(target: 'main' | number) {
	pickerTarget.value = target;
	showPicker.value = true;
}

function onPickLocation(value: { lon: string; lat: string; system: CoordSystem; address?: string }) {
	if (pickerTarget.value === 'main') {
		settings.lon = value.lon;
		settings.lat = value.lat;
		if (value.address) settings.address = value.address;
		return;
	}
	const item = settings.presetAddress[pickerTarget.value];
	if (item) {
		item.lon = value.lon;
		item.lat = value.lat;
		if (value.address) item.address = value.address;
	}
}

async function saveSettings(silent = false) {
	if (!selected.value) return;
	saving.value = !silent;
	try {
		const view = await remote.methods.call('signinUpdateConfig', selectedId.value, {
			interval: settings.interval,
			duration: settings.duration,
			delay: settings.delay,
			im: settings.im,
			autoSign: settings.autoSign,
			address: {
				lon: settings.lon,
				lat: settings.lat,
				address: settings.address,
				altitude: settings.altitude || '0'
			},
			presetAddress: settings.presetAddress.map((item) => ({
				lon: String(item.lon || ''),
				lat: String(item.lat || ''),
				address: String(item.address || ''),
				altitude: '0'
			})),
			photoPath: settings.photoPath,
			qrcodeEnc: settings.qrcodeEnc
		});
		if (view) {
			const index = accounts.value.findIndex((item) => item.id === view.id);
			if (index >= 0) accounts.value[index] = view;
			// 主进程会修正越界的数值（如间隔 <10），这里回填避免界面显示与实际配置不一致
			syncSettings(view);
		}
		if (!silent) Message.success('设置已保存');
	} catch (e: any) {
		Message.error(String(e || '保存失败'));
	} finally {
		saving.value = false;
	}
}

async function toggleAutoSign(value: boolean) {
	if (!selected.value) return;
	try {
		// 只提交开关本身，避免把表单里其它还没保存的改动一起写进去
		const view = await remote.methods.call('signinUpdateConfig', selectedId.value, { autoSign: value });
		if (view) {
			const index = accounts.value.findIndex((item) => item.id === view.id);
			if (index >= 0) accounts.value[index] = view;
		}
		Message.success(value ? '已开启自动签到' : '已关闭自动签到，仍可手动签到');
	} catch (e: any) {
		Message.error(String(e || '保存失败'));
		settings.autoSign = !!selected.value?.config.autoSign;
	}
}

async function clearLogs() {
	if (!selected.value) return;
	await remote.methods.call('signinClearLogs', selectedId.value);
	await refresh();
}

watch(selectedId, () => syncSettings(selected.value));

onMounted(async () => {
	await refresh();
	pollTimer = setInterval(() => {
		if (document.visibilityState === 'visible') void refresh();
	}, 2000);
});

onUnmounted(() => {
	if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped lang="less">
.signin-panel {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.panel-head {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.account-select {
	width: 260px;
}

.panel-card {
	border: 1px solid var(--color-border-2);
	border-radius: 8px;
	background: var(--color-bg-2);
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.card-title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	font-size: 14px;
	font-weight: 600;
	color: var(--color-text-1);
}

.card-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.hint {
	font-size: 12px;
	color: var(--color-text-3);
}

.activity-box {
	border: 1px dashed var(--color-border-2);
	border-radius: 6px;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.activity-name {
	font-size: 15px;
	font-weight: 600;
	color: var(--color-text-1);
}

.activity-meta {
	display: flex;
	align-items: center;
	gap: 8px;
}

.form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.form-item {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 12px;
	color: var(--color-text-2);
}

.form-item.span-2 {
	grid-column: span 2;
}

.row-inline {
	display: flex;
	align-items: center;
	gap: 8px;
}

.preset-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.coord {
	width: 116px;
	flex: none;
}

.grow {
	flex: 1;
}

.log-list {
	max-height: 280px;
	overflow: auto;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.log-item {
	display: flex;
	gap: 8px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--color-text-2);
}

.log-time {
	color: var(--color-text-3);
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.log-item.success .log-message {
	color: rgb(var(--green-6));
}

.log-item.warn .log-message {
	color: rgb(var(--orange-6));
}

.log-item.error .log-message {
	color: rgb(var(--red-6));
}

.mt-8 {
	margin-top: 8px;
}
</style>
