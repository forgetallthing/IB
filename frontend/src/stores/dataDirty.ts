import { ref } from 'vue';

// 跨页数据脏标记：编辑页保存后置位，列表页被 KeepAlive 保活后在 onActivated 时消费并刷新
export const questionListDirty = ref(false);
