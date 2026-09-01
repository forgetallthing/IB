import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import TagChip from '@/components/TagChip';
import DifficultyBadge from '@/components/DifficultyBadge';
import Markdown from '@/components/Markdown';
import ConfirmModal from '@/components/ConfirmModal';
import { getQuestion, createQuestion, updateQuestion, deleteQuestion, getTags } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import { DIFFICULTY_LABELS, VISIBILITY_LABELS, DIFFICULTY_LIST, VISIBILITY_LIST } from '@/utils/format';
import type { Difficulty, Question, Tag, Visibility } from '@/types';
import styles from './index.module.scss';

/**
 * 笔记编辑器视图（非页面组件，供 pages/editor 与 pages/create 两个页面复用）。
 * 注意：页面入口文件必须保持薄壳 re-export，不能反向引用其他页面模块，
 * 否则 Taro 注入的 Page() 注册副作用会在同一文件里执行两次导致
 * "Please do not register multiple Pages" 运行时错误。
 */
const EditorView: React.FC = () => {
  const router = useRouter();
  const editId = router.params.id;
  const user = useAuthStore((state) => state.user);
  const setListDirty = useUiStore((state) => state.setListDirty);

  /** view = 只读详情；edit = 编辑。已有笔记默认只读，新建直接进入编辑 */
  const [mode, setMode] = useState<'view' | 'edit'>(editId ? 'view' : 'edit');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [tags, setTags] = useState<Tag[]>([]);

  const [creatorId, setCreatorId] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 新建保存成功后记录 id，后续保存转为编辑模式 */
  const [createdId, setCreatedId] = useState('');

  const effectiveId = editId || createdId;
  /** 「新建」tab 页：无 url 参数，永远保持编辑模式，不进入只读详情 */
  const isNewTab = !editId;
  const canMaintain = Boolean(!effectiveId || (user && (user.role === 'admin' || creatorId === user.id)));

  const tagColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tags.forEach((tag) => {
      map[tag.name] = tag.color;
    });
    return map;
  }, [tags]);

  /** 拉取笔记详情并填充表单 */
  const fetchQuestion = useCallback(async (id: string) => {
    try {
      const question: Question = await getQuestion(id);
      setTitle(question.title);
      setContent(question.content);
      setSelectedTagNames(question.tags);
      setDifficulty(question.difficulty);
      setVisibility(question.visibility);
      setCreatorId(question.creatorId);
    } catch (error) {
      console.error('[Editor] 加载笔记失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
      setTimeout(() => Taro.navigateBack(), 900);
    }
  }, []);

  /** 标签库用于取颜色（详情）与勾选（编辑），进入页面即加载一次 */
  const tagsLoadedRef = React.useRef(false);
  useEffect(() => {
    if (tagsLoadedRef.current) return;
    tagsLoadedRef.current = true;
    getTags()
      .then((list) => setTags(list.filter((tag) => tag.active)))
      .catch((error) => {
        tagsLoadedRef.current = false;
        console.error('[Editor] 加载标签失败:', error);
      });
  }, []);

  useEffect(() => {
    if (editId) {
      fetchQuestion(editId);
    }
  }, [editId, fetchQuestion]);

  const toggleTag = (tagName: string) => {
    setSelectedTagNames((prev) => (prev.includes(tagName) ? prev.filter((item) => item !== tagName) : [...prev, tagName]));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!content.trim()) {
      Taro.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      content,
      tags: selectedTagNames,
      difficulty,
      visibility,
    };
    try {
      if (effectiveId) {
        await updateQuestion(effectiveId, payload);
        setListDirty(true);
        Taro.showToast({ title: '已保存', icon: 'success' });
        if (isNewTab) {
          // 新建 tab：保存后继续留在编辑状态，便于继续修改或新建下一篇
          return;
        }
        await fetchQuestion(effectiveId);
        setMode('view');
      } else {
        const created = await createQuestion(payload);
        setCreatedId(created.id);
        setListDirty(true);
        // 保存后停留编辑页，方便继续修改
        Taro.showToast({ title: '已保存，可继续编辑', icon: 'success' });
      }
    } catch (error) {
      console.error('[Editor] 保存失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!effectiveId) return;
    try {
      await deleteQuestion(effectiveId);
      setListDirty(true);
      Taro.showToast({ title: '笔记已删除', icon: 'success' });
      setConfirmDelete(false);
      setTimeout(() => Taro.navigateBack(), 600);
    } catch (error) {
      console.error('[Editor] 删除失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' });
      setConfirmDelete(false);
    }
  };

  /** 取消编辑：放弃修改并回到只读详情 */
  const handleCancelEdit = async () => {
    if (effectiveId) {
      await fetchQuestion(effectiveId);
    }
    setMode('view');
  };

  /** 新建 tab：清空表单，开始下一篇 */
  const handleReset = () => {
    setCreatedId('');
    setTitle('');
    setContent('');
    setSelectedTagNames([]);
    setDifficulty('medium');
    setVisibility('public');
    setConfirmReset(false);
  };

  const handleResetClick = () => {
    if (title.trim() || content.trim()) {
      setConfirmReset(true);
      return;
    }
    handleReset();
  };

  return (
    <View className={styles.container}>
      {/* 编辑模式的 Markdown 手写提示 */}
      {mode === 'edit' && (
        <Text className={styles.editHint}>小程序仅支持手写 Markdown，更多支持请使用浏览器访问网页版</Text>
      )}
      {/* 元信息卡：详情为紧凑单行标记，编辑为完整可选行 */}
      <View className={styles.metaCard}>
        {mode === 'view' ? (
          <View className={styles.metaHeader}>
            <View className={styles.metaBadges}>
              {selectedTagNames.map((tagName) => (
                <TagChip key={tagName} name={tagName} color={tagColorMap[tagName] || '#0d9488'} />
              ))}
              <DifficultyBadge difficulty={difficulty} />
              <Text className={styles.visibilityBadge}>{VISIBILITY_LABELS[visibility]}</Text>
            </View>
            {canMaintain ? (
              <View className={styles.miniActions}>
                <View className={`${styles.miniBtn} ${styles.miniBtnEdit}`} onClick={() => setMode('edit')}>
                  <Text className={styles.miniBtnEditText}>编辑</Text>
                </View>
                <View className={`${styles.miniBtn} ${styles.miniBtnDelete}`} onClick={() => setConfirmDelete(true)}>
                  <Text className={styles.miniBtnDeleteText}>删除</Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            <View className={styles.tagRow}>
              <Text className={styles.tagRowLabel}>标签</Text>
              <View className={styles.tagChips}>
                {tags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    name={tag.name}
                    color={tag.color}
                    selected={selectedTagNames.includes(tag.name)}
                    onClick={() => toggleTag(tag.name)}
                  />
                ))}
              </View>
            </View>

            {/* 难度与可见性各占一行，压缩纵向空间 */}
            <View className={styles.inlineRow}>
              <Text className={styles.inlineLabel}>难度</Text>
              {DIFFICULTY_LIST.map((item) => (
                <View
                  key={item}
                  className={`${styles.option} ${difficulty === item ? styles.optionActive : ''}`}
                  onClick={() => setDifficulty(item)}
                >
                  <Text className={`${styles.optionText} ${difficulty === item ? styles.optionActiveText : ''}`}>
                    {DIFFICULTY_LABELS[item]}
                  </Text>
                </View>
              ))}
            </View>

            {/* 可见性行右侧放操作按钮：新建 tab 为「＋ 新建」，编辑已有为「取消」；保存常驻 */}
            <View className={styles.inlineRow}>
              <Text className={styles.inlineLabel}>可见性</Text>
              {VISIBILITY_LIST.map((item) => (
                <View
                  key={item}
                  className={`${styles.option} ${visibility === item ? styles.optionActive : ''}`}
                  onClick={() => setVisibility(item)}
                >
                  <Text className={`${styles.optionText} ${visibility === item ? styles.optionActiveText : ''}`}>
                    {VISIBILITY_LABELS[item]}
                  </Text>
                </View>
              ))}
              <View className={styles.inlineActions}>
                {isNewTab ? (
                  <View className={styles.topBtnSoft} onClick={handleResetClick}>
                    <Text className={styles.topBtnSoftText}>＋ 新建</Text>
                  </View>
                ) : (
                  <View className={styles.topBtnSoft} onClick={saving ? undefined : handleCancelEdit}>
                    <Text className={styles.topBtnSoftText}>取消</Text>
                  </View>
                )}
                <View className={styles.topBtnPrimary} onClick={saving ? undefined : handleSave}>
                  <Text className={styles.topBtnPrimaryText}>{saving ? '保存中…' : '保存'}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* 标题卡：详情用 towxml 渲染，编辑用多行输入框支持换行 */}
      <View className={styles.titleCard}>
        {mode === 'edit' ? (
          <Textarea
            className={styles.titleInput}
            placeholder="标题（支持 Markdown）"
            value={title}
            maxlength={-1}
            autoHeight
            onInput={(e) => setTitle(e.detail.value)}
          />
        ) : (
          <View className={styles.viewTitle}>
            <Markdown source={title} defer={0} />
          </View>
        )}
      </View>

      {/* 正文卡：编辑区域尽量大 */}
      <View className={styles.contentCard}>
        {mode === 'edit' ? (
          <Textarea
            className={styles.contentInput}
            placeholder="正文，支持 Markdown 语法"
            value={content}
            maxlength={-1}
            onInput={(e) => setContent(e.detail.value)}
          />
        ) : content ? (
          // 正文较大：延迟到页面转场动画结束后再解析，避免阻塞主线程造成进页卡顿
          <Markdown source={content} defer={350} />
        ) : (
          <Text className={styles.emptyContent}>暂无内容</Text>
        )}
      </View>

      {/* 删除确认 */}
      <ConfirmModal
        visible={confirmDelete}
        title="删除笔记"
        content="删除后不可恢复，确定删除吗？"
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* 新建 tab：丢弃未保存内容的确认 */}
      <ConfirmModal
        visible={confirmReset}
        title="新建笔记"
        content="当前内容尚未保存，新建将丢弃已输入的内容，确定继续吗？"
        confirmText="继续新建"
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
    </View>
  );
};

export default EditorView;
