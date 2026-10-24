// @ts-check

const { series } = require('gulp');
const del = require('del');
const util = require('util');
const { version } = require('../package.json');
/** @type {(...args: any[])=> Promise<void>} */
const execOut = util.promisify(require('./utils').execOut);
const { createUserScript, createMetaFile } = require('../packages/utils');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const distPath = process.env.BUILD_PATH || '../dist';
console.log('BUILD_PATH: ', distPath);
const distResolvedPath = path.resolve(__dirname, distPath);

function cleanOutput() {
	return del([distPath, '../lib'], { force: true });
}

async function testResolver() {
	await execOut('tsx ../tests/resolver.test.ts');
}

async function buildPackages() {
	// vite 装在各包自己的 node_modules 里，exec 的 PATH 不含 node_modules/.bin，
	// 用 require.resolve 定位入口（与 build-extension.js 同一套做法）
	const coreVite = require.resolve('vite/bin/vite.js', { paths: [path.resolve(__dirname, '../packages/core')] });
	const scriptsVite = require.resolve('vite/bin/vite.js', { paths: [path.resolve(__dirname, '../packages/scripts')] });
	// vite 配置的 outDir 读取 VITE_BUILD_PATH；userjs 组装依赖 dist/index.js 与 dist/core.js
	const viteOpts = () => ({
		cwd: '../packages',
		env: { ...process.env, VITE_BUILD_PATH: distResolvedPath }
	});
	await execOut('tsc', { cwd: '../packages/core' });
	await execOut(`node "${coreVite}" build`, { ...viteOpts(), cwd: '../packages/core' });
	await execOut('tsc', { cwd: '../packages/scripts' });
	await execOut(`node "${scriptsVite}" build`, { ...viteOpts(), cwd: '../packages/scripts' });
}

async function createUserJs() {
	/** 模拟浏览器环境 */
	require('browser-env')();

	// @ts-ignore
	globalThis.unsafeWindow = {};

	/** @type {import('../packages/scripts/src/index')} */
	// @ts-ignore
	const hh = require(path.join(distPath, 'index.js'));

	/** @return {import('../packages/utils').CreateOptions} */
	const createOptions = () => {
		const { CXProject, ZHSProject, ZJYProject, IcveMoocProject, ICourseProject, YKTProject } = hh;
		const projectList = [CXProject, ZHSProject, ZJYProject, IcveMoocProject, ICourseProject, YKTProject]
			.map((s) => `【${s.name}】`)
			.join(' ');

		const matchMetadata = Array.from(
			new Set(
				hh
					.definedProjects()
					.map((p) => (p.domains || []).map((d) => `*://*.${d}/*`))
					.flat()
			)
		);

		return {
			parseRequire: true,
			parseResource: true,
			resourceBuilder: (key, value) => `const ${key} = \`${value}\`;`,
			metaDataFormatter: {
				header: '==UserScript==',
				footer: '==/UserScript==',
				prefix: '// ',
				symbol: '@',
				gap: '\t'.repeat(4)
			},
			metadata: {
				name: '鸿鹄易学',
				version: version,
				description: [
					'鸿鹄易学 网课助手，专注于帮助大学生从网课中释放出来',
					'让自己的时间把握在自己的手中，拥有人性化的操作页面，流畅的步骤提示，支持 ',
					projectList,
					'等网课的学习，作业。具体的功能请查看脚本悬浮窗中的教程页面。'
				].join(' '),
				author: 'enncy',
				license: 'MIT',
				namespace: 'https://honghueasystudy',
				homepage: 'https://easystudy.honghutech.eu.org',
				source: 'https://easystudy.honghutech.eu.org',
				icon: 'https://easystudy.honghutech.eu.org/assets/img/icon.png',
				connect: [
					'easystudy.honghutech.eu.org',
					'enncy.cn',
					'icodef.com',
					'zaizhexue.top',
					'localhost',
					'127.0.0.1'
				],
				match: matchMetadata,
				grant: [
					'GM_info',
					'GM_getTab',
					'GM_saveTab',
					'GM_setValue',
					'GM_getValue',
					'unsafeWindow',
					'GM_listValues',
					'GM_deleteValue',
					'GM_notification',
					'GM_xmlhttpRequest',
					'GM_getResourceText',
					'GM_addValueChangeListener',
					'GM_removeValueChangeListener'
				],
				require: [path.join(__dirname, distPath, 'index.js')],
				resource: [`STYLE ${path.join(__dirname, '../packages/scripts/assets/css/style.css')}`],
				'run-at': 'document-start',
				antifeature: 'payment'
			},
			entry: path.join(__dirname, '../packages/scripts/entry.js'),
			dist: path.join(__dirname, distPath, 'honghu.user.js')
		};
	};

	const officialOpts = createOptions();
	console.log('CreateUserScript: ', officialOpts.metadata.name, officialOpts.dist);
	await createUserScript(officialOpts);
	console.log('createMetaFile: ', path.join(distResolvedPath, 'honghu.meta.js'));
	await createMetaFile({ dist: officialOpts.dist, metaDist: path.join(distResolvedPath, 'honghu.meta.js') });

	/** 创建调试脚本 */
	const devOpts = createOptions();
	devOpts.parseRequire = false;
	devOpts.parseResource = false;
	devOpts.metadata.name = devOpts.metadata.name + '(dev)';
	devOpts.metadata.require = ['file:///' + path.join(distResolvedPath, 'index.js')];
	devOpts.metadata.resource = [`STYLE file:///${path.join(__dirname, '../packages/scripts/assets/css/style.css')}`];
	devOpts.entry = path.join(__dirname, '../packages/scripts/entry.dev.js');
	devOpts.dist = path.join(distResolvedPath, 'honghu.dev.user.js');
	/** 导出样式文件 */
	fs.copyFileSync(
		path.join(__dirname, '../packages/scripts/assets/css/style.css'),
		path.join(distResolvedPath, 'style.css')
	);
	console.log('createUserScript: ', devOpts.metadata.name, devOpts.dist);
	await createUserScript(devOpts);

	/** 创建全Connect域名通用脚本 */
	const commonOpts = createOptions();
	commonOpts.metadata.name = commonOpts.metadata.name + ' - 全域名通用版';
	const connect = Array.isArray(commonOpts.metadata.connect) ? commonOpts.metadata.connect : [];
	connect.push('*');
	commonOpts.metadata.connect = connect;
	commonOpts.entry = path.join(__dirname, '../packages/scripts/entry.common.js');
	commonOpts.dist = path.join(distResolvedPath, 'honghu.common.user.js');

	console.log('createUserScript: ', commonOpts.metadata.name, commonOpts.dist);
	await createUserScript(commonOpts);
}

exports.default = series(cleanOutput, testResolver, buildPackages, createUserJs);
