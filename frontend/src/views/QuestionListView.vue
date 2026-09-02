<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';
import FilterCheckGroup, { type CheckOption } from '../components/FilterCheckGroup.vue';

marked.setOptions({ gfm: true, breaks: true });

interface QuestionItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorId: string;
  creatorName: string;
  visibility: 'public' | 'private';
  updatedAt?: string;
  titleHtml?: string;
}

const router = useRouter();
const auth = useAuthStore();
const { notice, fail } = useToast();
const loading = ref(false);
const query = ref('');
const difficulty = ref<string[]>([]);
const visibility = ref<string[]>([]);
const tag = ref<string[]>([]);
const items = ref<QuestionItem[]>([]);
const tagOptions = ref<CheckOption[]>([]);

// 筛选勾选持久化到 localStorage，下次打开自动恢复
const FILTER_STORAGE_KEY = 'ib_question_filters';

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function loadStoredFilters(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function persistFilters() {
  try {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ difficulty: difficulty.value, visibility: visibility.value, tag: tag.value }),
    );
  } catch {
    /* 忽略存储失败（如隐私模式） */
  }
}

// 恢复上次勾选
{
  const stored = loadStoredFilters();
  difficulty.value = asStringArray(stored.difficulty);
  visibility.value = asStringArray(stored.visibility);
  tag.value = asStringArray(stored.tag);
}

// 懒加载分页
const PAGE_SIZE = 20;
const page = ref(1);
const total = ref(0);
const hasMore = ref(false);
const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
let requestSeq = 0;

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' } as const;

const difficultyOptions: CheckOption[] = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
];

const visibilityOptions: CheckOption[] = [
  { value: 'public', label: '公开' },
  { value: 'private', label: '私有' },
];

const expanded = ref<Record<string, boolean>>({});
const contentEls = ref<Record<string, HTMLDivElement | null>>({});
const rendered = ref<Record<string, boolean>>({});

function setContentEl(id: string, el: unknown) {
  contentEls.value[id] = (el as HTMLDivElement) ?? null;
}

async function toggleExpand(id: string) {
  expanded.value[id] = !expanded.value[id];
  if (!expanded.value[id] || rendered.value[id]) return;
  // 展开时才用 Vditor 渲染内容（懒渲染），代码块带语法高亮
  await nextTick();
  const el = contentEls.value[id];
  const item = items.value.find((i) => i.id === id);
  if (!el || !item || rendered.value[id]) return;
  rendered.value[id] = true;
  // 链接新标签页打开由 main.ts 的全局点击委托统一处理
  Vditor.preview(el, item.content, {
    lang: 'zh_CN',
    mode: 'light',
    cdn: '/vditor',
    hljs: { style: 'github', lineNumber: false },
  });
}

function isExpanded(id: string) {
  return !!expanded.value[id];
}

function mdTitleHtml(md: string) {
  return marked.parse(md || '', { async: false }) as string;
}

async function loadTagOptions() {
  const result = await request<Array<{ id: string; name: string; active: boolean; color?: string }>>('/tags');
  tagOptions.value = result
    .filter((item) => item.active)
    .map((item) => ({ value: item.name, label: item.name, color: item.color }));
  // 剔除已失效的标签勾选（仅在实际变化时更新，避免重复触发加载）
  const valid = new Set(tagOptions.value.map((option) => option.value));
  const pruned = tag.value.filter((name) => valid.has(name));
  if (pruned.length !== tag.value.length) tag.value = pruned;
}

const tagColorMap = computed<Record<string, string>>(() =>
  Object.fromEntries(tagOptions.value.map((option) => [option.value, option.color ?? ''])),
);

async function loadItems(reset = true) {
  // 追加模式下避免重复请求；重置模式允许打断旧请求（用序号丢弃过期响应）
  if (!reset && (loading.value || !hasMore.value)) return;
  const seq = ++requestSeq;
  if (reset) page.value = 1;

  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('page', String(page.value));
    params.set('limit', String(PAGE_SIZE));
    if (query.value.trim()) params.set('q', query.value.trim());
    difficulty.value.forEach((value) => params.append('difficulty', value));
    visibility.value.forEach((value) => params.append('visibility', value));
    tag.value.forEach((value) => params.append('tags', value));

    const result = await request<{ items: QuestionItem[]; total: number; hasMore: boolean }>(`/questions?${params.toString()}`);
    if (seq !== requestSeq) return;
    const mapped = result.items.map((item) => ({
      ...item,
      titleHtml: mdTitleHtml(item.title),
    }));
    items.value = reset ? mapped : [...items.value, ...mapped];
    if (reset) {
      // 重置加载后清除内容渲染缓存（元素会复用，重新展开时重渲染）
      contentEls.value = {};
      rendered.value = {};
    }
    total.value = result.total;
    hasMore.value = result.hasMore;
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return;
  page.value += 1;
  loadItems(false);
}

function isMine(item: QuestionItem) {
  return item.creatorId === auth.user?.id;
}

// 管理员可维护所有用户的笔记，普通用户只能维护自己创建的
function canMaintain(item: QuestionItem) {
  return auth.user?.role === 'admin' || isMine(item);
}

function editQuestion(id?: string) {
  router.push(id ? `/questions/edit?id=${id}` : '/questions/edit');
}

