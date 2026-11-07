/**
 * 国内地图坐标系换算
 *
 * 超星移动端上报的经纬度一般是 GCJ-02（高德/腾讯那一套），而 OpenStreetMap 底图是
 * WGS-84，百度拾取器给出的又是 BD-09。三者在国内相差几十米到几百米，位置签到是按
 * 距离校验的，直接混用很容易被判成「不在签到范围」。
 */

export type CoordSystem = 'wgs84' | 'gcj02' | 'bd09';

const PI = Math.PI;
const X_PI = (PI * 3000) / 180;
const A = 6378245.0;
const EE = 0.00669342162296594323;

/** GCJ-02 只在国内有效，境外保持原值 */
function outOfChina(lon: number, lat: number) {
	return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lon: number, lat: number) {
	let ret = -100.0 + 2.0 * lon + 3.0 * lat + 0.2 * lat * lat + 0.1 * lon * lat + 0.2 * Math.sqrt(Math.abs(lon));
	ret += ((20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0) / 3.0;
	ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0;
	ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0;
	return ret;
}

function transformLon(lon: number, lat: number) {
	let ret = 300.0 + lon + 2.0 * lat + 0.1 * lon * lon + 0.1 * lon * lat + 0.1 * Math.sqrt(Math.abs(lon));
	ret += ((20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0) / 3.0;
	ret += ((20.0 * Math.sin(lon * PI) + 40.0 * Math.sin((lon / 3.0) * PI)) * 2.0) / 3.0;
	ret += ((150.0 * Math.sin((lon / 12.0) * PI) + 300.0 * Math.sin((lon / 30.0) * PI)) * 2.0) / 3.0;
	return ret;
}

export function wgs84ToGcj02(lon: number, lat: number): [number, number] {
	if (outOfChina(lon, lat)) return [lon, lat];
	let dLat = transformLat(lon - 105.0, lat - 35.0);
	let dLon = transformLon(lon - 105.0, lat - 35.0);
	const radLat = (lat / 180.0) * PI;
	let magic = Math.sin(radLat);
	magic = 1 - EE * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
	dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
	return [lon + dLon, lat + dLat];
}

/** 迭代求逆，比「整体减两倍偏移」更稳，误差在 1e-8 度以内 */
export function gcj02ToWgs84(lon: number, lat: number): [number, number] {
	let wgsLon = lon;
	let wgsLat = lat;
	for (let i = 0; i < 10; i++) {
		const [gcjLon, gcjLat] = wgs84ToGcj02(wgsLon, wgsLat);
		const dLon = gcjLon - lon;
		const dLat = gcjLat - lat;
		if (Math.abs(dLon) < 1e-9 && Math.abs(dLat) < 1e-9) break;
		wgsLon -= dLon;
		wgsLat -= dLat;
	}
	return [wgsLon, wgsLat];
}

export function gcj02ToBd09(lon: number, lat: number): [number, number] {
	const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
	const theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * X_PI);
	return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function bd09ToGcj02(lon: number, lat: number): [number, number] {
	const x = lon - 0.0065;
	const y = lat - 0.006;
	const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
	const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
	return [z * Math.cos(theta), z * Math.sin(theta)];
}

/** WGS-84（底图坐标）→ 指定坐标系 */
export function fromWgs84(lon: number, lat: number, system: CoordSystem): [number, number] {
	if (system === 'gcj02') return wgs84ToGcj02(lon, lat);
	if (system === 'bd09') {
		const [gcjLon, gcjLat] = wgs84ToGcj02(lon, lat);
		return gcj02ToBd09(gcjLon, gcjLat);
	}
	return [lon, lat];
}

/** 指定坐标系 → WGS-84（底图坐标） */
export function toWgs84(lon: number, lat: number, system: CoordSystem): [number, number] {
	if (system === 'gcj02') return gcj02ToWgs84(lon, lat);
	if (system === 'bd09') {
		const [gcjLon, gcjLat] = bd09ToGcj02(lon, lat);
		return gcj02ToWgs84(gcjLon, gcjLat);
	}
	return [lon, lat];
}

/** 统一保留 6 位小数，和超星 App 上报的精度一致 */
export function formatCoord(value: number) {
	return Number.isFinite(value) ? value.toFixed(6) : '';
}

export function coordSystemLabel(system: CoordSystem) {
	if (system === 'gcj02') return 'GCJ-02（高德 / 腾讯 / 超星）';
	if (system === 'bd09') return 'BD-09（百度拾取器）';
	return 'WGS-84（GPS / 地图底图）';
}
