<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  knownCount: number;
  fuzzyCount: number;
  forgotCount: number;
  masteredCount: number;
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
  difficultyDist: { easy: number; medium: number; hard: number };
  topTags: Array<{ tag: string; count: number }>;
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

// ===== 回想热力图（GitHub 风格）：按列流式排布，今天固定落在最后一格（最右侧）=====
interface CalendarCell {
  date: string;
  count: number;
  future: boolean;
}

// 悬浮提示：跟随鼠标显示某天的回想次数
const heatTip = ref<{ x: number; y: number; text: string } | null>(null);

// 列数与格子边长由容器尺寸决定（8 ~ 53 列，53 列即一年）
const heatCols = ref(53);
const cellSize = ref(12);
const heatWrap = ref<HTMLElement | null>(null);
let heatObserver: ResizeObserver | null = null;
let heatFitRaf = 0;

const HEAT_GAP = 3;
const HEAT_PAD_X = 32;
const HEAT_PAD_Y = 40;

// cols*(size+GAP)-GAP+PAD_X ≤ 容器宽，数学上保证网格不溢出
function fitHeatmap() {
  const el = heatWrap.value;
  if (!el) return;
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (!width || !height) return;
  const size = Math.max(7, Math.min(13, Math.floor((height - HEAT_PAD_Y - 6 * HEAT_GAP) / 7)));
  const cols = Math.floor((width - HEAT_PAD_X + HEAT_GAP) / (size + HEAT_GAP));
  cellSize.value = size;
  heatCols.value = Math.max(8, Math.min(53, cols));
}

const heatCells = computed<CalendarCell[]>(() => {
  const map = new Map((stats.value?.calendar ?? []).map((item) => [item.date, item.count]));
  const now = new Date();
  const total = heatCols.value * 7;
  // 起点 = 今天往前推 total-1 天，最后一天恰好是今天，落在网格最后一格（最右侧）
  const start = now.getTime() - (total - 1) * 24 * 60 * 60 * 1000;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < total; i += 1) {
    const d = new Date(start + i * 24 * 60 * 60 * 1000);
    const key = fmtDate(d);
    cells.push({ date: key, count: map.get(key) ?? 0, future: d.getTime() > now.getTime() });
  }
  return cells;
});

// 色阶固定四档：0 / 1-5 / 6-15 / 15 以上。
// 所有格子（含今天）只使用图例中的四档颜色；今天固定在最右侧一列，无需额外标记色
const heatClass = (cell: CalendarCell) => {
  if (cell.future) return 'is-future';
  return cell.count <= 0 ? 'lv0' : cell.count <= 5 ? 'lv1' : cell.count <= 15 ? 'lv2' : 'lv3';
};

function onHeatMove(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const date = target?.dataset?.date;
  if (!date) {
    heatTip.value = null;
    return;
  }
  const count = Number(target.dataset.count ?? 0);
  const text = count > 0 ? `${count} 次回想 · ${date}` : `未回想 · ${date}`;
  const tipX = event.clientX + 14 + 170 > window.innerWidth ? event.clientX - 176 : event.clientX + 14;
  heatTip.value = { x: tipX, y: event.clientY - 36, text };
}

// 过去一年回想总次数（365 天日志求和）
const total365 = computed(() => (stats.value?.calendar ?? []).reduce((sum, item) => sum + item.count, 0));

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

const masteredTotal = computed(() => stats.value?.levelDist.find((item) => item.level === 0)?.count ?? 0);

// 最近 7 天回想趋势（含今天），柱高按最大值归一化
const trendRows = computed(() => {
  const map = new Map((stats.value?.calendar ?? []).map((item) => [item.date, item.count]));
  const todayKey = fmtDate(new Date());
  const rows: Array<{ date: string; count: number; label: string; isToday: boolean; height: string }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = fmtDate(d);
    const count = map.get(key) ?? 0;
    const dow = Number(new Date(d.getTime() + 8 * 3600 * 1000).getUTCDay());
    rows.push({
      date: key,
      count,
      label: ['日', '一', '二', '三', '四', '五', '六'][dow],
      isToday: key === todayKey,
      height: '0%',
    });
  }
  const max = Math.max(1, ...rows.map((row) => row.count));
  // 上限 78%：柱子不顶到轨道顶部，也给悬浮在柱顶上方的数字留出空间
  return rows.map((row) => ({ ...row, height: `${Math.min(78, Math.max(6, Math.round((row.count / max) * 100)))}%` }));
});

