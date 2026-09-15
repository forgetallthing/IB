<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { request } from '../api';
import PageToolbar from '../components/PageToolbar.vue';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';
import FilterCheckGroup, { type CheckOption } from '../components/FilterCheckGroup.vue';
import { questionListDirty } from '../stores/dataDirty';

defineOptions({ name: 'QuestionListView' });

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
// 搜索范围：all=标题+正文（默认）、title=仅标题、content=仅正文
const searchField = ref<'all' | 'title' | 'content'>('all');
const searchFieldOptions = [
  { value: 'all', label: '全部' },
  { value: 'title', label: '标题' },
  { value: 'content', label: '正文' },
] as const;

// 移动端搜索范围自定义小下拉：按钮显示当前值，菜单悬浮在按钮下方，点击外部收起
const fieldMenuOpen = ref(false);
const currentFieldLabel = computed(
  () => searchFieldOptions.find((option) => option.value === searchField.value)?.label ?? '全部',
);

function toggleFieldMenu() {
  fieldMenuOpen.value = !fieldMenuOpen.value;
}

function pickField(value: 'all' | 'title' | 'content') {
  searchField.value = value;
  fieldMenuOpen.value = false;
}

function closeFieldMenu() {
  fieldMenuOpen.value = false;
}

const difficulty = ref<string[]>([]);
const visibility = ref<string[]>([]);
const type = ref<string[]>([]);
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
      JSON.stringify({ searchField: searchField.value, difficulty: difficulty.value, visibility: visibility.value, type: type.value, tag: tag.value }),
    );
  } catch {
    /* 忽略存储失败（如隐私模式） */
  }
}

