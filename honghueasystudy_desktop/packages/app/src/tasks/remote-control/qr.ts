import QRCode from 'qrcode';
import { Logger } from '../../logger';

const logger = Logger('remote-qr');

export interface QRCodeResult {
	svg: string;
	/** 可直接用于 img src 的 data URL */
	dataUrl: string;
	text: string;
}

/**
 * 生成二维码（SVG）
 * 深色前景 + 白色背景，保证在深色界面上依然可被手机相机识别。
 */
export async function createQRCode(text: string): Promise<QRCodeResult> {
	const svg = await QRCode.toString(text, {
		type: 'svg',
		margin: 1,
		width: 320,
		errorCorrectionLevel: 'M',
		color: {
			dark: '#0B0E14',
			light: '#FFFFFF'
		}
	});

	return {
		svg,
		dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
		text
	};
}

/** 安全版本：二维码生成失败不影响主流程 */
export async function createQRCodeSafe(text: string): Promise<QRCodeResult | null> {
	if (!text) return null;
	try {
		return await createQRCode(text);
	} catch (e) {
		logger.error('二维码生成失败', e);
		return null;
	}
}
