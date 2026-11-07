<template>
	<div
		v-if="visible"
		class="mask"
		@click.self="close"
	>
		<section
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label="地图选点"
		>
			<header class="head">
				<div class="head__text">
					<h2>地图选点</h2>
					<p class="faint">点地图或搜索地点，坐标换算后自动回填</p>
				</div>
				<button
					type="button"
					class="close-btn"
					aria-label="关闭"
					@click="close"
				>
					<Icon
						name="close"
						:size="17"
					/>
				</button>
			</header>

			<div class="search-wrap">
				<div class="search-bar">
					<input
						v-model="keyword"
						class="search-input"
						type="search"
						enterkeyhint="search"
						placeholder="搜索地点，例如：清华大学、北京南站"
						@keyup.enter="doSearch"
					/>
					<button
						type="button"
						class="btn btn-sm btn-primary search-btn"
						:disabled="searching"
						@click="doSearch"
					>
						{{ searching ? '搜索中…' : '搜索' }}
					</button>
				</div>

				<div
					v-if="searching || results.length || searchHint"
					class="results"
				>
					<p
						v-if="searching"
						class="result-tip faint"
					>
						正在搜索…
					</p>
					<template v-else-if="results.length">
						<button
							v-for="(item, index) in results"
							:key="`${item.lon}-${item.lat}-${index}`"
							type="button"
							class="result"
							@click="applyResult(item)"
						>
							<strong class="result__name ellipsis">{{ item.name }}</strong>
							<span
								v-if="item.address"
								class="result__addr faint ellipsis"
							>
								{{ item.address }}
							</span>
						</button>
					</template>
					<p
						v-else
						class="result-tip faint"
					>
						{{ searchHint }}
					</p>
				</div>
			</div>

			<div class="toolbar">
				<label class="tool">
					<span class="tool__label">坐标类型</span>
					<select
						v-model="system"
						class="select"
					>
						<option value="bd09">BD-09（百度拾取器）</option>
						<option value="gcj02">GCJ-02（高德 / 腾讯 / 超星）</option>
						<option value="wgs84">WGS-84（GPS / 底图）</option>
					</select>
				</label>
				<div
					class="tiles"
					role="group"
					aria-label="底图"
				>
					<button
						v-for="item in TILE_OPTIONS"
						:key="item.value"
						type="button"
						class="tile"
						:class="{ on: tileSource === item.value }"
						@click="tileSource = item.value"
					>
						{{ item.label }}
					</button>
				</div>
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
					<span class="spinner"></span>
					<span>正在加载{{ tileLabel }}…</span>
				</div>
				<div
					v-else-if="failed"
					class="map-mask map-mask--failed"
				>
					<span>{{ tileLabel }}加载失败，请检查网络</span>
					<div class="map-mask__actions">
						<button
							type="button"
							class="btn btn-sm"
							@click="reloadTiles"
						>
							重试
						</button>
						<button
							v-if="tileSource !== 'esri'"
							type="button"
							class="btn btn-sm"
							@click="useFallback"
						>
							切换英文备用
						</button>
					</div>
				</div>
			</div>

			<footer class="foot">
				<div class="readout">
					<div class="line">
						<span class="faint">回填坐标</span>
						<strong class="num line__value ellipsis">
							{{ raw.valid ? `${draft.lon}, ${draft.lat}` : '未选点，点击地图' }}
						</strong>
						<span class="chip">{{ systemShort }}</span>
					</div>
					<p
						v-if="raw.valid"
						class="line-sub faint num"
					>
						底图 WGS-84：{{ rawText.lon }}, {{ rawText.lat }}
					</p>
					<p
						v-if="pickedAddress || reverseLoading"
						class="line-sub"
					>
						<span class="faint">地址</span>
						<span>{{ reverseLoading ? '识别中…' : pickedAddress }}</span>
					</p>
					<p
						v-if="raw.valid"
						class="line-sub faint"
					>
						拖动标记可微调；若签到提示「不在签到范围」，把坐标类型换成 GCJ-02 再试。
					</p>
				</div>
				<div class="actions">
					<button
						v-if="raw.valid"
						type="button"
						class="btn btn-sm btn-ghost actions__locate"
						@click="locateCurrent"
					>
						回到标记
					</button>
					<button
						type="button"
						class="btn btn-sm"
						@click="close"
					>
						取消
					</button>
					<button
						type="button"
						class="btn btn-sm btn-primary"
						:disabled="!raw.valid"
						@click="onConfirm"
					>
						使用这个位置
					</button>
				</div>
			</footer>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from './Icon.vue';
import { toast } from '../store';
import { type CoordSystem, formatCoord, fromWgs84, toWgs84 } from '../utils/coord';
import { type GeoPlace, reversePlace, searchPlaces } from '../utils/geocode';

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

