import React, { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import CellItem from '@/components/CellItem';
import ConfirmModal from '@/components/ConfirmModal';
import { getMe, updateMe } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import styles from './index.module.scss';

type DialogState =
  | { type: 'none' }
  | { type: 'username'; value: string }
  | { type: 'password'; value: string; current: string };

const SettingsPage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const storeUser = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const signOut = useAuthStore((state) => state.signOut);

  const [me, setMe] = useState<User | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [confirmLogout, setConfirmLogout] = useState(false);

  useDidShow(() => {
    if (!token) {
      Taro.navigateTo({ url: '/pages/login/index' });
      return;
    }
    getMe()
      .then((info) => setMe(info))
      .catch((error) => console.error('[Settings] 获取用户信息失败:', error));
  });

  const saveUsername = async () => {
    if (dialog.type !== 'username') return;
    const next = dialog.value.trim();
    if (!next) {
      Taro.showToast({ title: '用户名不能为空', icon: 'none' });
      return;
    }
    try {
      const updated = await updateMe({ username: next });
      setMe(updated);
      setUser(updated);
      setDialog({ type: 'none' });
      Taro.showToast({ title: '用户名已更新', icon: 'success' });
    } catch (error) {
      console.error('[Settings] 修改用户名失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '修改失败', icon: 'none' });
    }
  };

  const savePassword = async () => {
    if (dialog.type !== 'password') return;
    if (!dialog.current || !dialog.value) {
      Taro.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    if (dialog.value.length < 6) {
      Taro.showToast({ title: '新密码至少 6 位', icon: 'none' });
      return;
    }
    try {
      const updated = await updateMe({ currentPassword: dialog.current, password: dialog.value });
      setMe(updated);
      setDialog({ type: 'none' });
      Taro.showToast({ title: '密码已更新', icon: 'success' });
    } catch (error) {
      console.error('[Settings] 修改密码失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '修改失败', icon: 'none' });
    }
  };

  const handleLogout = () => {
    signOut();
    setConfirmLogout(false);
    Taro.reLaunch({ url: '/pages/login/index' });
  };

  const displayName = me?.username ?? storeUser?.username ?? '';

  return (
    <View className={styles.container}>
      {/* 账号 */}
      <Text className={styles.groupTitle}>账号</Text>
      <View className={styles.group}>
        <CellItem
          title="用户名"
          extra={displayName}
          onClick={() => setDialog({ type: 'username', value: displayName })}
        />
        <CellItem title="修改密码" onClick={() => setDialog({ type: 'password', value: '', current: '' })} />
        <CellItem title="退出登录" danger arrow={false} onClick={() => setConfirmLogout(true)} />
      </View>

      {/* 管理员功能 */}
      {storeUser?.role === 'admin' ? (
        <>
          <Text className={styles.groupTitle}>管理</Text>
          <View className={styles.group}>
            <CellItem title="用户管理" onClick={() => Taro.navigateTo({ url: '/pages/users/index' })} />
            <CellItem title="标签管理" onClick={() => Taro.navigateTo({ url: '/pages/tags-manage/index' })} />
          </View>
        </>
      ) : null}

      {/* 数据 */}
      <Text className={styles.groupTitle}>数据</Text>
      <View className={styles.group}>
        <CellItem
          title="导入 / 导出"
          desc="请在网页端设置页操作"
          onClick={() => Taro.showToast({ title: '请在网页端设置页操作', icon: 'none' })}
        />
      </View>

      {/* 用户名弹窗 */}
      {dialog.type === 'username' ? (
        <View className={styles.mask} onClick={() => setDialog({ type: 'none' })}>
          <View className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>修改用户名</Text>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>新用户名</Text>
              <Input
                className={styles.modalInput}
                value={dialog.value}
                placeholder="请输入新用户名"
                onInput={(e) => setDialog({ type: 'username', value: e.detail.value })}
              />
            </View>
            <View className={styles.modalFooter}>
              <View className={`${styles.modalBtn} ${styles.modalCancel}`} onClick={() => setDialog({ type: 'none' })}>
                <Text className={styles.modalCancelText}>取消</Text>
              </View>
              <View className={`${styles.modalBtn} ${styles.modalOk}`} onClick={saveUsername}>
                <Text className={styles.modalOkText}>保存</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* 修改密码弹窗 */}
      {dialog.type === 'password' ? (
        <View className={styles.mask} onClick={() => setDialog({ type: 'none' })}>
          <View className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>修改密码</Text>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>当前密码</Text>
              <Input
                className={styles.modalInput}
                password
                value={dialog.current}
                placeholder="请输入当前密码"
                onInput={(e) => setDialog({ type: 'password', value: dialog.value, current: e.detail.value })}
              />
            </View>
            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>新密码（至少 6 位）</Text>
              <Input
                className={styles.modalInput}
                password
                value={dialog.value}
                placeholder="请输入新密码"
                onInput={(e) => setDialog({ type: 'password', value: e.detail.value, current: dialog.current })}
              />
            </View>
            <View className={styles.modalFooter}>
              <View className={`${styles.modalBtn} ${styles.modalCancel}`} onClick={() => setDialog({ type: 'none' })}>
                <Text className={styles.modalCancelText}>取消</Text>
              </View>
              <View className={`${styles.modalBtn} ${styles.modalOk}`} onClick={savePassword}>
                <Text className={styles.modalOkText}>保存</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* 退出确认 */}
      <ConfirmModal
        visible={confirmLogout}
        title="退出登录"
        content="确定要退出当前账号吗？"
        confirmText="退出"
        danger
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </View>
  );
};

export default SettingsPage;
