<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { request } from '../api';
import { useToast } from '../composables/useToast';

interface QuestionItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorName: string;
  visibility: 'public' | 'private';
  aiSummary?: string;
  aiSuggestedTags?: string[];
  aiSuggestedDifficulty?: 'easy' | 'medium' | 'hard';
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  active: boolean;
}

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const loadingTags = ref(false);
const analyzing = ref(false);
const tags = ref<TagItem[]>([]);

const titleEditorRef = ref<HTMLDivElement | null>(null);
const contentEditorRef = ref<HTMLDivElement | null>(null);
let titleVditor: Vditor | null = null;
let contentVditor: Vditor | null = null;
let titleReady = false;
let contentReady = false;
let pendingTitle: string | null = null;
let pendingContent: string | null = null;

const form = reactive({
  id: '',
  title: '',
  content: '',
  selectedTagIds: [] as string[],
  difficulty: 'medium' as 'easy' | 'medium' | 'hard',
  visibility: 'public' as 'public' | 'private',
});

const aiPreview = reactive({
  summary: '',
  suggestedTags: [] as string[],
  suggestedDifficulty: 'medium' as 'easy' | 'medium' | 'hard',
});

const tagOptions = computed(() => tags.value.filter((tag) => tag.active));
const difficultyOptions = [
  { label: '简单', value: 'easy' },
  { label: '中等', value: 'medium' },
  { label: '困难', value: 'hard' },
] as const;
const visibilityOptions = [
  { label: '公开', value: 'public' },
  { label: '私有', value: 'private' },
] as const;

const { notice, fail } = useToast();

function setTitleContent(value: string) {
  if (titleReady && titleVditor) {
    titleVditor.setValue(value);
  } else {
    pendingTitle = value;
  }
}

function setEditorContent(value: string) {
  if (contentReady && contentVditor) {
    contentVditor.setValue(value);
  } else {
    pendingContent = value;
  }
}

function destroyEditors() {
  titleVditor?.destroy();
  titleVditor = null;
  titleReady = false;
  pendingTitle = null;
  contentVditor?.destroy();
  contentVditor = null;
  contentReady = false;
  pendingContent = null;
}

function initTitleEditor() {
  if (!titleEditorRef.value || titleVditor) return;
  titleVditor = new Vditor(titleEditorRef.value, {
    lang: 'zh_CN',
    mode: 'ir',
    height: 300,
    placeholder: '输入标题（支持 Markdown）',
    cache: { enable: false },
    cdn: '/vditor',
    value: form.title,
    input: (value) => {
      form.title = value.trim();
    },
    after: () => {
      titleReady = true;
      if (pendingTitle !== null && titleVditor) {
        titleVditor.setValue(pendingTitle);
        pendingTitle = null;
      }
    },
  });
}

function initContentEditor() {
  if (!contentEditorRef.value || contentVditor) return;
  contentVditor = new Vditor(contentEditorRef.value, {
    lang: 'zh_CN',
    mode: 'ir',
    height: 920,
    placeholder: '输入正文（支持 Markdown）',
    cache: { enable: false },
    cdn: '/vditor',
    value: form.content,
    input: (value) => {
      form.content = value;
    },
    after: () => {
      contentReady = true;
      if (pendingContent !== null && contentVditor) {
        contentVditor.setValue(pendingContent);
        pendingContent = null;
      }
    },
  });
}

async function loadTags() {
  loadingTags.value = true;
  try {
    tags.value = await request<TagItem[]>('/tags');
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载标签失败');
  } finally {
    loadingTags.value = false;
  }
}

