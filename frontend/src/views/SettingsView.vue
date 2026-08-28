<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
import { useAuthStore } from '../stores/auth';

interface UserItem {
  id: string;
  username: string;
  email?: string | null;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  description: string;
  active: boolean;
  displayOrder: number;
}

interface MeItem {
  id: string;
  username: string;
  email?: string | null;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
}

const authStore = useAuthStore();
const router = useRouter();
const isAdmin = computed(() => authStore.user?.role === 'admin');
const tab = ref<'profile' | 'users' | 'tags' | 'io'>('profile');
const loading = ref(false);
const { notice, fail } = useToast();
const users = ref<UserItem[]>([]);
const tags = ref<TagItem[]>([]);
const exportText = ref('');
const importText = ref('');

const userForm = reactive({ username: '', email: '', password: '', role: 'member' as 'admin' | 'member' });
const tagForm = reactive({ name: '', color: '#e3eef3', description: '', displayOrder: 0 });
const profileForm = reactive({ username: '', email: '', currentPassword: '', password: '', confirm: '' });

async function loadProfile() {
  const me = await request<MeItem>('/users/me');
  profileForm.username = me.username;
  profileForm.email = me.email ?? '';
}

async function saveProfile() {
  try {
    const body: Record<string, unknown> = {
      username: profileForm.username,
      email: profileForm.email,
    };
    if (profileForm.password) {
      if (profileForm.password !== profileForm.confirm) {
        fail('两次输入的新密码不一致');
        return;
      }
      body.password = profileForm.password;
      body.currentPassword = profileForm.currentPassword;
    }

    const result = await request<MeItem>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    if (authStore.user && authStore.token) {
      authStore.setSession(authStore.token, { ...authStore.user, username: result.username });
    }

    profileForm.currentPassword = '';
    profileForm.password = '';
    profileForm.confirm = '';
    notice('个人资料已更新');
  } catch (error) {
    fail(error instanceof Error ? error.message : '保存失败');
  }
}

function logout() {
  authStore.clearSession();
  router.push('/login');
}

async function loadUsers() {
  users.value = await request<UserItem[]>('/users');
}

async function loadTags() {
  tags.value = await request<TagItem[]>('/tags');
}

async function refresh() {
  loading.value = true;
  try {
    const tasks: Promise<void>[] = [loadProfile()];
    if (isAdmin.value) {
      tasks.push(loadUsers(), loadTags(), loadExport());
    }
    await Promise.all(tasks);
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadExport() {
  try {
    const result = await request<{ format: string; items: unknown[] }>('/questions/export');
    exportText.value = JSON.stringify(result, null, 2);
  } catch (error) {
    fail(error instanceof Error ? error.message : '导出加载失败');
  }
}

async function doImport() {
  try {
    const parsed = JSON.parse(importText.value || '{}') as { items?: unknown[] };
    const result = await request<{ ok: boolean; importedIds: string[] }>('/questions/import', {
      method: 'POST',
      body: JSON.stringify({ items: parsed.items ?? [] }),
    });
    notice(`导入成功，写入 ${result.importedIds.length} 条`);
    await loadExport();
  } catch (error) {
    fail(error instanceof Error ? error.message : '导入失败');
  }
}

async function copyExport() {
  await navigator.clipboard.writeText(exportText.value || '');
  notice('已复制导出 JSON');
}

async function createUser() {
  try {
    await request('/users', {
      method: 'POST',
      body: JSON.stringify(userForm),
    });
    notice('用户已创建');
    userForm.username = '';
    userForm.email = '';
    userForm.password = '';
    userForm.role = 'member';
    await loadUsers();
  } catch (error) {
    fail(error instanceof Error ? error.message : '创建失败');
  }
}

async function toggleUser(user: UserItem) {
  await request(`/users/${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: user.status === 'active' ? 'disabled' : 'active' }),
  });
  await loadUsers();
}

async function resetPassword(user: UserItem) {
  const password = prompt(`为 ${user.username} 输入新密码`);
  if (!password) return;
  await request(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ password }) });
  notice('密码已重置');
}

async function createTag() {
  try {
    await request('/tags', {
      method: 'POST',
      body: JSON.stringify(tagForm),
    });
    notice('标签已创建');
    tagForm.name = '';
    tagForm.color = '#e3eef3';
    tagForm.description = '';
    tagForm.displayOrder = 0;
    await loadTags();
  } catch (error) {
    fail(error instanceof Error ? error.message : '创建失败');
  }
}

async function toggleTag(tag: TagItem) {
  await request(`/tags/${tag.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ active: !tag.active }),
  });
  await loadTags();
}

