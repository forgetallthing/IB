import { defineStore } from 'pinia';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'member';
}

const tokenKey = 'ib_token';
const userKey = 'ib_user';

function readStoredUser() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(userKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: typeof localStorage !== 'undefined' ? localStorage.getItem(tokenKey) : null as string | null,
    user: readStoredUser() as AuthUser | null,
  }),
  actions: {
    setSession(token: string, user: AuthUser) {
      this.token = token;
      this.user = user;
      localStorage.setItem(tokenKey, token);
      localStorage.setItem(userKey, JSON.stringify(user));
    },
    clearSession() {
      this.token = null;
      this.user = null;
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(userKey);
    },
  },
});
