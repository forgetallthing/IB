const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ib_token') : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' && payload !== null && 'message' in payload
          ? String((payload as { message?: unknown }).message ?? '请求失败')
          : '请求失败';
    throw new Error(message);
  }

  return payload as T;
}

// 二进制下载（如整库备份文件）：失败时仍尝试解析 JSON 错误信息
export async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ib_token') : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, { headers });
  if (!response.ok) {
    let message = '请求失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && 'message' in payload) {
        message = String((payload as { message?: unknown }).message ?? message);
      }
    } catch {
      // 非 JSON 错误体，使用默认提示
    }
    throw new Error(message);
  }
  return response.blob();
}
