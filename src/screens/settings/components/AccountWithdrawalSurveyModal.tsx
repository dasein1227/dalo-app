import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AccountWithdrawalPayload, AccountWithdrawalReasonOption } from './accountWithdrawal.types';

export default function AccountWithdrawalSurveyModal({
  visible,
  reasons,
  loading,
  colors,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  reasons: AccountWithdrawalReasonOption[];
  loading?: boolean;
  colors: any;
  onClose: () => void;
  onSubmit: (payload: AccountWithdrawalPayload) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [reasonCode, setReasonCode] = useState<string>('');
  const [otherText, setOtherText] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (visible) {
      setReasonCode('');
      setOtherText('');
      setErrorText('');
    }
  }, [visible]);

  const selectedOther = reasonCode === 'other';
  const sortedReasons = useMemo(
    () => [...reasons].sort((a, b) => a.sortOrder - b.sortOrder),
    [reasons],
  );

  const submit = () => {
    if (!reasonCode) {
      setErrorText(t('settings:account.withdrawal.reasonRequired'));
      return;
    }
    const trimmedOther = otherText.trim();
    if (selectedOther && !trimmedOther) {
      setErrorText(t('settings:account.withdrawal.otherRequired'));
      return;
    }
    onSubmit({
      reasonCode,
      reasonText: selectedOther ? trimmedOther : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 18) }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('settings:account.withdrawal.surveyTitle')}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('settings:account.withdrawal.surveyMessage')}
          </Text>

          <ScrollView
            style={styles.reasonScroll}
            contentContainerStyle={styles.reasonContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}> 
                  {t('settings:account.withdrawal.reasonsLoading')}
                </Text>
              </View>
            ) : sortedReasons.length ? (
              sortedReasons.map((reason) => {
                const selected = reasonCode === reason.reasonCode;
                return (
                  <Pressable
                    key={reason.reasonCode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setReasonCode(reason.reasonCode);
                      setErrorText('');
                    }}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      {
                        backgroundColor: selected ? colors.surfaceSubtle : 'transparent',
                        opacity: pressed ? 0.78 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        {
                          borderColor: selected ? colors.controlSelected : colors.border,
                          backgroundColor: selected ? colors.controlSelected : colors.surfaceSubtle,
                        },
                      ]}
                    >
                      {selected ? <Check size={14} color={colors.controlSelectedText} strokeWidth={2.2} /> : null}
                    </View>
                    <Text style={[styles.reasonLabel, { color: colors.textPrimary }]}>{reason.label}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}> 
                {t('settings:account.withdrawal.reasonsEmpty')}
              </Text>
            )}

            {selectedOther ? (
              <TextInput
                value={otherText}
                onChangeText={(next) => {
                  setOtherText(next);
                  if (errorText) setErrorText('');
                }}
                placeholder={t('settings:account.withdrawal.otherPlaceholder')}
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={500}
                style={[
                  styles.otherInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}
                textAlignVertical="top"
              />
            ) : null}
          </ScrollView>

          {errorText ? <Text style={[styles.errorText, { color: colors.dangerText }]}>{errorText}</Text> : null}

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
              disabled={loading || !sortedReasons.length}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: loading || !sortedReasons.length ? colors.saveDisabledBg : colors.danger,
                  opacity: pressed && !loading ? 0.84 : 1,
                },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: loading || !sortedReasons.length ? colors.saveDisabledText : '#FFFFFF' }]}> 
                {t('settings:account.withdrawal.surveyAction')}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '86%',
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
  reasonScroll: {
    marginTop: 16,
  },
  reasonContent: {
    gap: 4,
    paddingBottom: 4,
  },
  reasonRow: {
    minHeight: 46,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  otherInput: {
    minHeight: 86,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    paddingVertical: 24,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
