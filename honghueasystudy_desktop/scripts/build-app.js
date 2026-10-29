const { series, src, dest } = require('gulp');
const del = require('del');
const zip = require('gulp-zip');
const path = require('path');
const { execOut } = require('./utils');
const { readFileSync, existsSync, openSync, closeSync } = require('fs');
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
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	// arch/目标参数必须走专用 npm script 而非 `pnpm dist -- --xxx` 转发——
	// CI 的 pnpm 会把首个 `--` 原样透传给脚本，electron-builder 的 yargs 遇 `--` 即停止解析，
	// --x64/--arm64 被当作位置参数丢弃后按宿主架构打包（mac-x64 曾因此实际产出 arm64 dmg
	// 且 chrome/ocr/cloudflared 因目录后缀不匹配全部缺失）。
	let cmd;
	if (platform === 'linux' && arch === 'arm64') {
		// electron-builder 的 fpm（deb/rpm 打包工具）仅有 linux-x86 预编译包，在 arm64 主机上 Exec format error；
		// AppImage 工具链（appimage-12.0.1）自带 linux-arm64 二进制与 runtime-arm64，故 linux-arm64 仅构建 AppImage
		cmd = 'pnpm run dist:arm64-appimage';
	} else {
		cmd = `pnpm run dist:${arch}`;
	}
	console.log('[build-app] dist command:', cmd);
	return execOut(cmd, { cwd: '../packages/app' });
}

function cleanOutput() {
	return del([`../packages/app/dist/app${version}.zip`], { force: true });
}

/**
 * 构建前置防呆：输出目录里的主程序正在运行就直接中止。
 *
 * 用户习惯直接双击 `dist/<platform>-unpacked/鸿鹄易学.exe` 使用（不是装到 Program Files），
 * 一旦应用还开着，electron-builder 会在准备阶段把该目录删掉一半，然后在复制 ffmpeg.dll 时
 * 报 EBUSY 中止，留下缺 `lib/`、`node_modules/`、`locales/` 的残骸。之后再点 exe 就是
 * `Cannot find module ...\resources\app\lib\index.js`，看起来像「装坏了」。
 *
 * 探测方式：对加载中的动态库做「写入方式打开」，被占用时返回 EBUSY。
 * 实测（win）：exe 和 icudtl.dat 的 rename 都不可靠（exe 甚至能改名成功、
 * icudtl.dat 则是 rename 失败但写入打开成功），只有 ffmpeg.dll / libEGL.dll
 * 的「写入打开」是稳定信号 —— 这恰好也是构建真正卡住的那类文件。
 */
function verifyOutputUnused(done) {
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	const dirName = platform === 'linux' && arch === 'arm64' ? 'linux-arm64-unpacked' : `${platform}-unpacked`;
	const outDir = path.resolve(__dirname, `../packages/app/dist/${dirName}`);
	if (!existsSync(outDir)) {
		done();
		return;
	}

	const { productName } = JSON.parse(
		readFileSync(path.resolve(__dirname, '../packages/app/electron.builder.json')).toString()
	);
	/** 加载中会被独占的动态库；按平台给候选，命中任意一个即判定「正在运行」 */
	let probes;
	if (platform === 'win') {
		probes = ['ffmpeg.dll', 'libGLESv2.dll', 'libEGL.dll'].map((f) => path.join(outDir, f));
	} else if (platform === 'darwin') {
		const fw = path.join(outDir, `${productName}.app`, 'Contents', 'Frameworks', 'Electron Framework.framework');
		probes = [path.join(fw, 'Electron Framework'), path.join(fw, 'Versions', 'A', 'Electron Framework')];
	} else {
		probes = ['libffmpeg.so', 'libGLESv2.so'].map((f) => path.join(outDir, f));
	}

	const locked = probes.find((file) => {
		if (!existsSync(file)) return false;
		try {
			closeSync(openSync(file, 'r+'));
			return false;
		} catch (err) {
			return err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
		}
	});

	if (!locked) {
		done();
		return;
	}
	done(
		new Error(
			`[build-app] ❌ 输出目录里的程序正在运行（${path.basename(locked)} 被占用），已中止构建。\n` +
				'继续构建会把该目录删掉一半再失败，留下缺 lib/ 与 node_modules/ 的残骸，' +
				'下次启动只会报 "Cannot find module ...\\resources\\app\\lib\\index.js"。\n' +
				`请先完全退出「${productName}」（含托盘 / 后台进程）后重试。`
		)
	);
}

function packResource() {
	const platform = process.env.PLATFORM || 'win';
	const arch = process.env.ARCH || 'x64';
	// electron-builder 输出目录：linux arm64 为 linux-arm64-unpacked，其余为 <platform>-unpacked
	const dirName = platform === 'linux' && arch === 'arm64' ? 'linux-arm64-unpacked' : `${platform}-unpacked`;
	const unpackedDir = `../packages/app/dist/${dirName}`;
	return src(`${unpackedDir}/resources/app/**/*`)
		.pipe(zip(`app${version}.zip`))
		.pipe(dest('../packages/app/dist'));
}

/**
 * Linux 打包前置防呆：仅本地校验内嵌 OCR 包存在（不下载）。
 * bin/ocr/linux-<arch>/ocr.zip 体积超 git 单文件 100MB 限制，不入库：
 * 由 GitHub Release（tag: ocr-linux，ocr-linux-build.yml 维护）提供，
 * CI（desktop-build.yml）打包前自动拉取；本地打包需手动下载放入。
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
					'Linux OCR 为纯内置分发，不提供在线下载。请从 GitHub Release（tag: ocr-linux）下载 ' +
					`ocr-linux-${arch}.zip（由 .github/workflows/ocr-linux-build.yml 产出），` +
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
	verifyOutputUnused,
	buildApp,
	packResource
);

// 单独可跑：`gulp -f ./scripts/build-app.js verifyOutputUnused`（用于排查"构建失败留下残骸"）
exports.verifyOutputUnused = verifyOutputUnused;
