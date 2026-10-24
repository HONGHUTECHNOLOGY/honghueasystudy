import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import banner from 'vite-plugin-banner';
import { author, description, homepage, license, name } from '../../package.json';
import dotenv from 'dotenv';

const bannerContent = `
/*!
 * ${name} ( ${homepage} )
 * ${description}
 * copyright ${author}
 * license ${license}
 */
`;

dotenv.config();

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		// easy-us 已本地化为 workspace 包（CJS 产物），符号链接 realpath 在 node_modules 之外，
		// 需显式纳入 rollup 的 commonjs 转换范围，否则命名导出解析失败
		commonjsOptions: {
			include: [/node_modules/, /[\\/]packages[\\/]easy-us[\\/]/],
			extensions: ['.js', '.cjs']
		},
		/** 取消css代码分离 */
		cssCodeSplit: false,
		/** 输出路径 */
		outDir: process.env.VITE_BUILD_PATH,
		/** 清空输出路径 */
		emptyOutDir: false,
		/** 是否压缩代码 */
		minify: false,
		/** 打包库， 全局名字为 HH */
		lib: {
			entry: './src/index.ts',
			name: 'HH',
			fileName: () => 'core.js',
			formats: ['umd']
		}
	},

	plugins: [visualizer(), banner(bannerContent)]
});
