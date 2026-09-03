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

// 清除当前用户的每日回想权重（出现次数与手动档位）
async function clearQuizState() {
  const ok = await showConfirm({
    title: '清除回想权重',
    message: '将清空你所有笔记的出现次数与手动档位（不影响笔记本身），清除后所有笔记重新按高优先级推送。确定清除吗？',
    confirmText: '清除',
    danger: true,
  });
  if (!ok) return;
  try {
    const result = await request<{ cleared: number }>('/users/me/quiz-state', { method: 'DELETE' });
    notice(`已清除 ${result.cleared} 条回想记录`);
  } catch (error) {
    fail(error instanceof Error ? error.message : '清除失败');
  }
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

const editingUser = ref<UserItem | null>(null);
const userEditForm = reactive({
  username: '',
  email: '',
  role: 'member' as 'admin' | 'member',
  status: 'active' as 'active' | 'disabled',
  password: '',
});

function openUserEdit(user: UserItem) {
  editingUser.value = user;
  userEditForm.username = user.username;
  userEditForm.email = user.email ?? '';
  userEditForm.role = user.role;
  userEditForm.status = user.status;
  userEditForm.password = '';
}

function closeUserEdit() {
  editingUser.value = null;
}

async function saveUserEdit() {
  if (!editingUser.value) return;
  if (!userEditForm.username.trim()) {
    fail('用户名不能为空');
    return;
  }
  try {
    const body: Record<string, unknown> = {
      username: userEditForm.username.trim(),
      email: userEditForm.email,
      role: userEditForm.role,
      status: userEditForm.status,
    };
    if (userEditForm.password) {
      body.password = userEditForm.password;
    }
    await request(`/users/${editingUser.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    notice('用户已更新');
    closeUserEdit();
    await loadUsers();
  } catch (error) {
    fail(error instanceof Error ? error.message : '保存失败');
  }
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

const editingTag = ref<TagItem | null>(null);
const editForm = reactive({ name: '', color: '#e3eef3', description: '', displayOrder: 0 });
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);

function openEdit(tag: TagItem) {
  editingTag.value = tag;
  editForm.name = tag.name;
  editForm.color = tag.color;
  editForm.description = tag.description;
  editForm.displayOrder = tag.displayOrder;
}

function closeEdit() {
  editingTag.value = null;
}

async function saveEdit() {
  if (!editingTag.value) return;
  if (!editForm.name.trim()) {
    fail('标签名不能为空');
    return;
  }
  try {
    await request(`/tags/${editingTag.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...editForm }),
    });
    notice('标签已更新');
    closeEdit();
    await loadTags();
  } catch (error) {
    fail(error instanceof Error ? error.message : '保存失败');
  }
}

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragOver(index: number) {
  overIndex.value = index;
}

function onDragEnd() {
  dragIndex.value = null;
  overIndex.value = null;
}

