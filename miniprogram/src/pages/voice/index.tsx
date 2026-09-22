import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useUnload } from '@tarojs/taro';
import { pushVoiceStream } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import styles from './index.module.scss';

/**
 * 录音转文字 tab：点按开始 / 再点按结束。
 * 使用微信同声传译插件（免费官方插件）实时识别，转写片段经服务器
 * 中转推送到同账号的 Web 端「每日回想」作答框；Web 端未打开时丢弃并提示。
 */

/** partial 推送最小间隔（ms）：同传插件回调很密，节流避免打爆后端限流 */
const PARTIAL_INTERVAL = 800;
/** 单次会话自动续录上限：插件单段最长 60s，到时自动开下一段，此处防失控 */
const MAX_SEGMENTS = 20;

type OnlineState = 'checking' | 'on' | 'off';

function loadPlugin(): any {
  try {
    // requirePlugin 由小程序运行时注入到模块作用域（非 globalThis 属性），
    // Taro 类型里的 Taro.requirePlugin 无运行时实现，必须直接调用裸标识符
    // @ts-ignore 运行时注入的插件加载函数
    if (typeof requirePlugin === 'function') return requirePlugin('WechatSI');
    const g = globalThis as any;
    if (typeof g.requirePlugin === 'function') return g.requirePlugin('WechatSI');
    console.error('[Voice] requirePlugin 不存在，当前环境无法加载同声传译插件');
  } catch (error) {
    console.error('[Voice] 同声传译插件加载失败:', error);
  }
  return null;
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const VoicePage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const [pluginOk, setPluginOk] = useState(true);
  const [online, setOnline] = useState<OnlineState>('checking');
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [seconds, setSeconds] = useState(0);

  const managerRef = useRef<any>(null);
  const recordingRef = useRef(false);
  const userStopRef = useRef(false);
  const segCountRef = useRef(0);
  const lastSentRef = useRef(0);
  const missTipRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, [stopTimer]);

  /** 推送一段转写文字；Web 端未在线时置离线状态并整段会话只提示一次 */
  const push = useCallback(async (text: string, isFinal: boolean) => {
    try {
      const res = await pushVoiceStream({ text, isFinal });
      if (res.delivered > 0) {
        setOnline('on');
        return;
      }
      setOnline('off');
      if (!missTipRef.current) {
        missTipRef.current = true;
        Taro.showToast({ title: '电脑端每日回想未打开，内容未同步', icon: 'none', duration: 2500 });
      }
    } catch {
      // 网络失败静默：本地文字仍在继续
    }
  }, []);

  /** 探测同账号 Web 端每日回想是否在线 */
  const probe = useCallback(async () => {
    setOnline('checking');
    try {
      const res = await pushVoiceStream({ probe: true });
      setOnline(res.online ? 'on' : 'off');
    } catch {
      setOnline('off');
    }
  }, []);

  /** 推送录音会话控制事件；Web 端据此点亮/熄灭「输入中」并确定追加基底 */
  const pushEvent = useCallback(async (event: 'start' | 'stop') => {
    try {
      await pushVoiceStream({ event });
    } catch {
      // 网络失败静默
    }
  }, []);

  const finishRecording = useCallback(() => {
    stopTimer();
    recordingRef.current = false;
    setRecording(false);
    setPartial('');
    pushEvent('stop');
  }, [stopTimer, pushEvent]);

  // 注册同传插件回调（组件生命周期内一次）
  useEffect(() => {
    const plugin = loadPlugin();
    setPluginOk(!!plugin);
    if (!plugin) return;

    const manager = plugin.getRecordRecognitionManager();

    // 同传插件回调为「属性赋值」式（官方文档：manager.onRecognize = fn）。
    // manager 预置的同名属性是默认空操作函数，插件内部直接调用当前属性派发事件；
    // 因此必须覆盖属性，不能把默认函数当注册方法调用（onResult 则完全不存在）。
    const bind = (key: string, fn: (res: any) => void) => {
      manager[key] = fn;
    };

    bind('onStart', (res: any) => {
      console.log('[Voice] onStart:', res);
    });

    bind('onRecognize', (res: any) => {
      console.log('[Voice] onRecognize:', JSON.stringify(res));
      const text = String(res?.result ?? '');
      if (!text || !recordingRef.current) return;
      setPartial(text);
      const now = Date.now();
      if (now - lastSentRef.current >= PARTIAL_INTERVAL) {
        lastSentRef.current = now;
        push(text, false);
      }
    });

    bind('onStop', (res: any) => {
      // 一段录音结束：最终识别文本在 res.result，无论是否续录都先落段
      const text = String(res?.result ?? '').trim();
      if (text) {
        setPartial('');
        setSegments((prev) => [...prev, text]);
        push(text, true);
      }
      if (recordingRef.current && !userStopRef.current && segCountRef.current < MAX_SEGMENTS - 1) {
        // 单段 60s 到时：自动续录下一段，保持整段会话连续
        segCountRef.current += 1;
        manager.start({ duration: 60000, lang: 'zh_CN' });
        startTimer();
        return;
      }
      finishRecording();
    });

    bind('onError', (res: any) => {
      console.error('[Voice] 语音识别错误:', res);
      finishRecording();
      Taro.showToast({ title: '语音识别出错，请重试', icon: 'none' });
    });

    managerRef.current = manager;
    return () => {
      try {
        manager.stop();
      } catch {
        // 已停止则忽略
      }
    };
  }, [finishRecording, push, startTimer, stopTimer]);

  // 页面显示时探测 Web 端在线状态
  useDidShow(() => {
    if (token && user) probe();
  });

  // 离开页面 / 卸载时停止录音
  const stopOnLeave = useCallback(() => {
    if (recordingRef.current) {
      userStopRef.current = true;
      managerRef.current?.stop();
      finishRecording();
    }
  }, [finishRecording]);
  useDidHide(stopOnLeave);
  useUnload(stopOnLeave);

  const handleToggle = async () => {
    const manager = managerRef.current;
    if (recordingRef.current) {
      userStopRef.current = true;
      manager?.stop();
      finishRecording();
      return;
    }
    if (!manager || !pluginOk) {
      Taro.showToast({ title: '当前环境不支持语音识别', icon: 'none' });
      return;
    }
    missTipRef.current = false;
    segCountRef.current = 0;
    userStopRef.current = false;
    lastSentRef.current = 0;
    setSegments([]);
    setPartial('');
    recordingRef.current = true;
    setRecording(true);
    startTimer();
    // 先告知 Web 端进入输入状态，再开始识别，保证事件先于转写片段到达
    await pushEvent('start');
    manager.start({ duration: 60000, lang: 'zh_CN' });
    probe();
  };

  if (!token || !user) {
    return (
      <View className={styles.container}>
        <View className={styles.loginCard}>
          <Text className={styles.loginText}>登录后可使用录音转文字</Text>
          <View className={styles.loginBtn} onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
            <Text className={styles.loginBtnText}>去登录</Text>
          </View>
        </View>
      </View>
    );
  }

  const onlineMeta: Record<OnlineState, { label: string; className: string }> = {
    checking: { label: '检测中…', className: styles.dotChecking },
    on: { label: '电脑端已连接', className: styles.dotOn },
    off: { label: '电脑端未连接', className: styles.dotOff },
  };
  const onlineInfo = onlineMeta[online];

  return (
    <View className={styles.container}>
      {/* 连接状态卡 */}
      <View className={styles.statusCard}>
        <View className={styles.statusLeft}>
          <View className={`${styles.dot} ${onlineInfo.className}`} />
          <Text className={styles.statusText}>{onlineInfo.label}</Text>
        </View>
        <Text className={styles.statusHint} onClick={probe}>
          重新检测
        </Text>
      </View>

      {/* 实时转写内容（录音中当前句 + 历史定稿段落） */}
      <View className={styles.transcript}>
        {segments.length === 0 && !partial && !recording && (
          <View className={styles.empty}>
            <Text className={styles.emptyText}>
              点按下方按钮开始录音，识别的文字会实时同步到电脑端「每日回想」的作答框。
            </Text>
            <Text className={styles.emptyText}>说完一段稍作停顿即可断句，再点按一次结束。</Text>
          </View>
        )}
        {segments.map((seg, i) => (
          <Text key={i} className={styles.segText}>
            {seg}
          </Text>
        ))}
        {partial ? (
          <Text className={styles.partialText}>{partial}</Text>
        ) : null}
      </View>

      {/* 底部录音按钮（固定） */}
      <View className={styles.recBar}>
        {recording && (
          <View className={styles.recTime}>
            <View className={styles.recTimeDot} />
            <Text className={styles.recTimeText}>录音中 {formatSeconds(seconds)}</Text>
          </View>
        )}
        <View
          className={`${styles.recBtn} ${recording ? styles.recBtnActive : ''}`}
          onClick={handleToggle}
        >
          <View className={styles.recIcon}>
            {recording ? (
              <View className={styles.recStop} />
            ) : (
              <View className={styles.recMic}>
                <View className={styles.micBody} />
                <View className={styles.micArc} />
                <View className={styles.micStem} />
                <View className={styles.micBase} />
              </View>
            )}
          </View>
        </View>
        <Text className={styles.recLabel}>{recording ? '点按结束' : '点按开始'}</Text>
      </View>
    </View>
  );
};

export default VoicePage;
