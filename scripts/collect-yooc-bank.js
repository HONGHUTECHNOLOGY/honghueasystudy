#!/usr/bin/env node
/**
 * 易班优课 · 题库收集脚本（纯接口版）
 *
 * 原理（实测，改动前请复核）：
 *   1. `api/exam/start/action` 建一场考试，`api/exam/list/get` 能拿到本场的 examuserId；
 *   2. `api/exam/paper/get` 拿本轮抽到的 100 题（考试中 `subject.answer` 是统一占位密文）；
 *   3. `api/exam/submit/action` 交卷。两个坑：
 *      - `score` 必须是 AES 加密的 `"yooc@admin" + 分数`，否则报「分数加密错误！」；
 *      - `answer` 必须是**双重 JSON 编码**，少一层 PHP 侧 `json_decode` 收到 object 直接 500。
 *   4. `api/exam/answer/get` 交卷后 `subject.answer` 变成**真实答案的选项下标数组**
 *      （如 `["1"]`、`["0","2"]`），按下标映射回选项文本即是官方答案；
 *   5. `api/exam/repeat/action`（带 examuserId）清记录后即可再开一场。
 *
 * 题库只记【题干 + 正确选项文本】，不记位置、也不记选项集合 —— 易班每场都会洗牌选项顺序，
 * 还可能随机增删干扰项，只有答案文本稳定；干扰项不在答案池里，因此天然不会被误选。
 * 同一题干出现多种写法时存成多个 `versions`；「全部选项都对」的题归入 `all` 池。
 *
 * 用法：
 *   node scripts/collect-yooc-bank.js                      # 刷到连续 20 轮无新增为止
 *   node scripts/collect-yooc-bank.js --rounds=40          # 最多刷 40 轮
 *   node scripts/collect-yooc-bank.js --idle=10            # 连续 10 轮无新增就停
 *   node scripts/collect-yooc-bank.js --port=9223
 *   node scripts/collect-yooc-bank.js --dry                # 只统计，不写文件
 *
 * 前置条件：浏览器开着远程调试端口，已登录易班优课，且当前页停在
 *           `https://exam.yooc.me/group/<gid>/exam/<eid>` 这类考试详情页。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const BANK_PATH = path.join(ROOT, 'packages/scripts/src/projects/yooc-bank.json');

const argv = process.argv.slice(2);
const arg = (name, def) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=').slice(1).join('=') : def;
};
const PORT = arg('port', '9222');
const MAX_ROUNDS = Number(arg('rounds', 80));
const IDLE_STOP = Number(arg('idle', 20));
const DRY = argv.includes('--dry');

function loadPlaywright() {
	const candidates = [
		'playwright-core',
		path.join(ROOT, 'honghueasystudy_desktop/node_modules/playwright-core'),
		path.join(ROOT, 'node_modules/playwright-core')
	];
	for (const c of candidates) {
		try {
			return require(c);
		} catch (e) {
			/* 继续尝试下一个 */
		}
	}
	throw new Error('未找到 playwright-core，请先安装依赖');
}

