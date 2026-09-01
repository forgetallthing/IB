import { create } from 'zustand';

interface UiState {
  /** 笔记列表数据已过期（详情页保存/删除后置位），返回列表时才需要刷新 */
  listDirty: boolean;
  setListDirty: (dirty: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  listDirty: false,
  setListDirty: (dirty) => set({ listDirty: dirty }),
}));
