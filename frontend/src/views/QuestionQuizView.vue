<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { marked } from 'marked';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { request } from '../api';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';
import FilterCheckGroup, { type CheckOption } from '../components/FilterCheckGroup.vue';

marked.setOptions({ gfm: true, breaks: true });

interface QuizQuestion {
  id: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorName: string;
  visibility: 'public' | 'private';
  // 出现次数：决定推送权重；完全掌握后不再推送
  drawCount: number;
  mastered: boolean;
}

const { notice, fail } = useToast();
const auth = useAuthStore();
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

// 筛选：登录用户的勾选持久化到后台（quiz-prefs），进入页面自动恢复
const difficultyOptions: CheckOption[] = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
];
const showFilter = ref(false);
const difficultyFilter = ref<string[]>([]);
const tagFilter = ref<string[]>([]);
const draftDifficulty = ref<string[]>([]);
const draftTags = ref<string[]>([]);
const tagOptions = ref<CheckOption[]>([]);
const savingPrefs = ref(false);

const activeFilterCount = computed(() => difficultyFilter.value.length + tagFilter.value.length);

function openFilter() {
  draftDifficulty.value = [...difficultyFilter.value];
  draftTags.value = [...tagFilter.value];
  showFilter.value = true;
}

// 重置：仅清空弹窗内勾选，点「确定」后才应用
function resetFilter() {
  draftDifficulty.value = [];
  draftTags.value = [];
}

async function applyFilter() {
  difficultyFilter.value = [...draftDifficulty.value];
  tagFilter.value = [...draftTags.value];
  showFilter.value = false;

  if (auth.user) {
    savingPrefs.value = true;
    try {
      await request('/users/me/quiz-prefs', {
        method: 'PUT',
        body: JSON.stringify({ difficulty: difficultyFilter.value, tags: tagFilter.value }),
      });
    } catch {
      fail('筛选偏好保存失败');
    } finally {
      savingPrefs.value = false;
    }
  }

  drawQuestion();
}

async function loadPrefs() {
  if (!auth.user) return;
  try {
    const prefs = await request<{ difficulty: string[]; tags: string[] }>('/users/me/quiz-prefs');
    difficultyFilter.value = Array.isArray(prefs.difficulty) ? prefs.difficulty : [];
    tagFilter.value = Array.isArray(prefs.tags) ? prefs.tags : [];
  } catch {
    // 拉取失败（含未登录）时按不筛选处理
  }
}

async function loadTagOptions() {
  const result = await request<Array<{ id: string; name: string; active: boolean; color?: string }>>('/tags');
  tagOptions.value = result
    .filter((item) => item.active)
    .map((item) => ({ value: item.name, label: item.name, color: item.color }));
}

// 回想自评反馈：直接调整推送权重
const feedbackSaving = ref(false);

// 反馈后的提示文案
const FEEDBACK_NOTICES: Record<string, string> = {
  forgot: '已记录：没记住，这篇会尽快再次出现',
  fuzzy: '已记录：模糊，出现频率保持不变',
  known: '已记录：记住了，出现频率会降低',
  mastered: '已标记为完全掌握，之后不再推送这篇',
};

async function submitFeedback(feedback: 'known' | 'fuzzy' | 'forgot' | 'mastered') {
  if (!question.value || feedbackSaving.value) return;
  feedbackSaving.value = true;
  try {
    const result = await request<{ drawCount: number; mastered: boolean }>(
      `/questions/${question.value.id}/quiz-feedback`,
      { method: 'POST', body: JSON.stringify({ feedback }) },
    );
    question.value = { ...question.value, drawCount: result.drawCount, mastered: result.mastered };
    notice(FEEDBACK_NOTICES[feedback]);
  } catch (error) {
    fail(error instanceof Error ? error.message : '反馈保存失败');
  } finally {
    feedbackSaving.value = false;
  }
}

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
    const params = new URLSearchParams();
    if (excludeId) params.set('excludeId', excludeId);
    difficultyFilter.value.forEach((value) => params.append('difficulty', value));
    tagFilter.value.forEach((value) => params.append('tags', value));
    const qs = params.toString();
    const item = await request<QuizQuestion>(`/questions/random${qs ? `?${qs}` : ''}`);
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

