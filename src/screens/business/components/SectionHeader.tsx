// src/screens/business/components/SectionHeader.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { styles } from './bizStyles';

type Props = {
  title: string;
  onMore?: () => void;
};

export const SectionHeader: React.FC<Props> = ({ title, onMore }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {onMore && (
      <Pressable
        style={styles.sectionMoreButton}
        onPress={onMore}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={styles.sectionMoreText}>더보기</Text>
        <ChevronRight size={14} color="#9CA3AF" />
      </Pressable>
    )}
  </View>
);
