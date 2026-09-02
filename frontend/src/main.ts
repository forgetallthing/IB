import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import LoginView from './views/LoginView.vue';
import QuestionListView from './views/QuestionListView.vue';
import QuestionQuizView from './views/QuestionQuizView.vue';
import QuestionDetailView from './views/QuestionDetailView.vue';
import QuestionEditorView from './views/QuestionEditorView.vue';
import SettingsView from './views/SettingsView.vue';
import { useAuthStore } from './stores/auth';
import './styles.css';

const routes = [
  { path: '/', redirect: '/questions' },
  { path: '/login', component: LoginView },
  { path: '/questions', component: QuestionListView },
  { path: '/quiz', component: QuestionQuizView },
  { path: '/questions/edit', component: QuestionEditorView },
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
    return { path: '/questions' };
  }

  return true;
});

// 全站 http(s) 链接统一用新标签页打开（含 Vditor 渲染出的链接）
document.addEventListener(
  'click',
  (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  },
  true,
);

createApp(App).use(pinia).use(router).mount('#app');