const TILE_OPTIONS: Array<{ value: TileKind; label: string }> = [
	{ value: 'amap', label: '中文地图' },
	{ value: 'amapSat', label: '卫星影像' },
	{ value: 'esri', label: '英文备用' }
];

const CENTER_KEY = 'signin-location-picker-center';
const SYSTEM_KEY = 'signin-location-picker-system';
const TILE_KEY = 'signin-location-picker-tile';

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
let sizeTimer: any = null;

/** 坐标类型只影响展示与回填，短标签避免挤占底部一行 */
const systemShort = computed(() => {
	if (system.value === 'bd09') return 'BD-09';
	if (system.value === 'gcj02') return 'GCJ-02';
	return 'WGS-84';
});

const tileLabel = computed(() => {
	if (tileSource.value === 'amapSat') return '卫星影像';
	if (tileSource.value === 'esri') return '英文备用底图';
	return '中文地图';
});

const markerHtml =
	'<span style="display:block;width:12px;height:12px;border-radius:50%;' +
	'background:#7c6cff;border:3px solid #FFFFFF;box-shadow:0 0 0 2px rgba(124,108,255,0.45)"></span>';

function readSystem(): CoordSystem {
	try {
		const value = localStorage.getItem(SYSTEM_KEY);
		// 取点教程常见做法是百度拾取器（BD-09），默认保持一致
		if (value === 'wgs84' || value === 'gcj02' || value === 'bd09') return value;
	} catch {
		// 隐私模式等场景可能禁用存储，直接用默认值
	}
	return 'bd09';
}

function readTile(): TileKind {
	try {
		const value = localStorage.getItem(TILE_KEY);
		// 旧版本存的是 street / satellite / osm，统一迁移到中文底图
		if (value === 'amap' || value === 'amapSat' || value === 'esri') return value;
	} catch {
		// 忽略存储失败
	}
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
			icon: L.divIcon({
				className: 'signin-location-marker',
				html: markerHtml,
				iconSize: [18, 18],
				iconAnchor: [9, 9]
			})
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
			toast('当前底图加载失败，已切换到英文备用底图', 'info');
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

	// 移动端软键盘 / 横竖屏切换会改变容器尺寸，多次修正才能铺满
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
	clearTimeout(sizeTimer);
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
		toast('还没有可用的坐标，直接在地图上点选即可', 'info');
		return;
	}
	const [mapLat, mapLon] = toMarkerLatLng(raw.lon, raw.lat);
	mapInstance.setView([mapLat, mapLon], 16);
}

