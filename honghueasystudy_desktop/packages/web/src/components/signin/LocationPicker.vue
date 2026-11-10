<template>
	<a-modal
		v-model:visible="innerVisible"
		title="地图选点"
		:width="880"
		:footer="false"
		unmount-on-close
	>
		<div class="picker">
			<div class="search-bar">
				<a-input-search
					v-model="keyword"
					size="small"
					placeholder="搜索地点，例如：清华大学、北京南站"
					:loading="searching"
					search-button
					allow-clear
					class="search-input"
					@search="doSearch"
				/>
				<span class="label">搜索结果来自 OpenStreetMap，冷门地点可能搜不到，可直接在地图上点选</span>
			</div>

			<div
				v-if="searching || results.length || searchHint"
				class="search-results"
			>
				<div
					v-if="searching"
					class="search-tip"
				>
					<a-spin :size="14" />
					<span>正在搜索…</span>
				</div>
				<template v-else-if="results.length">
					<div
						v-for="(item, index) in results"
						:key="`${item.lon}-${item.lat}-${index}`"
						class="search-item"
						@click="applyResult(item)"
					>
						<div class="search-name">{{ item.name }}</div>
						<div
							v-if="item.address"
							class="search-address"
						>
							{{ item.address }}
						</div>
					</div>
				</template>
				<div
					v-else
					class="search-tip"
				>
					{{ searchHint }}
				</div>
			</div>

			<div class="toolbar">
				<div class="toolbar-item">
					<span class="label">坐标类型</span>
					<a-select
						v-model="system"
						size="small"
						style="width: 220px"
					>
						<a-option value="bd09">BD-09（百度拾取器）</a-option>
						<a-option value="gcj02">GCJ-02（高德 / 腾讯 / 超星）</a-option>
						<a-option value="wgs84">WGS-84（GPS / 地图底图）</a-option>
					</a-select>
				</div>
				<div class="toolbar-item">
					<span class="label">底图</span>
					<a-radio-group
						v-model="tileSource"
						type="button"
						size="small"
					>
						<a-radio value="amap">中文地图</a-radio>
						<a-radio value="amapSat">卫星影像</a-radio>
						<a-radio value="esri">英文备用</a-radio>
					</a-radio-group>
				</div>
				<a-button
					size="small"
					:disabled="!raw.valid"
					@click="locateCurrent"
				>
					定位到已填坐标
				</a-button>
			</div>

			<div class="map-wrap">
				<div
					ref="mapEl"
					class="map"
				></div>
				<div
					v-if="loading"
					class="map-mask"
				>
					<a-spin :size="18" />
					<span>正在加载{{ tileLabel }}…</span>
				</div>
				<div
					v-else-if="failed"
					class="map-mask failed"
				>
					<span>{{ tileLabel }}加载失败，请检查网络</span>
					<a-button
						size="mini"
						@click="reloadTiles"
						>重试</a-button
					>
					<a-button
						v-if="tileSource !== 'esri'"
						size="mini"
						@click="useFallback"
					>
						切换英文备用
					</a-button>
				</div>
			</div>

			<div class="footer">
				<div class="readout">
					<div class="line">
						<span class="label">回填坐标</span>
						<span class="value">
							{{ raw.valid ? `${draft.lon}, ${draft.lat}` : '尚未选点，点击地图或拖动标记' }}
						</span>
						<span class="label">{{ coordSystemLabel(system) }}</span>
					</div>
					<div
						v-if="raw.valid"
						class="line sub"
					>
						底图坐标（WGS-84）：{{ rawText.lon }}, {{ rawText.lat }}
					</div>
					<div
						v-if="pickedAddress || reverseLoading"
						class="line sub"
					>
						<span class="label">地址</span>
						<span>{{ reverseLoading ? '识别中…' : pickedAddress }}</span>
					</div>
					<div class="line sub">
						点地图任意位置或拖动标记选点；坐标会按上方类型换算后回填到签到设置。 若签到提示「不在签到范围」，优先在
						BD-09 / GCJ-02 之间切换后重试。
					</div>
				</div>
				<div class="actions">
					<a-button
						size="small"
						@click="innerVisible = false"
						>取消</a-button
					>
					<a-button
						size="small"
						type="primary"
						:disabled="!raw.valid"
						@click="onConfirm"
					>
						使用这个位置
					</a-button>
				</div>
			</div>
		</div>
	</a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CoordSystem, coordSystemLabel, formatCoord, fromWgs84, toWgs84 } from '../../utils/coord';
