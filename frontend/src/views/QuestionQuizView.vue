<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { marked } from 'marked';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { request } from '../api';
import { useToast } from '../composables/useToast';

marked.setOptions({ gfm: true, breaks: true });

interface QuizQuestion {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorName: string;
  visibility: 'public' | 'private';
}

const { notice, fail } = useToast();
const loading = ref(false);
const question = ref<QuizQuestion | null>(null);
const showAnswer = ref(false);
const showAiPanel = ref(false);
const answerEl = ref<HTMLDivElement | null>(null);
const myEditorRef = ref<HTMLDivElement | null>(null);
const titleHtml = ref('');
const analyzing = ref(false);
const aiAnalysis = ref('');
const aiEl = ref<HTMLDivElement | null>(null);

let myVditor: Vditor | null = null;
let myEditorReady = false;

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' } as const;

// 按可见面板数控制网格列数：0 个侧栏时作答占满整行
const gridClass = computed(() => {
  const count = (showAiPanel.value ? 1 : 0) + (showAnswer.value ? 1 : 0);
  if (count === 0) return 'no-side';
  return count === 1 ? 'one-side' : 'two-sides';
});

function renderMarkdown(el: HTMLDivElement, content: string) {
  // 链接新标签页打开由 main.ts 的全局点击委托统一处理
  Vditor.preview(el, content, {
    lang: 'zh_CN',
    mode: 'light',
    cdn: '/vditor',
    hljs: { style: 'github', lineNumber: false },
  });
}

function initMyEditor() {
  if (!myEditorRef.value || myVditor) return;
  myVditor = new Vditor(myEditorRef.value, {
    lang: 'zh_CN',
    mode: 'ir',
    height: '100%',
    placeholder: '在这里写下你的答案…（支持 Markdown，仅本地显示）',
    cache: { enable: false },
    cdn: '/vditor',
    link: { isOpen: true },
    toolbar: [
      'headings', 'bold', 'italic', 'strike', '|',
      'list', 'ordered-list', 'quote', 'code', '|',
      'undo', 'redo', '|', 'fullscreen',
    ],
    after: () => {
      myEditorReady = true;
    },
  });
}

function clearMyAnswer() {
  if (myVditor && myEditorReady) myVditor.setValue('');
}

async function drawQuestion(excludeId?: string) {
  loading.value = true;
  try {
    const params = excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : '';
    const item = await request<QuizQuestion>(`/questions/random${params}`);
    question.value = item;
    showAnswer.value = false;
    showAiPanel.value = false;
    aiAnalysis.value = '';
    titleHtml.value = marked.parse(item.title || '', { async: false }) as string;
  } catch (error) {
    fail(error instanceof Error ? error.message : '抽题失败');
  } finally {
    loading.value = false;
  }
}

// 把题目与用户作答发给 Coze 智能体做点评
async function runAiReview() {
  if (!question.value || analyzing.value) return;
  showAiPanel.value = true;
  const myAnswer = myVditor && myEditorReady ? myVditor.getValue() : '';
  analyzing.value = true;
  try {
    const result = await request<{ analysis: string }>('/ai/review', {
      method: 'POST',
      body: JSON.stringify({ title: question.value.title, answer: myAnswer }),
    });
    aiAnalysis.value = result.analysis;
    notice('AI 分析完成');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'AI 分析失败');
  } finally {
    analyzing.value = false;
  }
}

function nextQuestion() {
  drawQuestion(question.value?.id);
}

// 首次抽到题目后初始化作答编辑器；换题时清空作答
watch(question, async (val) => {
  if (!val) return;
  if (!myVditor) {
    await nextTick();
    initMyEditor();
  } else {
    clearMyAnswer();
  }
});

// 显示详情时渲染参考内容（笔记正文），代码块带语法高亮
watch(showAnswer, async (visible) => {
  if (!visible || !question.value) return;
  await nextTick();
  if (!answerEl.value) return;
  renderMarkdown(answerEl.value, question.value.content);
});

// AI 分析结果渲染（Markdown，与参考答案同一渲染管线）
watch(aiAnalysis, async (val) => {
  if (!val) return;
  await nextTick();
  if (!aiEl.value) return;
  renderMarkdown(aiEl.value, val);
});

onMounted(() => drawQuestion());

