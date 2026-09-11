import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import QuestionListView from './views/QuestionListView.vue';
import QuestionQuizView from './views/QuestionQuizView.vue';
import QuestionDetailView from './views/QuestionDetailView.vue';
import QuestionEditorView from './views/QuestionEditorView.vue';
import SeriesView from './views/SeriesView.vue';
import SettingsView from './views/SettingsView.vue';
import { useAuthStore } from './stores/auth';
import './styles.css';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: LoginView },
  { path: '/dashboard', component: DashboardView },
  { path: '/questions', component: QuestionListView },
  { path: '/quiz', component: QuestionQuizView },
  { path: '/questions/edit', component: QuestionEditorView },
  { path: '/series', component: SeriesView },
  { path: '/settings', component: SettingsView },
  { path: '/questions/:id', component: QuestionDetailView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const pinia = createPinia();

router.beforeEach((to) => {
  const authStore = useAuthStore(pinia);

  if (!authStore.token && to.path !== '/login') {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (authStore.token && to.path === '/login') {
    return { path: '/dashboard' };
  }

  return true;
});

// 全站链接统一处理：
// 1) http(s) 外链（含 Vditor 渲染出的链接）用新标签页打开
// 2) 渲染内容里的站内路径链接（如面经关联的 /questions/:id）走 SPA 跳转，避免整页刷新丢保活状态
document.addEventListener(
  'click',
  (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (/^(https?:)?\/\//i.test(href)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      return;
    }
    if (!href.startsWith('/')) return;
    const e = event as MouseEvent;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(href);
  },
  true,
);

createApp(App).use(pinia).use(router).mount('#app');
