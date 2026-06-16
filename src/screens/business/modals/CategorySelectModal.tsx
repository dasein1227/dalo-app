// src/screens/business/modals/CategorySelectModal.tsx

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const CATEGORY_MAJOR_OPTIONS = [
  '음식점', '호프/펍', '바/라운지', '카페', '클럽', '기타',
];

const CATEGORY_MINOR_OPTIONS: Record<string, string[]> = {
  음식점: ['한식', '중식', '일식', '양식', '분식', '패스트푸드', '치킨', '피자', '고기/구이', '해산물', '뷔페', '기타'],
  '호프/펍': ['호프', '포차', '펍', '수제맥주', '이자카야', '기타'],
  '바/라운지': ['칵테일', '와인바', '위스키바', '라운지', '기타'],
  카페: ['커피', '디저트', '베이커리', '브런치', '테이크아웃', '기타'],
  클럽: ['EDM', '힙합', '라운지/파티', '기타'],
  기타: ['기타'],
};

interface CategorySelectModalProps {
  visible: boolean;
  mode: 'major' | 'minor';
  selectedMajor?: string;
  currentValue?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}

const CategorySelectModal: React.FC<CategorySelectModalProps> = ({
  visible,
  mode,
  selectedMajor,
  currentValue,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const getOptionLabel = (value: string) => t(`business:category.options.${value}`, { defaultValue: value });

  const options =
    mode === 'major'
      ? CATEGORY_MAJOR_OPTIONS
      : selectedMajor
      ? CATEGORY_MINOR_OPTIONS[selectedMajor] ?? []
      : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: 20 + insets.top,
            paddingBottom: 20 + insets.bottom,
          },
        ]}
      >
        <View style={styles.container}>
          <Text style={styles.title}>
            {mode === 'major' ? t('business:category.selectMajorTitle') : t('business:category.selectMinorTitle')}
          </Text>

          {mode === 'minor' && !selectedMajor ? (
            <Text style={styles.emptyText}>
              {t('business:category.majorFirst')}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {options.length === 0 ? (
                <Text style={styles.emptyText}>{t('business:category.noOptions')}</Text>
              ) : (
                options.map((opt) => {
                  const isActive = opt === currentValue;
                  return (
                    <Pressable
                      key={opt}
                      style={[styles.option, isActive && styles.optionActive]}
                      onPress={() => {
                        onSelect(opt);
                        onClose();
                      }}
                    >
                      <Text style={[styles.text, isActive && styles.textActive]}>
                        {getOptionLabel(opt)}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>{t('common:close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    maxHeight: 400,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    padding: 20,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  optionActive: {
    backgroundColor: '#F3F4F6',
  },
  text: {
    fontSize: 15,
    color: '#374151',
  },
  textActive: {
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
});

export default CategorySelectModal;