// 自评反馈分布（含完全掌握）
const feedbackRows = computed(() => {
  const s = stats.value;
  const rows = [
    { label: '记住了', count: s?.knownCount ?? 0, barClass: 'fb-bar-known' },
    { label: '模糊', count: s?.fuzzyCount ?? 0, barClass: 'fb-bar-fuzzy' },
    { label: '没记住', count: s?.forgotCount ?? 0, barClass: 'fb-bar-forgot' },
    { label: '完全掌握', count: s?.masteredCount ?? 0, barClass: 'fb-bar-mastered' },
  ];
  const max = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({ ...row, width: `${Math.max(row.count ? 4 : 0, Math.round((row.count / max) * 100))}%` }));
});

const weakRows = computed(() => {
  const rows = stats.value?.weakTags ?? [];
  const max = Math.max(0.01, ...rows.map((row) => row.score));
  return rows.map((row) => ({
    ...row,
    rate: Math.round(((row.forgot + 0.5 * row.fuzzy) / row.total) * 100),
    width: `${Math.round(((row.forgot + 0.5 * row.fuzzy) / row.total / max) * 100)}%`,
  }));
});

// 难度分布条形
const difficultyRows = computed(() => {
  const dist = info.value?.difficultyDist ?? { easy: 0, medium: 0, hard: 0 };
  const rows = [
    { label: '简单', count: dist.easy, barClass: 'diff-easy' },
    { label: '中等', count: dist.medium, barClass: 'diff-medium' },
    { label: '困难', count: dist.hard, barClass: 'diff-hard' },
  ];
  const max = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({ ...row, width: `${Math.round((row.count / max) * 100)}%` }));
});

// 标签 Top 条形
const topTagRows = computed(() => {
  const rows = info.value?.topTags ?? [];
  const max = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({ ...row, width: `${Math.round((row.count / max) * 100)}%` }));
});

const FEEDBACK_LABELS: Record<string, string> = { known: '记住了', fuzzy: '模糊', forgot: '没记住', mastered: '完全掌握' };

const feedbackLabel = (feedback: string | null) => (feedback && FEEDBACK_LABELS[feedback]) || '未反馈';

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
  await nextTick();
  void fitHeatmap();
  window.addEventListener('resize', fitHeatmap);
  // 持续观察容器尺寸：初次布局、字体加载、滚动条出现引起的变化都会自动重新校准
  heatObserver = new ResizeObserver(() => {
    cancelAnimationFrame(heatFitRaf);
    heatFitRaf = requestAnimationFrame(fitHeatmap);
  });
  if (heatWrap.value) heatObserver.observe(heatWrap.value);

  try {
    const [statsResult, infoResult] = await Promise.all([
      request<QuizStats>('/users/me/quiz-stats'),
      request<DashboardInfo>('/users/me/dashboard'),
    ]);
    stats.value = statsResult;
    info.value = infoResult;
  } catch (error) {
    fail(error instanceof Error ? error.message : '看板数据加载失败');
  } finally {
    loading.value = false;
  }
});

