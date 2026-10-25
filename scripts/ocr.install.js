const fs = require('fs');
const path = require('path');

// OCR 验证码识别模块（PyInstaller 打包的 ddddocr 独立运行环境）。
// 上游有 win / mac / linux 三种构建；win 按架构区分包，mac 包 x64 / arm64 通用。
// linux 为纯内置分发：包由 .github/workflows/ocr-linux-build.yml 产出（Actions Artifact
// ocr-linux-x64.zip / ocr-linux-arm64.zip），维护者放入 honghueasystudy_desktop/bin/ocr/linux-<arch>/
// 并重命名为 ocr.zip 入库，不提供 CDN 下载地址（Linux 打包期本地存在性校验见 scripts/build-app.js）。
// 与 chrome.install.js 同理：打包前把 ocr.zip 放到 bin/ocr/<platform>-<arch>/，
// 由 electron-builder 的 extraResources 带进安装包，运行时 init.ocr.ts 优先解压内置包。
const OCR_URLS = {
	win: 'https://cdn.ocsjs.com/app/download/ocr.zip',
	mac: 'https://cdn.ocsjs.com/app/download/extensions/ocr-darwin.zip'
};

const MIN_SIZE = 10 * 1024 * 1024;

// win 按架构取包；mac 通用包按平台取
function ocrUrl(platform, arch) {
	return OCR_URLS[`${platform}-${arch}`] || OCR_URLS[platform];
}

function targetDir() {
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	if (!ocrUrl(platform, arch)) {
		return null;
	}
	// 落盘到桌面端子工作区 bin/ocr/<platform>-<arch>/（electron.builder.json extraResources
	// 与 ocr.path.ts 开发态路径均相对 honghueasystudy_desktop/）
	return path.resolve(__dirname, '../honghueasystudy_desktop/bin/ocr', `${platform}-${arch}`);
}

async function downloadOcr() {
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	const dir = targetDir();
	if (!dir) {
		console.log(`[ocr.install] 平台 ${platform}-${arch} 无 OCR 构建，跳过`);
		return;
	}

	fs.mkdirSync(dir, { recursive: true });
	const dest = path.join(dir, 'ocr.zip');

	if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
		console.log('[ocr.install] ocr.zip 已存在，跳过下载:', dest);
		return;
	}

	const url = ocrUrl(platform, arch);
	console.log(`[ocr.install] 下载 OCR 模块: ${url} -> ${dest}`);

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`OCR 下载失败: HTTP ${res.status}`);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < MIN_SIZE) {
		throw new Error(`OCR 包体积异常: ${buf.length} bytes`);
	}
	fs.writeFileSync(dest, buf);
	console.log(`[ocr.install] 下载完成: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

// 下载失败不阻断打包：目录保持存在（空），安装包不带 OCR，
// 运行时 init.ocr.ts 会自动回退到在线下载
function verifyOcr() {
	const dir = targetDir();
	if (!dir) {
		return Promise.resolve();
	}
	fs.mkdirSync(dir, { recursive: true });
	const dest = path.join(dir, 'ocr.zip');
	if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
		console.log('[ocr.install] ✅ ocr.zip 就绪:', dest);
	} else {
		console.warn('[ocr.install] ⚠️ ocr.zip 缺失，安装包将不含内置 OCR（运行时在线下载兜底）');
	}
	return Promise.resolve();
}

exports.downloadOcr = downloadOcr;
exports.verifyOcr = verifyOcr;
exports.default = { downloadOcr, verifyOcr };