import { GeoPlace, reversePlace, searchPlaces } from '../../utils/geocode';

const props = defineProps<{
	visible: boolean;
	lon?: string;
	lat?: string;
	address?: string;
}>();

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void;
	(e: 'confirm', value: { lon: string; lat: string; system: CoordSystem; address?: string }): void;
}>();

type TileKind = 'amap' | 'amapSat' | 'esri';

interface TileConfig {
	url: string;
	subdomains?: string[];
	maxZoom: number;
	/** 该底图自身的坐标系，决定点击取点后要怎么换算 */
	crs: CoordSystem;
	attribution: string;
}

const TILES: Record<TileKind, TileConfig> = {
	amap: {
		url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
		subdomains: ['1', '2', '3', '4'],
		maxZoom: 18,
		crs: 'gcj02',
		attribution: '&copy; 高德地图'
	},
	amapSat: {
		url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
		subdomains: ['1', '2', '3', '4'],
		maxZoom: 18,
		crs: 'gcj02',
		attribution: '&copy; 高德地图'
	},
	esri: {
		url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
		maxZoom: 19,
		crs: 'wgs84',
		attribution: 'Tiles &copy; Esri'
	}
};

const CENTER_KEY = 'signin-location-picker-center';
const SYSTEM_KEY = 'signin-location-picker-system';
const TILE_KEY = 'signin-location-picker-tile';

const innerVisible = computed({
	get: () => props.visible,
	set: (value) => emit('update:visible', value)
});

const system = ref<CoordSystem>(readSystem());
const tileSource = ref<TileKind>(readTile());
const keyword = ref('');
const results = ref<GeoPlace[]>([]);
const searchHint = ref('');
const searching = ref(false);
const pickedAddress = ref('');
const reverseLoading = ref(false);
const loading = ref(false);
const failed = ref(false);
const draft = reactive({ lon: '', lat: '' });
const raw = reactive({ valid: false, lon: 0, lat: 0 });
const rawText = reactive({ lon: '', lat: '' });
const mapEl = ref<HTMLElement | null>(null);

let mapInstance: L.Map | null = null;
let marker: L.Marker | null = null;
let tileLayer: L.TileLayer | null = null;
let tileErrorCount = 0;
let fallbackUsed = false;
let persistTile = true;
let loadTimer: any = null;
let reverseTimer: any = null;
let reverseSeq = 0;
let searchSeq = 0;

const tileLabel = computed(() => {
	if (tileSource.value === 'amapSat') return '卫星影像';
	if (tileSource.value === 'esri') return '英文备用底图';
	return '中文地图';
});

const markerHtml =
	'<span style="display:block;width:12px;height:12px;border-radius:50%;' +
	'background:#165DFF;border:3px solid #FFFFFF;box-shadow:0 0 0 2px rgba(22,93,255,0.35)"></span>';

function readSystem(): CoordSystem {
	const value = localStorage.getItem(SYSTEM_KEY);
	// 取点教程常见做法是百度拾取器（BD-09），默认保持一致
	if (value === 'wgs84' || value === 'gcj02' || value === 'bd09') return value;
	return 'bd09';
}

function readTile(): TileKind {
	const value = localStorage.getItem(TILE_KEY);
	// 旧版本存的是 street / satellite / osm，统一迁移到中文底图
	if (value === 'amap' || value === 'amapSat' || value === 'esri') return value;
	return 'amap';
}

function tileCrs(): CoordSystem {
	return TILES[tileSource.value].crs;
}

function parseCoord(lon?: string, lat?: string): [number, number] | null {
	const lonValue = Number(lon);
	const latValue = Number(lat);
	if (!lon || !lat) return null;
	if (!Number.isFinite(lonValue) || !Number.isFinite(latValue)) return null;
	if (Math.abs(lonValue) > 180 || Math.abs(latValue) > 90) return null;
	// 0,0 基本只会是占位值，按未填写处理
	if (lonValue === 0 && latValue === 0) return null;
	return [lonValue, latValue];
}

function readSavedCenter(): [number, number] | null {
	try {
		const value = JSON.parse(localStorage.getItem(CENTER_KEY) || 'null');
		if (!value) return null;
		const lon = Number(value.lon);
		const lat = Number(value.lat);
		if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
		if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
		return [lon, lat];
	} catch {
		return null;
	}
}