onBeforeUnmount(() => {
  myVditor?.destroy();
  myVditor = null;
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>每日回想</h1>
        <p class="subtitle">随机抽取笔记，先自己回想作答，再对照参考详情。</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary" :disabled="analyzing || !question" @click="runAiReview">
          {{ analyzing ? 'AI 分析中…' : 'AI 分析' }}
        </button>
        <button type="button" class="secondary" :disabled="!question" @click="showAnswer = !showAnswer">
          {{ showAnswer ? '隐藏详情' : '显示详情' }}
        </button>
        <button type="button" :disabled="loading" @click="nextQuestion">再来一篇</button>
      </div>
    </header>

    <p v-if="loading && !question" class="loading">抽取中…</p>

    <p v-else-if="!question" class="empty">暂无可回想的内容，先去创建一些笔记吧。</p>

    <template v-else>
      <article class="panel question-card">
        <div class="question-pills">
          <span class="pill" :class="`difficulty-${question.difficulty}`">{{ difficultyLabels[question.difficulty] }}</span>
          <span v-for="tag in question.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="question-title" v-html="titleHtml"></div>
        <p class="meta">来自 {{ question.creatorName }} 的笔记 · {{ question.visibility === 'public' ? '公开' : '私有' }}</p>
      </article>

      <div class="quiz-grid" :class="gridClass">
        <section v-if="showAiPanel" class="panel side ai-side">
          <p class="side-label">AI 分析</p>
          <div v-if="analyzing" class="loading">AI 分析中，约需十几秒…</div>
          <!-- v-show 常驻，保证 Markdown 渲染目标始终存在 -->
          <div v-show="aiAnalysis" ref="aiEl" class="md-content"></div>
          <p v-if="!analyzing && !aiAnalysis" class="ai-placeholder">暂无分析结果，可点击右上角「AI 分析」重试。</p>
        </section>

        <section v-if="showAnswer" class="panel side answer-side">
          <p class="side-label">参考详情</p>
          <div ref="answerEl" class="md-content"></div>
        </section>

        <section class="panel side input-side">
          <p class="side-label">我的作答</p>
          <div ref="myEditorRef" class="my-editor"></div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* 覆盖全局 .page：整页占满可视高度（扣除 app-main 上下 padding），页面自身不滚动 */
.page {
  height: calc(100dvh - 64px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.page-header,
.question-card {
  flex-shrink: 0;
}

.question-card {
  display: grid;
  gap: 10px;
}

.question-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.question-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.question-title :deep(p) {
  margin: 0;
}

/* 占满剩余高度；内容过长时只滚动各自面板，不滚动整页 */
/* 手机默认顺序（order）：AI 分析 → 参考答案（答案在作答上方）→ 我的作答 */
.quiz-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-rows: minmax(0, 1fr);
}

.ai-side {
  order: -2;
}

.answer-side {
  order: -1;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}

.side-label {
  flex-shrink: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #557080;
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}

.ai-placeholder {
  flex: 1;
  margin: 0;
  display: grid;
  place-items: center;
  padding: 18px 16px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-tint);
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.my-editor {
  flex: 1;
  min-height: 180px;
}

.my-editor :deep(.vditor) {
  height: 100%;
  border-radius: var(--radius-md);
  border-color: var(--line);
}

/* 去掉 Vditor 内容区默认的限宽与两侧留白，作答区域铺满面板 */
.my-editor :deep(.vditor-reset) {
  max-width: 100% !important;
  margin: 0 !important;
  padding: 12px 16px !important;
}

/* PC / Pad：左侧作答占满全高，右侧按需放 AI 分析 / 参考答案 */
@media (min-width: 900px) {
  /* 行数显式声明，grid-row: 1 / -1 才能正确跨到最后一行 */
  .quiz-grid.no-side {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .quiz-grid.one-side,
  .quiz-grid.two-sides {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .quiz-grid.one-side {
    grid-template-rows: minmax(0, 1fr);
  }

  .quiz-grid.two-sides {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  .input-side {
    order: 0;
    grid-column: 1;
    grid-row: 1 / -1;
  }

  .ai-side {
    order: 0;
    grid-column: 2;
  }

  .answer-side {
    order: 0;
    grid-column: 2;
  }
}

.md-content {
  flex: 1;
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

.empty {
  margin: 8px 0;
  color: var(--muted);
  font-size: 14px;
}
</style>
