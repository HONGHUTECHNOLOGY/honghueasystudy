const { series, src, dest } = require('gulp');
const del = require('del');
const zip = require('gulp-zip');
const path = require('path');
const { execOut } = require('./utils');
const { readFileSync, existsSync } = require('fs');
const chromeInstall = require('./chrome.install').default;
const { downloadOcr, verifyOcr } = require('../../scripts/ocr.install');
const { downloadCloudflared, verifyCloudflared } = require('./cloudflared.install');
const syncExtension = require('./sync-extension');
const { version } = JSON.parse(readFileSync('../packages/app/package.json').toString());

function buildWeb() {
	return execOut('pnpm build', { cwd: '../packages/web' });
}

/** 构建远程控制台（纯 Web，输出到 packages/app/public-remote） */
function buildRemote() {
	return execOut('pnpm build', { cwd: '../packages/remote' });
}

function buildApp() {
	const arch = process.env.ARCH || 'x64';
	// electron-builder 默认按宿主架构打包；mac x64 在 arm64 机器（CI 已无 Intel runner）上需显式指定
	return execOut(`pnpm dist -- --${arch}`, { cwd: '../packages/app' });
}

function cleanOutput() {
	return del([`../packages/app/dist/app${version}.zip`], { force: true });
}

function packResource() {
	const platform = process.env.PLATFORM || 'win';
	const unpackedDirs = {
		win: '../packages/app/dist/win-unpacked',
		mac: '../packages/app/dist/mac-unpacked',
		linux: '../packages/app/dist/linux-unpacked'
	};
	const unpackedDir = unpackedDirs[platform] || unpackedDirs.win;
	return src(`${unpackedDir}/resources/app/**/*`)
		.pipe(zip(`app${version}.zip`))
		.pipe(dest('../packages/app/dist'));
}

/**
 * Linux 打包前置防呆：仅本地校验内嵌 OCR 包存在（不下载）。
 * bin/ocr/linux-<arch>/ocr.zip 为手工入库文件（CI Artifact 下载后放入），
 * 缺失时构建期报错，防止产出无 OCR 能力的 Linux 安装包；win/mac 不受影响。
 */
function verifyLinuxOcr(done) {
	const platform = process.env.PLATFORM || 'win';
	if (platform !== 'linux') {
		done();
		return;
	}
	const arch = process.env.ARCH || 'x64';
	const ocrZip = path.resolve(__dirname, '../bin/ocr', `linux-${arch}`, 'ocr.zip');
	if (!existsSync(ocrZip)) {
		done(
			new Error(
				`[build-app] Linux 打包缺少内嵌 OCR 资源包：${ocrZip}\n` +
					'Linux OCR 为纯内置分发，不提供在线下载。请从 CI Artifact 获取' +
					`（.github/workflows/ocr-linux-build.yml 产物 ocr-linux-${arch}.zip），` +
					`放入 honghueasystudy_desktop/bin/ocr/linux-${arch}/ 并重命名为 ocr.zip 后重试。`
			)
		);
		return;
	}
	console.log('[build-app] ✅ Linux 内嵌 OCR 包就绪:', ocrZip);
	done();
}

// syncExtension 放第一位：打包前把仓库根 extension/ 同步成内置扩展，避免带上旧版本
exports.default = series(
	syncExtension,
	cleanOutput,
	buildWeb,
	buildRemote,
	chromeInstall,
	downloadOcr,
	downloadCloudflared,
	verifyOcr,
	verifyCloudflared,
	verifyLinuxOcr,
	buildApp,
	packResource
);
