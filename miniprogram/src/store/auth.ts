import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { LoginResult, Role, User } from '../types';
import { TOKEN_STORAGE_KEY } from '../config';

interface AuthState {
  token: string;
  user: { id: string; username: string; role: Role } | null;
  /** 从本地存储恢复登录态 */
  hydrate: () => void;
  /** 写入登录结果（登录成功后调用） */
  signIn: (result: LoginResult) => void;
  /** 刷新用户信息（修改资料后调用） */
  setUser: (user: User) => void;
  /** 退出登录 */
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: '',
  user: null,

  hydrate: () => {
    try {
      const token = Taro.getStorageSync(TOKEN_STORAGE_KEY) as string;
      if (token) {
        set({ token });
        console.log('[Auth] 已恢复本地登录态');
      }
    } catch (error) {
      console.error('[Auth] 恢复登录态失败:', error);
    }
  },

  signIn: (result) => {
    try {
      Taro.setStorageSync(TOKEN_STORAGE_KEY, result.token);
    } catch (error) {
      console.error('[Auth] 保存登录态失败:', error);
    }
    set({ token: result.token, user: result.user });
  },

  setUser: (user) => {
    set({
      user: { id: user.id, username: user.username, role: user.role },
    });
  },

  signOut: () => {
    try {
      Taro.removeStorageSync(TOKEN_STORAGE_KEY);
    } catch (error) {
      console.error('[Auth] 清理登录态失败:', error);
    }
    set({ token: '', user: null });
  },
}));
