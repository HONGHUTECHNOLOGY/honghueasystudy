/**
 * 地点搜索 / 逆地址解析
 *
 * 用 Photon（OSM 数据）做检索：不需要 key，响应头带 Access-Control-Allow-Origin: *，
 * 浏览器可以直接 fetch；坐标本身就是 WGS-84，和地图底图一致，不用再换算。
 * 国内 POI 数量不如高德全，但常见地名、学校、商场、地铁站基本能命中。
 */

export interface GeoPlace {
	name: string;
	address: string;
	/** WGS-84 */
	lon: number;
	lat: number;
}

interface PhotonProperties {
	name?: string;
	housenumber?: string;
	street?: string;
	locality?: string;
	district?: string;
	city?: string;
	county?: string;
	state?: string;
	country?: string;
}

interface PhotonFeature {
	properties?: PhotonProperties;
	geometry?: { coordinates?: [number, number] };
}

const ENDPOINT = 'https://photon.komoot.io';
const TIMEOUT = 12000;

async function fetchJson(url: string): Promise<any> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) {
			throw new Error(`搜索服务返回 ${response.status}`);
		}
		return await response.json();
	} catch (error: any) {
		if (error?.name === 'AbortError') throw new Error('搜索超时，请检查网络后重试');
		throw new Error('搜索服务暂不可用，请稍后重试');
	} finally {
		clearTimeout(timer);
	}
}

/** 把省市区街道拼成一条可读地址，去掉「北京市北京市」这种重复 */
function buildAddress(properties?: PhotonProperties): string {
	if (!properties) return '';
	const parts = [
		properties.state,
		properties.city,
		properties.county,
		properties.district,
		properties.locality,
		properties.street,
		properties.housenumber
	]
		.filter((item): item is string => typeof item === 'string' && !!item.trim())
		.map((item) => item.trim());
	const unique: string[] = [];
	for (const part of parts) {
		if (unique[unique.length - 1] !== part) unique.push(part);
	}
	return unique.join('');
}

function toPlace(feature: PhotonFeature): GeoPlace | null {
	const coordinates = feature.geometry?.coordinates;
	if (!coordinates) return null;
	const [lon, lat] = coordinates.map(Number);
	if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
	if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
	const properties = feature.properties;
	return {
		name: (properties?.name || properties?.street || properties?.city || '未命名地点').trim(),
		address: buildAddress(properties),
		lon,
		lat
	};
}

/**
 * 关键字搜索地点
 *
 * @param keyword 用户输入
 * @param bias    地图中心（WGS-84），用于让附近的结果排前面
 */
export async function searchPlaces(
	keyword: string,
	bias?: { lon: number; lat: number },
	limit = 8
): Promise<GeoPlace[]> {
	const params = new URLSearchParams();
	params.set('q', keyword);
	params.set('limit', String(limit));
	if (bias && Number.isFinite(bias.lon) && Number.isFinite(bias.lat)) {
		params.set('lon', String(bias.lon));
		params.set('lat', String(bias.lat));
	}
	const data = await fetchJson(`${ENDPOINT}/api/?${params.toString()}`);
	const features: PhotonFeature[] = Array.isArray(data?.features) ? data.features : [];
	return features.map(toPlace).filter((item): item is GeoPlace => !!item);
}

/** 逆地址解析：根据坐标找一条可读地址，失败时返回空串 */
export async function reversePlace(lon: number, lat: number): Promise<string> {
	const params = new URLSearchParams({
		lon: String(lon),
		lat: String(lat),
		limit: '1'
	});
	try {
		const data = await fetchJson(`${ENDPOINT}/reverse?${params.toString()}`);
		const feature: PhotonFeature | undefined = Array.isArray(data?.features) ? data.features[0] : undefined;
		return buildAddress(feature?.properties);
	} catch {
		return '';
	}
}
