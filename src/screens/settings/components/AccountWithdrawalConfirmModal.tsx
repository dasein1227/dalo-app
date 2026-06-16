import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function AccountWithdrawalConfirmModal({
  visible,
  processing,
  colors,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  processing?: boolean;
  colors: any;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyword = t('settings:account.withdrawal.confirmKeyword');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  const canConfirm = value.trim() === keyword && !processing;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={processing ? undefined : onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 18) }]}
      >
        <Pressable style={StyleSheet.absoluteFill} disabled={processing} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('settings:account.withdrawal.confirmTitle')}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('settings:account.withdrawal.confirmMessage')}
          </Text>
          <Text style={[styles.instruction, { color: colors.textPrimary }]}>
            {t('settings:account.withdrawal.confirmInstruction', { keyword })}
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            editable={!processing}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('settings:account.withdrawal.confirmPlaceholder')}
            placeholderTextColor={colors.placeholder}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                backgroundColor: colors.inputBg,
                borderColor: value.length > 0 && !canConfirm ? colors.inputErrorBorder : colors.inputBorder,
              },
            ]}
          />

          <View style={styles.actions}>
            <Pressable
              disabled={processing}
              onPress={onClose}
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: colors.surfaceSubtle, opacity: pressed && !processing ? 0.78 : 1 },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                {t('settings:account.withdrawal.cancel')}
              </Text>
            </Pressable>
            <Pressable
              disabled={!canConfirm}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: canConfirm ? colors.danger : colors.saveDisabledBg,
                  opacity: pressed && canConfirm ? 0.84 : 1,
                },
              ]}
            >
              {processing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryButtonText, { color: canConfirm ? '#FFFFFF' : colors.saveDisabledText }]}> 
                  {t('settings:account.withdrawal.confirmAction')}
                </Text>
              )}
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
  instruction: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  input: {
    height: 50,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 10,
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