async function doSearch() {
	const text = keyword.value.trim();
	if (!text) {
		toast('请输入要搜索的地点', 'info');
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

function close() {
	emit('update:visible', false);
}

function onConfirm() {
	if (!raw.valid) {
		toast('请先在地图上选择位置', 'info');
		return;
	}
	emit('confirm', {
		lon: draft.lon,
		lat: draft.lat,
		system: system.value,
		address: pickedAddress.value || undefined
	});
	close();
}

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

/** 横竖屏 / 软键盘弹出后地图容器会变高变窄，重新测量才能铺满 */
function onResize() {
	clearTimeout(sizeTimer);
	sizeTimer = setTimeout(() => {
		if (mapInstance) mapInstance.invalidateSize();
	}, 200);
}

onMounted(async () => {
	await nextTick();
	initMap();
	window.addEventListener('resize', onResize);
	window.addEventListener('orientationchange', onResize);
});

onBeforeUnmount(() => {
	window.removeEventListener('resize', onResize);
	window.removeEventListener('orientationchange', onResize);
	destroyMap();
});
</script>

<style scoped>
.mask {
	position: fixed;
	inset: 0;
	z-index: 90;
	display: flex;
	align-items: stretch;
	background: var(--overlay);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	overscroll-behavior: contain;
	animation: fade-in 0.2s var(--ease);
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.sheet {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: calc(var(--safe-top) + 12px) 14px calc(var(--safe-bottom) + 12px);
	background: var(--sheet-bg);
	overflow: hidden;
	animation: slide-up 0.28s var(--ease);
}

@keyframes slide-up {
	from {
		transform: translateY(18px);
		opacity: 0.6;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}

.head {
	display: flex;
	align-items: flex-start;
	gap: 10px;
}

.head__text {
	flex: 1;
	min-width: 0;
}

.head__text h2 {
	margin: 0;
	font-size: 17px;
	font-weight: 650;
	letter-spacing: -0.01em;
}

.head__text p {
	margin: 2px 0 0;
	font-size: 11.5px;
}

.close-btn {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	flex: none;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--surface);
	color: var(--text-2);
	transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.close-btn:hover {
	background: var(--surface-2);
	color: var(--text);
}

/* ------------------------------------------------------------------ 搜索 */

.search-wrap {
	position: relative;
	z-index: 12;
}

.search-bar {
	display: flex;
	align-items: center;
	gap: 8px;
}

.search-input {
	width: 100%;
	min-width: 0;
	height: 38px;
	padding: 0 12px;
	border-radius: 11px;
	border: 1px solid var(--line);
	background: var(--surface-solid);
	color: var(--text);
	font-size: 13px;
	outline: none;
	-webkit-appearance: none;
	appearance: none;
	transition: border-color 0.18s var(--ease);
}

.search-input:focus {
	border-color: var(--brand);
}

.search-input::placeholder {
	color: var(--text-3);
}

.search-btn {
	flex: none;
	height: 38px;
}

.results {
	position: absolute;
	left: 0;
	right: 0;
	top: calc(100% + 6px);
	max-height: 42vh;
	overflow-y: auto;
	padding: 4px;
	border-radius: 12px;
	border: 1px solid var(--line);
	background: var(--surface-solid);
	box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
}

.result {
	display: flex;
	flex-direction: column;
	gap: 2px;
	width: 100%;
	padding: 9px 10px;
	border-radius: 8px;
	text-align: left;
	color: var(--text);
	transition: background 0.16s var(--ease);
}

.result:hover,
.result:active {
	background: var(--surface-2);
}

.result__name {
	font-size: 13px;
	font-weight: 550;
}

.result__addr {
	font-size: 11.5px;
}

.result-tip {
	margin: 0;
	padding: 10px;
	font-size: 11.5px;
	text-align: center;
}

/* ------------------------------------------------------------------ 工具条 */

.toolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.tool {
	display: flex;
	align-items: center;
	gap: 6px;
	flex: 1;
	min-width: 0;
}

.tool__label {
	flex: none;
	font-size: 11.5px;
	color: var(--text-3);
}

.select {
	height: 32px;
	min-width: 0;
	flex: 1;
	padding: 0 8px;
	border-radius: 9px;
	border: 1px solid var(--line);
	background: var(--surface-solid);
	color: var(--text);
	font-size: 12px;
	outline: none;
}

.tiles {
	display: flex;
	gap: 4px;
	padding: 3px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--inset);
	flex: none;
}

.tile {
	height: 26px;
	padding: 0 9px;
	border-radius: 7px;
	font-size: 11.5px;
	color: var(--text-3);
	transition: background 0.16s var(--ease), color 0.16s var(--ease);
}

.tile.on {
	background: var(--brand-soft);
	color: var(--brand-text);
	font-weight: 550;
}

/* ------------------------------------------------------------------ 地图 */

.map-wrap {
	position: relative;
	z-index: 0;
	flex: 1;
	min-height: 0;
	border-radius: 14px;
	overflow: hidden;
	border: 1px solid var(--line);
	background: var(--surface-solid-2);
}

.map {
	width: 100%;
	height: 100%;
	z-index: 0;
}

.map-mask {
	position: absolute;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	font-size: 12px;
	color: var(--text-2);
	background: rgba(8, 9, 13, 0.5);
	pointer-events: none;
}

.map-mask--failed {
	flex-direction: column;
	pointer-events: auto;
	backdrop-filter: blur(3px);
	-webkit-backdrop-filter: blur(3px);
	text-align: center;
	padding: 14px;
}

.map-mask__actions {
	display: flex;
	gap: 8px;
}

.spinner {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	border: 2px solid rgba(255, 255, 255, 0.25);
	border-top-color: var(--brand);
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

:deep(.signin-location-marker) {
	background: transparent;
	border: none;
}

/* ------------------------------------------------------------------ 底部 */

.foot {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 12px;
	border: 1px solid var(--line);
	background: var(--inset);
}

.readout {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.line {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
}

.line__value {
	min-width: 0;
	font-size: 12.5px;
	font-weight: 600;
}

.chip {
	flex: none;
	height: 20px;
	padding: 0 7px;
	display: inline-flex;
	align-items: center;
	border-radius: 999px;
	border: 1px solid var(--line-brand);
	background: var(--brand-soft);
	color: var(--brand-text);
	font-size: 10.5px;
	font-weight: 550;
	white-space: nowrap;
}

.line-sub {
	margin: 0;
	font-size: 11.5px;
	line-height: 1.5;
	word-break: break-all;
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.actions__locate {
	margin-right: auto;
}

@media (min-width: 720px) {
	.mask {
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.sheet {
		width: min(720px, 100%);
		height: min(760px, 92vh);
		border-radius: 22px;
		border: 1px solid var(--line);
		padding: 16px 18px;
	}
}
</style>
