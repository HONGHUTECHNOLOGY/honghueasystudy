/** 通用小工具：剪贴板、时间格式化 */

/**
 * 复制文本。
 *
 * 远程控制台常通过 `http://192.168.x.x:15320` 访问，属于非安全上下文，
 * 此时 `navigator.clipboard` 不存在，必须回退到 `execCommand('copy')`。
 */
export async function copyText(text: string): Promise<boolean> {
	if (!text) return false;

	if (navigator.clipboard && window.isSecureContext) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			/* 继续走回退方案 */
		}
	}

	try {
		const area = document.createElement('textarea');
		area.value = text;
		area.setAttribute('readonly', '');
		area.style.position = 'fixed';
		area.style.top = '-1000px';
		area.style.opacity = '0';
		document.body.appendChild(area);
		area.select();
		area.setSelectionRange(0, area.value.length);
		const ok = document.execCommand('copy');
		document.body.removeChild(area);
		return ok;
	} catch {
		return false;
	}
}

function pad(value: number): string {
	return value < 10 ? '0' + value : String(value);
}

/** 时间戳 → HH:mm:ss */
export function formatTime(ts: number): string {
	if (!ts) return '';
	const date = new Date(ts);
	return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

/** 相对时间：刚刚 / 12 秒前 / 3 分钟前 */
export function formatAgo(ts: number, now: number): string {
	if (!ts) return '—';
	const diff = Math.max(0, Math.round((now - ts) / 1000));
	if (diff < 3) return '刚刚';
	if (diff < 60) return diff + ' 秒前';
	if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
	return Math.floor(diff / 3600) + ' 小时前';
}
