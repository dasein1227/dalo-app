// src/screens/business/components/CategorySection.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useBizStyles } from './bizStyles';
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

const SectionHeader: React.FC<{ title: string }> = ({ title }) => {
  const styles = useBizStyles();

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
};

export const CategorySection: React.FC<CategorySectionProps> = ({
  categoryMajor,
  categoryMinor,
  onPressSelectMajor,
  onPressSelectMinor,
  isAdultOnly,
  onChangeIsAdultOnly,
}) => {
  const { t } = useTranslation();
  const styles = useBizStyles();

  return (
    <>
      {/* ================== 가게 카테고리 ================== */}
      <View style={styles.card}>
        <SectionHeader title={t('business:category.sectionTitle')} />

        {/* 1차 카테고리 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>{t('business:category.majorTitle')}</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressSelectMajor}
          >
            <Text
              style={categoryMajor ? styles.inputValueText : styles.mutedText}
            >
              {categoryMajor || t('business:category.majorPlaceholder')}
            </Text>
          </Pressable>
        </View>

        {/* 2차 카테고리 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>{t('business:category.minorTitle')}</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressSelectMinor}
          >
            <Text
              style={categoryMinor ? styles.inputValueText : styles.mutedText}
            >
              {categoryMinor || t('business:category.minorPlaceholder')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ================== 연령 제한 ================== */}
      <View style={styles.card}>
        <SectionHeader title={t('business:category.ageLimit')} />

        <ToggleRow
          label={t('business:category.adultOnly')}
          value={isAdultOnly}
          onChange={onChangeIsAdultOnly}
        />
      </View>
    </>
  );
};
