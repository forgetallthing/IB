<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
import FilterCheckGroup, { type CheckOption } from '../components/FilterCheckGroup.vue';

marked.setOptions({ gfm: true, breaks: true });

interface QuestionItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorName: string;
  visibility: 'public' | 'private';
  updatedAt?: string;
  titleHtml?: string;
  contentHtml?: string;
}

const router = useRouter();
const loading = ref(false);
const query = ref('');
const difficulty = ref<string[]>([]);
const visibility = ref<string[]>([]);
const tag = ref<string[]>([]);
const items = ref<QuestionItem[]>([]);
const tagOptions = ref<CheckOption[]>([]);

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

function toggleExpand(id: string) {
  expanded.value[id] = !expanded.value[id];
}

function isExpanded(id: string) {
  return !!expanded.value[id];
}

function mdToHtml(md: string) {
  return marked.parse(md || '', { async: false }) as string;
}

async function loadTagOptions() {
  const result = await request<Array<{ id: string; name: string; active: boolean; color?: string }>>('/tags');
  tagOptions.value = result
    .filter((item) => item.active)
    .map((item) => ({ value: item.name, label: item.name, color: item.color }));
}

const tagColorMap = computed<Record<string, string>>(() =>
  Object.fromEntries(tagOptions.value.map((option) => [option.value, option.color ?? ''])),
);

async function loadItems() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (query.value.trim()) params.set('q', query.value.trim());
    difficulty.value.forEach((value) => params.append('difficulty', value));
    visibility.value.forEach((value) => params.append('visibility', value));
    tag.value.forEach((value) => params.append('tags', value));

    const result = await request<{ items: QuestionItem[]; total: number }>(`/questions?${params.toString()}`);
    items.value = result.items.map((item) => ({
      ...item,
      titleHtml: mdToHtml(item.title),
      contentHtml: mdToHtml(item.content),
    }));
  } finally {
    loading.value = false;
  }
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
  await request(`/questions/${id}`, { method: 'DELETE' });
  await loadItems();
}

onMounted(() => {
  loadTagOptions().catch(() => {});
  loadItems();
});
watch([query, difficulty, visibility, tag], loadItems);
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>笔记中心</h1>
        <p class="subtitle">搜索、筛选和管理笔记。</p>
      </div>
      <div class="header-actions">
        <button type="button" @click="editQuestion()">新建笔记</button>
      </div>
    </header>

    <section class="filter-panel">
      <div class="filter-row">
        <input v-model="query" type="search" placeholder="搜索标题或内容" />
        <button type="button" class="secondary" @click="loadItems">刷新</button>
      </div>
      <FilterCheckGroup v-model="difficulty" label="难度" :options="difficultyOptions" />
      <FilterCheckGroup v-model="visibility" label="可见性" :options="visibilityOptions" />
      <FilterCheckGroup v-model="tag" label="标签" :options="tagOptions" />
    </section>

    <p v-if="loading" class="loading">加载中…</p>

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

        <p class="meta">{{ item.creatorName }} · {{ item.visibility === 'public' ? '公开' : '私有' }}</p>

        <div class="collapse" :class="{ open: isExpanded(item.id) }">
          <div class="collapse-inner">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="md-content" v-html="item.contentHtml"></div>
            <div class="card-actions">
              <button type="button" class="text-btn" @click="editQuestion(item.id)">编辑</button>
              <span class="sep">·</span>
              <button type="button" class="text-btn danger-text" @click="deleteQuestion(item.id)">删除</button>
            </div>
          </div>
        </div>
      </article>
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

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
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
</style>
