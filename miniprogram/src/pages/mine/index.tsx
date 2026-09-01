import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import CellItem from '@/components/CellItem';
import { useAuthStore } from '@/store/auth';
import styles from './index.module.scss';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  member: '成员',
};

const MinePage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  useDidShow(() => {
    // 已登录时无需额外处理；未登录展示引导卡片
  });

  if (!token || !user) {
    return (
      <View className={styles.container}>
        <View className={styles.loginCard}>
          <Text className={styles.loginText}>登录后可管理笔记与账号</Text>
          <View className={styles.loginBtn} onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
            <Text className={styles.loginBtnText}>去登录</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className={styles.container}>
      {/* 用户信息 */}
      <View className={styles.profileCard}>
        <View className={styles.avatar}>
          <Text className={styles.avatarText}>{user.username.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View className={styles.profileInfo}>
          <Text className={styles.username}>{user.username}</Text>
          <View className={styles.badgeRow}>
            <Text className={styles.roleBadge}>{ROLE_LABELS[user.role] ?? user.role}</Text>
          </View>
        </View>
      </View>

      {/* 账号 */}
      <Text className={styles.groupTitle}>账号</Text>
      <View className={styles.group}>
        <CellItem title="系统设置" desc="用户名、密码与退出登录" onClick={() => Taro.navigateTo({ url: '/pages/settings/index' })} />
      </View>

      {/* 管理员功能 */}
      {user.role === 'admin' ? (
        <>
          <Text className={styles.groupTitle}>管理</Text>
          <View className={styles.group}>
            <CellItem title="用户管理" desc="创建账号、停用与重置密码" onClick={() => Taro.navigateTo({ url: '/pages/users/index' })} />
            <CellItem title="标签管理" desc="新增、编辑、排序与删除标签" onClick={() => Taro.navigateTo({ url: '/pages/tags-manage/index' })} />
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
    </View>
  );
};

export default MinePage;
