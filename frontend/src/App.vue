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
        <RouterLink to="/settings" @click="closeMenu">设置</RouterLink>
      </nav>
    </aside>

    <div class="content-shell">
      <main ref="mainEl" class="app-main">
        <RouterView />
      </main>
      <button
        type="button"
        class="back-top"
        :class="{ visible: showTop }"
        title="回到顶部"
        aria-label="回到顶部"
        @click="backToTop"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 L12.2 11 H1.8 Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>

  <ConfirmDialog />
  <ToastHost />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ConfirmDialog from './components/ConfirmDialog.vue';
import ToastHost from './components/ToastHost.vue';

const route = useRoute();
const menuOpen = ref(false);

const isLoginPage = computed(() => route.path === '/login');

// 回到顶部
const mainEl = ref<HTMLElement | null>(null);
const showTop = ref(false);

function onMainScroll() {
  showTop.value = (mainEl.value?.scrollTop ?? 0) > 360;
}

function backToTop() {
  mainEl.value?.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(() => {
  mainEl.value?.addEventListener('scroll', onMainScroll, { passive: true });
});

onBeforeUnmount(() => {
  mainEl.value?.removeEventListener('scroll', onMainScroll);
});

function closeMenu() {
  menuOpen.value = false;
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
  background: rgba(240, 248, 250, 0.75);
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
  background: linear-gradient(135deg, #0f766e 0%, #0d9488 60%, #14b8a6 120%);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.25);
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
  color: #557080;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.nav-links a:hover {
  background: rgba(13, 148, 136, 0.08);
  color: var(--ink);
}

/* 路由前缀命中（如 /questions 包含 /questions/edit）给浅色态，精确命中才高亮深色 */
.nav-links a.router-link-active {
  background: rgba(15, 42, 58, 0.07);
  color: var(--ink);
}

.nav-links a.router-link-exact-active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.28);
}

.app-main {
  min-height: 0;
  overflow: auto;
  padding: 24px 32px 40px;
}

.back-top {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 30;
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--line-soft);
  background: #fff;
  color: var(--accent);
  box-shadow: 0 10px 24px rgba(15, 42, 58, 0.16);
  cursor: pointer;
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.16s ease, color 0.16s ease;
}

.back-top.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.back-top:hover {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 12px 28px rgba(15, 118, 110, 0.32);
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
    box-shadow: 0 12px 32px rgba(15, 42, 58, 0.28);
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(84vw, 320px);
    transform: translateX(-110%);
    transition: transform 0.22s ease;
    z-index: 20;
    background: rgba(240, 248, 250, 0.97);
  }

  .sidebar.open {
    transform: translateX(0);
    box-shadow: 24px 0 48px rgba(15, 42, 58, 0.18);
  }

  .app-main {
    padding-left: 20px;
    padding-right: 20px;
  }
}
</style>
