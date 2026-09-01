import React from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import classnames from 'classnames';
import TagChip from '../TagChip';
import { DIFFICULTY_LABELS, VISIBILITY_LABELS, DIFFICULTY_LIST, VISIBILITY_LIST } from '../../utils/format';
import type { Difficulty, Tag, Visibility } from '../../types';
import styles from './index.module.scss';

interface FilterBarProps {
  /** 已选难度 */
  difficulty: Difficulty[];
  /** 已选可见性 */
  visibility: Visibility[];
  /** 已选标签 id */
  tagIds: string[];
  /** 全量标签 */
  tags: Tag[];
  onDifficultyChange: (value: Difficulty[]) => void;
  onVisibilityChange: (value: Visibility[]) => void;
  onTagChange: (value: string[]) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** 多选筛选栏：难度 / 可见性 / 标签（支持本地持久化由页面负责） */
const FilterBar: React.FC<FilterBarProps> = ({
  difficulty,
  visibility,
  tagIds,
  tags,
  onDifficultyChange,
  onVisibilityChange,
  onTagChange,
}) => {
  return (
    <View className={styles.container}>
      {/* 难度 */}
      <View className={styles.row}>
        <Text className={styles.label}>难度</Text>
        <ScrollView scrollX className={styles.scroll} enhanced showScrollbar={false}>
          <View className={styles.chipRow}>
            {DIFFICULTY_LIST.map((item) => (
              <View
                key={item}
                className={classnames(styles.option, difficulty.includes(item) && styles.optionActive)}
                onClick={() => onDifficultyChange(toggle(difficulty, item))}
              >
                <Text>{DIFFICULTY_LABELS[item]}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        {difficulty.length ? (
          <Text className={styles.clear} onClick={() => onDifficultyChange([])}>清空</Text>
        ) : null}
      </View>

      {/* 可见性 */}
      <View className={styles.row}>
        <Text className={styles.label}>范围</Text>
        <View className={styles.chipRow}>
          {VISIBILITY_LIST.map((item) => (
            <View
              key={item}
              className={classnames(styles.option, visibility.includes(item) && styles.optionActive)}
              onClick={() => onVisibilityChange(toggle(visibility, item))}
            >
              <Text>{VISIBILITY_LABELS[item]}</Text>
            </View>
          ))}
        </View>
        {visibility.length ? (
          <Text className={styles.clear} onClick={() => onVisibilityChange([])}>清空</Text>
        ) : null}
      </View>

      {/* 标签 */}
      <View className={styles.row}>
        <Text className={styles.label}>标签</Text>
        <ScrollView scrollX className={styles.scroll} enhanced showScrollbar={false}>
          <View className={styles.chipRow}>
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                selected={tagIds.includes(tag.id)}
                onClick={() => onTagChange(toggle(tagIds, tag.id))}
              />
            ))}
          </View>
        </ScrollView>
        {tagIds.length ? (
          <Text className={styles.clear} onClick={() => onTagChange([])}>清空</Text>
        ) : null}
      </View>
    </View>
  );
};

export default FilterBar;
