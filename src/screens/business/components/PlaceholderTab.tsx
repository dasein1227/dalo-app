// src/screens/business/components/PlaceholderTab.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './bizStyles';

type PlaceholderTabProps = {
  title: string;
  description?: string;
};

const PlaceholderTab: React.FC<PlaceholderTabProps> = ({
  title,
  description,
}) => {
  return (
    <View style={styles.tabContent}>
      <View style={styles.emptyBox}>
        <Text style={styles.mutedText}>
          {description || `${title} 기능은 추후 연결 예정입니다.`}
        </Text>
      </View>
    </View>
  );
};

export default PlaceholderTab;
