<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { request } from '../api';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../composables/useToast';

const router = useRouter();
const auth = useAuthStore();
const { fail } = useToast();

interface QuizStats {
  drawTotal: number;
  reviewTotal: number;
  streak: number;
  calendar: Array<{ date: string; count: number }>;
  levelDist: Array<{ level: number; count: number }>;
  unseen: number;
  weakTags: Array<{ tag: string; total: number; known: number; fuzzy: number; forgot: number; score: number }>;
}

interface DashboardInfo {
  noteTotal: number;
  publicCount: number;
  privateCount: number;
  todayReviews: number;
  recent: Array<{ questionId: string; title: string; feedback: string | null; createdAt: string }>;
}

const loading = ref(true);
const stats = ref<QuizStats | null>(null);
const info = ref<DashboardInfo | null>(null);

const greeting = computed(() => {
  const hour = Number(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 13));
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const todayText = computed(() => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const week = ['日', '一', '二', '三', '四', '五', '六'][Number(d.getUTCDay())];
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 · 星期${week}`;
});

// 与后端一致的 UTC+8 日期字符串，保证打卡格子与日志分组对齐
const fmtDate = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 打卡热力图：最近 15 周（105 天），列为周、周一为第一行
interface CalendarCell {
  date: string;
  count: number;
  future: boolean;
}
const heatCells = computed<CalendarCell[]>(() => {
  const map = new Map((stats.value?.calendar ?? []).map((item) => [item.date, item.count]));
  const today = new Date();
  const shiftedDow = (new Date(today.getTime() + 8 * 3600 * 1000).getUTCDay() + 6) % 7;
  const start = new Date(today.getTime() - (shiftedDow + 14 * 7) * 24 * 60 * 60 * 1000);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 15 * 7; i += 1) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = fmtDate(d);
    cells.push({ date: key, count: map.get(key) ?? 0, future: d.getTime() > today.getTime() });
  }
  return cells;
});

const heatClass = (cell: CalendarCell) => {
  if (cell.future) return 'h-future';
  if (cell.count <= 0) return 'h0';
  if (cell.count <= 2) return 'h1';
  if (cell.count <= 5) return 'h2';
  return 'h3';
};

const LEVEL_LABELS = ['完全掌握', '低频回顾', '继续巩固', '常规复习', '优先推荐'];
const LEVEL_BAR_CLASSES = ['lb0', 'lb1', 'lb2', 'lb3', 'lb4'];

// 推送频率分布：含未出现，按总量归一化条形
const levelRows = computed(() => {
  const rows = (stats.value?.levelDist ?? []).map((item) => ({
    label: LEVEL_LABELS[item.level] ?? `档位 ${item.level}`,
    count: item.count,
    barClass: LEVEL_BAR_CLASSES[item.level] ?? 'lb0',
  }));
  rows.push({ label: '未出现过', count: stats.value?.unseen ?? 0, barClass: 'lb-new' });
  const max = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({ ...row, width: `${Math.round((row.count / max) * 100)}%` }));
});

const masteredCount = computed(() => stats.value?.levelDist.find((item) => item.level === 0)?.count ?? 0);

const weakRows = computed(() => {
  const rows = stats.value?.weakTags ?? [];
  const max = Math.max(0.01, ...rows.map((row) => row.score));
  return rows.map((row) => ({
    ...row,
    rate: Math.round(((row.forgot + 0.5 * row.fuzzy) / row.total) * 100),
    width: `${Math.round(((row.forgot + 0.5 * row.fuzzy) / row.total / max) * 100)}%`,
  }));
});

const FEEDBACK_LABELS: Record<string, string> = { known: '记住了', fuzzy: '模糊', forgot: '没记住', mastered: '完全掌握' };

const feedbackLabel = (feedback: string | null) =>
  (feedback && FEEDBACK_LABELS[feedback]) || '未反馈';

// 相对时间显示
const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(5, 10).replace('-', '/');
};

function startQuiz() {
  router.push('/quiz');
}

function openNote(questionId: string) {
  router.push(`/questions/${questionId}`);
}

onMounted(async () => {
  try {
    const [statsResult, infoResult] = await Promise.all([
      request<QuizStats>('/users/me/quiz-stats'),
      request<DashboardInfo>('/users/me/dashboard'),
    ]);
    stats.value = statsResult;
    info.value = infoResult;
  } catch (error) {
    fail(error instanceof Error ? error.message : '主页数据加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="dashboard">
    <!-- 欢迎区：问候 + 日期 + 回想入口 -->
    <header class="hero">
      <div>
        <h2>{{ greeting }}，{{ auth.user?.username ?? '同学' }}</h2>
        <p class="hero-sub">{{ todayText }} · 今天也来回想几道题吧</p>
      </div>
      <button type="button" class="primary start-quiz" @click="startQuiz">开始回想</button>
    </header>

    <p v-if="loading" class="loading">加载中…</p>

    <template v-else-if="stats && info">
      <!-- 核心统计卡 -->
      <div class="stat-cards">
        <div class="stat-card">
          <b>{{ info.todayReviews }}</b>
          <span>今日回想</span>
        </div>
        <div class="stat-card">
          <b>{{ stats.drawTotal }}</b>
          <span>累计回想</span>
        </div>
        <div class="stat-card">
          <b>{{ stats.streak }}</b>
          <span>连续打卡（天）</span>
        </div>
        <div class="stat-card">
          <b>{{ masteredCount }}</b>
          <span>完全掌握</span>
        </div>
      </div>

      <div class="grid-2">
        <!-- 打卡热力图 -->
        <section class="panel">
          <h4>回想热力图（最近 15 周）</h4>
          <div class="heatmap" role="img" aria-label="最近 15 周回想热力图">
            <i
              v-for="cell in heatCells"
              :key="cell.date"
              class="heat-cell"
              :class="heatClass(cell)"
              :title="`${cell.date} · ${cell.count} 次`"
            ></i>
          </div>
        </section>

        <div class="stack">
          <!-- 推送频率分布 -->
          <section class="panel">
            <h4>推送频率分布</h4>
            <div class="dist-list">
              <div v-for="row in levelRows" :key="row.label" class="dist-row">
                <span class="dist-label">{{ row.label }}</span>
                <span class="dist-track"><i class="dist-bar" :class="row.barClass" :style="{ width: row.width }"></i></span>
                <b class="dist-count">{{ row.count }}</b>
              </div>
            </div>
          </section>

          <!-- 薄弱标签 -->
          <section class="panel">
            <h4>薄弱标签（自评没记住/模糊占比）</h4>
            <p v-if="!weakRows.length" class="empty">暂无自评数据，回想后点「没记住 / 模糊 / 记住了」即可积累。</p>
            <div v-else class="dist-list">
              <div v-for="row in weakRows" :key="row.tag" class="dist-row">
                <span class="dist-label">{{ row.tag }}</span>
                <span class="dist-track"><i class="dist-bar lb-weak" :style="{ width: row.width }"></i></span>
                <b class="dist-count">{{ row.rate }}%</b>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div class="grid-2">
        <!-- 笔记数据概览 -->
        <section class="panel">
          <h4>我的笔记</h4>
          <div class="overview-cards">
            <div class="overview-card">
              <b>{{ info.noteTotal }}</b>
              <span>笔记总数</span>
            </div>
            <div class="overview-card">
              <b>{{ info.publicCount }}</b>
              <span>公开</span>
            </div>
            <div class="overview-card">
              <b>{{ info.privateCount }}</b>
              <span>私有</span>
            </div>
          </div>
        </section>

        <!-- 最近回想 -->
        <section class="panel">
          <h4>最近回想</h4>
          <p v-if="!info.recent.length" class="empty">还没有回想记录，点上方「开始回想」试试。</p>
          <ul v-else class="recent-list">
            <li v-for="item in info.recent" :key="`${item.questionId}-${item.createdAt}`">
              <button type="button" class="recent-item" @click="openNote(item.questionId)">
                <span class="recent-title">{{ item.title }}</span>
                <span class="recent-meta">
                  <i class="fb-badge" :class="`fb-${item.feedback ?? 'none'}`">{{ feedbackLabel(item.feedback) }}</i>
                  <time>{{ relativeTime(item.createdAt) }}</time>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 18px;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 26px 28px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.1) 0%, rgba(13, 148, 136, 0.04) 100%);
  border: 1px solid rgba(13, 148, 136, 0.16);
}

.hero h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.01em;
}

.hero-sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.start-quiz {
  padding: 11px 22px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #0f766e, #0d9488);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15, 118, 110, 0.28);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.start-quiz:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(15, 118, 110, 0.34);
}

.loading {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

/* 数字卡：4 列网格 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  display: grid;
  gap: 2px;
  padding: 16px 18px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line-soft);
  box-shadow: 0 6px 16px rgba(15, 42, 58, 0.05);
}

.stat-card b {
  font-size: 26px;
  letter-spacing: -0.02em;
  color: #0f766e;
}

.stat-card span {
  font-size: 12px;
  color: var(--muted);
}

/* 双列面板 */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
}

.stack {
  display: grid;
  gap: 14px;
}

.panel {
  padding: 18px 20px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line-soft);
  box-shadow: 0 6px 16px rgba(15, 42, 58, 0.05);
}

.panel h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

/* 热力图：15 列 × 7 行，列为周 */
.heatmap {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 14px);
  grid-auto-columns: 14px;
  gap: 3px;
  justify-content: center;
  padding: 10px;
  border-radius: 12px;
  background: #f6fafb;
  border: 1px solid var(--line-soft);
}

.heat-cell {
  border-radius: 3px;
  background: #e6ecef;
}

.heat-cell.h1 {
  background: #9bd4cb;
}

.heat-cell.h2 {
  background: #4aa99c;
}

.heat-cell.h3 {
  background: #0f766e;
}

.heat-cell.h-future {
  background: transparent;
}

/* 条形列表 */
.dist-list {
  display: grid;
  gap: 9px;
}

.dist-row {
  display: grid;
  grid-template-columns: 76px 1fr 44px;
  align-items: center;
  gap: 10px;
}

.dist-label {
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dist-track {
  height: 10px;
  border-radius: 999px;
  background: #eef3f4;
  overflow: hidden;
}

.dist-bar {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.lb0 {
  background: #94a3b8;
}

.lb1 {
  background: #b0bcc7;
}

.lb2 {
  background: #d3a05f;
}

.lb3 {
  background: #5b8def;
}

.lb4 {
  background: #0f766e;
}

.lb-new {
  background: #c6d2d8;
}

.lb-weak {
  background: #d95f5f;
}

.dist-count {
  font-size: 12px;
  color: var(--muted);
  text-align: right;
}

/* 笔记概览卡 */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.overview-card {
  display: grid;
  gap: 2px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(13, 148, 136, 0.05);
  border: 1px solid rgba(13, 148, 136, 0.12);
}

.overview-card b {
  font-size: 20px;
  color: #0f766e;
}

.overview-card span {
  font-size: 12px;
  color: var(--muted);
}

/* 最近回想列表 */
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.recent-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.recent-item:hover {
  background: rgba(13, 148, 136, 0.06);
  border-color: rgba(13, 148, 136, 0.16);
}

.recent-title {
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.recent-meta time {
  font-size: 12px;
  color: var(--muted);
}

.fb-badge {
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.fb-badge.fb-known {
  color: #0f766e;
  background: rgba(13, 148, 136, 0.12);
}

.fb-badge.fb-fuzzy {
  color: #b45309;
  background: rgba(180, 83, 9, 0.12);
}

.fb-badge.fb-forgot {
  color: #c24545;
  background: rgba(217, 95, 95, 0.12);
}

.fb-badge.fb-mastered {
  color: #64748b;
  background: rgba(100, 116, 139, 0.14);
}

.fb-badge.fb-none {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.14);
}

.empty {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
