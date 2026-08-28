import { reactive } from 'vue';

export interface ToastItem {
  id: number;
  type: 'success' | 'error';
  text: string;
}

const state = reactive({ items: [] as ToastItem[] });
let seq = 0;

function push(type: ToastItem['type'], text: string) {
  const id = ++seq;
  state.items.push({ id, type, text });
  setTimeout(() => {
    const index = state.items.findIndex((item) => item.id === id);
    if (index !== -1) state.items.splice(index, 1);
  }, 3200);
}

export function toastState() {
  return state;
}

export function useToast() {
  return {
    notice: (text: string) => push('success', text),
    fail: (text: string) => push('error', text),
  };
}
