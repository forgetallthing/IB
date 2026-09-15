<template>
  <div v-if="isLoginPage" class="auth-shell">
    <RouterView />
  </div>

  <div v-else class="app-shell">
    <!-- 移动端抽屉蒙版：点击收起菜单 -->
    <Transition name="mask-fade">
      <div v-if="menuOpen" class="sidebar-mask" @click="closeMenu"></div>
    </Transition>

    <aside :class="['sidebar', { open: menuOpen }]">
      <div class="brand">
        <div class="logo-mark">IB</div>
        <p class="eyebrow">INTERVIEW BANK</p>
        <h1>笔记库</h1>
        <p class="subtitle">沉淀每一次思考。</p>
      </div>

      <nav class="nav-links">
        <RouterLink to="/dashboard" @click="closeMenu">数据看板</RouterLink>
        <RouterLink to="/questions" @click="closeMenu">笔记中心</RouterLink>
        <RouterLink to="/quiz" @click="closeMenu">每日回想</RouterLink>
        <RouterLink to="/series" @click="closeMenu">系列笔记</RouterLink>
        <RouterLink to="/settings" @click="closeMenu">设置</RouterLink>
      </nav>
    </aside>

    <div class="content-shell">
      <!-- 固定顶部工具栏：各页页头经 PageToolbar Teleport 进 #page-toolbar-slot，不参与滚动 -->
      <div class="page-toolbar-row">
        <!-- 移动端：全局导航菜单收进工具栏最左 ☰ -->
        <button
          class="toolbar-menu-btn"
          type="button"
          aria-label="菜单"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <svg width="20" height="20" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6H15M3 9H15M3 12H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <div id="page-toolbar-slot"></div>
      </div>
      <main ref="mainEl" class="app-main">
        <RouterView v-slot="{ Component }">
          <!-- KeepAlive 内不允许注释节点：详情页按 path 独立实例（key），每篇笔记一个保活实例 -->
          <KeepAlive :include="keepAliveNames">
            <component :is="Component" :key="isDetailPath(route.path) ? route.path : undefined" />
          </KeepAlive>
        </RouterView>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ConfirmDialog from './components/ConfirmDialog.vue';
import ToastHost from './components/ToastHost.vue';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const auth = useAuthStore();
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

// 保活有状态的页面：列表（页码/滚动/展开项）、系列（目录展开）、回想（作答现场）、详情（滚动/渲染结果）
const keepAliveNames = ref<string[]>(['QuestionListView', 'SeriesView', 'QuestionQuizView', 'QuestionDetailView']);

// 登录/登出/切换账号时清空保活缓存，避免看到上一位用户的页面状态
watch(
  () => auth.token,
  async () => {
    const names = keepAliveNames.value;
    keepAliveNames.value = [];
    await nextTick();
    keepAliveNames.value = names;
  },
);

// 是否笔记详情页（/questions/:id，ObjectId；排除 /questions/edit 等）
function isDetailPath(p: string): boolean {
  return /^\/questions\/[a-f\d]{24}$/i.test(p);
}

// 保活页面离开时 .app-main 的滚动位置会被重置，按路径记忆并在返回时恢复
// 详情页路径动态，前缀判断；前进跳转滚顶，返回恢复精确位置（保活 DOM 已在，无恢复偏差）
const keptScrollPaths = new Set(['/questions', '/series', '/quiz']);
const scrollMemory = new Map<string, number>();
let lastNavPos = typeof window.history.state?.position === 'number' ? window.history.state.position : 0;

watch(
  () => route.fullPath,
  (to, from) => {
    closeMenu();
    const pos = typeof window.history.state?.position === 'number' ? window.history.state.position : 0;
    const isBack = pos < lastNavPos;
    lastNavPos = pos;

    const toPath = to.split('?')[0];
    if (from && mainEl.value) scrollMemory.set(from.split('?')[0], mainEl.value.scrollTop);
    if (keptScrollPaths.has(toPath) || isDetailPath(toPath)) {
      const isDetail = isDetailPath(toPath);
      void nextTick(() => {
        requestAnimationFrame(() => {
          if (!mainEl.value) return;
          // 前进进入详情：总是滚到顶部；返回才恢复之前浏览位置
          if (isDetail && !isBack) {
            mainEl.value.scrollTop = 0;
            return;
          }
          const saved = scrollMemory.get(toPath);
          if (saved != null) mainEl.value.scrollTop = saved;
        });
      });
    }
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

/* 移动端全局菜单按钮：桌面隐藏，移动端固定在工具栏最右（见 media） */
.toolbar-menu-btn {
  display: none;
}

/* 抽屉蒙版仅移动端存在；桌面兜底隐藏（防止窗口拉宽后 menuOpen 残留） */
.sidebar-mask {
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
  /* 第一行固定工具栏（不滚动），第二行滚动内容区 */
  grid-template-rows: auto minmax(0, 1fr);
}

.page-toolbar-row {
  height: var(--toolbar-h);
  position: relative;
  z-index: 25;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line-soft);
  background: rgba(240, 248, 250, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

#page-toolbar-slot {
  width: 100%;
  display: flex;
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

/* 触摸屏点击后 :hover 会粘住，hover 仅限支持悬停的设备 */
@media (hover: hover) {
  .nav-links a:hover {
    background: rgba(13, 148, 136, 0.08);
    color: var(--ink);
  }
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
  /* 顶部 20px：工具栏行已承担分隔（60+20+40=120，见 Dashboard/Quiz 的 calc 公式） */
  padding: 20px 32px 40px;
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

@media (hover: hover) {
  .back-top:hover {
    background: var(--primary);
    color: #fff;
    box-shadow: 0 12px 28px rgba(15, 118, 110, 0.32);
  }
}

.app-main > * {
  max-width: 1180px;
  margin-inline: auto;
}

@media (max-width: 1120px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  /* 全局菜单入口：工具栏最左 ☰（替代原左下角悬浮「菜单」按钮） */
  .toolbar-menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    margin-left: 14px;
    margin-right: 4px;
    padding: 0;
    background: none;
    color: var(--muted);
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    box-shadow: none;
  }

  /* hover 粘住问题：触摸设备不给悬停反馈 */
  @media (hover: hover) {
    .toolbar-menu-btn:hover:not(:disabled) {
      background: rgba(13, 148, 136, 0.09);
      color: var(--accent);
      transform: none;
      box-shadow: none;
    }
  }

  .toolbar-menu-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.35);
  }

  /* 蒙版：盖住工具栏与内容，点击收起抽屉；抽屉在其上为最高层 */
  .sidebar-mask {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(15, 42, 58, 0.42);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .mask-fade-enter-active,
  .mask-fade-leave-active {
    transition: opacity 0.2s ease;
  }

  .mask-fade-enter-from,
  .mask-fade-leave-to {
    opacity: 0;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(84vw, 320px);
    transform: translateX(-110%);
    transition: transform 0.22s ease;
    z-index: 50;
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
