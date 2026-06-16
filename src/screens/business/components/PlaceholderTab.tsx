// src/screens/business/components/PlaceholderTab.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useBizStyles } from './bizStyles';

type PlaceholderTabProps = {
  title: string;
  description?: string;
};

const PlaceholderTab: React.FC<PlaceholderTabProps> = ({
  title,
  description,
}) => {
  const { t } = useTranslation();
  const styles = useBizStyles();

  return (
    <View style={styles.tabContent}>
      <View style={styles.emptyBox}>
        <Text style={styles.mutedText}>
          {description || t('business:placeholder.defaultDesc', { title })}
        </Text>
      </View>
    </View>
  );
};

export default PlaceholderTab;
