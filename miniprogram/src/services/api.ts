import Taro from '@tarojs/taro';
import { API_BASE, TOKEN_STORAGE_KEY } from '../config';
import { useAuthStore } from '../store/auth';
import type {
  AiSuggestion,
  Difficulty,
  LoginResult,
  Question,
  QuestionDraft,
  QuestionPage,
  Tag,
  User,
  UserWithTime,
  Visibility,
} from '../types';

/** 401 时清理登录态并跳转登录页 */
function handleUnauthorized() {
  console.warn('[API] 登录态失效，清理并跳转登录页');
  useAuthStore.getState().signOut();
  Taro.removeStorageSync(TOKEN_STORAGE_KEY);
  Taro.reLaunch({ url: '/pages/login/index' });
}

/** 构造查询串（数组使用重复 key，与后端 Fastify 解析一致） */
function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface QuestionQueryInput {
  q?: string;
  tags?: string[];
  difficulty?: Difficulty[];
  visibility?: Visibility[];
  page?: number;
  limit?: number;
}

async function httpRequest<T>(mockName: string, method: HttpMethod, path: string, data?: unknown): Promise<T> {
  const token = useAuthStore.getState().token;
  const header: Record<string, string> = { 'content-type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;

  try {
    const res = await Taro.request({
      url: `${API_BASE}${path}`,
      method,
      // GET 的查询串已拼在 path 上，避免 Taro 再拼一次 data 导致参数重复
      data: method === 'GET' ? undefined : (data as Record<string, unknown>),
      header,
    });

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }

    const payload = res.data as { message?: string } | null;
    const message = payload?.message ?? `请求失败（${res.statusCode}）`;
    console.error(`[API] ${method} ${path} 失败:`, res.statusCode, message);
    if (res.statusCode === 401) handleUnauthorized();
    throw new Error(message);
  } catch (error) {
    if (error instanceof Error && error.message && !(error instanceof TypeError)) {
      throw error;
    }
    console.error(`[API] ${method} ${path} 网络异常:`, error);
    throw new Error('网络请求失败，请检查网络后重试');
  }
}

/** 统一请求入口：所有环境（weapp 真机 / 微信开发者工具 / H5 预览）都走真实后端 */
async function request<T>(mockName: string, method: HttpMethod, path: string, data?: unknown): Promise<T> {
  return httpRequest<T>(mockName, method, path, data);
}

// ========== Auth ==========
export function login(username: string, password: string) {
  return request<LoginResult>('login', 'POST', '/api/auth/login', { username, password });
}

export function wechatLogin(code: string, username?: string, password?: string) {
  return request<LoginResult>('wechat-login', 'POST', '/api/auth/wechat-login', { code, username, password });
}

export function getMe() {
  return request<User>('get-me', 'GET', '/api/users/me');
}

export function updateMe(payload: { username?: string; password?: string; currentPassword?: string }) {
  return request<User>('update-me', 'PATCH', '/api/users/me', payload);
}

// ========== Questions ==========
export function getQuestions(query: QuestionQueryInput) {
  const qs = buildQuery({
    q: query.q,
    tags: query.tags,
    difficulty: query.difficulty,
    visibility: query.visibility,
    page: query.page,
    limit: query.limit,
  });
  return request<QuestionPage>('get-questions', 'GET', `/api/questions${qs}`, query);
}

export function getQuestion(id: string) {
  return request<Question>('get-question', 'GET', `/api/questions/${id}`, { id });
}

export function createQuestion(draft: QuestionDraft) {
  return request<{ id: string }>('create-question', 'POST', '/api/questions', draft);
}

export function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
  return request<{ ok: boolean }>('update-question', 'PUT', `/api/questions/${id}`, patch);
}

export function deleteQuestion(id: string) {
  return request<{ ok: boolean }>('delete-question', 'DELETE', `/api/questions/${id}`);
}

// ========== Tags ==========
export function getTags() {
  return request<Tag[]>('get-tags', 'GET', '/api/tags');
}

export function createTag(payload: { name: string; color: string; description?: string; displayOrder?: number }) {
  return request<Tag>('create-tag', 'POST', '/api/tags', payload);
}

export function updateTag(id: string, patch: Partial<{ name: string; color: string; description: string; active: boolean; displayOrder: number }>) {
  return request<Tag>('update-tag', 'PATCH', `/api/tags/${id}`, patch);
}

export function deleteTag(id: string) {
  return request<{ ok: boolean }>('delete-tag', 'DELETE', `/api/tags/${id}`);
}

// ========== Users（管理员） ==========
export function getUsers() {
  return request<UserWithTime[]>('get-users', 'GET', '/api/users');
}

export function createUser(payload: { username: string; password: string; role?: 'admin' | 'member' }) {
  return request<UserWithTime>('create-user', 'POST', '/api/users', payload);
}

export function updateUser(id: string, patch: { status?: 'active' | 'disabled'; password?: string }) {
  return request<UserWithTime>('update-user', 'PATCH', `/api/users/${id}`, patch);
}

// ========== AI ==========
export function analyzeAi(payload: { title: string; content: string }) {
  return request<AiSuggestion>('analyze-ai', 'POST', '/api/ai/analyze', payload);
}