function saveCenter(lon: number, lat: number) {
	try {
		localStorage.setItem(CENTER_KEY, JSON.stringify({ lon, lat }));
	} catch {
		// 存储不可用时忽略，只是下次打开不记得上次位置
	}
}

function updateDraft() {
	if (!raw.valid) {
		draft.lon = '';
		draft.lat = '';
		return;
	}
	const [lon, lat] = fromWgs84(raw.lon, raw.lat, system.value);
	draft.lon = formatCoord(lon);
	draft.lat = formatCoord(lat);
}

/** WGS-84 坐标 → 当前底图上的经纬度 */
function toMarkerLatLng(lon: number, lat: number): [number, number] {
	const [mapLon, mapLat] = fromWgs84(lon, lat, tileCrs());
	return [mapLat, mapLon];
}

/**
 * 写入选中点
 *
 * 内部统一存 WGS-84，展示和取点都按当前底图坐标系换算，切换底图时标记才不会偏移。
 */
function setRaw(lon: number, lat: number, center = false, address?: string, resolveAddress = false) {
	raw.valid = true;
	raw.lon = lon;
	raw.lat = lat;
	rawText.lon = formatCoord(lon);
	rawText.lat = formatCoord(lat);
	updateDraft();

	if (address !== undefined) pickedAddress.value = address;
	if (resolveAddress) scheduleReverse(lon, lat);

	if (!mapInstance) return;
	const [mapLat, mapLon] = toMarkerLatLng(lon, lat);
	if (!marker) {
		marker = L.marker([mapLat, mapLon], {
			draggable: true,
			icon: L.divIcon({ className: 'signin-location-marker', html: markerHtml, iconSize: [18, 18], iconAnchor: [9, 9] })
		}).addTo(mapInstance);
		marker.on('dragend', () => {
			const point = marker?.getLatLng();
			if (point) setFromTile(point.lng, point.lat, false, true);
		});
	} else {
		marker.setLatLng([mapLat, mapLon]);
	}
	if (center) mapInstance.setView([mapLat, mapLon], Math.max(mapInstance.getZoom(), 16));
}

/** 底图坐标系下的经纬度 → 内部 WGS-84 */
function setFromTile(lon: number, lat: number, center = false, resolveAddress = false) {
	const [wgsLon, wgsLat] = toWgs84(lon, lat, tileCrs());
	setRaw(wgsLon, wgsLat, center, undefined, resolveAddress);
}

function clearRaw() {
	raw.valid = false;
	raw.lon = 0;
	raw.lat = 0;
	rawText.lon = '';
	rawText.lat = '';
	draft.lon = '';
	draft.lat = '';
}

/** 选点后逆解析地址，失败就保持空，不影响回填坐标 */
function scheduleReverse(lon: number, lat: number) {
	const seq = ++reverseSeq;
	clearTimeout(reverseTimer);
	pickedAddress.value = '';
	reverseLoading.value = true;
	reverseTimer = setTimeout(async () => {
		const text = await reversePlace(lon, lat);
		if (seq !== reverseSeq) return;
		pickedAddress.value = text;
		reverseLoading.value = false;
	}, 400);
}

function stopReverse() {
	reverseSeq += 1;
	reverseLoading.value = false;
	clearTimeout(reverseTimer);
}

function applyTile() {
	if (!mapInstance) return;
	if (tileLayer) {
		mapInstance.removeLayer(tileLayer);
		tileLayer = null;
	}
	const config = TILES[tileSource.value];
	tileErrorCount = 0;
	failed.value = false;
	loading.value = true;
	clearTimeout(loadTimer);

	mapInstance.setMaxZoom(config.maxZoom);
	if (mapInstance.getZoom() > config.maxZoom) mapInstance.setZoom(config.maxZoom);

	const layer = L.tileLayer(config.url, {
		subdomains: config.subdomains || 'abc',
		maxZoom: config.maxZoom,
		attribution: config.attribution
	});
	tileLayer = layer;
	// 只有首屏加载才盖遮罩，之后平移时瓦片是渐进出现的，再盖一层会一直闪
	let firstLoaded = false;

	layer.on('loading', () => {
		if (layer !== tileLayer || firstLoaded) return;
		loading.value = true;
	});
	layer.on('load', () => {
		if (layer !== tileLayer) return;
		firstLoaded = true;
		loading.value = false;
		failed.value = false;
		tileErrorCount = 0;
		clearTimeout(loadTimer);
	});
	layer.on('tileerror', () => {
		if (layer !== tileLayer || firstLoaded) return;
		tileErrorCount += 1;
		// 少量瓦片失败通常是局部缺失，连续失败才认为底图整体不可用
		if (tileErrorCount < 8) return;
		loading.value = false;
		failed.value = true;
		if (!fallbackUsed && tileSource.value !== 'esri') {
			fallbackUsed = true;
			Message.warning('当前底图加载失败，已切换到英文备用底图');
			// 自动降级不写入偏好，下次打开仍优先用中文底图
			persistTile = false;
			tileSource.value = 'esri';
		}
	});
	layer.addTo(mapInstance);

	// 首屏 15 秒还没有任何瓦片完成，给出可操作的重试入口
	loadTimer = setTimeout(() => {
		if (layer !== tileLayer) return;
		if (loading.value) {
			loading.value = false;
			failed.value = true;
		}
	}, 15000);
}

