import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface CellItemProps {
  title: string;
  desc?: string;
  /** 右侧附加内容（如状态值） */
  extra?: string;
  /** 是否显示箭头 */
  arrow?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

/** 设置页单元格 */
const CellItem: React.FC<CellItemProps> = ({ title, desc, extra, arrow = true, danger = false, onClick }) => {
  return (
    <View className={classnames(styles.cell, onClick && styles.pressable)} onClick={onClick}>
      <View className={styles.left}>
        <Text className={classnames(styles.title, danger && styles.dangerTitle)}>{title}</Text>
        {desc ? <Text className={styles.desc}>{desc}</Text> : null}
      </View>
      <View className={styles.right}>
        {extra ? <Text className={styles.extra}>{extra}</Text> : null}
        {arrow ? <Text className={styles.arrow}>›</Text> : null}
      </View>
    </View>
  );
};

export default CellItem;
