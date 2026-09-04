<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
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

async function deleteQuestion() {
  if (!item.value) return;
  const ok = await showConfirm({
    title: '删除笔记',
    message: '删除后无法恢复，确定要删除这条笔记吗？',
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  await request(`/questions/${item.value.id}`, { method: 'DELETE' });
  await router.push('/questions');
}

onMounted(loadDetail);
</script>

<template>
  <section class="page">
    <div class="topbar">
      <button class="secondary" type="button" @click="router.push('/questions')">返回列表</button>
      <div v-if="item" class="actions">
        <button class="secondary" type="button" @click="router.push(`/questions/edit?id=${item.id}`)">编辑</button>
        <button class="danger" type="button" @click="deleteQuestion">删除</button>
      </div>
    </div>

    <p v-if="loading" class="loading">详情加载中…</p>

    <article v-if="item" class="panel">
      <div class="detail-head">
        <div>
          <p class="meta">{{ item.creatorName }} · {{ item.visibility === 'public' ? '公开' : '私有' }}</p>
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
</style>
