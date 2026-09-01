import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  content?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 自定义确认弹窗（替代系统 confirm） */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  content,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  if (!visible) return null;

  return (
    <View className={styles.mask} onClick={onCancel}>
      <View className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <Text className={styles.title}>{title}</Text>
        {content ? <Text className={styles.content}>{content}</Text> : null}
        <View className={styles.footer}>
          <View className={classnames(styles.button, styles.cancel)} onClick={onCancel}>
            <Text className={styles.cancelText}>{cancelText}</Text>
          </View>
          <View className={classnames(styles.button, danger ? styles.dangerBtn : styles.confirmBtn)} onClick={onConfirm}>
            <Text className={danger ? styles.dangerText : styles.confirmText}>{confirmText}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default ConfirmModal;
