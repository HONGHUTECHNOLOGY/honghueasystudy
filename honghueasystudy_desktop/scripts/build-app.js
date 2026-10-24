const { series, src, dest } = require('gulp');
const del = require('del');
const zip = require('gulp-zip');
const { execOut } = require('./utils');
const { readFileSync } = require('fs');
const chromeInstall = require('./chrome.install').default;
const { downloadOcr, verifyOcr } = require('../../scripts/ocr.install');
const syncExtension = require('./sync-extension');
const { version } = JSON.parse(readFileSync('../packages/app/package.json').toString());

function buildWeb() {
	return execOut('pnpm build', { cwd: '../packages/web' });
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

// syncExtension 放第一位：打包前把仓库根 extension/ 同步成内置扩展，避免带上旧版本
exports.default = series(
	syncExtension,
	cleanOutput,
	buildWeb,
	chromeInstall,
	downloadOcr,
	verifyOcr,
	buildApp,
	packResource
);
