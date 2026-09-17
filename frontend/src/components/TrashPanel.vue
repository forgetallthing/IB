<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
import { questionListDirty } from '../stores/dataDirty';

interface TrashItem {
  id: string;
  title: string;
  type: 'qa' | 'article';
  visibility: 'public' | 'private';
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorName: string;
  deletedAt: string;
}

// 与后端 trashCleanup.service 的保留期一致
const RETENTION_DAYS = 30;

const { notice, fail } = useToast();
const loading = ref(false);
const loadingMore = ref(false);
const items = ref<TrashItem[]>([]);
const total = ref(0);
const hasMore = ref(false);
const page = ref(1);

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' } as const;

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 剩余保留天数 = 到期时间 - 现在，向上取整；不足 1 天显示「即将清除」
function remainingDays(iso: string) {
  const expiry = new Date(iso).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const days = Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000));
  return days > 0 ? days : 0;
}

async function loadItems(reset = true) {
  const firstLoad = reset;
  if (!firstLoad && loadingMore.value) return;
  if (firstLoad) page.value = 1;
  if (firstLoad) loading.value = true;
  else loadingMore.value = true;
  try {
    const result = await request<{ items: TrashItem[]; total: number; hasMore: boolean }>(
      `/trash?page=${page.value}&limit=20`,
    );
    items.value = firstLoad ? result.items : [...items.value, ...result.items];
    total.value = result.total;
    hasMore.value = result.hasMore;
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载回收站失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  page.value += 1;
  loadItems(false);
}

async function restoreItem(item: TrashItem) {
  const ok = await showConfirm({
    title: '恢复笔记',
    message: `「${item.title}」将恢复到原来的位置（含系列归属），确定恢复吗？`,
    confirmText: '恢复',
  });
  if (!ok) return;
  try {
    await request(`/trash/${item.id}/restore`, { method: 'POST' });
    questionListDirty.value = true;
    notice('笔记已恢复');
    await loadItems();
  } catch (error) {
    fail(error instanceof Error ? error.message : '恢复失败');
  }
}

async function purgeItem(item: TrashItem) {
  const ok = await showConfirm({
    title: '彻底删除',
    message: `「${item.title}」将被彻底删除，无法恢复。确定删除吗？`,
    confirmText: '彻底删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await request(`/questions/${item.id}?permanent=1`, { method: 'DELETE' });
    questionListDirty.value = true;
    notice('笔记已彻底删除');
    await loadItems();
  } catch (error) {
    fail(error instanceof Error ? error.message : '删除失败');
  }
}

async function emptyTrash() {
  const ok = await showConfirm({
    title: '清空回收站',
    message: `将彻底删除回收站中全部 ${total.value} 条笔记，无法恢复。确定清空吗？`,
    confirmText: '清空',
    danger: true,
  });
  if (!ok) return;
  try {
    await request('/trash/empty', { method: 'POST' });
    questionListDirty.value = true;
    notice('回收站已清空');
    await loadItems();
  } catch (error) {
    fail(error instanceof Error ? error.message : '清空失败');
  }
}

onMounted(() => loadItems());
</script>

<template>
  <article class="panel trash-panel">
    <div class="panel-head">
      <h2>回收站</h2>
      <button v-if="total > 0" class="danger" type="button" @click="emptyTrash">清空回收站</button>
    </div>
    <p class="trash-hint">
      已删除笔记保留 30 天，到期自动彻底清除<template v-if="total">，共 {{ total }} 条</template>。恢复后回到原位置（含系列归属与回想进度）。
    </p>

    <p v-if="loading && !items.length" class="trash-tip">加载中…</p>
    <p v-else-if="!items.length" class="trash-tip">回收站是空的。</p>
    <div v-else class="trash-list">
      <div v-for="item in items" :key="item.id" class="trash-row">
        <div class="row-main">
          <div class="row-title">
            <strong class="row-name">{{ item.title }}</strong>
            <span class="pill" :class="`difficulty-${item.difficulty}`">{{ difficultyLabels[item.difficulty] }}</span>
          </div>
          <p class="row-meta">
            {{ item.type === 'article' ? '文章' : '回想' }} · {{ item.visibility === 'public' ? '公开' : '私有' }}
            <template v-if="item.tags.length"> · {{ item.tags.join(' / ') }}</template>
            <br />
            {{ item.creatorName }} · 删除于 {{ fmtDateTime(item.deletedAt) }} ·
            <span :class="{ expiring: remainingDays(item.deletedAt) <= 3 }">
              {{ remainingDays(item.deletedAt) > 0 ? `${remainingDays(item.deletedAt)} 天后自动清除` : '即将自动清除' }}
            </span>
          </p>
        </div>
        <div class="row-actions">
          <button class="secondary" type="button" @click="restoreItem(item)">恢复</button>
          <button class="danger" type="button" @click="purgeItem(item)">彻底删除</button>
        </div>
      </div>
    </div>

    <div v-if="hasMore && items.length" class="load-more-row">
      <button class="secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.trash-panel {
  display: grid;
  gap: 12px;
  align-content: start;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.trash-panel h2 {
  margin: 0;
}

.trash-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.trash-list {
  display: grid;
  gap: 10px;
}

.trash-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title .pill {
  flex-shrink: 0;
}

.row-meta {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
}

.expiring {
  color: var(--danger);
  font-weight: 600;
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.load-more-row {
  display: flex;
  justify-content: center;
}

@media (max-width: 640px) {
  .trash-row {
    flex-wrap: wrap;
  }

  .row-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
