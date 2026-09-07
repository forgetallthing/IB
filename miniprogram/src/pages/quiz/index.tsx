import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import Markdown from '@/components/Markdown';
import DifficultyBadge from '@/components/DifficultyBadge';
import TagChip from '@/components/TagChip';
import Empty from '@/components/Empty';
import {
  aiReview,
  getRandomQuestion,
  getQuizPrefs,
  getTags,
  postQuizFeedback,
  putQuizPrefs,
} from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { DIFFICULTY_LABELS, DIFFICULTY_LIST } from '@/utils/format';
import type { Difficulty, QuizFeedback, QuizQuestion, Tag } from '@/types';
import styles from './index.module.scss';

/** 反馈后的提示文案（与 Web 端一致） */
const FEEDBACK_NOTICES: Record<QuizFeedback, string> = {
  forgot: '已记录：没记住，这篇会尽快再次出现',
  fuzzy: '已记录：模糊，出现频率保持不变',
  known: '已记录：记住了，出现频率会降低',
  mastered: '已标记为完全掌握，之后不再推送这篇',
};

/** 自评反馈按钮配置：四档浅色胶囊（与 Web 端配色一致） */
const FEEDBACK_ITEMS: Array<{ key: QuizFeedback; label: string; className: string }> = [
  { key: 'forgot', label: '没记住', className: styles.fbForgot },
  { key: 'fuzzy', label: '模糊', className: styles.fbFuzzy },
  { key: 'known', label: '记住了', className: styles.fbKnown },
  { key: 'mastered', label: '完全掌握', className: styles.fbMastered },
];

