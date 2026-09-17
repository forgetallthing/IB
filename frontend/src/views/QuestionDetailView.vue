<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { request } from '../api';
import PageToolbar from '../components/PageToolbar.vue';
import VersionDrawer from '../components/VersionDrawer.vue';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';

// 详情页在 KeepAlive 中按 path 独立实例保活（App.vue keepAliveNames + isDetailPath key），
// 滚动位置随 DOM 一起保留，无需手动记忆恢复
defineOptions({ name: 'QuestionDetailView' });

interface QuestionItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorId: string;
  creatorName: string;
  visibility: 'public' | 'private';
  type?: 'qa' | 'article';
  series?: { id: string; title: string };
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const { notice, fail } = useToast();
const item = ref<QuestionItem | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' } as const;

const previewOptions = {
  lang: 'zh_CN',
  mode: 'light',
  cdn: '/vditor',
  hljs: { style: 'github', lineNumber: false },
} as const;

async function loadDetail() {
  loading.value = true;
  try {
    item.value = await request<QuestionItem>(`/questions/${route.params.id}`);
    await nextTick();
    if (contentEl.value && item.value) {
      // 与列表/回想页一致，用 Vditor.preview 渲染：本地 /vditor 资源 + hljs 代码高亮
      Vditor.preview(contentEl.value, item.value.content || '', previewOptions);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载详情失败');
  } finally {
    loading.value = false;
  }
}

// 保存/恢复后的静默刷新：不亮 loading，原地更新标题与正文
async function silentReload() {
  if (!item.value) return;
  try {
    item.value = await request<QuestionItem>(`/questions/${item.value.id}`);
    await nextTick();
    if (contentEl.value && item.value) {
      Vditor.preview(contentEl.value, item.value.content || '', previewOptions);
    }
  } catch {
    // 静默失败：保留现有内容
  }
}

// 返回来源列表：从系列目录进入时回系列页，其余回笔记中心（vue-router 在 history.state.back 记录来源）
function backToList() {
  if (typeof window.history.state?.back === 'string') router.back();
  else router.push('/questions');
}

// ===== 历史版本抽屉：渲染逻辑在 VersionDrawer 组件，此处仅控制显隐 =====
const drawerOpen = ref(false);

// 与编辑权限一致：仅创建者或管理员可查看/恢复历史版本
const canViewVersions = computed(() => {
  if (!item.value) return false;
  return auth.user?.role === 'admin' || item.value.creatorId === auth.user?.id;
});

onMounted(loadDetail);
</script>

<template>
  <section class="page">
    <!-- 页头上移至全站固定工具栏：左标题/说明、右操作按钮 -->
    <PageToolbar>
      <div>
        <h1>笔记详情</h1>
        <p class="subtitle">{{ item?.title }}</p>
      </div>
      <div class="header-actions">
        <button class="secondary" type="button" @click="backToList">返回列表</button>
        <button v-if="item && canViewVersions" class="secondary" type="button" @click="drawerOpen = true">历史版本</button>
        <button v-if="item" class="secondary" type="button" @click="router.push(`/questions/edit?id=${item.id}`)">编辑</button>
      </div>
    </PageToolbar>

    <p v-if="loading" class="loading">详情加载中…</p>

    <article v-if="item" class="panel">
      <div class="detail-head">
        <div>
          <p class="meta">
            {{ item.creatorName }}
            · {{ item.visibility === 'public' ? '公开' : '私有' }}
            · {{ item.type === 'article' ? '文章' : '回想' }}
            <button v-if="item.series" type="button" class="series-badge" @click="router.push('/series')">
              系列 · {{ item.series.title }}
            </button>
          </p>
          <h1 class="title">{{ item.title }}</h1>
        </div>
        <span class="pill" :class="`difficulty-${item.difficulty}`">{{ difficultyLabels[item.difficulty] }}</span>
      </div>

      <div class="tag-row">
        <span v-for="tag in item.tags" :key="tag" class="tag">#{{ tag }}</span>
      </div>

      <div ref="contentEl" class="content"></div>
    </article>

    <!-- 历史版本抽屉：蒙版/列表/预览/恢复在 VersionDrawer 内渲染，恢复成功后静默刷新详情 -->
    <VersionDrawer
      v-if="drawerOpen && item"
      :question-id="item.id"
      @close="drawerOpen = false"
      @restored="silentReload"
    />
  </section>
</template>

<style scoped>
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.title {
  margin: 6px 0 0;
  font-size: 24px;
  letter-spacing: -0.01em;
}

/* 难度徽标不被标题挤压，文字保持一行 */
.detail-head .pill {
  flex-shrink: 0;
  white-space: nowrap;
}

.tag-row {
  margin-top: 12px;
}

.content {
  margin-top: 8px;
  line-height: 1.8;
  /* 行内代码/链接中的超长 URL 允许任意断行，避免撑出页面横向区域 */
  overflow-wrap: anywhere;
}

/* 代码块内部横向滚动，不把页面撑出横向溢出 */
.content :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
}

.content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.series-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 10px;
  border: none;
  border-radius: 999px;
  background: rgba(13, 148, 136, 0.12);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  vertical-align: 1px;
  transition: background 0.15s ease;
}

@media (hover: hover) {
  .series-badge:hover {
    background: rgba(13, 148, 136, 0.2);
  }
}
</style>
