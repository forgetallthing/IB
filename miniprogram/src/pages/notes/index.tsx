import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow, usePageScroll, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import FilterBar from '@/components/FilterBar';
import QuestionCard from '@/components/QuestionCard';
import Empty from '@/components/Empty';
import { getQuestions, getTags } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import { FILTER_STORAGE_KEY } from '@/config';
import type { Difficulty, Question, Tag, Visibility } from '@/types';
import styles from './index.module.scss';

const PAGE_SIZE = 20;

interface StoredFilters {
  difficulty?: Difficulty[];
  visibility?: Visibility[];
  tag?: string[];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const NotesPage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const listDirty = useUiStore((state) => state.listDirty);
  const setListDirty = useUiStore((state) => state.setListDirty);

  const [keyword, setKeyword] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty[]>([]);
  const [visibility, setVisibility] = useState<Visibility[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [items, setItems] = useState<Question[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const firstLoadDone = useRef(false);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  /** 标签列表基本不变，整个页面生命周期只加载一次 */
  const tagsLoadedRef = useRef(false);

  const tagNameColorMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    tags.forEach((tag) => {
      map[tag.name] = tag.color;
    });
    return map;
  }, [tags]);

  const tagNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    tags.forEach((tag) => {
      map[tag.id] = tag.name;
    });
    return map;
  }, [tags]);

  /** 恢复本地缓存的筛选条件 */
  const restoreFilters = useCallback(() => {
    try {
      const raw = Taro.getStorageSync(FILTER_STORAGE_KEY) as string | object;
      if (!raw) return;
      const stored = (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoredFilters;
      const restoredDifficulty = asStringArray(stored.difficulty) as Difficulty[];
      const restoredVisibility = asStringArray(stored.visibility) as Visibility[];
      setDifficulty(restoredDifficulty.filter((item) => ['easy', 'medium', 'hard'].includes(item)));
      setVisibility(restoredVisibility.filter((item) => ['public', 'private'].includes(item)));
      setTagIds(asStringArray(stored.tag));
    } catch (error) {
      console.error('[Notes] 恢复筛选条件失败:', error);
    }
  }, []);

  const persistFilters = useCallback(
    (next: { difficulty: Difficulty[]; visibility: Visibility[]; tag: string[] }) => {
      try {
        Taro.setStorageSync(FILTER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 忽略存储失败 */
      }
    },
    [],
  );

  /** 拉取列表（page=1 刷新） */
  const loadItems = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await getQuestions({
          q: searchQ || undefined,
          tags: tagIds.map((id) => tagNameById[id]).filter(Boolean),
          difficulty: difficulty.length ? difficulty : undefined,
          visibility: visibility.length ? visibility : undefined,
          page: targetPage,
          limit: PAGE_SIZE,
        });
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setPage(targetPage);
        pageRef.current = targetPage;
        setHasMore(res.hasMore);
        setTotal(res.total);
      } catch (error) {
        console.error('[Notes] 加载列表失败:', error);
        Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
      } finally {
        loadingRef.current = false;
        setLoading(false);
        Taro.stopPullDownRefresh();
      }
    },
    [searchQ, tagIds, tagNameById, difficulty, visibility],
  );

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQ(keyword.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 首次进入：恢复筛选
  useEffect(() => {
    if (!firstLoadDone.current) {
      firstLoadDone.current = true;
      restoreFilters();
    }
  }, [restoreFilters]);

  // 筛选变化：持久化 + 重新加载
  useEffect(() => {
    if (!firstLoadDone.current) return;
    persistFilters({ difficulty, visibility, tag: tagIds });
    loadItems(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, difficulty, visibility, tagIds]);

  // 登录态与标签加载、来自标签页的筛选联动
  useDidShow(() => {
    if (!token) {
      Taro.navigateTo({ url: '/pages/login/index' });
      return;
    }
    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true;
      getTags()
        .then((list) => setTags(list.filter((tag) => tag.active)))
        .catch((error) => {
          tagsLoadedRef.current = false;
          console.error('[Notes] 加载标签失败:', error);
        });
    }

    // 仅在详情页发生过保存/删除时刷新，避免每次返回都全量重绘造成列表闪动
    if (firstLoadDone.current && listDirty) {
      setListDirty(false);
      loadItems(1, true);
    }
  });

  usePullDownRefresh(() => {
    loadItems(1, true);
  });

  useReachBottom(() => {
    if (hasMore && !loadingRef.current) {
      loadItems(pageRef.current + 1, false);
    }
  });

  /** 点击卡片进入详情页 */
  const handleOpen = (question: Question) => {
    Taro.navigateTo({ url: `/pages/editor/index?id=${question.id}` });
  };

  // 回到顶部：滚动超过 360px 显示
  const [showTop, setShowTop] = useState(false);
  usePageScroll((res) => setShowTop(res.scrollTop > 360));
  const backToTop = () => Taro.pageScrollTo({ scrollTop: 0, duration: 300 });

  return (
    <View className={styles.container}>
      {/* 搜索栏 */}
      <View className={styles.searchBar}>
        <Text className={styles.searchIcon}>⌕</Text>
        <Input
          className={styles.searchInput}
          placeholder="搜索标题或内容"
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          confirmType="search"
        />
        {keyword ? (
          <Text className={styles.searchClear} onClick={() => setKeyword('')}>
            清除
          </Text>
        ) : null}
      </View>

      {/* 多选筛选 */}
      <FilterBar
        difficulty={difficulty}
        visibility={visibility}
        tagIds={tagIds}
        tags={tags}
        onDifficultyChange={setDifficulty}
        onVisibilityChange={setVisibility}
        onTagChange={setTagIds}
      />

      {/* 列表 */}
      {items.length ? (
        items.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            isMine={user ? question.creatorId === user.id : false}
            tagColorMap={tagNameColorMap}
            onClick={() => handleOpen(question)}
          />
        ))
      ) : (
        !loading && <Empty text={searchQ ? '没有匹配的笔记' : '暂无笔记'} />
      )}

      {loading ? (
        <View className={styles.listFooter}>
          <Text className={styles.listFooterText}>加载中…</Text>
        </View>
      ) : hasMore ? (
        <View className={styles.listFooter} onClick={() => loadItems(pageRef.current + 1, false)}>
          <Text className={styles.listFooterText}>上拉加载更多（{total} 条）</Text>
        </View>
      ) : items.length ? (
        <View className={styles.listFooter}>
          <Text className={styles.listFooterText}>共 {total} 条 · 已全部加载</Text>
        </View>
      ) : null}

      {/* 回到顶部 */}
      <View className={`${styles.backTop} ${showTop ? styles.backTopVisible : ''}`} onClick={backToTop}>
        <View className={styles.backTopArrow} />
      </View>
    </View>
  );
};

export default NotesPage;
