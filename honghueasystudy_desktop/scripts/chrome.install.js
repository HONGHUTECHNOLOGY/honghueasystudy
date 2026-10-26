const { series, src, dest } = require('gulp');
const { execOut } = require('./utils');
const zip = require('gulp-zip');
const fs = require('fs');
const path = require('path');

// 平台映射：@puppeteer/browsers 支持的平台标识
const PLATFORM_MAP = {
	'win-x64': 'win64',
	'mac-x64': 'mac',
	'mac-arm64': 'mac_arm',
	'linux-x64': 'linux'
};

// Linux ARM64 暂不内置 Chrome：Chrome for Testing 自 153.0.8001.0 才提供 linux-arm64 构建，
// 与下方锁定的 137 版本策略冲突（137 后谷歌禁止命令行加载插件）。
// 命中时跳过下载/校验/打包，仅保证 bin/chrome/linux-arm64/ 目录存在（空目录），
// electron-builder extraResources 引用该目录，缺失会导致打包报错；
// 运行时 initChrome 检测不到 chrome.zip 会自动跳过内置浏览器初始化。
const SKIP_CHROME_TARGETS = ['linux-arm64'];

function shouldSkipChrome() {
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	return SKIP_CHROME_TARGETS.includes(`${platform}-${arch}`);
}

// 137 版本后谷歌禁止使用命令行加载插件，目前只能内置Chrome for Test测试浏览器，并且进行严格版本控制，手动更新
function downloadChrome(done) {
	if (shouldSkipChrome()) {
		console.log('跳过内置 Chrome 下载: linux-arm64 暂不内置浏览器');
		done();
		return;
	}

	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	const targetPlatform = `${platform}-${arch}`;

	const browserPlatform = PLATFORM_MAP[targetPlatform];

	if (!browserPlatform) {
		throw new Error(`Chrome for Testing 不支持平台: ${targetPlatform}`);
	}

	console.log(`目标平台: ${targetPlatform}`);
	console.log(`Chrome 平台参数: ${browserPlatform}`);

	return execOut(
		`npx @puppeteer/browsers install chrome@137.0.7151.55 --platform ${browserPlatform} --path ../.chrome-temp`
	);
}

// 验证 Chrome 架构
function verifyChromeArchitecture(done) {
	if (shouldSkipChrome()) {
		done();
		return;
	}
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	const targetPlatform = `${platform}-${arch}`;
	const expectedBrowserPlatform = PLATFORM_MAP[targetPlatform];

	if (!expectedBrowserPlatform) {
		throw new Error(`不支持的平台: ${targetPlatform}`);
	}

	const chromeDir = path.resolve(__dirname, '../.chrome-temp/chrome');

	if (!fs.existsSync(chromeDir)) {
		throw new Error(`Chrome 目录不存在: ${chromeDir}`);
	}

	// 检测实际下载的 Chrome 平台
	const actualPlatform = detectChromePlatform(chromeDir);

	console.log(`目标平台: ${targetPlatform}`);
	console.log(`期望 Chrome 平台: ${expectedBrowserPlatform}`);
	console.log(`实际 Chrome 平台: ${actualPlatform}`);

	// 平台名称映射（检测值 -> 期望值）
	const platformAliasMap = {
		mac: 'mac', // mac-x64 下载的目录名是 mac
		mac_arm: 'mac_arm',
		win64: 'win64',
		linux: 'linux'
	};

	const normalizedActual = platformAliasMap[actualPlatform] || actualPlatform;

	if (normalizedActual !== expectedBrowserPlatform) {
		throw new Error(`Chrome 架构不匹配! 期望: ${expectedBrowserPlatform}, 实际: ${actualPlatform}`);
	}

	console.log('✅ Chrome 架构验证通过');
	return Promise.resolve();
}

// 检测 Chrome 平台（通过下载目录名前缀判断）
// 下载目录结构: .chrome-temp/chrome/{platform}-{version}/chrome-{dir}/...
// 例如: .chrome-temp/chrome/linux-137.0.7151.55/chrome-linux64/chrome
function detectChromePlatform(chromeDir) {
	const entries = fs.readdirSync(chromeDir);

	for (const entry of entries) {
		if (entry.startsWith('mac_arm-')) return 'mac_arm';
		if (entry.startsWith('mac-')) return 'mac';
		if (entry.startsWith('win64-') || entry.startsWith('win32-')) return 'win64';
		if (entry.startsWith('linux-')) return 'linux';
	}

	return 'unknown';
}

function pack(done) {
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	const targetDir = `../bin/chrome/${platform}-${arch}`;

	if (shouldSkipChrome()) {
		// 保留空目录，保证 electron-builder extraResources 源路径存在
		fs.mkdirSync(path.resolve(__dirname, targetDir), { recursive: true });
		console.log(`跳过内置 Chrome 打包（空目录）: ${targetDir}`);
		done();
		return;
	}

	console.log(`打包 Chrome 到: ${targetDir}`);

	return src('../.chrome-temp/chrome/**/*').pipe(zip('chrome.zip')).pipe(dest(targetDir));
}

exports.default = series(downloadChrome, verifyChromeArchitecture, pack);