function toggleItem<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const QuizPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);

  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  /** 抽题失败且无当前题时的空态文案（含「全部完全掌握」等后端提示） */
  const [emptyTip, setEmptyTip] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [myAnswer, setMyAnswer] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  // 已应用的筛选：难度存枚举、标签存名称（与后端 quiz-prefs 结构对齐）
  const [difficulty, setDifficulty] = useState<Difficulty[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  // 筛选弹层草稿：勾选只在点「确定」后应用
  const [showFilter, setShowFilter] = useState(false);
  const [draftDifficulty, setDraftDifficulty] = useState<Difficulty[]>([]);
  const [draftTagNames, setDraftTagNames] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const startedRef = useRef(false);
  const tagsLoadedRef = useRef(false);
  const loadingRef = useRef(false);
  const questionRef = useRef<QuizQuestion | null>(null);
  const difficultyRef = useRef<Difficulty[]>([]);
  const tagNamesRef = useRef<string[]>([]);
  /** 每篇抽到的笔记只在首次反馈时计一次完整回想（与 Web 端一致） */
  const recallCountedRef = useRef(false);

  const activeFilterCount = difficulty.length + tagNames.length;

  /** 加权随机抽题；excludeId 供「再来一篇」避开当前题 */
  const drawQuestion = useCallback(async (excludeId?: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const item = await getRandomQuestion({
        excludeId: excludeId || undefined,
        difficulty: difficultyRef.current.length ? difficultyRef.current : undefined,
        tags: tagNamesRef.current.length ? tagNamesRef.current : undefined,
      });
      questionRef.current = item;
      setQuestion(item);
      setEmptyTip('');
      recallCountedRef.current = false;
      setShowAnswer(false);
      setShowAi(false);
      setAnalysis('');
      setMyAnswer('');
    } catch (error) {
      console.error('[Quiz] 抽题失败:', error);
      const message = error instanceof Error ? error.message : '抽题失败';
      // 无当前题时展示空态（含后端「都已完全掌握」提示），否则保留当前题仅提示
      if (!questionRef.current) setEmptyTip(message);
      Taro.showToast({ title: message, icon: 'none' });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  /** 首次进入：加载标签、恢复登录用户的筛选偏好、抽首题；再次切回时保留现场 */
  useDidShow(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true;
      getTags()
        .then((list) => setTags(list.filter((tag) => tag.active)))
        .catch((error) => {
          tagsLoadedRef.current = false;
          console.error('[Quiz] 加载标签失败:', error);
        });
    }

    (async () => {
      // 拉取失败（含未登录）时按不筛选处理
      if (useAuthStore.getState().user) {
        try {
          const prefs = await getQuizPrefs();
          const nextDifficulty = (Array.isArray(prefs.difficulty) ? prefs.difficulty : []).filter(
            (item): item is Difficulty => DIFFICULTY_LIST.includes(item as Difficulty),
          );
          const nextTags = (Array.isArray(prefs.tags) ? prefs.tags : []).filter(
            (item) => typeof item === 'string' && item,
          );
          difficultyRef.current = nextDifficulty;
          tagNamesRef.current = nextTags;
          setDifficulty(nextDifficulty);
          setTagNames(nextTags);
        } catch (error) {
          console.error('[Quiz] 恢复筛选偏好失败:', error);
        }
      }
      drawQuestion();
    })();
  });

  /** 回想自评反馈：直接调整推送权重；登录用户首次反馈计一次完整回想 */
  const handleFeedback = async (feedback: QuizFeedback) => {
    const current = questionRef.current;
    if (!current || feedbackSaving) return;
    setFeedbackSaving(true);
    const countDraw = !!user && !recallCountedRef.current;
    try {
      const result = await postQuizFeedback(current.id, { feedback, countDraw });
      recallCountedRef.current = true;
      const next = { ...current, drawCount: result.drawCount, mastered: result.mastered };
      questionRef.current = next;
      setQuestion(next);
      Taro.showToast({ title: FEEDBACK_NOTICES[feedback], icon: 'none' });
    } catch (error) {
      console.error('[Quiz] 反馈保存失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '反馈保存失败', icon: 'none' });
    } finally {
      setFeedbackSaving(false);
    }
  };

  /** 把题目与用户作答发给 Coze 智能体做点评（约需十几秒） */
  const handleAiReview = async () => {
    const current = questionRef.current;
    if (!current || analyzing) return;
    setShowAi(true);
    setAnalyzing(true);
    try {
      const result = await aiReview({ title: current.title, answer: myAnswer });
      setAnalysis(result.analysis);
      Taro.showToast({ title: 'AI 分析完成', icon: 'none' });
    } catch (error) {
      console.error('[Quiz] AI 分析失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : 'AI 分析失败', icon: 'none' });
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleAnswer = () => {
    if (!questionRef.current) return;
    setShowAnswer(!showAnswer);
  };

  // ========== 筛选弹层 ==========
  const openFilter = () => {
    setDraftDifficulty(difficulty);
    setDraftTagNames(tagNames);
    setShowFilter(true);
  };

  /** 重置：仅清空弹层内勾选，点「确定」后才应用 */
  const resetFilter = () => {
    setDraftDifficulty([]);
    setDraftTagNames([]);
  };

  const applyFilter = () => {
    const nextDifficulty = draftDifficulty;
    const nextTags = draftTagNames;
    difficultyRef.current = nextDifficulty;
    tagNamesRef.current = nextTags;
    setDifficulty(nextDifficulty);
    setTagNames(nextTags);
    setShowFilter(false);

    // 登录用户的筛选偏好持久化到后台，保存失败不影响本次抽取
    if (user) {
      putQuizPrefs({ difficulty: nextDifficulty, tags: nextTags }).catch((error) => {
        console.error('[Quiz] 筛选偏好保存失败:', error);
        Taro.showToast({ title: '筛选偏好保存失败', icon: 'none' });
      });
    }
    drawQuestion();
  };

  return (
    <View className={styles.container}>
      {/* 操作行 */}
      <View className={styles.actionRow}>
        <View
          className={classnames(styles.actionBtn, activeFilterCount > 0 && styles.actionBtnActive)}
          onClick={openFilter}
        >
          <Text>筛选{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text>
        </View>
        <View className={styles.actionBtn} onClick={handleAiReview}>
          <Text>{analyzing ? 'AI 分析中…' : 'AI 分析'}</Text>
        </View>
        <View className={styles.actionBtn} onClick={toggleAnswer}>
          <Text>{showAnswer ? '隐藏详情' : '显示详情'}</Text>
        </View>
        <View
          className={classnames(styles.actionBtn, styles.actionBtnPrimary)}
          onClick={() => drawQuestion(questionRef.current?.id)}
        >
          <Text>再来一篇</Text>
        </View>
      </View>

      {/* 加载 / 空态 */}
      {loading && !question ? (
        <View className={styles.loadingWrap}>
          <Text className={styles.loadingText}>抽取中…</Text>
        </View>
      ) : emptyTip && !question ? (
        <Empty text={emptyTip} />
      ) : question ? (
        <View className={styles.body}>
          {/* 题卡 */}
          <View className={styles.card}>
            <View className={styles.pillRow}>
              <DifficultyBadge difficulty={question.difficulty} />
              {question.tags.map((tag) => (
                <TagChip key={tag} name={tag} />
              ))}
            </View>
            <View className={styles.questionTitle}>
              <Markdown source={question.title} defer={0} />
            </View>
            <Text className={styles.meta}>
              来自 {question.creatorName} 的笔记 · {question.visibility === 'public' ? '公开' : '私有'} · 出现{' '}
              {question.drawCount} 次
            </Text>
          </View>

          {/* AI 分析 */}
          {showAi ? (
            <View className={styles.card}>
              <View className={styles.panelHead}>
                <Text className={styles.panelLabel}>AI 分析</Text>
              </View>
              {analyzing ? <Text className={styles.loadingText}>AI 分析中，约需十几秒…</Text> : null}
              {analysis ? (
                <View className={styles.mdContent}>
                  <Markdown source={analysis} defer={60} />
                </View>
              ) : null}
              {!analyzing && !analysis ? (
                <View className={styles.aiPlaceholder}>
                  <Text className={styles.aiPlaceholderText}>暂无分析结果，可点击上方「AI 分析」重试</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 参考详情 + 自评反馈（纯切换显示，不产生任何计数） */}
          {showAnswer ? (
            <View className={styles.card}>
              <View className={styles.panelHead}>
                <Text className={styles.panelLabel}>参考详情</Text>
              </View>
              <View className={styles.mdContent}>
                <Markdown source={question.content} defer={60} />
              </View>
              {user ? (
                <View className={styles.feedbackBar}>
                  <Text className={styles.feedbackHint}>对照后回忆得怎么样？</Text>
                  <View className={styles.feedbackActions}>
                    {FEEDBACK_ITEMS.map((item) => (
                      <View
                        key={item.key}
                        className={classnames(styles.fbBtn, item.className)}
                        hoverClass={styles.fbHover}
                        hoverStayTime={120}
                        onClick={() => handleFeedback(item.key)}
                      >
                        <Text>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text className={styles.guestHint}>登录后可通过自评反馈调整这篇笔记的推送频率</Text>
              )}
            </View>
          ) : null}

          {/* 我的作答（仅本地显示，不上传；默认撑满剩余屏高） */}
          <View className={classnames(styles.card, styles.answerCard)}>
            <View className={styles.panelHead}>
              <Text className={styles.panelLabel}>我的作答</Text>
              {myAnswer ? (
                <Text className={styles.clearBtn} onClick={() => setMyAnswer('')}>
                  清空
                </Text>
              ) : null}
            </View>
            {/* 筛选弹层打开时隐藏输入框：原生 Textarea 层级最高，会穿透弹层遮罩 */}
            {!showFilter ? (
              <View className={styles.answerField}>
                <Textarea
                  className={styles.answerInput}
                  style={{ width: '100%', height: '100%' }}
                  value={myAnswer}
                  placeholder="在这里写下你的答案…（支持 Markdown，仅本地显示）"
                  maxlength={-1}
                  onInput={(e) => setMyAnswer(e.detail.value)}
                />
              </View>
            ) : null}
            <Text className={styles.editHint}>小程序仅支持手写 Markdown，更多支持请使用浏览器访问网页版</Text>
          </View>
        </View>
      ) : null}

      {/* 筛选弹层：勾选只作用于抽取范围，不改变列表页筛选 */}
      {showFilter ? (
        <View className={styles.mask} onClick={() => setShowFilter(false)}>
          <View className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.sheetTitle}>筛选</Text>
            <Text className={styles.sheetHint}>仅抽取符合条件的内容，全部留空表示不限制</Text>

            <View className={styles.filterBlock}>
              <Text className={styles.filterLabel}>难度</Text>
              <View className={styles.filterChips}>
                {DIFFICULTY_LIST.map((item) => (
                  <View
                    key={item}
                    className={classnames(styles.option, draftDifficulty.includes(item) && styles.optionActive)}
                    onClick={() => setDraftDifficulty(toggleItem(draftDifficulty, item))}
                  >
                    <Text>{DIFFICULTY_LABELS[item]}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className={styles.filterBlock}>
              <Text className={styles.filterLabel}>标签</Text>
              <View className={styles.filterChips}>
                {tags.length ? (
                  tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      name={tag.name}
                      color={tag.color}
                      selected={draftTagNames.includes(tag.name)}
                      onClick={() => setDraftTagNames(toggleItem(draftTagNames, tag.name))}
                    />
                  ))
                ) : (
                  <Text className={styles.filterEmpty}>暂无可用标签</Text>
                )}
              </View>
            </View>

            <View className={styles.sheetActions}>
              <View className={classnames(styles.actionBtn, styles.actionBtnGhost)} onClick={resetFilter}>
                <Text>重置</Text>
              </View>
              <View className={styles.sheetSpacer} />
              <View className={styles.actionBtn} onClick={() => setShowFilter(false)}>
                <Text>取消</Text>
              </View>
              <View className={classnames(styles.actionBtn, styles.actionBtnPrimary)} onClick={applyFilter}>
                <Text>确定</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default QuizPage;