// 恢复上次勾选
{
  const stored = loadStoredFilters();
  const storedField = stored.searchField;
  if (storedField === 'title' || storedField === 'content' || storedField === 'all') searchField.value = storedField;
  difficulty.value = asStringArray(stored.difficulty);
  visibility.value = asStringArray(stored.visibility);
  type.value = asStringArray(stored.type);
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

// 读与记分离：回想笔记参与每日回想，文章类型以阅读为主
const typeOptions: CheckOption[] = [
  { value: 'qa', label: '回想' },
  { value: 'article', label: '文章' },
];

const expanded = ref<Record<string, boolean>>({});
const contentEls = ref<Record<string, HTMLDivElement | null>>({});
const rendered = ref<Record<string, boolean>>({});

function setContentEl(id: string, el: unknown) {
  contentEls.value[id] = (el as HTMLDivElement) ?? null;
}

// 头部按下位置：用于判断 click 是否由拖动（划选）结束产生
const headDownPoint = { x: 0, y: 0 };

function onHeadMousedown(e: MouseEvent) {
  headDownPoint.x = e.clientX;
  headDownPoint.y = e.clientY;
}

async function toggleExpand(id: string, e?: MouseEvent) {
  // 守卫一：存在非折叠文本选区（划选标题、双击选词）时不切换
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  // 守卫二：click 起点与 mousedown 落点相距超过 6px 视为拖动划选（部分场景选区已在 click 前被折叠，选区守卫可能漏判）
  if (e) {
    const dx = e.clientX - headDownPoint.x;
    const dy = e.clientY - headDownPoint.y;
    if (dx * dx + dy * dy > 36) return;
  }
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
  // 标题按纯文本转义后再解析，防止 title 里的 <tag> 被当成真 HTML 吞字
  const escaped = (md || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return marked.parse(escaped, { async: false }) as string;
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

// 占位文案跟随搜索范围
const searchPlaceholder = computed(() =>
  searchField.value === 'title' ? '搜索标题' : searchField.value === 'content' ? '搜索正文内容' : '搜索标题或内容',
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
    if (query.value.trim()) {
      params.set('q', query.value.trim());
      if (searchField.value !== 'all') params.set('qf', searchField.value);
    }
    difficulty.value.forEach((value) => params.append('difficulty', value));
    visibility.value.forEach((value) => params.append('visibility', value));
    type.value.forEach((value) => params.append('type', value));
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
  // 点击下拉外部时收起移动端搜索范围菜单
  document.addEventListener('click', closeFieldMenu);
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
  document.removeEventListener('click', closeFieldMenu);
});

watch([query, searchField, difficulty, visibility, type, tag], () => {
  persistFilters();
  loadItems(true);
});
</script>

<template>
  <section class="page">
    <PageToolbar>
      <div>
        <h1>笔记中心</h1>
        <p class="subtitle">搜索、筛选和管理笔记，<template v-if="total">共 {{ total }} 条</template></p>
      </div>
      <div class="header-actions">
        <button type="button" @click="editQuestion()">新建笔记</button>
      </div>
    </PageToolbar>

    <section class="filter-panel">
      <div class="filter-row">
        <div class="search-scope" role="group" aria-label="搜索范围">
          <button
            v-for="opt in searchFieldOptions"
            :key="opt.value"
            type="button"
            class="scope-btn"
            :class="{ active: searchField === opt.value }"
            :aria-pressed="searchField === opt.value"
            @click="searchField = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <!-- 移动端专用：窄屏用自定义小下拉（原生 select 选项无法美化） -->
        <div class="search-field-dropdown">
          <button type="button" class="field-btn" :aria-expanded="fieldMenuOpen" @click.stop="toggleFieldMenu">
            {{ currentFieldLabel }}
          </button>
          <div v-if="fieldMenuOpen" class="field-menu">
            <button
              v-for="opt in searchFieldOptions"
              :key="opt.value"
              type="button"
              class="menu-item"
              :class="{ active: searchField === opt.value }"
              @click="pickField(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <input v-model="query" type="search" :placeholder="searchPlaceholder" />
        <button type="button" class="secondary refresh-btn" aria-label="刷新" @click="loadItems(true)">
          <span class="btn-full">刷新</span>
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 1.5v3h-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <FilterCheckGroup v-model="difficulty" label="难度" :options="difficultyOptions" />
      <FilterCheckGroup v-model="visibility" label="可见性" :options="visibilityOptions" />
      <FilterCheckGroup v-model="type" label="类型" :options="typeOptions" />
      <FilterCheckGroup v-model="tag" label="标签" :options="tagOptions" />
    </section>

    <p v-if="loading && !items.length" class="loading">加载中…</p>

    <div class="list">
      <article v-for="item in items" :key="item.id" class="card">
        <!-- 头部区域（含卡片内边距）任意位置可点击展开/收起；编辑/删除按钮与正文内容除外 -->
        <div class="card-top" @mousedown="onHeadMousedown" @click="toggleExpand(item.id, $event)">
          <button type="button" class="card-head" :aria-expanded="isExpanded(item.id)" @click.stop="toggleExpand(item.id, $event)">
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
            <!-- 按钮常驻占位、折叠时仅视觉隐藏：避免展开/收起瞬间行高突变导致 meta 行抖动 -->
            <div v-if="canMaintain(item)" class="card-actions" :class="{ 'actions-hidden': !isExpanded(item.id) }" @click.stop>
              <button type="button" class="text-btn" @click="editQuestion(item.id)">编辑</button>
              <span class="sep">·</span>
              <button type="button" class="text-btn danger-text" @click="deleteQuestion(item.id)">删除</button>
            </div>
          </div>
        </div>

        <div class="collapse" :class="{ open: isExpanded(item.id) }">
          <div class="collapse-inner">
            <div class="collapse-body">
              <div class="md-content" :ref="(el) => setContentEl(item.id, el)"></div>
              <p v-if="!canMaintain(item)" class="maintain-hint">仅创建者或管理员可维护此笔记</p>
            </div>
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

/* 搜索范围分段控件：连体按钮组，选中项青绿底白字 */
.search-scope {
  display: inline-flex;
  flex-shrink: 0;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: #e8f0f4;
  border: 1px solid var(--line-soft);
}

.scope-btn {
  padding: 6px 12px;
  background: none;
  border: none;
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  box-shadow: none;
  transform: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

/* 触摸屏点击后 :hover 会粘住，hover 仅限支持悬停的设备 */
@media (hover: hover) {
  .scope-btn:hover:not(:disabled) {
    background: rgba(13, 148, 136, 0.09);
    color: var(--accent);
    transform: none;
    box-shadow: none;
  }

  .scope-btn.active:hover:not(:disabled) {
    background: var(--primary-strong);
  }
}

.scope-btn.active,
.scope-btn.active:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
}

.scope-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.35);
}

