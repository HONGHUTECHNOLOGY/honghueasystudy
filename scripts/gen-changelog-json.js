#!/usr/bin/env node
/**
 * 更新日志 → 官网 JSON（面向普通用户）
 * ---------------------------------------------------------------
 * 数据源是仓库根的 CHANGELOG.md（release-please 自动维护），产物是
 * website/api/changelog.json，供桌面端更新弹窗与官网直接读取。
 *
 * 为什么要单独做一份而不是让客户端直接解析 CHANGELOG.md：
 *   1) CHANGELOG 是给开发者看的 —— 里面混着 ci / manifest / mirror / 构建产物
 *      这类纯工程条目，普通用户看不懂也不需要知道；
 *   2) 客户端要的是「结构化 + 已分组」的小数据，而不是 70KB 的 markdown；
 *   3) 过滤规则集中在一处，官网和客户端展示口径天然一致。
 *
 * 过滤规则（三条同时生效）：
 *   - 只保留「新功能 / 问题修复 / 性能优化」三类小节，其余（文档、代码重构）整段丢弃；
 *   - 丢弃 scope 属于工程范畴的条目（ci/cd/build/deps/release/workflow/manifest/mirror…）；
 *   - 丢弃正文仍带工程黑话的条目（工作流、探链、runner、lockfile…），
 *     兜住「scope 写了 feat 但内容是内部改动」的情况。
 *
 * 用法：
 *   node scripts/gen-changelog-json.js                  # 写 website/api/changelog.json
 *   node scripts/gen-changelog-json.js --out some.json  # 自定义输出
 *   node scripts/gen-changelog-json.js --print          # 只打印，不落盘
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const DEFAULT_OUT = path.join(ROOT, 'website', 'api', 'changelog.json');

/** 小节标题归一化：中英文 / 带不带 emoji 都映射到同一组 */
const SECTION_MAP = [
	{ key: 'feat', title: '新功能', re: /新功能|features?|✨/i },
	{ key: 'fix', title: '问题修复', re: /问题修复|bug ?fixes|^fixe?s?$|🐛/i },
	{ key: 'perf', title: '性能优化', re: /性能优化|performance|⚡/i }
];

/** 整段丢弃的小节（用户不关心实现过程） */
const DROP_SECTION_RE = /文档|重构|refactor|documentation|📝|♻️/i;

/** 工程范畴的 scope：条目直接丢掉 */
const DROP_SCOPES = new Set([
	'ci', 'cd', 'build', 'deps', 'dependabot', 'release', 'workflow', 'actions',
	'repo', 'test', 'tests', 'docs', 'style', 'chore', 'manifest', 'mirror',
	'lockfile', 'sandbox', 'script', 'tooling'
]);

/** 正文兜底过滤：scope 没写对但内容仍是内部改动的 */
const DROP_TEXT_RE = /工作流|workflow|release-please|探链|回写|runner|lockfile|构建产物|打包脚本|上传阶段|镜像源|CNB|GitHub Actions|依赖升级|版本号注入/i;

/** 一条条目最多保留这么长，避免弹窗里出现整段小作文 */
const MAX_TEXT = 160;

