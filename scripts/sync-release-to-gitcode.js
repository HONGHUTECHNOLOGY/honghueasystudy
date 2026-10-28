#!/usr/bin/env node
/**
 * 本地一键同步 GitHub Release → GitCode Release → 更新清单回写。
 *
 * 为什么必须本地跑（2026-10-28 实测结论）：
 *   - GitHub CI（海外）→ file.gitcode.com 的预签名 PUT 被 GitCode 文件网关按
 *     来源 IP 拒绝（海外 502 秒拒，国内 200 success），CI 内无论怎么传都不通；
 *   - GitCode 原生 Action 托管 runner 不可控（无 node、secrets 不可配、job 静默重跑）；
 *   - 本机两条路均实测通过：镜像下载（gh-proxy 等）+ 近网直传。
 *
 * 流程（三步，均可单独跳过）：
 *   1. fetch-release-assets.js    从镜像下载全部附件（size+sha256 双校验，断点续传）
 *   2. publish-to-gitcode.js      近网上传（8 路并发，重试 + 下载校验 + 残留清理）
 *   3. write-update-manifest.js   探链后回写 website/api 清单并推送（CF 自动重建）
 *
 * 用法：
 *   node scripts/sync-release-to-gitcode.js --tag v5.2.0
 *
 * 选项：
 *   --tag <tag>       必填，Release tag（如 v5.2.0）
 *   --repo <o/r>      GitHub 仓库，默认 HONGHUTECHNOLOGY/honghueasystudy
 *   --out <dir>       下载目录，默认 .release-sync/<tag>（重复运行断点续传）
 *   --skip-fetch      跳过第 1 步（下载中断后续传 / 只重传）
 *   --skip-manifest   跳过第 3 步（只发 GitCode，不回写清单）
 *
 * 退出码：0 成功；1 任一步失败。
 * 凭据：GITCODE_TOKEN 环境变量，未设置时从 git credential（host=gitcode.com）读取。
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--tag') out.tag = argv[++i];
		else if (a === '--repo') out.repo = argv[++i];
		else if (a === '--out') out.out = argv[++i];
		else if (a === '--skip-fetch') out.skipFetch = true;
		else if (a === '--skip-manifest') out.skipManifest = true;
		else if (a === '--help' || a === '-h') out.help = true;
	}
	return out;
}

/** 未显式给 token 时，从 git credential manager 取（Windows 凭据管理器常驻） */
function resolveGitcodeToken() {
	if (process.env.GITCODE_TOKEN) return process.env.GITCODE_TOKEN;
	const r = spawnSync('git', ['credential', 'fill'], {
		input: 'protocol=https\nhost=gitcode.com\n\n',
		encoding: 'utf8',
		windowsHide: true,
		cwd: ROOT
	});
	const m = /^password=(.+)$/m.exec(r.stdout || '');
	return m ? m[1].trim() : '';
}

/** 运行仓库内脚本，继承 stdio 让进度实时可见；返回退出码 */
function runScript(relPath, args) {
	const r = spawnSync(process.execPath, [path.join(ROOT, relPath), ...args], {
		stdio: 'inherit',
		cwd: ROOT,
		windowsHide: true
	});
	if (r.error) throw r.error;
	return r.status;
}

