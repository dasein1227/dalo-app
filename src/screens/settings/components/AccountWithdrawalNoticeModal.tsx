import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function AccountWithdrawalNoticeModal({
  visible,
  loading,
  colors,
  onClose,
  onContinue,
}: {
  visible: boolean;
  loading?: boolean;
  colors: any;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (visible) setChecked(false);
  }, [visible]);

  const items = [
    t('settings:account.withdrawal.noticeItemProfile'),
    t('settings:account.withdrawal.noticeItemChat'),
    t('settings:account.withdrawal.noticeItemRejoin'),
    t('settings:account.withdrawal.noticeItemIdentifier'),
  ];

  const canContinue = checked && !loading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 18) }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('settings:account.withdrawal.noticeTitle')}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('settings:account.withdrawal.noticeMessage')}
          </Text>

          <View style={styles.noticeList}>
            {items.map((item) => (
              <View key={item} style={styles.noticeItem}>
                <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                <Text style={[styles.noticeText, { color: colors.textPrimary }]}>{item}</Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => setChecked((prev) => !prev)}
            style={styles.checkRow}
          >
            <View
              style={[
                styles.checkBox,
                {
                  backgroundColor: checked ? colors.controlSelected : colors.surfaceSubtle,
                  borderColor: checked ? colors.controlSelected : colors.border,
                },
              ]}
            >
              {checked ? <Check size={15} color={colors.controlSelectedText} strokeWidth={2.2} /> : null}
            </View>
            <Text style={[styles.checkText, { color: colors.textPrimary }]}>
              {t('settings:account.withdrawal.noticeAcknowledge')}
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: colors.surfaceSubtle, opacity: pressed ? 0.78 : 1 },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                {t('settings:account.withdrawal.cancel')}
              </Text>
            </Pressable>
            <Pressable
              disabled={!canContinue}
              onPress={onContinue}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: canContinue ? colors.danger : colors.saveDisabledBg,
                  opacity: pressed && canContinue ? 0.84 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.controlSelectedText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: canContinue ? '#FFFFFF' : colors.saveDisabledText }]}> 
                  {t('settings:account.withdrawal.continue')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: Platform.OS === 'ios' ? 0.16 : 0,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  noticeList: {
    gap: 10,
    marginTop: 18,
  },
  noticeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 4,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  primaryButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
});
