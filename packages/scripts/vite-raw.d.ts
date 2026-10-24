/**
 * vite 的 ?raw 导入声明。
 * 注意：必须放在独立的环境声明文件里——global.d.ts 顶部有 import 会被当作模块文件，
 * 其中的 declare module 会变成模块增强而非环境声明，导致 ?raw 模块解析失败。
 */
declare module '*?raw' {
	const content: string;
	export default content;
}
