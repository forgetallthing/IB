<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { request } from '../api';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { fail } = useToast();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function login() {
  loading.value = true;

  try {
    const result = await request<{ token: string; user: { id: string; username: string; role: 'admin' | 'member' } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    authStore.setSession(result.token, result.user);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/questions';
    await router.replace(redirect);
  } catch (error) {
    fail(error instanceof Error ? error.message : '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="login-shell">
    <article class="login-card">
      <p class="eyebrow">INTERVIEW BANK</p>
      <h1>笔记库登录</h1>
      <p class="subtitle">请输入管理员或成员账号后进入系统。</p>

      <label>
        用户名
        <input v-model="form.username" type="text" autocomplete="username" />
      </label>

      <label>
        密码
        <input v-model="form.password" type="password" autocomplete="current-password" />
      </label>

      <button type="button" @click="login" :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
    </article>
  </section>
</template>

<style scoped>
.login-shell {
  width: min(100%, 440px);
  padding: 16px;
}

.login-card {
  display: grid;
  gap: 16px;
  padding: 36px 32px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--line-soft);
  box-shadow:
    0 24px 60px rgba(15, 42, 58, 0.16),
    0 4px 12px rgba(15, 42, 58, 0.06);
  animation: page-in 0.32s ease both;
}

h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.01em;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

label {
  display: grid;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #557080;
}

button {
  margin-top: 6px;
  padding: 13px 18px;
}
</style>
