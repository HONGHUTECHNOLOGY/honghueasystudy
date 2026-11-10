import { createApp } from 'vue';
import App from './App.vue';
import './styles/global.css';
import { initPinned, initTheme } from './store';

/** 主题先于挂载生效，避免闪一下系统默认色 */
initTheme();
/** 置顶顺序也先载入，避免列表先按后端顺序渲染再跳一下 */
initPinned();

createApp(App).mount('#app');
