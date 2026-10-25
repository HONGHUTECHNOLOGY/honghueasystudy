import { createApp } from 'vue';
import App from './App.vue';
import './styles/global.css';
import { initTheme } from './store';

/** 主题先于挂载生效，避免闪一下系统默认色 */
initTheme();

createApp(App).mount('#app');