async function onDrop(targetIndex: number) {
  const from = dragIndex.value;
  onDragEnd();
  if (from === null || from === targetIndex) return;

  const list = [...tags.value];
  const [moved] = list.splice(from, 1);
  list.splice(targetIndex, 0, moved);
  tags.value = list.map((tag, idx) => ({ ...tag, displayOrder: idx + 1 }));

  try {
    await Promise.all(
      tags.value.map((tag) =>
        request(`/tags/${tag.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ displayOrder: tag.displayOrder }),
        }),
      ),
    );
    notice('排序已保存');
  } catch (error) {
    fail(error instanceof Error ? error.message : '排序保存失败');
    await loadTags();
  }
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

      <h2>每日回想</h2>
      <div class="account-row">
        <p>清除后所有笔记的出现次数与手动档位将归零，重新按高优先级推送（不影响笔记内容）。</p>
        <button class="danger" type="button" @click="clearQuizState">清除我的回想权重</button>
      </div>

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
            <button class="secondary" @click="openUserEdit(user)">编辑</button>
            <button class="secondary" @click="toggleUser(user)">{{ user.status === 'active' ? '禁用' : '启用' }}</button>
          </div>
        </div>
      </div>
    </article>

    <article v-else-if="tab === 'tags'" class="panel">
      <h2>新增标签</h2>
      <div class="form-grid">
        <input v-model="tagForm.name" placeholder="标签名" />
        <input v-model="tagForm.color" type="color" />
        <input v-model="tagForm.description" placeholder="标签描述" />
        <input v-model="tagForm.displayOrder" type="number" placeholder="顺序" />
      </div>
      <button type="button" @click="createTag">创建标签</button>

      <h2>标签列表</h2>
      <p class="drag-hint">拖动 ⠿ 调整顺序，松开自动保存。</p>
      <div class="list">
        <div
          v-for="(tag, index) in tags"
          :key="tag.id"
          class="row tag-row"
          :class="{ dragging: dragIndex === index, 'drop-before': overIndex === index && dragIndex !== null && dragIndex !== index }"
          draggable="true"
          @dragstart="onDragStart(index)"
          @dragover.prevent="onDragOver(index)"
          @drop.prevent="onDrop(index)"
          @dragend="onDragEnd"
        >
          <div class="tag-main">
            <span class="grip">⠿</span>
            <span class="tag-dot" :style="{ backgroundColor: tag.color }"></span>
            <div>
              <strong>{{ tag.name }}</strong>
              <p>{{ tag.description || '无描述' }} · 顺序 {{ tag.displayOrder }}<span v-if="!tag.active"> · 已停用</span></p>
            </div>
          </div>
          <div class="actions">
            <button class="secondary" @click="openEdit(tag)">编辑</button>
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

    <div v-if="editingUser" class="modal-overlay" @click.self="closeUserEdit">
      <div class="modal-card">
        <h2>编辑用户</h2>
        <div class="form-grid">
          <label class="field-item">
            <span>用户名</span>
            <input v-model="userEditForm.username" placeholder="用户名" />
          </label>
          <label class="field-item">
            <span>邮箱</span>
            <input v-model="userEditForm.email" placeholder="邮箱" />
          </label>
          <label class="field-item">
            <span>角色</span>
            <select v-model="userEditForm.role">
              <option value="member">member（普通用户）</option>
              <option value="admin">admin（管理员）</option>
            </select>
          </label>
          <label class="field-item">
            <span>状态</span>
            <select v-model="userEditForm.status">
              <option value="active">active（正常）</option>
              <option value="disabled">disabled（已停用）</option>
            </select>
          </label>
          <label class="field-item">
            <span>重置密码（留空则不修改）</span>
            <input v-model="userEditForm.password" type="password" placeholder="输入新密码" />
          </label>
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" @click="closeUserEdit">取消</button>
          <button type="button" @click="saveUserEdit">保存</button>
        </div>
      </div>
    </div>

    <div v-if="editingTag" class="modal-overlay" @click.self="closeEdit">
      <div class="modal-card">
        <h2>编辑标签</h2>
        <div class="form-grid">
          <label class="field-item">
            <span>标签名</span>
            <input v-model="editForm.name" placeholder="标签名" />
          </label>
          <label class="field-item">
            <span>颜色</span>
            <input v-model="editForm.color" type="color" />
          </label>
          <label class="field-item">
            <span>描述</span>
            <input v-model="editForm.description" placeholder="标签描述" />
          </label>
          <label class="field-item">
            <span>顺序</span>
            <input v-model.number="editForm.displayOrder" type="number" placeholder="顺序" />
          </label>
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" @click="closeEdit">取消</button>
          <button type="button" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
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

.drag-hint {
  margin: -6px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.tag-row {
  cursor: grab;
}

.tag-row.dragging {
  opacity: 0.45;
}

.tag-row.drop-before {
  box-shadow: 0 -3px 0 0 var(--primary);
}

.tag-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tag-main strong {
  font-size: 14px;
}

.grip {
  color: var(--muted);
  font-size: 14px;
  letter-spacing: -1px;
  cursor: grab;
  user-select: none;
}

.tag-dot {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(26, 43, 58, 0.18);
}

input[type='color'] {
  padding: 3px;
  height: 38px;
  cursor: pointer;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 42, 58, 0.45);
  backdrop-filter: blur(3px);
  animation: overlay-in 0.16s ease;
}

.modal-card {
  width: min(480px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 24px 60px rgba(15, 42, 58, 0.28);
  animation: modal-in 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
