import React from 'react';
import { View, Text } from '@tarojs/components';
import TagChip from '../TagChip';
import DifficultyBadge from '../DifficultyBadge';
import { formatDate } from '../../utils/format';
import type { Question } from '../../types';
import styles from './index.module.scss';

interface QuestionCardProps {
  question: Question;
  /** 是否本人创建（仅展示“我的”徽标） */
  isMine?: boolean;
  /** 标签名 → 颜色映射 */
  tagColorMap: Record<string, string>;
  /** 点击卡片进入详情页 */
  onClick: () => void;
}

/** 笔记卡片：标题 + 标签/难度 + 作者信息，点击进入详情页 */
const QuestionCard: React.FC<QuestionCardProps> = ({ question, isMine, tagColorMap, onClick }) => {
  return (
    <View className={styles.card} onClick={onClick}>
      {/* 标题 */}
      <View className={styles.titleRow}>
        <Text className={styles.title}>{question.title}</Text>
      </View>

      {/* 元信息 */}
      <View className={styles.metaRow}>
        <DifficultyBadge difficulty={question.difficulty} />
        {question.tags.map((tagName) => (
          <TagChip key={tagName} name={tagName} color={tagColorMap[tagName]} />
        ))}
      </View>

      <View className={styles.footerRow}>
        <View className={styles.authorRow}>
          <Text className={styles.author}>{question.creatorName}</Text>
          {isMine ? <Text className={styles.mineBadge}>我的</Text> : null}
          {question.visibility === 'private' ? <Text className={styles.privateBadge}>私有</Text> : null}
          <Text className={styles.date}>{formatDate(question.updatedAt)}</Text>
        </View>
      </View>
    </View>
  );
};

export default QuestionCard;
