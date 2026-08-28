<template>
  <div v-if="isLoginPage" class="auth-shell">
    <RouterView />
  </div>

  <div v-else class="app-shell">
    <button class="mobile-menu-button" type="button" @click="menuOpen = !menuOpen">菜单</button>

    <aside :class="['sidebar', { open: menuOpen }]">
      <div class="brand">
        <div class="logo-mark">IB</div>
        <p class="eyebrow">INTERVIEW BANK</p>
        <h1>笔记库</h1>
        <p class="subtitle">沉淀每一次思考。</p>
      </div>

      <nav class="nav-links">
        <RouterLink to="/questions" @click="closeMenu">笔记中心</RouterLink>
        <RouterLink to="/questions/edit" @click="closeMenu">笔记编辑</RouterLink>
        <RouterLink to="/questions/io" @click="closeMenu">导入导出</RouterLink>
        <RouterLink v-if="isAdmin" to="/settings" @click="closeMenu">设置</RouterLink>
        <button class="nav-button" type="button" @click="logout">退出登录</button>
      </nav>
    </aside>

    <div class="content-shell">
      <main class="app-main">
        <RouterView />
      </main>
    </div>
  </div>

  <ConfirmDialog />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmDialog from './components/ConfirmDialog.vue';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const menuOpen = ref(false);

const isLoginPage = computed(() => route.path === '/login');
const isAdmin = computed(() => authStore.user?.role === 'admin');

function closeMenu() {
  menuOpen.value = false;
}

function logout() {
  authStore.clearSession();
  closeMenu();
  router.replace('/login');
}

watch(
  () => route.fullPath,
  () => {
    closeMenu();
  },
);
</script>

<style scoped>
.app-shell {
  height: 100dvh;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  color: var(--ink);
}

.auth-shell {
  height: 100dvh;
  display: grid;
  place-items: center;
}

.mobile-menu-button {
  display: none;
}

.sidebar {
  padding: 28px 20px;
  border-right: 1px solid var(--line-soft);
  display: grid;
  gap: 26px;
  align-content: start;
  position: sticky;
  top: 0;
  height: 100vh;
  background: rgba(255, 252, 245, 0.72);
  backdrop-filter: blur(12px);
}

.content-shell {
  min-width: 0;
  min-height: 0;
  display: grid;
}

.brand {
  display: grid;
  gap: 6px;
}

.logo-mark {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #2b231d 0%, #5c4633 60%, #b4551e 120%);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 18px rgba(64, 48, 32, 0.25);
  margin-bottom: 6px;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.01em;
}

.subtitle {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
  font-size: 13px;
}

.nav-links {
  display: grid;
  gap: 6px;
}

.nav-links a {
  display: block;
  padding: 11px 14px;
  border-radius: 12px;
  background: transparent;
  border: 1px solid transparent;
  color: #5d5046;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.nav-links a:hover {
  background: rgba(180, 85, 30, 0.08);
  color: var(--ink);
}

/* 路由前缀命中（如 /questions 包含 /questions/edit）给浅色态，精确命中才高亮深色 */
.nav-links a.router-link-active {
  background: rgba(43, 35, 29, 0.07);
  color: var(--ink);
}

.nav-links a.router-link-exact-active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 8px 18px rgba(154, 67, 26, 0.28);
}

.nav-button {
  padding: 11px 16px;
  background: var(--surface-tint);
  color: var(--ink);
  border-color: var(--line);
}

.nav-button:hover:not(:disabled) {
  background: #efe5d3;
  box-shadow: 0 8px 18px rgba(64, 48, 32, 0.12);
}

.app-main {
  min-height: 0;
  overflow: auto;
  padding: 24px 32px 40px;
}

.app-main > * {
  max-width: 1180px;
  margin-inline: auto;
}

@media (max-width: 1120px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .mobile-menu-button {
    display: inline-flex;
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 30;
    border-radius: 999px;
    padding: 14px 20px;
    box-shadow: 0 12px 32px rgba(31, 26, 23, 0.28);
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(84vw, 320px);
    transform: translateX(-110%);
    transition: transform 0.22s ease;
    z-index: 20;
    background: rgba(255, 252, 245, 0.97);
  }

  .sidebar.open {
    transform: translateX(0);
    box-shadow: 24px 0 48px rgba(31, 26, 23, 0.18);
  }

  .app-main {
    padding-left: 20px;
    padding-right: 20px;
  }
}
</style>
