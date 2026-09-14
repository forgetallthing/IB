# 全站固定顶部工具栏改造

## Context

每个页面目前把 `<header class="page-header">`（标题 + 副标题 + 操作按钮）放在滚动区 `.app-main` 内，长页面下滚后操作按钮不可见（详情页刚加过临时 sticky 补丁）。本次全站改造：把每页页头整体上移到一条**固定、不参与滚动、横向拉满内容区剩余宽度**（侧边栏右侧 edge-to-edge）的工具栏中；滚动区只保留正文/列表。

已确认的决策：
- 工具栏内容 = 页头整体上移（标题 + 副标题 + 操作按钮）
- 全部页面都加，包括锁定视口的 Dashboard 和每日回想，同步改高度公式
- 登录页在 `.auth-shell` 内、无侧边栏，不参与本次改造

## 架构设计

### 1. 外壳（frontend/src/App.vue）

- `.content-shell` 改为 `grid-template-rows: auto minmax(0, 1fr)`
- `<main>` 之前插入固定工具栏行：
  - `.page-toolbar-row`：高 60px、占满内容区全宽、`border-bottom: 1px solid var(--line-soft)`、半透明底 `rgba(240,248,250,0.75)` + `backdrop-filter: blur(12px)`（与侧边栏一致）、`position: relative; z-index: 25`（低于 `.back-top` 的 30，远低于弹窗 100）
  - 内含 `<div id="page-toolbar-slot"></div>`（Teleport 目标）
- `.app-main` 上内边距 24px → 20px（工具栏行已承担分隔），左右下不变
- 已验证不受影响：侧边栏 sticky（仅第一列）、滚动记忆逻辑（只读 mainEl）、`.back-top`、移动端侧边栏 overlay

### 2. 共享组件（新建 frontend/src/components/PageToolbar.vue）

```
<Teleport to="#page-toolbar-slot">
  <header class="page-header" v-show="visible"><slot /></header>
</Teleport>
```

- `visible` 守卫（关键，KeepAlive + Teleport 的失活内容不会自动隐藏）：`onMounted/onActivated → true`，`onUnmounted/onDeactivated → false`
- 用 `v-show` 而非 Teleport `:disabled` 切换（disabled 会把内容渲染回页面体内，造成页头在滚动区重复出现）
- 详情页按 path 独立 KeepAlive 实例（可能同时存在多个），每个实例持有自己的 PageToolbar，守卫保证只有激活实例的页头可见

### 3. 对齐（frontend/src/styles.css）

被传送的页头脱离了 `.app-main > *` 的 1180px 居中规则，需补：

- `.page-toolbar-row .page-header { flex: 1; min-width: 0; width: 100%; max-width: 1180px; margin-inline: auto; padding-inline: 32px; flex-wrap: nowrap; }`
- `.page-toolbar-row .subtitle { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`
- `.page-toolbar-row .header-actions { flex-wrap: nowrap; flex-shrink: 0; }`
- `@media (max-width: 1120px)` 时 `padding-inline: 20px`（对齐 app-main 移动端内边距）；≤640px 隐藏副标题
- 高度常量用 CSS 变量 `--toolbar-h: 60px`（styles.css `:root`），App.vue 与两处 calc 公式共用，避免漂移

## 各页面改动

| 页面 | 上移内容 | 滚动区保留 |
|---|---|---|
| QuestionListView | 标题/副标题 + 新建笔记 | filter-panel |
| QuestionQuizView | 标题/副标题 + 筛选/AI 分析/显示详情/再来一篇 4 按钮 | 题卡、quiz-grid |
| SeriesView | 标题/副标题 + 新建系列 | 目录树 |
| SettingsView | 标题/副标题 + 刷新 | .tabs 及各 tab 面板 |
| QuestionEditorView | 标题/副标题 + 返回/AI 辅助/保存 | meta-panel、编辑器 |
| DashboardView | hero → 标准页头：h1「数据看板」+ 副标题（问候语 · todayText）+ 开始回想按钮（保留 `.start-quiz` 类） | stat-cards、各 panel |
| QuestionDetailView | `.topbar` → 工具栏：左「返回列表」、右「编辑」；删除上次加的 sticky CSS | 详情面板（标题/正文） |

要点：
- 各页把 `<header class="page-header">` 换成 `<PageToolbar>`，内部标记结构不变（slot 内容保持页面作用域，greeting 等响应式不受影响）
- DashboardView 删除 hero/hero-deco/hero-body/hero-sub 样式；hero 未出现在任何媒体查询中（已验证）
- QuestionQuizView 删除 `.page-header, .question-card { flex-shrink: 0 }` 中的 `.page-header`；高度公式见下
- QuestionDetailView 删除 `.topbar`/`.actions` 相关 scoped 样式（含 sticky/backdrop-filter 块）

## 高度公式更新（全量清单，已 grep 验证）

| 位置 | 现值 | 新值 |
|---|---|---|
| DashboardView.vue `.dashboard`（~L490） | `calc(100dvh - 64px)` | `calc(100dvh - 120px)`（工具栏 60 + app-main 上 20 + 下 40），同步更新注释 |
| QuestionQuizView.vue `.page`（~L404） | `calc(100dvh - 64px)` | `calc(100dvh - 120px)` |
| DashboardView ≤1120px 媒体查询 | `height: auto`，无 calc | 不变 |
| 其余 100dvh（.app-shell/.auth-shell/.sidebar） | — | 不变 |

## 已知取舍

- 工具栏行全宽拉满，行内页头内容仍与 1180px 内容列对齐（用户要求是「工具栏拉满剩余宽度」）
- 被传送的页头不参与 `.page` 的 page-in 入场动画（瞬时切换，可接受）
- 路由切换瞬间新旧页头守卫理论上可能有一帧重叠，均为 display 切换，可接受

## 验证

1. `npm run typecheck -w @ib/frontend`
2. `npm run build -w @ib/frontend`
3. 浏览器逐页检查（账号 111/111，backend/.env）：
   - 7 个页面工具栏均固定、滚动内容从其下方穿过、行宽拉满且内容与 1180px 列对齐
   - KeepAlive 重点回归：列表页 ↔ 详情页 A ↔ 详情页 B 来回切换，工具栏内容始终唯一且正确；返回列表时滚动位置恢复不变
   - Dashboard / 每日回想：锁定一屏无滚动条，热力图/趋势/作答区不溢出不挤压（高度公式 120px 生效）
   - 移动端 ≤1120px / ≤640px：工具栏内容不换行、侧边栏 overlay 正常、副标题隐藏
