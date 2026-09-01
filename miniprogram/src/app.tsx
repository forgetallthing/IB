import React, { useEffect } from 'react';
import { useDidShow, useDidHide, useLaunch } from '@tarojs/taro';
// 全局样式
import './app.scss';
import { useAuthStore } from './store/auth';
import { getMe } from './services/api';

function App(props) {
  useLaunch(() => {
    // 启动时恢复登录态（token 校验由各页面请求时的 401 统一处理）
    useAuthStore.getState().hydrate();
    // hydrate 只恢复了 token，用户信息需重新拉取，否则权限判断（编辑/删除按钮）会失效
    const { token, setUser } = useAuthStore.getState();
    if (token) {
      getMe()
        .then((me) => setUser(me))
        .catch((error) => console.error('[Auth] 恢复用户信息失败:', error));
    }
  });

  // 可以使用所有的 React Hooks
  useEffect(() => {});

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
