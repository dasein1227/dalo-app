// src/screens/business/components/LabeledInput.tsx
import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { styles } from './bizStyles';

export type LabeledInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
} & Pick<
  TextInputProps,
  'keyboardType' | 'autoCapitalize'
>;

export const LabeledInput: React.FC<LabeledInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
}) => (
  <View style={styles.inputRow}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      style={[styles.input, multiline && styles.inputMultiline]}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
  </View>
);
