import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

interface EmptyProps {
  text?: string;
}

const Empty: React.FC<EmptyProps> = ({ text = '暂无内容' }) => {
  return (
    <View className={styles.container}>
      <Text className={styles.icon}>◌</Text>
      <Text className={styles.text}>{text}</Text>
    </View>
  );
};

export default Empty;