function reloadTiles() {
	applyTile();
}

function useFallback() {
	tileSource.value = 'esri';
}

function initMap() {
	if (!mapEl.value || mapInstance) return;
	mapInstance = L.map(mapEl.value, {
		// 默认缩放按钮的提示是英文，这里自己加一个中文的
		zoomControl: false,
		attributionControl: true,
		minZoom: 3,
		maxZoom: TILES[tileSource.value].maxZoom
	}).setView([39.90923, 116.397428], 12);
	L.control.zoom({ zoomInTitle: '放大', zoomOutTitle: '缩小' }).addTo(mapInstance);

	applyTile();

	mapInstance.on('click', (event: L.LeafletMouseEvent) => {
		setFromTile(event.latlng.lng, event.latlng.lat, false, true);
	});

	// 每次打开都按当前填写的坐标重新定位，避免沿用上次的标记
	results.value = [];
	searchHint.value = '';
	keyword.value = '';
	pickedAddress.value = props.address || '';
	stopReverse();

	const initial = parseCoord(props.lon, props.lat);
	if (initial) {
		const [lon, lat] = toWgs84(initial[0], initial[1], system.value);
		setRaw(lon, lat, true, props.address || '');
	} else {
		clearRaw();
		const saved = readSavedCenter();
		if (saved) {
			const [mapLat, mapLon] = toMarkerLatLng(saved[0], saved[1]);
			mapInstance.setView([mapLat, mapLon], 14);
		}
	}

	// 弹窗有打开动画，容器尺寸确定后再算一次，否则瓦片可能只铺一半
	const timer = setInterval(() => {
		if (!mapInstance) {
			clearInterval(timer);
			return;
		}
		mapInstance.invalidateSize();
	}, 200);
	setTimeout(() => clearInterval(timer), 1200);
}

function destroyMap() {
	stopReverse();
	clearTimeout(loadTimer);
	tileLayer = null;
	if (mapInstance) {
		const center = mapInstance.getCenter();
		if (Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
			const [lon, lat] = toWgs84(center.lng, center.lat, tileCrs());
			saveCenter(lon, lat);
		}
		mapInstance.remove();
	}
	mapInstance = null;
	marker = null;
}

function locateCurrent() {
	if (!mapInstance || !raw.valid) {
		Message.info('还没有可用的坐标，直接在地图上点选即可');
		return;
	}
	const [mapLat, mapLon] = toMarkerLatLng(raw.lon, raw.lat);
	mapInstance.setView([mapLat, mapLon], 16);
}

async function doSearch() {
	const text = keyword.value.trim();
	if (!text) {
		Message.info('请输入要搜索的地点');
		return;
	}
	const seq = ++searchSeq;
	searching.value = true;
	searchHint.value = '';
	results.value = [];
	try {
		let bias: { lon: number; lat: number } | undefined;
		if (mapInstance) {
			const center = mapInstance.getCenter();
			const [lon, lat] = toWgs84(center.lng, center.lat, tileCrs());
			bias = { lon, lat };
		}
		const list = await searchPlaces(text, bias);
		if (seq !== searchSeq) return;
		results.value = list;
		if (!list.length) searchHint.value = '没有找到匹配地点，换个关键词试试';
	} catch (e: any) {
		if (seq !== searchSeq) return;
		searchHint.value = String(e?.message || '搜索失败，请稍后重试');
	} finally {
		if (seq === searchSeq) searching.value = false;
	}
}

