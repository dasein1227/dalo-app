// src/screens/business/components/ToggleRow.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { styles } from './bizStyles';

export type ToggleRowProps = {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
};

export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  value,
  onChange,
}) => (
  <View style={styles.toggleRow}>
    <Text style={styles.toggleLabel}>{label}</Text>
    <View style={styles.toggleButtons}>
      {/* 예 */}
      <Pressable
        style={[
          styles.toggleButton,
          value === true && styles.toggleButtonActive,
        ]}
        onPress={() => onChange(true)}
      >
        <Text
          style={[
            styles.toggleButtonText,
            value === true && styles.toggleButtonTextActive,
          ]}
        >
          예
        </Text>
      </Pressable>

      {/* 아니오 */}
      <Pressable
        style={[
          styles.toggleButton,
          value === false && styles.toggleButtonActive,
        ]}
        onPress={() => onChange(false)}
      >
        <Text
          style={[
            styles.toggleButtonText,
            value === false && styles.toggleButtonTextActive,
          ]}
        >
          아니오
        </Text>
      </Pressable>

      {/* 미등록 */}
      <Pressable
        style={[
          styles.toggleButton,
          value === null && styles.toggleButtonActiveLight,
        ]}
        onPress={() => onChange(null)}
      >
        <Text
          style={[
            styles.toggleButtonText,
            value === null && styles.toggleButtonTextActiveLight,
          ]}
        >
          미등록
        </Text>
      </Pressable>
    </View>
  </View>
);
