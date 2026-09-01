import React, { useCallback, useState } from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import ConfirmModal from '@/components/ConfirmModal';
import { getTags, createTag, updateTag, deleteTag } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import type { Tag } from '@/types';
import styles from './index.module.scss';

/** 预设色板（清爽色系） */
const COLOR_PALETTE = [
  '#0d9488', '#14b8a6', '#0ea5e9', '#3b82f6',
  '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b',
  '#10b981', '#64748b', '#84cc16', '#f97316',
];

interface TagForm {
  name: string;
  color: string;
  description: string;
}

const emptyForm: TagForm = { name: '', color: COLOR_PALETTE[0], description: '' };

const TagsManagePage: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const me = useAuthStore((state) => state.user);

  const [tags, setTags] = useState<Tag[]>([]);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [form, setForm] = useState<TagForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  const loadTags = useCallback(() => {
    if (!token) {
      Taro.navigateTo({ url: '/pages/login/index' });
      return;
    }
    if (me?.role !== 'admin') {
      Taro.showToast({ title: '仅管理员可访问', icon: 'none' });
      setTimeout(() => Taro.navigateBack(), 800);
      return;
    }
    getTags()
      .then(setTags)
      .catch((error) => {
        console.error('[TagsManage] 加载标签失败:', error);
        Taro.showToast({ title: '加载失败', icon: 'none' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, me]);

  useDidShow(() => {
    loadTags();
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (tag: Tag) => {
    setEditing(tag);
    setForm({ name: tag.name, color: tag.color, description: tag.description ?? '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Taro.showToast({ title: '请输入标签名称', icon: 'none' });
      return;
    }
    try {
      if (editing) {
        await updateTag(editing.id, { name: form.name.trim(), color: form.color, description: form.description });
        Taro.showToast({ title: '标签已更新', icon: 'success' });
      } else {
        const maxOrder = tags.reduce((max, item) => Math.max(max, item.displayOrder), 0);
        await createTag({ name: form.name.trim(), color: form.color, description: form.description, displayOrder: maxOrder + 1 });
        Taro.showToast({ title: '标签已创建', icon: 'success' });
      }
      setShowForm(false);
      loadTags();
    } catch (error) {
      console.error('[TagsManage] 保存标签失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTag(deleteTarget.id);
      Taro.showToast({ title: '标签已删除', icon: 'success' });
      setDeleteTarget(null);
      loadTags();
    } catch (error) {
      console.error('[TagsManage] 删除标签失败:', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' });
      setDeleteTarget(null);
    }
  };

  /** 上移 / 下移排序（保存到后端） */
  const move = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= tags.length) return;
    const next = [...tags];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);

    // 乐观更新
    setTags(next);
    try {
      await Promise.all(
        next.map((tag, order) => updateTag(tag.id, { displayOrder: order + 1 })),
      );
      Taro.showToast({ title: '排序已保存', icon: 'success' });
    } catch (error) {
      console.error('[TagsManage] 排序保存失败:', error);
      Taro.showToast({ title: '排序保存失败，已回滚', icon: 'none' });
      loadTags();
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.addBtn} onClick={openCreate}>
        <Text className={styles.addBtnText}>+ 新建标签</Text>
      </View>

      {tags.map((tag, index) => (
        <View key={tag.id} className={styles.tagCard}>
          {/* 排序手柄 */}
          <View className={styles.orderCol}>
            <View
              className={`${styles.orderBtn} ${index === 0 ? styles.orderBtnDisabled : ''}`}
              onClick={index === 0 ? undefined : () => move(index, -1)}
            >
              <Text>▲</Text>
            </View>
            <View
              className={`${styles.orderBtn} ${index === tags.length - 1 ? styles.orderBtnDisabled : ''}`}
              onClick={index === tags.length - 1 ? undefined : () => move(index, 1)}
            >
              <Text>▼</Text>
            </View>
            <Text className={styles.orderNum}>{index + 1}</Text>
          </View>

          {/* 信息 */}
          <View className={styles.infoCol}>
            <View className={styles.nameRow}>
              <View className={styles.colorDot} style={{ backgroundColor: tag.color }} />
              <Text className={styles.tagName}>{tag.name}</Text>
            </View>
            {tag.description ? <Text className={styles.tagDesc}>{tag.description}</Text> : null}
          </View>

          {/* 操作 */}
          <View className={styles.editCol}>
            <View className={`${styles.miniBtn} ${styles.btnEdit}`} onClick={() => openEdit(tag)}>
              <Text>编辑</Text>
            </View>
            <View className={`${styles.miniBtn} ${styles.btnDelete}`} onClick={() => setDeleteTarget(tag)}>
              <Text>删除</Text>
            </View>
          </View>
        </View>
      ))}

      {/* 编辑/新建弹窗 */}
      {showForm ? (
        <View className={styles.mask} onClick={() => setShowForm(false)}>
          <View className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>{editing ? '编辑标签' : '新建标签'}</Text>

            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>名称</Text>
              <Input
                className={styles.modalInput}
                value={form.name}
                placeholder="请输入标签名称"
                onInput={(e) => setForm((prev) => ({ ...prev, name: e.detail.value }))}
              />
            </View>

            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>颜色</Text>
              <View className={styles.palette}>
                {COLOR_PALETTE.map((color) => (
                  <View
                    key={color}
                    className={`${styles.swatch} ${form.color === color ? styles.swatchActive : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm((prev) => ({ ...prev, color }))}
                  />
                ))}
              </View>
            </View>

            <View className={styles.modalField}>
              <Text className={styles.modalLabel}>描述（可选）</Text>
              <Textarea
                className={styles.modalTextarea}
                value={form.description}
                placeholder="请输入描述"
                maxlength={100}
                onInput={(e) => setForm((prev) => ({ ...prev, description: e.detail.value }))}
              />
            </View>

            <View className={styles.modalFooter}>
              <View className={`${styles.modalBtn} ${styles.modalCancel}`} onClick={() => setShowForm(false)}>
                <Text className={styles.modalCancelText}>取消</Text>
              </View>
              <View className={`${styles.modalBtn} ${styles.modalOk}`} onClick={handleSave}>
                <Text className={styles.modalOkText}>保存</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* 删除确认 */}
      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title="删除标签"
        content={`确定删除标签「${deleteTarget?.name ?? ''}」吗？`}
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
};

export default TagsManagePage;
