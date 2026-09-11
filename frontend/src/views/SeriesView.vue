<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';

interface SeriesItem {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  creatorName: string;
  canManage: boolean;
  articleCount: number;
}

interface CatalogArticle {
  id: string;
  title: string;
  visibility: 'public' | 'private';
  creatorName: string;
}

interface PickerArticle {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  visibility: 'public' | 'private';
  seriesId?: string;
}

const router = useRouter();
const auth = useAuthStore();
const { notice, fail } = useToast();

const loading = ref(false);
const seriesList = ref<SeriesItem[]>([]);
// 目录展开状态：默认全部折叠
const expanded = ref<Record<string, boolean>>({});
const articlesBySeries = ref<Record<string, CatalogArticle[]>>({});
const loadingArticles = ref<Record<string, boolean>>({});

function isExpanded(id: string) {
  return !!expanded.value[id];
}

function articlesOf(id: string): CatalogArticle[] {
  return articlesBySeries.value[id] ?? [];
}

async function toggleExpand(s: SeriesItem) {
  expanded.value[s.id] = !expanded.value[s.id];
  if (expanded.value[s.id] && !articlesBySeries.value[s.id]) {
    await loadArticles(s.id);
  }
}

async function loadArticles(id: string) {
  loadingArticles.value[id] = true;
  try {
    const detail = await request<{ articles: CatalogArticle[] }>(`/series/${id}`);
    articlesBySeries.value[id] = detail.articles;
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载目录失败');
  } finally {
    loadingArticles.value[id] = false;
  }
}

async function loadSeries() {
  loading.value = true;
  try {
    seriesList.value = await request<SeriesItem[]>('/series');
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载系列失败');
  } finally {
    loading.value = false;
  }
}

// ---------- 拖拽排序（同级之间）：系列行与文章行 ----------
const dragType = ref<'series' | 'article' | null>(null);
const dragFrom = ref<number>(-1);
const dragSeriesId = ref('');
const overKey = ref('');

function resetDrag() {
  dragType.value = null;
  dragFrom.value = -1;
  dragSeriesId.value = '';
  overKey.value = '';
}

function onSeriesDragStart(index: number) {
  dragType.value = 'series';
  dragFrom.value = index;
}

function onSeriesDragOver(event: DragEvent, index: number) {
  if (dragType.value !== 'series') return;
  event.preventDefault();
  overKey.value = `series:${index}`;
}

async function onSeriesDrop(index: number) {
  const from = dragFrom.value;
  const type = dragType.value;
  resetDrag();
  if (type !== 'series' || from === index || from < 0) return;

  const list = [...seriesList.value];
  const [moved] = list.splice(from, 1);
  if (!moved) return;
  list.splice(index, 0, moved);
  seriesList.value = list;

  try {
    await request('/series/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ seriesIds: list.map((s) => s.id) }),
    });
    notice('排序已保存');
  } catch (error) {
    fail(error instanceof Error ? error.message : '排序保存失败');
    await loadSeries();
  }
}

function onArticleDragStart(s: SeriesItem, index: number) {
  dragType.value = 'article';
  dragSeriesId.value = s.id;
  dragFrom.value = index;
}

function onArticleDragOver(event: DragEvent, s: SeriesItem, index: number) {
  if (dragType.value !== 'article' || dragSeriesId.value !== s.id) return;
  event.preventDefault();
  overKey.value = `article:${s.id}:${index}`;
}

async function onArticleDrop(s: SeriesItem, index: number) {
  const from = dragFrom.value;
  const type = dragType.value;
  const fromSeriesId = dragSeriesId.value;
  resetDrag();
  if (type !== 'article' || fromSeriesId !== s.id || from === index || from < 0) return;

  const list = [...articlesOf(s.id)];
  const [moved] = list.splice(from, 1);
  if (!moved) return;
  list.splice(index, 0, moved);
  articlesBySeries.value[s.id] = list;

  try {
    await request(`/series/${s.id}/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ questionIds: list.map((a) => a.id) }),
    });
    notice('排序已保存');
  } catch (error) {
    fail(error instanceof Error ? error.message : '排序保存失败');
    await loadArticles(s.id);
  }
}

// ---------- 新建系列 ----------
const createOpen = ref(false);
const creating = ref(false);
const createForm = reactive({ title: '', description: '' });

function openCreate() {
  createForm.title = '';
  createForm.description = '';
  createOpen.value = true;
}

async function submitCreate() {
  if (!createForm.title.trim()) {
    fail('系列名称不能为空');
    return;
  }
  creating.value = true;
  try {
    const created = await request<{ id: string }>('/series', {
      method: 'POST',
      body: JSON.stringify({ title: createForm.title.trim(), description: createForm.description }),
    });
    notice('系列已创建');
    createOpen.value = false;
    await loadSeries();
    // 新系列自动展开并加载目录
    expanded.value[created.id] = true;
    await loadArticles(created.id);
  } catch (error) {
    fail(error instanceof Error ? error.message : '创建失败');
  } finally {
    creating.value = false;
  }
}

// ---------- 改名 / 编辑简介 ----------
const renaming = ref(false);
const renameId = ref('');
const renameForm = reactive({ title: '', description: '' });

function openRename(s: SeriesItem) {
  renameId.value = s.id;
  renameForm.title = s.title;
  renameForm.description = s.description;
  renaming.value = true;
}

async function submitRename() {
  if (!renameId.value) return;
  if (!renameForm.title.trim()) {
    fail('系列名称不能为空');
    return;
  }
  try {
    await request(`/series/${renameId.value}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: renameForm.title.trim(), description: renameForm.description }),
    });
    notice('系列已更新');
    renaming.value = false;
    await loadSeries();
  } catch (error) {
    fail(error instanceof Error ? error.message : '保存失败');
  }
}

