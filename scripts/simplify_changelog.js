const { readFileSync, writeFileSync } = require('fs');
const { series } = require('gulp');
const path = require('path');

exports.default = series((/** @type {Function} */ cb) => {
	let changelog = readFileSync(path.resolve(__dirname, '../CHANGELOG.md'), 'utf-8');

	// 移除链接部分
	changelog = changelog.replace(/\(\[.+\]\((.+)\)\)/g, '<a href="$1">></a>');

	// 移除空更新内容
	changelog = changelog.replace(/(#+)\s+\[(.+)\]\(.+\)\s\((.+)\)(?=\n+(#+)\s+\[(.+)\]\(.+\)\s\((.+)\))/g, '');

	// 简化标题格式
	changelog = changelog.replace(/(#+)\s+\[(.+)\]\(.+\)\s\((.+)\)/g, '$1 $2 ($3)');

	// 移除多余的Scope说明
	changelog = changelog.replace(/\*\s+\*\*.+\*\*\s/g, '* ');

	changelog = changelog.replace(/Bug Fixes/g, '🔧 修复内容');
	changelog = changelog.replace(/Features/g, '✨ 更新内容');
	changelog = changelog.replace(/Performance Improvements/g, '⚡ 优化提升');

	writeFileSync(path.resolve(__dirname, '../CHANGELOG_SIMPLIFIED.md'), changelog, 'utf-8');
	cb();
});
