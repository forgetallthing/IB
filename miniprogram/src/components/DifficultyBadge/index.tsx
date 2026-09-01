import React from 'react';
import { Text } from '@tarojs/components';
import classnames from 'classnames';
import { DIFFICULTY_LABELS } from '../../utils/format';
import type { Difficulty } from '../../types';
import styles from './index.module.scss';

interface DifficultyBadgeProps {
  difficulty: Difficulty;
}

const DifficultyBadge: React.FC<DifficultyBadgeProps> = ({ difficulty }) => {
  return <Text className={classnames(styles.badge, styles[difficulty])}>{DIFFICULTY_LABELS[difficulty]}</Text>;
};

export default DifficultyBadge;
