// @ts-check

const { series } = require('gulp');
const del = require('del');
const util = require('util');
const execOut = util.promisify(require('./utils').execOut);
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');

const extDir = path.resolve(__dirname, '../extension');
const libDir = path.join(extDir, 'lib');
const contentDir = path.join(extDir, 'content');

function cleanExt() {
	return del([path.join(libDir, '**')], { force: true });
}

async function buildLib() {
	process.env.VITE_BUILD_PATH = libDir;
	const viteBin = require.resolve('vite/bin/vite.js', {
		paths: [path.resolve(__dirname, '../packages/scripts')]
	});
	await execOut('node "' + viteBin + '" build', { cwd: '../packages/scripts' });
	const produced = path.join(libDir, 'index.js');
	if (!fs.existsSync(produced)) {
		throw new Error('vite build 未产出 ' + produced);
	}
}

async function buildResources() {
	const cssPath = path.resolve(__dirname, '../packages/scripts/assets/css/style.css');
	let css = '';
	try {
		css = fs.readFileSync(cssPath, 'utf8');
	} catch (e) {
		console.warn('[build-extension] style.css 未找到:', cssPath);
	}

	const meta = {
		name: '鸿鹄易学',
		version: pkg.version,
		description: pkg.description,
		author: pkg.author,
		license: pkg.license,
		namespace: 'https://honghueasystudy',
		homepage: pkg.homepage,
		source: 'https://github.com/ocsjs/ocsjs',
		icon: 'https://cdn.ocsjs.com/logo.png',
		connect: ['enncy.cn', 'icodef.com', 'ocsjs.com', 'zaizhexue.top', 'localhost', '127.0.0.1'],
		'run-at': 'document-start'
	};

	const res = {
		version: pkg.version,
		metadata: meta,
		resources: { STYLE: css }
	};

	const content = 'globalThis.__OCS_RESOURCES__ = ' + JSON.stringify(res) + ';\n';
	fs.writeFileSync(path.join(contentDir, 'resources.js'), content, 'utf8');
	console.log('[build-extension] resources.js 已生成, STYLE 长度:', css.length);
}

async function syncManifestVersion() {
	const manifestPath = path.join(extDir, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	manifest.version = pkg.version;
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n', 'utf8');
	console.log('[build-extension] manifest.json version 同步为:', pkg.version);
}

async function copyIcons() {
	const srcDir = path.resolve(__dirname, '../icon');
	const destDir = path.join(extDir, 'icon');
	if (!fs.existsSync(srcDir)) {
		console.warn('[build-extension] icon 源目录未找到:', srcDir);
		return;
	}
	fs.mkdirSync(destDir, { recursive: true });
	for (const file of fs.readdirSync(srcDir)) {
		fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
	}
	console.log('[build-extension] icon 已同步到:', destDir);
}

exports.default = series(cleanExt, buildLib, buildResources, syncManifestVersion, copyIcons);