// 数据到位、格子首次渲染后再校准尺寸，并把 ResizeObserver 挂到容器上（此前 heatWrap 尚未渲染）
watch(loading, (isLoading) => {
  if (isLoading) return;
  void nextTick(() => {
    fitHeatmap();
    if (heatObserver && heatWrap.value) heatObserver.observe(heatWrap.value);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitHeatmap);
  heatObserver?.disconnect();
  heatObserver = null;
  cancelAnimationFrame(heatFitRaf);
});
</script>

<template>
  <div class="dashboard">
    <!-- 欢迎横幅 -->
    <header class="hero">
      <div class="hero-deco" aria-hidden="true"></div>
      <div class="hero-body">
        <div>
          <h2>{{ greeting }}，{{ auth.user?.username ?? '同学' }}</h2>
          <p class="hero-sub">{{ todayText }} · 今天也来回想几道题吧</p>
        </div>
        <button type="button" class="start-quiz" @click="startQuiz">开始回想</button>
      </div>
    </header>

    <p v-if="loading" class="loading">加载中…</p>

    <template v-else-if="stats && info">
      <!-- 核心统计卡 -->
      <div class="stat-cards">
        <div class="stat-card sc1">
          <b>{{ info.todayReviews }}</b>
          <span>今日回想</span>
        </div>
        <div class="stat-card sc2">
          <b>{{ stats.drawTotal }}</b>
          <span>累计回想</span>
        </div>
        <div class="stat-card sc3">
          <b>{{ stats.streak }}</b>
          <span>连续打卡（天）</span>
        </div>
        <div class="stat-card sc4">
          <b>{{ masteredTotal }}</b>
          <span>完全掌握</span>
        </div>
      </div>

      <div class="row-main">
        <!-- 打卡热力图（GitHub 风格） -->
        <section class="panel heat-panel">
          <h4>回想热力图（最近一年 {{ total365 }} 次回想）</h4>
          <div ref="heatWrap" class="heat-wrap" @mousemove="onHeatMove" @mouseleave="heatTip = null">
            <div class="heat-canvas">
              <div
                class="heat-grid"
                role="img"
                aria-label="最近一年回想热力图"
                :style="{
                  gridTemplateColumns: `repeat(${heatCols}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(7, ${cellSize}px)`,
                  gridAutoColumns: `${cellSize}px`,
                }"
              >
                <i
                  v-for="cell in heatCells"
                  :key="cell.date"
                  class="heat-cell"
                  :class="heatClass(cell)"
                  :data-date="cell.date"
                  :data-count="cell.count"
                ></i>
              </div>
            </div>
            <div class="heat-legend" aria-hidden="true">
              <span>少</span>
              <i class="heat-cell lv0"></i><i class="heat-cell lv1"></i><i class="heat-cell lv2"></i><i class="heat-cell lv3"></i>
              <span>多</span>
            </div>
          </div>
        </section>

        <!-- 自评反馈分布 -->
        <section class="panel">
          <h4>自评反馈分布</h4>
          <div class="dist-list">
            <div v-for="row in feedbackRows" :key="row.label" class="dist-row">
              <span class="dist-label">{{ row.label }}</span>
              <span class="dist-track"><i class="dist-bar" :class="row.barClass" :style="{ width: row.width }"></i></span>
              <b class="dist-count">{{ row.count }}</b>
            </div>
          </div>
        </section>
      </div>

      <div class="grid-3">
        <!-- 7 天趋势 -->
        <section class="panel">
          <h4>近 7 天回想趋势</h4>
          <div class="trend">
            <div v-for="day in trendRows" :key="day.date" class="trend-col" :title="`${day.date} · ${day.count} 次`">
              <div class="trend-track">
                <b
                  v-if="day.count"
                  class="trend-count"
                  :class="{ today: day.isToday }"
                  :style="{ bottom: `calc(${day.height} + 4px)` }"
                >{{ day.count }}</b>
                <i class="trend-bar" :class="{ today: day.isToday, zero: !day.count }" :style="{ height: day.height }"></i>
              </div>
              <span class="trend-label" :class="{ today: day.isToday }">{{ day.label }}</span>
            </div>
          </div>
        </section>

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
          <h4>薄弱标签</h4>
          <p v-if="!weakRows.length" class="empty">暂无自评数据，回想后点「没记住 / 模糊 / 记住了」即可积累。</p>
          <div v-else class="dist-list top">
            <div v-for="row in weakRows" :key="row.tag" class="dist-row">
              <span class="dist-label">{{ row.tag }}</span>
              <span class="dist-track"><i class="dist-bar lb-weak" :style="{ width: row.width }"></i></span>
              <b class="dist-count">{{ row.rate }}%</b>
            </div>
          </div>
        </section>
      </div>

      <div class="grid-3">
        <!-- 我的笔记：总数 / 可见性 / 难度分布 -->
        <section class="panel">
          <h4>我的笔记</h4>
          <div class="note-summary">
            <div class="note-total">
              <b>{{ info.noteTotal }}</b>
              <span>笔记总数</span>
            </div>
            <div class="note-visibility">
              <span class="vis-item"><i class="vis-dot pub"></i>公开 {{ info.publicCount }}</span>
              <span class="vis-item"><i class="vis-dot priv"></i>私有 {{ info.privateCount }}</span>
            </div>
          </div>
          <div class="dist-list difficulty">
            <div v-for="row in difficultyRows" :key="row.label" class="dist-row">
              <span class="dist-label">{{ row.label }}</span>
              <span class="dist-track"><i class="dist-bar" :class="row.barClass" :style="{ width: row.width }"></i></span>
              <b class="dist-count">{{ row.count }}</b>
            </div>
          </div>
        </section>

        <!-- 标签 Top -->
        <section class="panel">
          <h4>高频标签 Top 6</h4>
          <p v-if="!topTagRows.length" class="empty">还没有笔记标签，编辑笔记时添加标签后可见。</p>
          <div v-else class="dist-list">
            <div v-for="row in topTagRows" :key="row.tag" class="dist-row">
              <span class="dist-label">{{ row.tag }}</span>
              <span class="dist-track"><i class="dist-bar tag-bar" :style="{ width: row.width }"></i></span>
              <b class="dist-count">{{ row.count }}</b>
            </div>
          </div>
        </section>

        <!-- 最近回想 -->
        <section class="panel">
          <h4>最近回想</h4>
          <p v-if="!info.recent.length" class="empty">还没有回想记录，点上方「开始回想」试试。</p>
          <ul v-else class="recent-list top">
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

    <!-- 热力图悬浮提示 -->
    <Teleport to="body">
      <div
        v-if="heatTip"
        class="heat-tip"
        :style="{ left: `${heatTip.x}px`, top: `${heatTip.y}px` }"
      >
        {{ heatTip.text }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  /* 行（PC/Pad）：横幅、统计卡随内容自适应；热力图行固定 180px；
     近 7 天趋势行与我的笔记行按 0.77 : 0.88 弹性分配剩余高度 */
  grid-template-rows:
    auto
    auto
    200px
    minmax(0, 0.77fr)
    minmax(0, 0.88fr);
  gap: 12px;
  /* 固定高度 = 扣除 app-main 上下 padding（24+40）后的可视高度，
     让 fr 行正好分配完剩余空间，整页锁定一屏、禁止滚动 */
  height: calc(100dvh - 64px);
  overflow: hidden;
}

