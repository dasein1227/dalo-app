// src/screens/business/components/TabButton.tsx
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useBizStyles } from './bizStyles';

export type TabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export const TabButton: React.FC<TabButtonProps> = ({
  label,
  active,
  onPress,
}) => {
  const styles = useBizStyles();

  return (
  <Pressable
    style={[styles.tabButton, active && styles.tabButtonActive]}
    onPress={onPress}
  >
    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
      {label}
    </Text>
  </Pressable>
  );
};
