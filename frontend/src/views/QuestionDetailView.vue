<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import { request } from '../api';
import { useToast } from '../composables/useToast';

marked.setOptions({ gfm: true, breaks: true });

interface QuestionItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
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
const loading = ref(false);
const { fail } = useToast();
const item = ref<QuestionItem | null>(null);

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' } as const;

const contentHtml = computed(() => (item.value ? (marked.parse(item.value.content || '', { async: false }) as string) : ''));

async function loadDetail() {
  loading.value = true;
  try {
    item.value = await request<QuestionItem>(`/questions/${route.params.id}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载详情失败');
  } finally {
    loading.value = false;
  }
}

// 返回来源列表：从系列目录进入时回系列页，其余回笔记中心（vue-router 在 history.state.back 记录来源）
function backToList() {
  if (typeof window.history.state?.back === 'string') router.back();
  else router.push('/questions');
}

onMounted(loadDetail);
</script>

<template>
  <section class="page">
    <div class="topbar">
      <button class="secondary" type="button" @click="backToList">返回列表</button>
      <div v-if="item" class="actions">
        <button class="secondary" type="button" @click="router.push(`/questions/edit?id=${item.id}`)">编辑</button>
      </div>
    </div>

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

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="content" v-html="contentHtml"></div>
    </article>
  </section>
</template>

<style scoped>
.topbar,
.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

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

.content {
  margin-top: 8px;
  line-height: 1.8;
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

.series-badge:hover {
  background: rgba(13, 148, 136, 0.2);
}
</style>