/* 欢迎横幅：浅 teal 渐变 + 柔光装饰圆 */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(13, 148, 136, 0.16);
  background: linear-gradient(120deg, rgba(13, 148, 136, 0.12) 0%, rgba(13, 148, 136, 0.05) 55%, rgba(20, 184, 166, 0.1) 100%);
}

.hero-deco {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(180px 120px at 88% 20%, rgba(20, 184, 166, 0.22), transparent 70%),
    radial-gradient(220px 160px at 70% 110%, rgba(13, 148, 136, 0.14), transparent 70%);
  pointer-events: none;
}

.hero-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 24px;
}

.hero-body h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.01em;
}

.hero-sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.start-quiz {
  padding: 11px 24px;
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

/* 数字条：单块白卡四等分，hairline 分隔，极简风 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: #fff;
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(15, 42, 58, 0.05);
}

.stat-card {
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 16px 24px;
}

/* 相邻卡片之间用细线分隔 */
.stat-card + .stat-card {
  border-left: 1px solid var(--line-soft);
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

/* 面板：白卡 + teal 竖条标题；同行面板等高填满。
   行高显式约束为 minmax(0, 1fr)：把 dashboard 行高传导给每个面板，
   面板内容超出时走内部滚动，不会撑破包装层把整页顶出滚动条 */
.row-main {
  display: grid;
  /* 与 .grid-3 一致的三列结构，热力图跨两列，保证右边缘与下方网格第 2 列对齐 */
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 硬性裁剪：任何面板内容都不允许溢出面板撑高整页，溢出一律走面板内滚动 */
  overflow: hidden;
  padding: 14px 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line-soft);
  box-shadow: 0 6px 16px rgba(15, 42, 58, 0.05);
}

.panel h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.panel h4::before {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, #0d9488, #14b8a6);
}

/* ===== 回想热力图（GitHub 风格）：画布 + 方格网格 + 图例 ===== */
.heat-panel {
  grid-column: span 2;
  gap: 8px;
}

.heat-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 画布：浅色圆角容器，网格居中，四周留白均匀 */
.heat-canvas {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 10px 16px;
  border-radius: 12px;
  background: #f6fafb;
  border: 1px solid var(--line-soft);
  overflow: hidden;
}

.heat-grid {
  display: grid;
  grid-auto-flow: column;
  gap: 3px;
  overflow: hidden;
}

.heat-cell {
  border-radius: 4px;
  background: #e8eef1;
}

.heat-cell.lv1 {
  background: #b9ddd5;
}

.heat-cell.lv2 {
  background: #5cb3a4;
}

.heat-cell.lv3 {
  background: #0f766e;
}

.heat-cell.is-future {
  background: transparent;
}

/* 图例：少 → 多 */
.heat-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}