// ---------- 文本归一化（必须与 packages/scripts/src/projects/yooc.ts 完全一致） ----------
function normalizeStem(s) {
	return String(s)
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/[\s\u3000]+/g, ' ')
		.trim()
		.replace(/[\s\u3000]+/g, '')
		.replace(/[（(]\s*[）)]/g, '()')
		.replace(/[，,、；;：:。.？?！!“”"''‘’·…—\-_]/g, '')
		.toLowerCase();
}
function cleanText(s) {
	return String(s)
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// ---------- HTTP ----------
let CTX = null; // { cookie, groupId, examId, q }

function api(pathname, { method = 'GET', body = null } = {}) {
	return new Promise((resolve) => {
		const sep = pathname.includes('?') ? '&' : '?';
		const url = new URL(`https://exambackend.yooc.me${pathname}${sep}${new URLSearchParams(CTX.q)}`);
		const req = https.request(
			{
				hostname: url.hostname,
				path: url.pathname + url.search,
				method,
				headers: {
					'Content-Type': 'application/json',
					Origin: 'https://exam.yooc.me',
					Referer: 'https://exam.yooc.me/',
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
					'X-Requested-With': 'XMLHttpRequest',
					Cookie: CTX.cookie,
					...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
				},
				timeout: 30000
			},
			(res) => {
				let d = '';
				res.on('data', (c) => (d += c));
				res.on('end', () => resolve({ status: res.statusCode, body: d }));
			}
		);
		req.on('error', (e) => resolve({ status: 0, body: '', err: e.message }));
		req.on('timeout', () => {
			req.destroy();
			resolve({ status: 0, body: '', err: 'timeout' });
		});
		if (body) req.write(body);
		req.end();
	});
}
const json = (s) => {
	try {
		return JSON.parse(s);
	} catch (e) {
		return null;
	}
};

// ---------- 加解密（AES-128-CBC，key = MD5("yooc@admin"+yibanId)[8:24]，IV 固定） ----------
let AES_KEY = null;
const IV = Buffer.from('42e07d2f7199c35d', 'utf8');
function aesKey() {
	if (!AES_KEY) {
		const md5 = crypto.createHash('md5').update('yooc@admin' + CTX.q.yibanId).digest('hex');
		AES_KEY = Buffer.from(md5.substring(8, 24), 'utf8');
	}
	return AES_KEY;
}
/** 解密 answer 字段：得到形如 `["0","2"]` 的选项下标数组 */
function decryptAnswer(cipher) {
	try {
		const d = crypto.createDecipheriv('aes-128-cbc', aesKey(), IV);
		return Buffer.concat([d.update(Buffer.from(String(cipher), 'base64')), d.final()]).toString('utf8');
	} catch (e) {
		return null;
	}
}
/** 加密分数：服务端要求 AES("yooc@admin" + 分数) */
function encryptScore(score) {
	const c = crypto.createCipheriv('aes-128-cbc', aesKey(), IV);
	return Buffer.concat([c.update('yooc@admin' + String(score), 'utf8'), c.final()]).toString('base64');
}

// ---------- 考试流程 ----------
async function listRecord() {
	const r = await api(`/api/exam/list/get?groupId=${CTX.groupId}`);
	const j = json(r.body);
	return j?.data?.find((x) => Number(x.examId) === Number(CTX.examId)) || null;
}
async function clearRecord(examuserId) {
	const r = await api('/api/exam/repeat/action', {
		method: 'POST',
		body: JSON.stringify({ userId: Number(CTX.q.userId), examId: CTX.examId, examuserId })
	});
	return json(r.body);
}
async function startExam() {
	const r = await api('/api/exam/start/action', {
		method: 'POST',
		body: JSON.stringify({ userId: Number(CTX.q.userId), examId: CTX.examId })
	});
	return json(r.body);
}
async function getPaper(examuserId) {
	return json((await api(`/api/exam/paper/get?examuserId=${examuserId}`)).body);
}
/** 交卷：答案随便填，只为拿到官方答案；score / answer 格式必须按服务端要求 */
async function submitPaper(examuserId, paper) {
	const data = {};
	let points = 0;
	paper.data.forEach((sec) =>
		sec.subjects.forEach((sub) => {
			const first = String(Array.isArray(sub.option?.[0]) ? sub.option[0][0] : sub.option?.[0] ?? '');
			data[sub.subjectId] = [{ 1: [first] }, 1];
			points += Number(sub.points || 0);
		})
	);
	const payload = JSON.stringify({
		answer: JSON.stringify(JSON.stringify(data)), // 双重编码，少一层就 500
		score: encryptScore(points),
		examuserId
	});
	return json((await api('/api/exam/submit/action', { method: 'POST', body: payload })).body);
}
async function getAnswers(examuserId) {
	return json((await api(`/api/exam/answer/get?examuserId=${examuserId}`)).body);
}

// ---------- 题库 ----------
/**
 * 题库只存【题干 + 正确答案文本】，不存选项集合。
 *  - `versions`：同一题干的不同答案文本版本（换排版 / 选项被截短 / 选项池抽题）
 *  - `all`：题干属「应包含且不限于」类，页面选项凡属池内即全选
 * 判定见 `recordAnswer`，结构说明见 `packages/scripts/src/projects/yooc-bank-match.ts`。
 */
function loadBank() {
	const bank = new Map();
	if (!fs.existsSync(BANK_PATH)) return bank;
	const old = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
	for (const it of old.items || []) {
		const key = it.q || normalizeStem(it.stem);
		if (!key) continue;
		const versions = (it.versions || []).filter((a) => Array.isArray(a) && a.length).map((a) => [...a]);
		const all = Array.isArray(it.all) && it.all.length ? [...it.all] : [];
		if (!versions.length && !all.length) continue;
		bank.set(key, { q: key, stem: it.stem, pool: all, versions });
	}
	return bank;
}

/** 一条答案入库：全选轮并入池，非全选轮单独成版 */
function recordAnswer(ent, answers, optionCount) {
	const uniq = [...new Set(answers)];
	// 答案覆盖当轮全部选项 → 「全部都对」，并进全选池（多轮池子的并集即完整答案集）
	if (uniq.length >= 3 && uniq.length === optionCount) {
		const set = new Set(ent.pool);
		let added = 0;
		for (const a of uniq) {
			if (!set.has(a)) {
				set.add(a);
				added++;
			}
		}
		ent.pool = [...set];
		return added;
	}
	const sig = [...uniq].sort().join('\u0001');
	if (ent.versions.some((v) => [...v].sort().join('\u0001') === sig)) return 0;
	ent.versions.push(uniq);
	return 1;
}

function saveBank(bank) {
	const items = [];
	for (const v of bank.values()) {
		const pool = [...new Set(v.pool || [])];
		// 只要出现过任何一轮「非全选」，就不能把池子当成唯一答案，池子降级为一个普通版本
		const versions = [];
		if (pool.length) versions.push(pool);
		for (const x of v.versions || []) {
			const sig = [...x].sort().join('\u0001');
			if (!versions.some((y) => [...y].sort().join('\u0001') === sig)) versions.push(x);
		}
		versions.sort((a, b) => b.join('').length - a.join('').length);

		const entry = { q: v.q, stem: v.stem };
		if (pool.length && !(v.versions || []).length) entry.all = pool;
		else if (versions.length) entry.versions = versions;
		else continue;
		items.push(entry);
	}
	const out = {
		meta: {
			platform: 'yooc',
			source: 'exam.yooc.me api answer/get',
			note: '只存题干与正确选项文本：versions 为答案文本集合的多版本，all 为全选型题的正确答案池；不存选项，匹配靠题干 + 答案文本，干扰项天然不入选',
			updatedAt: new Date().toISOString()
		},
		items
	};
	fs.writeFileSync(BANK_PATH, JSON.stringify(out, null, 1));
}

async function main() {
	const { chromium } = loadPlaywright();
	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
	const ctx = browser.contexts()[0];
	const page = ctx.pages().find((p) => /exam\.yooc\.me/.test(p.url()));
	if (!page) throw new Error('没有找到 exam.yooc.me 的标签页，请先在浏览器里打开一次考试页');

	// 从页面的 React 运行时取 userId / token / yibanId（比抓 cookie 稳）
	const cred = await page.evaluate(() => {
		try {
			const key = Object.keys(window).find((k) => k.startsWith('webpackChunk'));
			if (!key) return null;
			let req = null;
			window[key].push([[Math.random()], {}, (r) => (req = r)]);
			const C = req(69636);
			const m = location.pathname.match(/\/group\/(\d+)\/exam\/(\d+)/);
			return { userId: C.n5(), token: C.Nh(), yibanId: C.FP(), groupId: m ? m[1] : null, examId: m ? m[2] : null };
		} catch (e) {
			return { error: String(e) };
		}
	});
	if (!cred) throw new Error('页面缺少 React 运行时，请刷新考试页后重试');
	if (cred.error) throw new Error('读取凭据失败：' + cred.error);
	if (!cred.examId) throw new Error('当前页面不是考试详情页，请打开 /group/<gid>/exam/<eid> 后再运行');

	const cookies = [...(await ctx.cookies('https://exambackend.yooc.me')), ...(await ctx.cookies('https://exam.yooc.me'))]
		.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name && x.domain === c.domain) === i)
		.map((c) => `${c.name}=${c.value}`)
		.join('; ');

	CTX = {
		cookie: cookies,
		groupId: cred.groupId,
		examId: Number(cred.examId),
		q: { userId: cred.userId, token: cred.token, yibanId: cred.yibanId }
	};
	console.log(`[题库] yibanId=${CTX.q.yibanId} | examId=${CTX.examId} | 调试端口 ${PORT}`);

	const bank = loadBank();
	const baseItems = bank.size;
	const baseVariants = [...bank.values()].reduce((n, v) => n + (v.versions || []).length, 0);
	console.log(`[题库] 现有 ${baseItems} 题 / ${baseVariants} 个答案版本，开始刷题…\n`);

	let idle = 0;
	
	for (let round = 1; round <= MAX_ROUNDS; round++) {
		const rec0 = await listRecord();
		if (rec0) await clearRecord(rec0.examuserId);
		await startExam();
		await new Promise((r) => setTimeout(r, 650));

		const rec = await listRecord();
		if (!rec) {
			console.log(`  第 ${round} 轮：拿不到本场记录，停止`);
			break;
		}
		const paper = await getPaper(rec.examuserId);
		if (!paper?.data) {
			console.log(`  第 ${round} 轮：试卷拉取失败，停止`);
			break;
		}
		const sub = await submitPaper(rec.examuserId, paper);
		if (!sub?.result) {
			console.log(`  第 ${round} 轮：交卷失败（${sub?.message || '未知'}），停止`);
			break;
		}
		const ans = await getAnswers(rec.examuserId);
		if (!ans?.data) {
			console.log(`  第 ${round} 轮：答案拉取失败，停止`);
			break;
		}

		let added = 0;
		let parsed = 0;
		for (const sec of ans.data) {
			for (const s of sec.subjects) {
				if (s.type === 'completion') continue; // 填空/简答没有选项
				const raw = decryptAnswer(s.answer);
				if (!raw) continue;
				const idx = json(raw);
				if (!Array.isArray(idx) || !idx.length) continue;
				const opts = (s.option || []).map((o) => cleanText(Array.isArray(o) ? o[0] : o));
				const answers = idx.map((i) => opts[Number(i)]).filter((v) => v !== undefined);
				if (!answers.length || answers.length !== idx.length) continue;
				const stem = cleanText((s.title || []).join(''));
				const q = normalizeStem(stem);
				if (!q) continue;
				parsed++;

				let ent = bank.get(q);
				if (!ent) {
					ent = { q, stem, pool: [], versions: [] };
					bank.set(q, ent);
				}
				added += recordAnswer(ent, answers, new Set(opts).size);
			}
		}

		const totalVariants = [...bank.values()].reduce((n, v) => n + (v.versions || []).length, 0);
		console.log(`  第 ${round} 轮：解析 ${parsed} 题，新增答案 ${added} 个 ｜ 题库 ${bank.size} 题 / ${totalVariants} 版`);

		if (added === 0) {
			idle++;
			if (idle >= IDLE_STOP) {
				console.log(`\n[题库] 连续 ${IDLE_STOP} 轮无新增，判定已收全`);
				break;
			}
		} else idle = 0;

		if (!DRY) saveBank(bank);
		await new Promise((r) => setTimeout(r, 450));
	}

	// 收尾：清掉最后一场，别占着用户的考试次数
	const last = await listRecord();
	if (last) await clearRecord(last.examuserId);

	if (DRY) console.log('[题库] --dry 模式，未写文件');
	const items = [...bank.values()];
	const totalVariants = items.reduce((n, v) => n + (v.versions || []).length + ((v.pool || []).length ? 1 : 0), 0);
	console.log(`\n[题库] 完成：${items.length} 题（本次新增 ${items.length - baseItems}），答案版本 ${totalVariants} 个`);
	console.log(`[题库] 文件：${BANK_PATH}`);
	console.log('[题库] 记得重建扩展：pnpm build:ext && node honghueasystudy_desktop/scripts/sync-extension.js');
	process.exit(0);
}

// 被 require 时只导出纯函数（供离线回归测试用），不启动刷题流程
module.exports = { recordAnswer, saveBank, loadBank, normalizeStem, cleanText, BANK_PATH };

if (require.main === module) {
	main().catch((e) => {
		console.error('[题库] 失败：', e?.message || e);
		process.exit(1);
	});
}