/** 待同步附件：与 CI publish-gitcode.yml 同一套过滤（安装包/更新包/扩展） */
function pickDistributables(manifest, outDir) {
	const isDist = (name) =>
		/\.(exe|dmg|AppImage|deb|rpm)$/.test(name) ||
		/^app-.*\.zip(\.sha256)?$/.test(name) ||
		name === 'extension.zip';
	return manifest.files
		.filter((f) => isDist(f.name) && fs.existsSync(path.join(outDir, f.name)))
		.map((f) => path.join(outDir, f.name));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.tag) {
		console.log(
			'用法: node scripts/sync-release-to-gitcode.js --tag <tag> [--repo owner/repo] [--out dir]\n' +
				'      [--skip-fetch] [--skip-manifest]'
		);
		process.exit(args.help ? 0 : 1);
	}
	const repo = args.repo || 'HONGHUTECHNOLOGY/honghueasystudy';
	const outDir = path.resolve(ROOT, args.out || path.join('.release-sync', args.tag));

	if (!resolveGitcodeToken()) {
		console.error('[sync] 未找到 GitCode token：请设置 GITCODE_TOKEN 环境变量，或在凭据管理器保存 gitcode.com 凭据');
		process.exit(1);
	}

	// ---- 第 1 步：镜像下载全部附件（清单驱动，sha256 校验，断点续传） ----
	if (!args.skipFetch) {
		console.log(`\n[sync] 第 1/3 步：从镜像下载 ${repo} ${args.tag} 全部附件 → ${outDir}`);
		const code = runScript('scripts/fetch-release-assets.js', ['--tag', args.tag, '--repo', repo, '--out', outDir]);
		if (code !== 0) process.exit(code);
	} else {
		console.log(`[sync] 跳过下载，使用已有目录 ${outDir}`);
	}

	const manifestPath = path.join(outDir, 'assets-manifest.json');
	if (!fs.existsSync(manifestPath)) {
		console.error(`[sync] 缺少 ${manifestPath}（下载步骤应产出）。如目录来自旧版本，请去掉 --skip-fetch 重跑`);
		process.exit(1);
	}
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

	// ---- 第 2 步：近网上传 GitCode ----
	console.log(`\n[sync] 第 2/3 步：上传 GitCode Release（${args.tag}）`);
	const distFiles = pickDistributables(manifest, outDir);
	if (!distFiles.length) {
		console.error('[sync] 没有可同步的附件（安装包 / 更新包 / 扩展均缺失）');
		process.exit(1);
	}
	const notesFile = path.join(outDir, 'release-notes.md');
	const publishArgs = [
		'--tag', args.tag,
		'--name', args.tag,
		'--concurrency', '8',
		'--purge-stale',
		'--require-token'
	];
	if (fs.existsSync(notesFile)) publishArgs.push('--notes-file', notesFile);
	for (const f of distFiles) publishArgs.push('--file', f);
	const pubCode = runScript('scripts/publish-to-gitcode.js', publishArgs);
	if (pubCode !== 0) process.exit(pubCode);

	// ---- 第 3 步：回写更新清单并推送（CF Pages 监听 main push 自动重建） ----
	if (args.skipManifest) {
		console.log('\n[sync] --skip-manifest：跳过清单回写。客户端要收到更新需手动触发 GitHub update-manifest 工作流');
		return;
	}
	console.log('\n[sync] 第 3/3 步：回写更新清单（探链 GitCode + GitHub，全绿才写）');
	const manifestCode = runScript('scripts/write-update-manifest.js', [
		'--meta', path.join(outDir, 'update-meta.json'),
		'--artifacts', outDir,
		'--tag', args.tag,
		'--notes', 'other: 桌面端与扩展同步更新，详见发布页',
		'--verify'
	]);
	if (manifestCode !== 0) {
		console.error('[sync] 清单写入失败（探链未全绿或脚本错误）。附件已上传成功，可修复后单独重跑第 3 步');
		process.exit(manifestCode);
	}

	// 提交并推送：只有清单真变了才提交；推 GitHub（CF 源）与 GitCode 镜像两端
	const git = (...a) => {
		const r = spawnSync('git', a, { encoding: 'utf8', cwd: ROOT, windowsHide: true });
		return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
	};
	if (git('add', 'website/api').code !== 0) {
		console.error('[sync] git add 失败');
		process.exit(1);
	}
	const diff = git('diff', '--cached', '--quiet');
	if (diff.code === 0) {
		console.log('[sync] 清单无变化（版本已存在），跳过提交');
		return;
	}
	const msg = `chore(release): 同步 ${args.tag} 更新清单（本地同步）`;
	const commit = git('commit', '-m', msg);
	if (commit.code !== 0) {
		console.error(`[sync] git commit 失败：${commit.out.trim()}`);
		process.exit(1);
	}
	console.log(`[sync] 已提交：${git('log', '--oneline', '-1').out.trim()}`);
	for (const remote of ['origin', 'honghueasystudy']) {
		const p = git('push', remote, 'main');
		if (p.code !== 0) {
			console.error(`[sync] 推送 ${remote} 失败：${p.out.trim()}\n清单已本地提交，网络恢复后手动 git push ${remote} main 即可`);
			process.exit(1);
		}
		console.log(`[sync] 已推送 ${remote}`);
	}
	console.log('\n[sync] 完成：GitCode 附件 + 更新清单均已就位，CF 重建后客户端即可收到更新');
}

main().catch((e) => {
	console.error('[sync] 未捕获异常：', e && e.stack || e);
	process.exit(1);
});