async function deleteQuestion(id: string) {
  const ok = await showConfirm({
    title: '删除笔记',
    message: '删除后无法恢复，确定要删除这条笔记吗？',
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await request(`/questions/${id}`, { method: 'DELETE' });
    notice('笔记已删除');
    await loadItems();
  } catch (error) {
    fail(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(() => {
  loadTagOptions().catch(() => {});
  loadItems(true);
  // 滚动到底部自动加载下一页
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    },
    { root: sentinelRef.value?.closest('.app-main') ?? null, rootMargin: '240px' },
  );
  if (sentinelRef.value) observer.observe(sentinelRef.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

watch([query, difficulty, visibility, tag], () => {
  persistFilters();
  loadItems(true);
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>笔记中心</h1>
        <p class="subtitle">搜索、筛选和管理笔记，<template v-if="total">共 {{ total }} 条</template></p>
      </div>
      <div class="header-actions">
        <button type="button" @click="editQuestion()">新建笔记</button>
      </div>
    </header>

    <section class="filter-panel">
      <div class="filter-row">
        <input v-model="query" type="search" placeholder="搜索标题或内容" />
        <button type="button" class="secondary" @click="loadItems(true)">刷新</button>
      </div>
      <FilterCheckGroup v-model="difficulty" label="难度" :options="difficultyOptions" />
      <FilterCheckGroup v-model="visibility" label="可见性" :options="visibilityOptions" />
      <FilterCheckGroup v-model="tag" label="标签" :options="tagOptions" />
    </section>

    <p v-if="loading && !items.length" class="loading">加载中…</p>

    <div class="list">
      <article v-for="item in items" :key="item.id" class="card">
        <button type="button" class="card-head" :aria-expanded="isExpanded(item.id)" @click="toggleExpand(item.id)">
          <span class="chevron" :class="{ open: isExpanded(item.id) }">▾</span>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="md-title" v-html="item.titleHtml"></div>
          <span class="head-pills">
            <span v-for="tagName in item.tags" :key="tagName" class="tag">
              <i v-if="tagColorMap[tagName]" class="tag-dot" :style="{ backgroundColor: tagColorMap[tagName] }"></i>{{ tagName }}
            </span>
            <span class="pill" :class="`difficulty-${item.difficulty}`">{{ difficultyLabels[item.difficulty] }}</span>
          </span>
        </button>

        <div class="meta-row">
          <p class="meta">
            {{ item.creatorName }}
            <span v-if="isMine(item)" class="mine-badge">我的</span>
            · {{ item.visibility === 'public' ? '公开' : '私有' }}
          </p>
          <div v-if="canMaintain(item) && isExpanded(item.id)" class="card-actions">
            <button type="button" class="text-btn" @click="editQuestion(item.id)">编辑</button>
            <span class="sep">·</span>
            <button type="button" class="text-btn danger-text" @click="deleteQuestion(item.id)">删除</button>
          </div>
        </div>

        <div class="collapse" :class="{ open: isExpanded(item.id) }">
          <div class="collapse-inner">
            <div class="md-content" :ref="(el) => setContentEl(item.id, el)"></div>
            <p v-if="!canMaintain(item)" class="maintain-hint">仅创建者或管理员可维护此笔记</p>
          </div>
        </div>
      </article>
    </div>

    <div ref="sentinelRef" class="load-more">
      <span v-if="loading && items.length">加载中…</span>
      <span v-else-if="items.length && !hasMore">已加载全部 {{ total }} 条</span>
    </div>
  </section>
</template>

<style scoped>
.filter-panel {
  display: grid;
  gap: 12px;
  padding: 18px 20px;
}

.filter-row {
  display: flex;
  gap: 10px;
}

.filter-row input {
  flex: 1;
  min-width: 0;
  background: #f4f8fa;
}

.filter-panel > :not(.filter-row) {
  padding-top: 2px;
}

.tag {
  gap: 5px;
}

.list {
  display: grid;
  gap: 16px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-card);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.card-head:hover {
  background: none;
  transform: none;
  box-shadow: none;
}

.card-head:focus-visible {
  outline: 2px solid rgba(13, 148, 136, 0.55);
  outline-offset: 4px;
  border-radius: 8px;
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
  transition: transform 0.22s ease, background 0.16s ease;
}

.chevron.open {
  transform: rotate(-180deg);
  background: rgba(13, 148, 136, 0.14);
  color: var(--accent);
}

.head-pills {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.md-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.md-title :deep(p) {
  margin: 0;
}

/* 折叠动画：grid-template-rows 0fr -> 1fr */
.collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.26s ease;
}

.collapse.open {
  grid-template-rows: 1fr;
}

.collapse-inner {
  overflow: hidden;
}

.md-content {
  color: #4a5b6a;
  font-size: 14px;
  line-height: 1.75;
}

.md-content :deep(p) {
  margin: 0 0 8px;
}

.md-content :deep(p:last-child) {
  margin-bottom: 0;
}

.md-content :deep(pre) {
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f4f7f9;
  overflow: auto;
}

.md-content :deep(code) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 13px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #eef2f5;
}

.md-content :deep(pre code) {
  padding: 0;
  background: none;
  line-height: 1.6;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 2px 0;
}

.meta {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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

.sep {
  color: var(--line);
  font-size: 12px;
}

.mine-badge {
  display: inline-block;
  margin: 0 2px;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(13, 148, 136, 0.12);
  color: var(--primary-strong);
  font-size: 12px;
  vertical-align: 1px;
}

.maintain-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}

.load-more {
  min-height: 20px;
  padding: 10px 0 4px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
</style>
