import React, { useCallback, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getUsers, createUser, updateUser } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { formatDate } from '@/utils/format';
import type { UserWithTime } from '@/types';
import styles from './index.module.scss';

interface CreateForm {
  username: string;
  password: string;
}

interface EditForm {
  username: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  password: string;
}

const UsersPage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const me = useAuthStore((state) => state.user);

  const [users, setUsers] = useState<UserWithTime[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ username: '', password: '' });
  const [editTarget, setEditTarget] = useState<UserWithTime | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ username: '', role: 'member', status: 'active', password: '' });

  const loadUsers = useCallback(() => {
    if (!token) {
      Taro.navigateTo({ url: '/pages/login/index' });
      return;
    }
    if (me?.role !== 'admin') {
      Taro.showToast({ title: '仅管理员可访问', icon: 'none' });
      setTimeout(() => Taro.navigateBack(), 800);
      return;
    }
    getUsers()
      .then(setUsers)
      .catch((error) => {
        console.error('[Users] 加载用户失败:', error);
        Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, me]);

  useDidShow(() => {
    loadUsers();
  });

  const handleCreate = async () => {
    if (!createForm.username.trim() || !createForm.password) {
      Taro.showToast({ title: '请填写用户名和初始密码', icon: 'none' });
      return;
    }
    try {
      await createUser({ username: createForm.username.trim(), password: createForm.password });
      Taro.showToast({ title: '账号已创建', icon: 'success' });
      setShowCreate(false);
      setCreateForm({ username: '', password: '' });
      loadUsers();
    } catch (error) {
      console.error('[Users] 创建用户失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '创建失败', icon: 'none' });
    }
  };

  const openEdit = (user: UserWithTime) => {
    setEditTarget(user);
    setEditForm({ username: user.username, role: user.role, status: user.status, password: '' });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editForm.username.trim()) {
      Taro.showToast({ title: '用户名不能为空', icon: 'none' });
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      Taro.showToast({ title: '新密码至少 6 位', icon: 'none' });
      return;
    }
    try {
      const body: { username: string; role: 'admin' | 'member'; status: 'active' | 'disabled'; password?: string } = {
        username: editForm.username.trim(),
        role: editForm.role,
        status: editForm.status,
      };
      if (editForm.password) {
        body.password = editForm.password;
      }
      await updateUser(editTarget.id, body);
      Taro.showToast({ title: '用户已更新', icon: 'success' });
      setEditTarget(null);
      loadUsers();
    } catch (error) {
      console.error('[Users] 更新用户失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' });
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.addBtn} onClick={() => setShowCreate(true)}>
        <Text className={styles.addBtnText}>+ 新建账号</Text>
      </View>

      {users.map((user) => (
        <View key={user.id} className={styles.userCard}>
          <View className={styles.userRow}>
            <View className={styles.userAvatar}>
              <Text>{user.username.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View className={styles.userInfo}>
              <View style={{ display: 'flex', alignItems: 'center' }}>
                <Text className={styles.userName}>{user.username}</Text>
                {user.role === 'admin' ? <Text className={`${styles.badge} ${styles.roleBadge}`}>管理员</Text> : null}
                <Text
                  className={`${styles.badge} ${user.status === 'active' ? styles.activeBadge : styles.disabledBadge}`}
                >
                  {user.status === 'active' ? '正常' : '已停用'}
                </Text>
              </View>
              <Text className={styles.userMeta}>创建于 {formatDate(user.createdAt)}</Text>
            </View>
          </View>

          <View className={styles.actionRow}>
            <View className={`${styles.actionBtn} ${styles.btnPrimary}`} onClick={() => openEdit(user)}>
              <Text>编辑</Text>
            </View>
          </View>
        </View>
      ))}

      {/* 新建账号弹窗 */}
      {showCreate ? (
        <View className={styles.mask} onClick={() => setShowCreate(false)}>
          <View className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>新建账号</Text>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>用户名</Text>
              <Input
                className={styles.modalInput}
                value={createForm.username}
                placeholder="请输入用户名"
                onInput={(e) => setCreateForm((prev) => ({ ...prev, username: e.detail.value }))}
              />
            </View>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>初始密码</Text>
              <Input
                className={styles.modalInput}
                value={createForm.password}
                placeholder="请输入初始密码"
                onInput={(e) => setCreateForm((prev) => ({ ...prev, password: e.detail.value }))}
              />
            </View>
            <View className={styles.modalFooter}>
              <View className={`${styles.modalBtn} ${styles.modalCancel}`} onClick={() => setShowCreate(false)}>
                <Text className={styles.modalCancelText}>取消</Text>
              </View>
              <View className={`${styles.modalBtn} ${styles.modalOk}`} onClick={handleCreate}>
                <Text className={styles.modalOkText}>创建</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* 编辑用户弹窗 */}
      {editTarget ? (
        <View className={styles.mask} onClick={() => setEditTarget(null)}>
          <View className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>编辑用户</Text>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>用户名</Text>
              <Input
                className={styles.modalInput}
                value={editForm.username}
                placeholder="请输入用户名"
                onInput={(e) => setEditForm((prev) => ({ ...prev, username: e.detail.value }))}
              />
            </View>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>角色</Text>
              <View className={styles.pillRow}>
                <View
                  className={`${styles.pill} ${editForm.role === 'member' ? styles.pillActive : ''}`}
                  onClick={() => setEditForm((prev) => ({ ...prev, role: 'member' }))}
                >
                  <Text>普通用户</Text>
                </View>
                <View
                  className={`${styles.pill} ${editForm.role === 'admin' ? styles.pillActive : ''}`}
                  onClick={() => setEditForm((prev) => ({ ...prev, role: 'admin' }))}
                >
                  <Text>管理员</Text>
                </View>
              </View>
            </View>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>状态</Text>
              <View className={styles.pillRow}>
                <View
                  className={`${styles.pill} ${editForm.status === 'active' ? styles.pillActive : ''}`}
                  onClick={() => setEditForm((prev) => ({ ...prev, status: 'active' }))}
                >
                  <Text>正常</Text>
                </View>
                <View
                  className={`${styles.pill} ${editForm.status === 'disabled' ? styles.pillActive : ''}`}
                  onClick={() => setEditForm((prev) => ({ ...prev, status: 'disabled' }))}
                >
                  <Text>停用</Text>
                </View>
              </View>
            </View>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>重置密码（留空则不修改）</Text>
              <Input
                className={styles.modalInput}
                password
                value={editForm.password}
                placeholder="输入新密码（至少 6 位）"
                onInput={(e) => setEditForm((prev) => ({ ...prev, password: e.detail.value }))}
              />
            </View>
            <View className={styles.modalFooter}>
              <View className={`${styles.modalBtn} ${styles.modalCancel}`} onClick={() => setEditTarget(null)}>
                <Text className={styles.modalCancelText}>取消</Text>
              </View>
              <View className={`${styles.modalBtn} ${styles.modalOk}`} onClick={handleEditSave}>
                <Text className={styles.modalOkText}>保存</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default UsersPage;
