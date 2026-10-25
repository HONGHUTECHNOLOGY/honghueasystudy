import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
	build: {
		/** 主进程 express 直接托管该目录 */
		outDir: '../app/public-remote',
		emptyOutDir: true,
		target: 'es2019',
		minify: 'esbuild',
		chunkSizeWarningLimit: 800
	},
	/** 相对路径，避免部署在子路径时资源 404 */
	base: './',
	plugins: [vue()],
	server: {
		port: 3100,
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:15320',
				changeOrigin: false
			}
		}
	}
});
