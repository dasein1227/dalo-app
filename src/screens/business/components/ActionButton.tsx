// src/screens/business/components/ActionButton.tsx
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useBizStyles } from './bizStyles';

export type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
}) => {
  const styles = useBizStyles();

  return (
  <Pressable style={styles.actionButton} onPress={onPress}>
    {icon}
    <Text style={styles.actionLabel}>{label}</Text>
  </Pressable>
  );
};
