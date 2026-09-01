import React, { useCallback, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import ConfirmModal from '@/components/ConfirmModal';
import { getUsers, createUser, updateUser } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { formatDate } from '@/utils/format';
import type { UserWithTime } from '@/types';
import styles from './index.module.scss';

interface CreateForm {
  username: string;
  password: string;
}

const UsersPage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const me = useAuthStore((state) => state.user);

  const [users, setUsers] = useState<UserWithTime[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ username: '', password: '' });
  const [resetTarget, setResetTarget] = useState<UserWithTime | null>(null);

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

  const toggleStatus = async (user: UserWithTime) => {
    const next = user.status === 'active' ? 'disabled' : 'active';
    try {
      await updateUser(user.id, { status: next });
      Taro.showToast({ title: next === 'active' ? '已启用' : '已停用', icon: 'success' });
      loadUsers();
    } catch (error) {
      console.error('[Users] 更新状态失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' });
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    try {
      await updateUser(resetTarget.id, { password: 'ib123456' });
      Taro.showToast({ title: '密码已重置为 ib123456', icon: 'none', duration: 2500 });
      setResetTarget(null);
    } catch (error) {
      console.error('[Users] 重置密码失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '重置失败', icon: 'none' });
      setResetTarget(null);
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
            <View
              className={`${styles.actionBtn} ${user.status === 'active' ? styles.btnWarning : styles.btnPrimary}`}
              onClick={() => toggleStatus(user)}
            >
              <Text>{user.status === 'active' ? '停用' : '启用'}</Text>
            </View>
            <View className={`${styles.actionBtn} ${styles.btnDanger}`} onClick={() => setResetTarget(user)}>
              <Text>重置密码</Text>
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

      {/* 重置密码确认 */}
      <ConfirmModal
        visible={Boolean(resetTarget)}
        title="重置密码"
        content={`确定将「${resetTarget?.username ?? ''}」的密码重置为 ib123456 吗？`}
        confirmText="重置"
        danger
        onConfirm={resetPassword}
        onCancel={() => setResetTarget(null)}
      />
    </View>
  );
};

export default UsersPage;
