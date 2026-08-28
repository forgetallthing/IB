import { reactive } from 'vue';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export const confirmState = reactive({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
});

let resolver: ((value: boolean) => void) | null = null;

/** 自定义确认弹窗，替代系统 confirm()，返回 Promise<boolean> */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  confirmState.title = options.title ?? '请确认';
  confirmState.message = options.message;
  confirmState.confirmText = options.confirmText ?? '确定';
  confirmState.cancelText = options.cancelText ?? '取消';
  confirmState.danger = options.danger ?? false;
  confirmState.visible = true;

  return new Promise((resolve) => {
    resolver?.(false);
    resolver = resolve;
  });
}

export function resolveConfirm(value: boolean) {
  if (!confirmState.visible) return;
  confirmState.visible = false;
  resolver?.(value);
  resolver = null;
}
