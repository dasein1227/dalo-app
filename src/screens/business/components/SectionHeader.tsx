// src/screens/business/components/SectionHeader.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useBizStyles } from './bizStyles';

type Props = {
  title: string;
  onMore?: () => void;
};

export const SectionHeader: React.FC<Props> = ({ title, onMore }) => {
  const { t } = useTranslation();
  const styles = useBizStyles();

  return (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {onMore && (
      <Pressable
        style={styles.sectionMoreButton}
        onPress={onMore}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={styles.sectionMoreText}>{t('business:common.more')}</Text>
        <ChevronRight size={14} color={styles.__iconMuted.color} />
      </Pressable>
    )}
  </View>
  );
};
