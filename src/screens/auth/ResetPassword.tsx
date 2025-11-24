// src/screens/auth/ResetPassword.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import AppHeader from '@/components/AppHeader';
import { useTranslation } from 'react-i18next';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const sendReset = useCallback(async () => {
    const e = email.trim();
    if (!e || !e.includes('@')) {
      Alert.alert(t('errors.common', '오류'), t('auth.invalidEmail', '유효한 이메일을 입력해주세요.'));
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: `${process.env.EXPO_PUBLIC_APP_URL}/auth/reset-callback`,
      });
      if (error) throw error;
      Alert.alert(
        t('auth.resetSent', '비밀번호 재설정 메일 발송'),
        t('auth.resetSentDesc', '입력하신 이메일로 재설정 링크를 보냈습니다.')
      );
      setEmail('');
    } catch (err: any) {
      Alert.alert(t('errors.common', '오류'), err.message ?? String(err));
    } finally {
      setSending(false);
    }
  }, [email, t]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <AppHeader title={t('auth.resetPassword', '비밀번호 재설정')} showBack />

      <View style={styles.content}>
        <Text style={styles.desc}>
          {t(
            'auth.resetDesc',
            '가입 시 사용한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.'
          )}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.emailPlaceholder', '이메일 주소')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Pressable
          style={[styles.btn, sending && { opacity: 0.6 }]}
          onPress={sendReset}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnTxt}>{t('auth.sendLink', '재설정 링크 보내기')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 16 },
  desc: { color: '#6b7280', fontSize: 14, marginBottom: 16 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
