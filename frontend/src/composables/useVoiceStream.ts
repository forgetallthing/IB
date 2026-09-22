import { onBeforeUnmount, onMounted, ref } from 'vue';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * 订阅小程序「录音」tab 推送的语音转写片段（SSE）。
 * 同一账号在小程序开始录音时，转写文字经服务器中转实时到达本页面。
 * - token 通过 query 传递（EventSource 无法携带自定义请求头）
 * - 断线由 EventSource 自动重连；连续多次连不上则停止，避免死循环
 * - connected：SSE 通道是否打开（Web 端在线）
 * - active：手机端是否正在推送输入（收到片段后点亮，超时自动熄灭，
 *   避免手机端直接关闭小程序后「输入中」状态永远挂着）
 */
const ACTIVE_TIMEOUT = 6000;

export function useVoiceStream(onText: (text: string, isFinal: boolean) => void) {
  const connected = ref(false);
  const active = ref(false);
  let source: EventSource | null = null;
  let failureCount = 0;
  let lastActiveAt = 0;
  let activityTimer: ReturnType<typeof setInterval> | null = null;

  function ensureTimer() {
    if (activityTimer) return;
    activityTimer = setInterval(() => {
      if (active.value && Date.now() - lastActiveAt > ACTIVE_TIMEOUT) {
        active.value = false;
      }
    }, 1000);
  }

  function connect() {
    if (source) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ib_token') : null;
    if (!token) return;

    source = new EventSource(`${apiBaseUrl}/voice/stream?token=${encodeURIComponent(token)}`);
    source.onopen = () => {
      connected.value = true;
      failureCount = 0;
    };
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { text?: string; isFinal?: boolean };
        if (typeof data.text === 'string' && data.text) {
          lastActiveAt = Date.now();
          active.value = true;
          onText(data.text, data.isFinal === true);
        }
      } catch {
        // 非 JSON 帧（心跳注释帧不会触发 onmessage），忽略
      }
    };
    source.onerror = () => {
      connected.value = false;
      // 从未成功连接且连续失败多次（如 token 失效返回 401），停止重连
      failureCount += 1;
      if (!connected.value && failureCount >= 3) disconnect();
    };
  }

  function disconnect() {
    source?.close();
    source = null;
    connected.value = false;
  }

  onMounted(() => {
    ensureTimer();
    connect();
  });
  onBeforeUnmount(() => {
    disconnect();
    if (activityTimer) {
      clearInterval(activityTimer);
      activityTimer = null;
    }
  });

  return { connected, active, disconnect };
}
