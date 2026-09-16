import { ref } from 'vue';

// 跨页数据脏标记：编辑页保存后置位，列表页被 KeepAlive 保活后在 onActivated 时消费并刷新
export const questionListDirty = ref(false);

// 编辑页保存更新已抽中的回想题后置位，回想页 onActivated 时消费：同一题静默刷新标题与参考详情
export const quizDirty = ref(false);
