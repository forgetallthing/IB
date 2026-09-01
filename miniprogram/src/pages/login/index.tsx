import React, { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login, wechatLogin } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import styles from './index.module.scss';

const LoginPage: React.FC = () => {
  const signIn = useAuthStore((state) => state.signIn);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const afterLogin = (result: { token: string; user: { id: string; username: string; role: 'admin' | 'member' } }, tip: string) => {
    signIn(result);
    Taro.showToast({ title: tip, icon: 'success' });
    setTimeout(() => {
      Taro.switchTab({ url: '/pages/notes/index' });
    }, 600);
  };

  /** 账号密码登录（若已通过微信登录过，可在后端同时绑定） */
  const handleAccountLogin = async () => {
    if (!username.trim() || !password) {
      Taro.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      afterLogin(result, '登录成功');
    } catch (error) {
      console.error('[Login] 账号登录失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  /** 微信一键登录：code 换 session，自动创建或绑定账号 */
  const handleWechatLogin = async () => {
    setSubmitting(true);
    try {
      let code = 'mock-code';
      if (process.env.TARO_ENV === 'weapp') {
        const loginRes = await Taro.login();
        code = loginRes.code;
      }
      const result = await wechatLogin(code);
      afterLogin(result, '微信登录成功');
    } catch (error) {
      console.error('[Login] 微信登录失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '微信登录失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={styles.container}>
      {/* 品牌区 */}
      <View className={styles.brand}>
        <View className={styles.logo}>
          <Text className={styles.logoText}>记</Text>
        </View>
        <Text className={styles.appName}>笔记库</Text>
        <Text className={styles.appSlogan}>团队共享的面试笔记仓库</Text>
      </View>

      {/* 账号密码登录 */}
      <View className={styles.formCard}>
        <View className={styles.inputItem}>
          <Text className={styles.fieldLabel}>用户名</Text>
          <Input
            className={styles.fieldInput}
            placeholder="请输入用户名"
            value={username}
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>
        <View className={`${styles.inputItem} ${styles.inputItemLast}`}>
          <Text className={styles.fieldLabel}>密码</Text>
          <Input
            className={styles.fieldInput}
            placeholder="请输入密码"
            password
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        <View
          className={`${styles.primaryBtn} ${submitting ? styles.primaryBtnDisabled : ''}`}
          onClick={submitting ? undefined : handleAccountLogin}
        >
          <Text className={styles.primaryBtnText}>{submitting ? '登录中…' : '登录'}</Text>
        </View>
      </View>

      <View className={styles.divider}>
        <View className={styles.dividerLine} />
        <Text className={styles.dividerText}>或</Text>
        <View className={styles.dividerLine} />
      </View>

      {/* 微信一键登录 */}
      <View className={styles.wechatBtn} onClick={submitting ? undefined : handleWechatLogin}>
        <Text className={styles.wechatBtnText}>微信一键登录</Text>
      </View>

      <Text className={styles.hint}>账号由管理员统一创建{'\n'}首次微信登录将自动创建成员账号{'\n'}使用已有账号登录可绑定微信</Text>
    </View>
  );
};

export default LoginPage;
