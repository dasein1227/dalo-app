// src/screens/business/components/CategorySection.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { styles } from './bizStyles';
import { ToggleRow } from './ToggleRow';

type CategorySectionProps = {
  // 카테고리
  categoryMajor: string;
  categoryMinor: string;
  onPressSelectMajor: () => void;
  onPressSelectMinor: () => void;

  // 19세 이상 업소 여부
  isAdultOnly: boolean | null;
  onChangeIsAdultOnly: (value: boolean | null) => void;
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

export const CategorySection: React.FC<CategorySectionProps> = ({
  categoryMajor,
  categoryMinor,
  onPressSelectMajor,
  onPressSelectMinor,
  isAdultOnly,
  onChangeIsAdultOnly,
}) => {
  return (
    <>
      {/* ================== 가게 카테고리 ================== */}
      <View style={styles.card}>
        <SectionHeader title="가게 카테고리" />

        {/* 1차 카테고리 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>주요 카테고리</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressSelectMajor}
          >
            <Text
              style={categoryMajor ? { color: '#111827' } : styles.mutedText}
            >
              {categoryMajor || '카테고리 선택'}
            </Text>
          </Pressable>
        </View>

        {/* 2차 카테고리 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>세부 카테고리</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressSelectMinor}
          >
            <Text
              style={categoryMinor ? { color: '#111827' } : styles.mutedText}
            >
              {categoryMinor || '세부 카테고리 선택'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ================== 연령 제한 ================== */}
      <View style={styles.card}>
        <SectionHeader title="연령 제한" />

        <ToggleRow
          label="19세 이상 업소 여부"
          value={isAdultOnly}
          onChange={onChangeIsAdultOnly}
        />
      </View>
    </>
  );
};
