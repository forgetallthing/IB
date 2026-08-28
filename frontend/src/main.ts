import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import LoginView from './views/LoginView.vue';
import QuestionListView from './views/QuestionListView.vue';
import QuestionDetailView from './views/QuestionDetailView.vue';
import QuestionEditorView from './views/QuestionEditorView.vue';
import SettingsView from './views/SettingsView.vue';
import { useAuthStore } from './stores/auth';
import './styles.css';

const routes = [
  { path: '/', redirect: '/questions' },
  { path: '/login', component: LoginView },
  { path: '/questions', component: QuestionListView },
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

createApp(App).use(pinia).use(router).mount('#app');
