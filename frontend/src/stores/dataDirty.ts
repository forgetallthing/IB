import { ref } from 'vue';

// 跨页数据脏标记：回收站等结构性变化后置位，列表页被 KeepAlive 保活后在 onActivated 时消费并整体刷新
export const questionListDirty = ref(false);

// 编辑页保存已有题后置位（记录该题 id）：列表页 onActivated 时只定向更新该题的标题与内容，
// 不整体刷新，保住已加载分页与浏览位置
export const editedQuestionId = ref<string | null>(null);

// 编辑页保存更新已抽中的回想题后置位，回想页 onActivated 时消费：同一题静默刷新标题与参考详情
export const quizDirty = ref(false);