.heat-legend .heat-cell {
  width: 11px;
  height: 11px;
}

/* 悬浮提示 */
.heat-tip {
  position: fixed;
  z-index: 90;
  pointer-events: none;
  padding: 5px 10px;
  border-radius: 7px;
  background: #0f172a;
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.25);
}

/* 条形列表：撑满面板剩余高度；默认垂直均分，.top 为顶部对齐。
   行高被压缩时在面板内滚动，不超出容器 */
.dist-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 0px;
  align-content: space-evenly;
}

.dist-list.top {
  align-content: start;
  gap: 12px;
  padding-top: 6px;
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

/* 自评反馈分布 */
.fb-bar-known {
  background: #0f766e;
}

.fb-bar-fuzzy {
  background: #d3a05f;
}

.fb-bar-forgot {
  background: #d95f5f;
}

.fb-bar-mastered {
  background: #94a3b8;
}

/* 推送频率分布 */
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

/* 7 天趋势柱状图：撑满面板剩余高度 */
.trend {
  /* 行高按百分比弹性分配，趋势图用 flex 撑满面板并随行高伸缩 */
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  align-items: stretch;
  min-height: 0;
}

.trend-col {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 6px;
  min-height: 0;
}

/* 轨道：整列宽浅色圆角底，柱子底部对齐 */
.trend-track {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
  min-height: 0;
  border-radius: 10px;
  background: #f0f7f8;
}

/* 数字悬浮在柱顶上方，随柱高移动 */
.trend-count {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  line-height: 1;
  color: var(--muted);
  white-space: nowrap;
}

.trend-count.today {
  color: #0f766e;
  font-weight: 700;
}

.trend-bar {
  display: block;
  width: 58%;
  max-width: 20px;
  border-radius: 999px;
  background: linear-gradient(180deg, #2dd4bf, #0d9488);
  transition: height 0.3s ease;
}

.trend-bar.today {
  background: linear-gradient(180deg, #0f766e, #14b8a6);
  box-shadow: 0 4px 10px rgba(13, 148, 136, 0.35);
}

.trend-bar.zero {
  background: #d5e4e6;
  box-shadow: none;
}

.trend-label {
  font-size: 11px;
  color: var(--muted);
  text-align: center;
}

.trend-label.today {
  color: #0f766e;
  font-weight: 700;
}

/* 我的笔记面板 */
.note-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.note-total {
  display: grid;
  gap: 2px;
}

.note-total b {
  font-size: 24px;
  letter-spacing: -0.02em;
  color: #0f766e;
}

.note-total span {
  font-size: 12px;
  color: var(--muted);
}

.note-visibility {
  display: grid;
  gap: 6px;
}

.vis-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.vis-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.vis-dot.pub {
  background: #0d9488;
}

.vis-dot.priv {
  background: #94a3b8;
}

.difficulty {
  padding-top: 4px;
  border-top: 1px dashed var(--line-soft);
}

.diff-easy {
  background: #0d9488;
}

.diff-medium {
  background: #d3a05f;
}

.diff-hard {
  background: #d95f5f;
}

/* 标签 Top */
.tag-bar {
  background: linear-gradient(90deg, #0d9488, #14b8a6);
}

/* 最近回想列表：条目过多时在面板内滚动，不超出容器 */
.recent-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 2px 4px 2px 0;
  display: grid;
  gap: 6px;
  align-content: space-evenly;
}

.recent-list.top {
  align-content: start;
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

@media (max-width: 1120px) {
  /* 单列布局恢复自然高度，随页面滚动 */
  .dashboard {
    grid-template-rows: none;
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .row-main {
    grid-template-columns: 1fr;
  }

  .grid-3 {
    grid-template-columns: 1fr;
  }

  /* 单列时热力图恢复占满一行 */
  .heat-panel {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  /* 2×2 布局：去掉行首的左分隔线，第二行改用上分隔线 */
  .stat-card:nth-child(odd) {
    border-left: none;
  }

  .stat-card:nth-child(n + 3) {
    border-top: 1px solid var(--line-soft);
  }
}
</style>