function applyResult(item: GeoPlace) {
	results.value = [];
	searchHint.value = '';
	keyword.value = item.name;
	setRaw(item.lon, item.lat, true, item.address || '');
}

function onConfirm() {
	if (!raw.valid) {
		Message.warning('请先在地图上选择位置');
		return;
	}
	emit('confirm', {
		lon: draft.lon,
		lat: draft.lat,
		system: system.value,
		address: pickedAddress.value || undefined
	});
	innerVisible.value = false;
}

watch(
	() => props.visible,
	async (visible) => {
		if (!visible) {
			destroyMap();
			return;
		}
		fallbackUsed = false;
		// 每次打开都按当前填写的坐标重新定位，避免沿用上次的标记
		await nextTick();
		// 打开动画还没结束就被关掉时，mapEl 已经不存在，直接跳过
		if (!props.visible) return;
		initMap();
	},
	// 组件挂载时就处于打开状态（例如被 keep-alive / 复用）也要初始化地图
	{ immediate: true }
);

/**
 * 弹窗内容是在打开时才渲染的，visible 刚变 true 时 ref 可能还没挂上。
 * 以 ref 真正绑定为准，能覆盖「挂载即打开」和「运行中打开」两种情况。
 */
watch(
	mapEl,
	(element) => {
		if (element) initMap();
		else destroyMap();
	},
	{ flush: 'post' }
);

watch(system, (value) => {
	try {
		localStorage.setItem(SYSTEM_KEY, value);
	} catch {
		// 忽略存储失败
	}
	updateDraft();
});

watch(tileSource, (value, oldValue) => {
	if (persistTile) {
		try {
			localStorage.setItem(TILE_KEY, value);
		} catch {
			// 忽略存储失败
		}
	}
	persistTile = true;
	if (!mapInstance) return;
	// 先按旧底图坐标系记下中心点，换底图后再换算回来
	const center = mapInstance.getCenter();
	const [centerLon, centerLat] = toWgs84(center.lng, center.lat, TILES[oldValue].crs);
	applyTile();
	if (raw.valid) {
		const [mapLat, mapLon] = toMarkerLatLng(raw.lon, raw.lat);
		if (marker) {
			marker.setLatLng([mapLat, mapLon]);
		}
	}
	const [nextLat, nextLon] = toMarkerLatLng(centerLon, centerLat);
	mapInstance.setView([nextLat, nextLon], mapInstance.getZoom(), { animate: false });
});
</script>

<style scoped lang="less">
.picker {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.search-bar {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.search-input {
	width: 320px;
	flex: none;
}

.search-results {
	max-height: 180px;
	overflow-y: auto;
	border: 1px solid var(--color-border-2);
	border-radius: 8px;
	background: var(--color-bg-2);
	padding: 4px;
}

.search-item {
	padding: 6px 8px;
	border-radius: 6px;
	cursor: pointer;
	transition: background 0.15s;

	&:hover {
		background: var(--color-fill-2);
	}
}

.search-name {
	font-size: 13px;
	color: var(--color-text-1);
}

.search-address {
	font-size: 12px;
	color: var(--color-text-3);
	margin-top: 2px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.search-tip {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px;
	font-size: 12px;
	color: var(--color-text-3);
}

.toolbar {
	display: flex;
	align-items: center;
	gap: 16px;
	flex-wrap: wrap;
}

.toolbar-item {
	display: flex;
	align-items: center;
	gap: 8px;
}

.label {
	font-size: 12px;
	color: var(--color-text-3);
}

.map-wrap {
	position: relative;
	width: 100%;
	height: 400px;
	border-radius: 8px;
	overflow: hidden;
	background: var(--color-fill-2);
}

.map {
	width: 100%;
	height: 100%;
}

.map-mask {
	position: absolute;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	font-size: 13px;
	color: var(--color-text-2);
	background: var(--color-bg-2);
	pointer-events: none;

	&.failed {
		pointer-events: auto;
		flex-wrap: wrap;
		padding: 0 24px;
	}
}

.footer {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
}

.readout {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.line {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--color-text-2);
	flex-wrap: wrap;
}

.line.sub {
	color: var(--color-text-3);
}

.value {
	font-variant-numeric: tabular-nums;
	color: var(--color-text-1);
	font-weight: 600;
}

.actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: none;
}

:deep(.signin-location-marker) {
	background: transparent;
	border: none;
}
</style>
