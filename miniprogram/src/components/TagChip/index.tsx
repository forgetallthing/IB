import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface TagChipProps {
  name: string;
  color?: string;
  selected?: boolean;
  onClick?: () => void;
}

/** 中性浅色胶囊 + 彩点（与 Web 端标签风格一致） */
const TagChip: React.FC<TagChipProps> = ({ name, color, selected = false, onClick }) => {
  return (
    <View
      className={classnames(styles.chip, selected && styles.selected, onClick && styles.pressable)}
      onClick={onClick}
    >
      {color ? <View className={styles.dot} style={{ backgroundColor: color }} /> : null}
      <Text className={styles.name}>{name}</Text>
    </View>
  );
};

export default TagChip;