async function deleteTag(tag: TagItem) {
  const ok = await showConfirm({
    title: '删除标签',
    message: `确定删除标签「${tag.name}」吗？`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  await request(`/tags/${tag.id}`, { method: 'DELETE' });
  await loadTags();
}

async function saveTag(tag: TagItem) {
  const name = prompt('标签名', tag.name);
  if (name === null) return;
  const color = prompt('标签颜色', tag.color) ?? tag.color;
  const description = prompt('标签描述', tag.description) ?? tag.description;
  const displayOrder = Number(prompt('显示顺序', String(tag.displayOrder)) ?? tag.displayOrder);

  await request(`/tags/${tag.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, color, description, displayOrder }),
  });
  await loadTags();
}

onMounted(refresh);
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>设置</h1>
        <p class="subtitle">{{ isAdmin ? '系统设置与管理功能。' : '系统设置。' }}</p>
      </div>
      <button type="button" @click="refresh" :disabled="loading">{{ loading ? '刷新中…' : '刷新' }}</button>
    </header>

    <p v-if="loading" class="loading">加载中…</p>

    <div class="tabs">
      <button class="secondary" :class="{ active: tab === 'profile' }" @click="tab = 'profile'">系统设置</button>
      <template v-if="isAdmin">
        <button class="secondary" :class="{ active: tab === 'users' }" @click="tab = 'users'">用户管理</button>
        <button class="secondary" :class="{ active: tab === 'tags' }" @click="tab = 'tags'">标签管理</button>
        <button class="secondary" :class="{ active: tab === 'io' }" @click="tab = 'io'">导入导出</button>
      </template>
    </div>

    <article v-if="tab === 'profile'" class="panel">
      <h2>个人资料</h2>
      <div class="form-grid">
        <label class="field-item">
          <span>用户名</span>
          <input v-model="profileForm.username" placeholder="用户名" />
        </label>
        <label class="field-item">
          <span>邮箱</span>
          <input v-model="profileForm.email" placeholder="邮箱" />
        </label>
      </div>
      <button type="button" @click="saveProfile">保存资料</button>

      <h2>修改密码</h2>
      <div class="form-grid">
        <label class="field-item">
          <span>当前密码</span>
          <input v-model="profileForm.currentPassword" type="password" placeholder="当前密码" />
        </label>
        <label class="field-item">
          <span>新密码</span>
          <input v-model="profileForm.password" type="password" placeholder="新密码" />
        </label>
        <label class="field-item">
          <span>确认新密码</span>
          <input v-model="profileForm.confirm" type="password" placeholder="再次输入新密码" />
        </label>
      </div>
      <button type="button" @click="saveProfile">更新密码</button>

      <h2>账户</h2>
      <div class="account-row">
        <p>当前登录：{{ authStore.user?.username }}（{{ isAdmin ? '管理员' : '普通用户' }}）</p>
        <button class="danger" type="button" @click="logout">退出登录</button>
      </div>
    </article>

    <article v-else-if="tab === 'users'" class="panel">
      <h2>新增用户</h2>
      <div class="form-grid">
        <input v-model="userForm.username" placeholder="用户名" />
        <input v-model="userForm.email" placeholder="邮箱" />
        <input v-model="userForm.password" type="password" placeholder="密码" />
        <select v-model="userForm.role">
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <button type="button" @click="createUser">创建用户</button>

      <h2>用户列表</h2>
      <div class="list">
        <div v-for="user in users" :key="user.id" class="row">
          <div>
            <strong>{{ user.username }}</strong>
            <p>{{ user.email || '无邮箱' }} · {{ user.role }} · {{ user.status }}</p>
          </div>
          <div class="actions">
            <button class="secondary" @click="toggleUser(user)">{{ user.status === 'active' ? '禁用' : '启用' }}</button>
            <button class="secondary" @click="resetPassword(user)">重置密码</button>
          </div>
        </div>
      </div>
    </article>

    <article v-else-if="tab === 'tags'" class="panel">
      <h2>新增标签</h2>
      <div class="form-grid">
        <input v-model="tagForm.name" placeholder="标签名" />
        <input v-model="tagForm.color" placeholder="#e3eef3" />
        <input v-model="tagForm.description" placeholder="标签描述" />
        <input v-model="tagForm.displayOrder" type="number" placeholder="顺序" />
      </div>
      <button type="button" @click="createTag">创建标签</button>

      <h2>标签列表</h2>
      <div class="list">
        <div v-for="tag in tags" :key="tag.id" class="row">
          <div>
            <strong>{{ tag.name }}</strong>
            <p>{{ tag.description || '无描述' }} · 顺序 {{ tag.displayOrder }}</p>
          </div>
          <div class="actions">
            <button class="secondary" @click="saveTag(tag)">编辑</button>
            <button class="secondary" @click="toggleTag(tag)">{{ tag.active ? '停用' : '启用' }}</button>
            <button class="danger" @click="deleteTag(tag)">删除</button>
          </div>
        </div>
      </div>
    </article>

    <article v-else-if="tab === 'io'" class="panel">
      <div class="panel-head">
        <h2>导出内容</h2>
        <button class="secondary" type="button" @click="copyExport">复制</button>
      </div>
      <textarea v-model="exportText" rows="14" readonly></textarea>

      <div class="panel-head">
        <h2>导入内容</h2>
        <button type="button" @click="doImport">开始导入</button>
      </div>
      <textarea v-model="importText" rows="14" placeholder='粘贴 {"items": [...] }'></textarea>
    </article>
  </section>
</template>

<style scoped>
.tabs,
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.tabs button.active {
  background: var(--primary);
  color: #fff;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field-item {
  display: grid;
  gap: 5px;
}

.field-item span {
  font-size: 13px;
  font-weight: 500;
  color: #557080;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
}

.account-row p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

.list {
  display: grid;
  gap: 10px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.row:hover {
  border-color: rgba(26, 43, 58, 0.2);
  box-shadow: var(--shadow-card);
}

.row p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 13px;
}

h2 {
  margin: 0;
  font-size: 15px;
}

.panel {
  display: grid;
  gap: 16px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

.form-grid + button {
  margin-top: 4px;
}

.list + h2,
h2 + .list {
  margin-top: 4px;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