async function loadQuestion(id: string) {
  loading.value = true;
  try {
    const item = await request<QuestionItem>(`/questions/${id}`);
    form.id = item.id;
    form.title = item.title;
    setTitleContent(item.title);
    form.content = item.content;
    setEditorContent(item.content);
    form.selectedTagIds = tagOptions.value.filter((tag) => item.tags.includes(tag.name)).map((tag) => tag.id);
    form.difficulty = item.difficulty;
    form.visibility = item.visibility;
    aiPreview.summary = item.aiSummary ?? '';
    aiPreview.suggestedTags = item.aiSuggestedTags ?? [];
    aiPreview.suggestedDifficulty = item.aiSuggestedDifficulty ?? 'medium';
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载笔记失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.title.trim() || !form.content.trim()) {
    fail('请填写标题和内容');
    return;
  }

  saving.value = true;
  try {
    const selectedTags = tagOptions.value.filter((tag) => form.selectedTagIds.includes(tag.id)).map((tag) => tag.name);
    const payload = {
      title: form.title,
      content: form.content,
      answer: '',
      tags: selectedTags,
      difficulty: form.difficulty,
      visibility: form.visibility,
      aiSummary: aiPreview.summary || undefined,
      aiSuggestedTags: aiPreview.suggestedTags,
      aiSuggestedDifficulty: aiPreview.suggestedDifficulty,
    };

    if (form.id) {
      await request(`/questions/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      notice('笔记已更新');
    } else {
      const result = await request<{ id: string }>('/questions', { method: 'POST', body: JSON.stringify(payload) });
      form.id = result.id;
      notice('笔记已创建，可继续编辑');
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function analyze() {
  if (!form.title.trim() && !form.content.trim()) {
    fail('请先填写标题或内容，再使用 AI 辅助');
    return;
  }

  analyzing.value = true;
  try {
    const result = await request<{ summary: string; suggestedTags: string[]; suggestedDifficulty: 'easy' | 'medium' | 'hard' }>('/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        content: form.content,
        answer: '',
      }),
    });

    aiPreview.summary = result.summary;
    aiPreview.suggestedTags = result.suggestedTags;
    aiPreview.suggestedDifficulty = result.suggestedDifficulty;
    notice('AI 建议已生成');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'AI 分析失败');
  } finally {
    analyzing.value = false;
  }
}

function applyAi() {
  form.selectedTagIds = tagOptions.value.filter((tag) => aiPreview.suggestedTags.includes(tag.name)).map((tag) => tag.id);
  form.difficulty = aiPreview.suggestedDifficulty;
  notice('AI 建议已应用');
}

onMounted(async () => {
  initTitleEditor();
  initContentEditor();
  await loadTags();
  const id = typeof route.query.id === 'string' ? route.query.id : '';
  if (id) await loadQuestion(id);
});

onBeforeUnmount(() => {
  destroyEditors();
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>笔记编辑</h1>
        <p class="subtitle">编辑标题、正文、标签、难度和可见性。</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary" @click="analyze" :disabled="analyzing">{{ analyzing ? '分析中…' : 'AI 辅助' }}</button>
        <button type="button" class="secondary" @click="router.push('/questions')">去笔记中心</button>
        <button type="button" @click="save" :disabled="saving">{{ saving ? '保存中…' : '保存笔记' }}</button>
      </div>
    </header>

    <p v-if="loading" class="loading">笔记加载中…</p>

    <section class="panel meta-panel">
      <div class="field">
        <span class="field-label">标签</span>
        <div class="tag-grid">
          <label v-for="tag in tags" :key="tag.id" class="tag-option">
            <input v-model="form.selectedTagIds" type="checkbox" :value="tag.id" />
            <span class="tag-chip" :style="{ backgroundColor: tag.color }">{{ tag.name }}</span>
          </label>
        </div>
      </div>

      <div class="choice-grid">
        <div class="field">
          <span class="field-label">难度</span>
          <div class="choice-row">
            <label v-for="option in difficultyOptions" :key="option.value" class="choice-item">
              <input v-model="form.difficulty" type="radio" :value="option.value" />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>

        <div class="field">
          <span class="field-label">可见性</span>
          <div class="choice-row">
            <label v-for="option in visibilityOptions" :key="option.value" class="choice-item">
              <input v-model="form.visibility" type="radio" :value="option.value" />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <div v-if="aiPreview.summary || aiPreview.suggestedTags.length" class="ai-box">
        <strong>AI 建议</strong>
        <p>摘要：{{ aiPreview.summary || '暂无' }}</p>
        <p>建议标签：{{ aiPreview.suggestedTags.join('，') || '暂无' }}</p>
        <p>建议难度：{{ aiPreview.suggestedDifficulty }}</p>
        <button type="button" class="secondary" @click="applyAi">应用建议</button>
      </div>
    </section>

    <section class="panel editor-panel">
      <div class="field">
        <span class="field-label">笔记标题</span>
        <div ref="titleEditorRef" class="title-editor"></div>
      </div>

      <div class="field content-field">
        <span class="field-label">笔记内容</span>
        <div ref="contentEditorRef" class="content-editor"></div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.meta-panel {
  display: grid;
  gap: 20px;
}

.editor-panel {
  display: grid;
  gap: 24px;
}

.field {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #557080;
}

.tag-grid,
.choice-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-option,
.choice-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  background: var(--surface-tint);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.tag-option:hover,
.choice-item:hover {
  border-color: rgba(26, 43, 58, 0.24);
}

.tag-option:has(input:checked),
.choice-item:has(input:checked) {
  border-color: rgba(13, 148, 136, 0.55);
  background: #e3eef3;
}

.choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.content-field {
  margin-top: 4px;
}

.title-editor :deep(.vditor),
.content-editor :deep(.vditor) {
  border-radius: var(--radius-md);
  border-color: var(--line);
}

.ai-box {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: #e0eaf0;
}

.ai-box p {
  margin: 5px 0;
}

.ai-box strong {
  font-size: 13px;
}

.ai-box button {
  margin-top: 6px;
}

@media (max-width: 700px) {
  .choice-grid {
    grid-template-columns: 1fr;
  }
}
</style>