/* 移动端搜索范围小下拉（桌面隐藏）：窄按钮 + 悬浮菜单 */
.search-field-dropdown {
  display: none;
  position: relative;
  flex-shrink: 0;
}

.field-btn {
  padding: 7px 12px;
  background: var(--surface-tint);
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  box-shadow: none;
}

.field-btn:focus-visible {
  background: #e0eaf0;
  color: var(--ink);
  transform: none;
  box-shadow: none;
}

.field-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  min-width: 88px;
  display: grid;
  gap: 2px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  box-shadow: var(--shadow-lift);
}

.field-menu .menu-item {
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  box-shadow: none;
}

.field-menu .menu-item.active,
.field-menu .menu-item.active:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
}

@media (hover: hover) {
  .field-btn:hover:not(:disabled) {
    background: #e0eaf0;
    color: var(--ink);
    transform: none;
    box-shadow: none;
  }

  .field-menu .menu-item:hover:not(:disabled) {
    background: rgba(13, 148, 136, 0.09);
    color: var(--accent);
    transform: none;
    box-shadow: none;
  }
}

.refresh-btn {
  flex-shrink: 0;
}

.refresh-btn .btn-icon {
  display: none;
}

/* 移动端：范围用左侧小下拉（菜单悬浮按钮下方）；搜索行整体缩小更紧凑 */
@media (max-width: 640px) {
  .search-scope {
    display: none;
  }

  .search-field-dropdown {
    display: block;
  }

  .filter-row input,
  .refresh-btn {
    padding: 7px 10px;
    font-size: 13px;
    border-radius: 10px;
  }

  .refresh-btn {
    padding: 7px;
  }

  .refresh-btn .btn-full {
    display: none;
  }

  .refresh-btn .btn-icon {
    display: block;
  }
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
  /* 底部留白 = 间隙 12px + padding-bottom 6px + meta 行框自带半行距 ≈ 顶部 23px，上下对称 */
  padding: 22px 24px 6px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-card);
}

/* 仅头部可点击：负 margin 只扩上/左/右三边，把点击区延伸到卡片边缘；
   底边不外扩，避免压到正文顶部导致点正文边缘被误判为头部 */
.card-top {
  margin: -22px -24px 0;
  padding: 22px 24px 0;
  cursor: pointer;
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

@media (hover: hover) {
  .card-head:hover {
    background: none;
    transform: none;
    box-shadow: none;
  }
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
  /* 标题可划选复制：文本光标提示可选中；button 内默认不可选，需显式放开 */
  user-select: text;
  cursor: text;
}

.md-title :deep(*) {
  user-select: text;
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

/* 展开内容的底部留白放在裁剪层内层：折叠时随内容一起被裁掉，不占卡片空间 */
.collapse-body {
  padding-bottom: 12px;
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
  /* 14px = 原卡片 grid gap 12px + 原 margin 2px，保持标题行与 meta 行的原有间距 */
  margin: 14px 0 2px;
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

/* 折叠时操作按钮仅视觉隐藏：visibility 不响应点击，且保持行高不变 */
.card-actions.actions-hidden {
  visibility: hidden;
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

@media (hover: hover) {
  .text-btn:hover {
    background: none;
    transform: none;
    box-shadow: none;
    color: var(--accent);
  }

  .text-btn.danger-text:hover {
    color: var(--danger);
  }
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