function normalizeSectionTitle(raw) {
	const t = String(raw).replace(/^#+\s*/, '').trim();
	if (!t) return null;
	if (DROP_SECTION_RE.test(t)) return null;
	for (const s of SECTION_MAP) if (s.re.test(t)) return s;
	return null;
}

/**
 * 解析单条 `* **scope:** 文案 ([sha](url))` 或 `* 文案 ([sha](url))`
 * @returns {{ scope: string, text: string, sha: string } | null}
 */
function parseItem(line) {
	const m = /^\s*[*-]\s+(.*)$/.exec(line);
	if (!m) return null;
	let body = m[1].trim();

	// 去掉尾部的提交链接：([abc1234](https://...))
	let sha = '';
	body = body.replace(/\s*\(\[([0-9a-f]{7,40})\]\([^)]*\)\)\s*$/i, (_, s) => {
		sha = s;
		return '';
	});

	// 去掉 scope：**desktop:** xxx（冒号在粗体里，release-please 的默认写法）
	// 与 **desktop**: xxx（冒号在粗体外，手写时常见）两种都要认
	let scope = '';
	body = body.replace(/^\*\*([^*]+?)\*\*\s*[:：]?\s*/, (whole, s) => {
		const name = String(s).replace(/[:：]\s*$/, '').trim();
		// 不是「scope 形态」的粗体（比如整句加粗）就原样保留，交给后面的去粗体步骤
		if (!name || /[\s，。,.]/.test(name)) return whole;
		scope = name.toLowerCase();
		return '';
	});

	body = body
		.replace(/\*\*([^*]+)\*\*/g, '$1') // 残留加粗
		.replace(/`([^`]+)`/g, '$1') // 行内代码
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接只留文字
		.replace(/\s*\(#\d+\)\s*$/, '') // PR 号，用户不关心
		.replace(/\s*[，,]\s*版本升级至\s*v?\d+\.\d+\.\d+\s*$/, '') // 提交信息里的版本尾巴
		.replace(/\s+/g, ' ')
		.trim();

	if (!body) return null;
	if (body.length > MAX_TEXT) body = body.slice(0, MAX_TEXT - 1) + '…';
	return { scope, text: body, sha };
}

function isUserFacing(item) {
	if (!item) return false;
	if (item.scope && DROP_SCOPES.has(item.scope)) return false;
	if (DROP_TEXT_RE.test(item.text)) return false;
	// 纯「发布 x.y.z」类条目
	if (/^(发布|release)\s*v?\d+\.\d+\.\d+/i.test(item.text)) return false;
	return true;
}

/**
 * 解析 CHANGELOG.md
 * @returns {{ version: string, date: string, sections: { title: string, items: string[] }[] }[]}
 */
function parseChangelog(markdown) {
	const lines = String(markdown).split(/\r?\n/);
	const versions = [];
	const VERSION_RE = /^##\s+(?:\[)?(\d+\.\d+\.\d+)(?:\])?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?/;

	let current = null;
	let section = null;

	for (const line of lines) {
		const vm = VERSION_RE.exec(line);
		if (vm) {
			current = { version: vm[1], date: vm[2] || '', sections: [] };
			versions.push(current);
			section = null;
			continue;
		}
		if (!current) continue;

		if (/^###\s+/.test(line)) {
			const mapped = normalizeSectionTitle(line);
			section = mapped ? { title: mapped.title, items: [] } : null;
			if (section) current.sections.push(section);
			continue;
		}
		if (/^##\s+/.test(line)) {
			// 其他二级标题（比如未发版的 Unreleased），结束当前版本块
			current = null;
			section = null;
			continue;
		}
		if (!section) continue;
		if (!/^\s*[*-]\s+/.test(line)) continue;

		const item = parseItem(line);
		if (!isUserFacing(item)) continue;
		// 同一版本内去重（偶尔会因 cherry-pick 重复出现）
		if (section.items.includes(item.text)) continue;
		section.items.push(item.text);
	}

	return versions
		.map((v) => ({ ...v, sections: v.sections.filter((s) => s.items.length) }))
		.filter((v) => v.sections.length);
}

/**
 * 生成结构化更新日志
 * @param {{ changelogPath?: string, limit?: number }} [opts]
 */
function buildChangelog(opts = {}) {
	const file = opts.changelogPath || CHANGELOG;
	if (!fs.existsSync(file)) throw new Error('找不到 CHANGELOG.md: ' + file);

	const versions = parseChangelog(fs.readFileSync(file, 'utf8'));
	const limited = opts.limit && opts.limit > 0 ? versions.slice(0, opts.limit) : versions;

	return {
		// 客户端按版本号取区间，用不上生成时间，但排查「线上是不是旧的」时很有用
		generatedAt: new Date().toISOString(),
		latest: limited[0]?.version || '',
		versions: limited
	};
}

function writeChangelog(outPath, opts) {
	const data = buildChangelog(opts);
	const dir = path.dirname(outPath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
	return data;
}

function summarize(data) {
	const count = data.versions.reduce(
		(n, v) => n + v.sections.reduce((m, s) => m + s.items.length, 0),
		0
	);
	return `${data.versions.length} 个版本 / ${count} 条用户可见条目，最新 ${data.latest || '（空）'}`;
}

if (require.main === module) {
	const argv = process.argv.slice(2);
	const getArg = (name) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const out = getArg('--out') || DEFAULT_OUT;
	const limit = Number(getArg('--limit')) || 0;

	if (argv.includes('--print')) {
		const data = buildChangelog({ limit });
		console.log(JSON.stringify(data, null, 2));
		console.error('[changelog] ' + summarize(data));
		process.exit(0);
	}

	const data = writeChangelog(path.resolve(out), { limit });
	console.log(`[changelog] 写入 ${path.relative(ROOT, path.resolve(out))}`);
	console.log(`[changelog] ${summarize(data)}`);
}

module.exports = { buildChangelog, writeChangelog, parseChangelog, parseItem, isUserFacing };