onMounted(async () => {
  loadTagOptions().catch(() => {});
  await loadPrefs();
  drawQuestion();
});

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
        <button type="button" class="secondary" :class="{ 'filter-on': activeFilterCount }" @click="openFilter">
          筛选<template v-if="activeFilterCount"> · {{ activeFilterCount }}</template>
        </button>
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
        <p class="meta">来自 {{ question.creatorName }} 的笔记 · {{ question.visibility === 'public' ? '公开' : '私有' }} · 出现 {{ question.drawCount }} 次</p>
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
          <!-- 回想自评反馈：直接调整推送权重 -->
          <div v-if="auth.user" class="feedback-bar">
            <span class="feedback-hint">对照后回忆得怎么样？</span>
            <div class="feedback-actions">
              <button
                type="button"
                class="fb-btn fb-forgot"
                :disabled="feedbackSaving"
                title="立即回到最优先推送"
                @click="submitFeedback('forgot')"
              >
                没记住
              </button>
              <button
                type="button"
                class="fb-btn fb-fuzzy"
                :disabled="feedbackSaving"
                title="推送频率基本不变"
                @click="submitFeedback('fuzzy')"
              >
                模糊
              </button>
              <button
                type="button"
                class="fb-btn fb-known"
                :disabled="feedbackSaving"
                title="降低推送频率"
                @click="submitFeedback('known')"
              >
                记住了
              </button>
              <button
                type="button"
                class="fb-btn fb-mastered"
                :disabled="feedbackSaving"
                title="不再推送这篇笔记"
                @click="submitFeedback('mastered')"
              >
                完全掌握
              </button>
            </div>
          </div>
        </section>

        <section class="panel side input-side">
          <p class="side-label">我的作答</p>
          <div ref="myEditorRef" class="my-editor"></div>
        </section>
      </div>
    </template>

    <!-- 筛选弹窗：勾选只作用于抽取范围，不改变列表页筛选 -->
    <Teleport to="body">
      <Transition name="quiz-filter-fade">
        <div v-if="showFilter" class="quiz-filter-backdrop" @click.self="showFilter = false">
          <div class="quiz-filter-dialog" role="dialog" aria-modal="true" aria-label="筛选">
            <h3>筛选</h3>
            <p class="filter-hint">仅抽取符合条件的内容，全部留空表示不限制</p>
            <FilterCheckGroup v-model="draftDifficulty" label="难度" :options="difficultyOptions" />
            <FilterCheckGroup v-model="draftTags" label="标签" :options="tagOptions" />
            <div class="filter-actions">
              <button type="button" class="btn-ghost" @click="resetFilter">重置</button>
              <span class="spacer"></span>
              <button type="button" class="btn-cancel" @click="showFilter = false">取消</button>
              <button type="button" class="btn-primary" :disabled="savingPrefs" @click="applyFilter">确定</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

/* 回想自评反馈条：贴在详情内容底部，不随内容滚动 */
.feedback-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 4px 2px;
  margin-top: 8px;
  background: var(--surface);
  border-top: 1px solid var(--line-soft);
}

.feedback-hint {
  font-size: 13px;
  color: var(--muted);
}

.feedback-actions {
  display: flex;
  gap: 8px;
}

.fb-btn {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

/* 覆盖全局 button:hover 的 teal 实心背景，保持浅色胶囊风格 */
.fb-btn:hover:not(:disabled),
.fb-btn:active:not(:disabled) {
  box-shadow: none;
}

.fb-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.fb-btn:active:not(:disabled) {
  transform: translateY(0);
}

.fb-forgot {
  color: #c24545;
  background: rgba(217, 95, 95, 0.1);
}

.fb-forgot:hover:not(:disabled) {
  background: rgba(217, 95, 95, 0.2);
}

.fb-fuzzy {
  color: #b45309;
  background: rgba(180, 83, 9, 0.1);
}

.fb-fuzzy:hover:not(:disabled) {
  background: rgba(180, 83, 9, 0.18);
}

.fb-known {
  color: #0f766e;
  background: rgba(13, 148, 136, 0.12);
}

.fb-known:hover:not(:disabled) {
  background: rgba(13, 148, 136, 0.22);
}

.fb-mastered {
  color: #64748b;
  background: rgba(100, 116, 139, 0.12);
}

.fb-mastered:hover:not(:disabled) {
  background: rgba(100, 116, 139, 0.22);
}

.empty {
  margin: 8px 0;
  color: var(--muted);
  font-size: 14px;
}

/* 筛选按钮激活态：teal 描边提示当前有筛选条件 */
.filter-on {
  border-color: #5eaaa0;
  color: #0f766e;
}

/* 筛选弹窗（风格对齐全局确认弹窗） */
.quiz-filter-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 30, 40, 0.4);
  backdrop-filter: blur(6px);
}

.quiz-filter-dialog {
  width: min(520px, 100%);
  display: grid;
  gap: 14px;
  padding: 24px 24px 20px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  box-shadow: 0 24px 64px rgba(15, 30, 40, 0.28);
}

.quiz-filter-dialog h3 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.01em;
}

.filter-hint {
  margin: -6px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.filter-actions .spacer {
  flex: 1;
}

.btn-ghost {
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: rgba(13, 148, 136, 0.08);
  color: #0f766e;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-ghost:hover {
  background: rgba(13, 148, 136, 0.16);
}

.btn-cancel,
.btn-primary {
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink);
}

.btn-cancel:hover {
  background: rgba(15, 42, 58, 0.06);
}

.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.22);
}

.btn-primary:hover {
  transform: translateY(-1px);
}

.btn-ghost:focus-visible,
.btn-cancel:focus-visible,
.btn-primary:focus-visible {
  outline: 2px solid rgba(13, 148, 136, 0.55);
  outline-offset: 2px;
}

.quiz-filter-fade-enter-active {
  transition: opacity 0.2s ease;
}

.quiz-filter-fade-enter-active .quiz-filter-dialog {
  animation: quiz-filter-pop 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.quiz-filter-fade-leave-active {
  transition: opacity 0.16s ease;
}

.quiz-filter-fade-enter-from,
.quiz-filter-fade-leave-to {
  opacity: 0;
}

@keyframes quiz-filter-pop {
  from {
    transform: scale(0.92) translateY(10px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>