async function removeSeries(s: SeriesItem) {
  const ok = await showConfirm({
    title: '删除系列',
    message: `确定删除系列「${s.title}」吗？系列内的文章不会被删除，仅移出该系列。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    const result = await request<{ unbound: number }>(`/series/${s.id}`, { method: 'DELETE' });
    notice(result.unbound ? `系列已删除，${result.unbound} 篇文章已移出` : '系列已删除');
    delete expanded.value[s.id];
    delete articlesBySeries.value[s.id];
    await loadSeries();
  } catch (error) {
    fail(error instanceof Error ? error.message : '删除失败');
  }
}

// ---------- 添加文章弹层 ----------
const addOpen = ref(false);
const addSeries = ref<SeriesItem | null>(null);
const loadingCandidates = ref(false);
const adding = ref(false);
const candidates = ref<PickerArticle[]>([]);
const pickedIds = ref<string[]>([]);
const pickerQuery = ref('');

const filteredCandidates = computed(() => {
  const kw = pickerQuery.value.trim().toLowerCase();
  if (!kw) return candidates.value;
  return candidates.value.filter((item) => item.title.toLowerCase().includes(kw));
});

// 候选 = 文章类型 + 未入任何系列 + 自己创建（admin 不限）
async function openAdd(s: SeriesItem) {
  addSeries.value = s;
  addOpen.value = true;
  pickedIds.value = [];
  pickerQuery.value = '';
  loadingCandidates.value = true;
  try {
    const result = await request<{ items: PickerArticle[] }>('/questions?type=article&limit=100&page=1');
    const isAdmin = auth.user?.role === 'admin';
    const meId = auth.user?.id ?? '';
    candidates.value = result.items.filter(
      (item) => !item.seriesId && (isAdmin || item.creatorId === meId),
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载文章列表失败');
    addOpen.value = false;
  } finally {
    loadingCandidates.value = false;
  }
}

async function submitAdd() {
  if (!addSeries.value) return;
  if (!pickedIds.value.length) {
    fail('请选择要添加的文章');
    return;
  }
  adding.value = true;
  try {
    const result = await request<{ added: number }>(`/series/${addSeries.value.id}/articles`, {
      method: 'POST',
      body: JSON.stringify({ questionIds: pickedIds.value }),
    });
    notice(`已添加 ${result.added} 篇文章`);
    addOpen.value = false;
    expanded.value[addSeries.value.id] = true;
    await Promise.all([loadSeries(), loadArticles(addSeries.value.id)]);
  } catch (error) {
    fail(error instanceof Error ? error.message : '添加失败');
  } finally {
    adding.value = false;
  }
}

async function removeArticle(s: SeriesItem, article: CatalogArticle) {
  const ok = await showConfirm({
    title: '移出文章',
    message: `确定将「${article.title}」移出该系列吗？文章本身不会被删除。`,
    confirmText: '移出',
  });
  if (!ok) return;
  try {
    await request(`/series/${s.id}/articles/${article.id}`, { method: 'DELETE' });
    notice('文章已移出系列');
    await Promise.all([loadSeries(), loadArticles(s.id)]);
  } catch (error) {
    fail(error instanceof Error ? error.message : '移出失败');
  }
}

// 页面被 KeepAlive 保活：每次回到本页刷新系列列表与已展开系列的目录（文章可能在别处被删除/移出）
onActivated(() => {
  loadSeries();
  for (const id of Object.keys(expanded.value)) {
    if (expanded.value[id] && articlesBySeries.value[id]) void loadArticles(id);
  }
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>系列笔记</h1>
        <p class="subtitle">目录形式组织系列与文章：点击系列展开目录，同级拖拽调整顺序。</p>
      </div>
      <div class="header-actions">
        <button type="button" @click="openCreate">新建系列</button>
      </div>
    </header>

    <p v-if="loading && !seriesList.length" class="loading">加载中…</p>
    <p v-else-if="!seriesList.length" class="empty-hint panel">还没有系列，点击右上角「新建系列」创建一个</p>

    <div v-else class="tree panel">
      <div v-for="(s, si) in seriesList" :key="s.id" class="series-node">
        <!-- 系列行：点击折叠/展开，整行可拖拽排序 -->
        <div
          class="series-row"
          :draggable="true"
          :class="{ dragging: dragType === 'series' && dragFrom === si, 'drag-over': overKey === `series:${si}` && dragType === 'series' }"
          @click="toggleExpand(s)"
          @dragstart="onSeriesDragStart(si)"
          @dragover="onSeriesDragOver($event, si)"
          @drop.prevent="onSeriesDrop(si)"
          @dragend="resetDrag"
        >
          <span class="chevron" :class="{ open: isExpanded(s.id) }">▾</span>
          <span class="series-title">{{ s.title }}</span>
          <span v-if="s.description" class="series-desc">{{ s.description }}</span>
          <span class="series-meta">{{ s.articleCount }} 篇</span>
          <i v-if="s.canManage" class="mine-badge">我的</i>
          <span v-if="s.canManage" class="row-actions" @click.stop>
            <button type="button" class="text-btn" @click="openAdd(s)">添加</button>
            <button type="button" class="text-btn" @click="openRename(s)">改名</button>
            <button type="button" class="text-btn danger-text" @click="removeSeries(s)">删除</button>
          </span>
        </div>

        <!-- 文章目录：展开时显示，点击跳详情，同级可拖拽 -->
        <div v-if="isExpanded(s.id)" class="article-rows">
          <p v-if="loadingArticles[s.id]" class="loading sub-loading">加载中…</p>
          <p v-else-if="!articlesOf(s.id).length" class="empty-hint sub-empty">目录还是空的，点击「添加」把自己写的文章加进来</p>
          <template v-else>
            <div
              v-for="(a, ai) in articlesOf(s.id)"
              :key="a.id"
              class="article-row"
              :draggable="s.canManage"
              :class="{ dragging: dragType === 'article' && dragSeriesId === s.id && dragFrom === ai, 'drag-over': overKey === `article:${s.id}:${ai}` && dragType === 'article' && dragSeriesId === s.id }"
              @click="router.push(`/questions/${a.id}`)"
              @dragstart="onArticleDragStart(s, ai)"
              @dragover="onArticleDragOver($event, s, ai)"
              @drop.prevent="onArticleDrop(s, ai)"
              @dragend="resetDrag"
            >
              <span class="order-no">{{ ai + 1 }}</span>
              <span class="article-title">{{ a.title }}</span>
              <button
                v-if="s.canManage"
                type="button"
                class="text-btn danger-text"
                @click.stop="removeArticle(s, a)"
              >
                移出
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 新建系列 -->
    <div v-if="createOpen" class="modal-overlay" @click.self="createOpen = false">
      <div class="modal-card">
        <h2>新建系列</h2>
        <label class="field-item">
          <span>系列名称</span>
          <input v-model="createForm.title" placeholder="如：Vue3 响应式原理系列" @keyup.enter="submitCreate" />
        </label>
        <label class="field-item">
          <span>简介（可选）</span>
          <input v-model="createForm.description" placeholder="一句话介绍这个系列" @keyup.enter="submitCreate" />
        </label>
        <div class="modal-actions">
          <button class="secondary" type="button" @click="createOpen = false">取消</button>
          <button type="button" :disabled="creating" @click="submitCreate">{{ creating ? '创建中…' : '创建' }}</button>
        </div>
      </div>
    </div>

    <!-- 改名 / 编辑简介 -->
    <div v-if="renaming" class="modal-overlay" @click.self="renaming = false">
      <div class="modal-card">
        <h2>编辑系列</h2>
        <label class="field-item">
          <span>系列名称</span>
          <input v-model="renameForm.title" placeholder="系列名称" @keyup.enter="submitRename" />
        </label>
        <label class="field-item">
          <span>简介</span>
          <input v-model="renameForm.description" placeholder="一句话介绍这个系列" @keyup.enter="submitRename" />
        </label>
        <div class="modal-actions">
          <button class="secondary" type="button" @click="renaming = false">取消</button>
          <button type="button" @click="submitRename">保存</button>
        </div>
      </div>
    </div>

    <!-- 添加文章 -->
    <div v-if="addOpen" class="modal-overlay" @click.self="addOpen = false">
      <div class="modal-card modal-wide">
        <h2>添加文章</h2>
        <p class="modal-hint">仅可选择你创建的、类型为「文章」且未加入其他系列的笔记。</p>
        <input v-model="pickerQuery" type="search" placeholder="搜索文章标题" />
        <div class="picker-list">
          <p v-if="loadingCandidates" class="loading">加载中…</p>
          <p v-else-if="!filteredCandidates.length" class="empty-hint">没有可添加的文章</p>
          <label v-for="article in filteredCandidates" :key="article.id" class="picker-row">
            <input v-model="pickedIds" type="checkbox" :value="article.id" />
            <span class="picker-title">{{ article.title }}</span>
            <span class="picker-meta">{{ article.creatorName }} · {{ article.visibility === 'public' ? '公开' : '私有' }}</span>
          </label>
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" @click="addOpen = false">取消</button>
          <button type="button" :disabled="adding" @click="submitAdd">
            {{ adding ? '添加中…' : `添加${pickedIds.length ? `（已选 ${pickedIds.length} 篇）` : ''}` }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tree {
  margin-top: 16px;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  align-content: start;
}

.series-node {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.series-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}

.series-row:hover {
  background: rgba(13, 148, 136, 0.06);
}

.series-row[draggable='true'] {
  cursor: grab;
}

.series-row.dragging {
  opacity: 0.45;
}

.series-row.drag-over {
  border-color: rgba(13, 148, 136, 0.55);
  background: rgba(13, 148, 136, 0.07);
}

.chevron {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 12px;
  color: var(--muted);
  background: var(--surface-tint);
  transition: transform 0.22s ease, background 0.16s ease, color 0.16s ease;
}

.chevron.open {
  transform: rotate(-180deg);
  background: rgba(13, 148, 136, 0.14);
  color: var(--accent);
}

.series-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-desc {
  font-size: 12.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-meta {
  flex-shrink: 0;
  font-size: 12.5px;
  color: var(--muted);
}

.mine-badge {
  flex-shrink: 0;
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(13, 148, 136, 0.12);
  color: var(--primary-strong);
  font-size: 12px;
  font-style: normal;
}

.row-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 无操作按钮时把 meta 推到行尾 */
.series-row:not(:has(.row-actions)) .series-meta {
  margin-left: auto;
}

.article-rows {
  padding: 2px 0 6px 34px;
  display: grid;
  gap: 4px;
}

.sub-loading {
  padding: 8px 0;
}

.sub-empty {
  padding: 10px 0;
  text-align: left;
}

.article-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: #fbfdfd;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}

.article-row:hover {
  border-color: rgba(13, 148, 136, 0.35);
}

.article-row[draggable='true'] {
  cursor: grab;
}

.article-row.dragging {
  opacity: 0.45;
}

.article-row.drag-over {
  border-color: rgba(13, 148, 136, 0.55);
  background: rgba(13, 148, 136, 0.07);
}

.order-no {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(13, 148, 136, 0.1);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.article-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-btn {
  padding: 2px 4px;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  box-shadow: none;
  transform: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.text-btn:hover {
  background: none;
  transform: none;
  box-shadow: none;
  color: var(--accent);
}

.text-btn.danger-text:hover {
  color: var(--danger);
}

.empty-hint {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  font-size: 13.5px;
  color: var(--muted);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 42, 58, 0.45);
  backdrop-filter: blur(3px);
  animation: overlay-in 0.16s ease;
}

.modal-card {
  width: min(480px, 100%);
  display: grid;
  gap: 14px;
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 24px 60px rgba(15, 42, 58, 0.28);
  animation: modal-in 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

.modal-card h2 {
  margin: 0;
  font-size: 18px;
}

/* 表单行：标签在上、输入框在下占满，与设置页弹窗一致 */
.field-item {
  display: grid;
  gap: 5px;
}

.field-item span {
  font-size: 13px;
  font-weight: 500;
  color: #557080;
}

.field-item input,
.modal-card > input {
  width: 100%;
}

.modal-wide {
  width: min(560px, 100%);
}

.modal-hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.picker-list {
  max-height: 46vh;
  overflow: auto;
  display: grid;
  gap: 6px;
  align-content: start;
}

.picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.picker-row:hover {
  border-color: rgba(13, 148, 136, 0.35);
}

.picker-row:has(input:checked) {
  border-color: rgba(13, 148, 136, 0.55);
  background: rgba(13, 148, 136, 0.06);
}

.picker-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
}

.picker-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 移动端适配：隐藏简介让标题占满、减小缩进与内边距，避免横向溢出 */
@media (max-width: 640px) {
  .tree {
    padding: 8px;
  }

  .series-row {
    gap: 8px;
    padding: 10px 8px;
  }

  .series-desc {
    display: none;
  }

  .series-title {
    flex: 1;
  }

  .article-rows {
    padding-left: 18px;
  }

  .article-row {
    gap: 8px;
    padding: 9px 8px;
  }

  .modal-overlay {
    padding: 12px;
  }

  .modal-card {
    padding: 18px 16px;
  }
}
</style>
