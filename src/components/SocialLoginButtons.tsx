import React from 'react';
import { View, Platform, Pressable, Text, Image, StyleSheet } from 'react-native';

type Props = {
  loading?: boolean;
  onApple?: () => void;      // iOS에서만 전달(부모에서 분기)
  onGoogle?: () => void;
  onFacebook?: () => void;   // ✅ 추가
  onKakao?: () => void;
  onPhone?: () => void;
  onEmail?: () => void;
};

const BTN_H = 52;
const RADIUS = 14;

export default function SocialLoginButtons({
  loading = false,
  onApple,
  onGoogle,
  onFacebook,
  onKakao,
  onPhone,
  onEmail,
}: Props) {
  return (
    <View style={styles.wrap}>
      {/* Apple: iOS & onApple 있을 때만 노출 */}
      {Platform.OS === 'ios' && !!onApple && (
        <Pressable
          onPress={onApple}
          disabled={loading}
          style={({ pressed }) => [styles.btn, styles.apple, pressed && styles.pressed, loading && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>  Sign in with Apple</Text>
        </Pressable>
      )}

      {/* Google: 흰 배경 + 컬러 G */}
      {!!onGoogle && (
        <Pressable
          onPress={onGoogle}
          disabled={loading}
          style={({ pressed }) => [styles.btn, styles.google, pressed && styles.pressed, loading && styles.disabled]}
        >
          <View style={styles.row}>
            <Image
              // 로컬 아이콘이 있으면 require(...)로 교체 추천
              source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg' }}
              style={styles.icon}
            />
            <Text style={[styles.btnText, { color: '#1f1f1f' }]}>Sign in with Google</Text>
          </View>
        </Pressable>
      )}

      {/* Facebook: 파랑 배경 + 흰 텍스트 */}
      {!!onFacebook && (
        <Pressable
          onPress={onFacebook}
          disabled={loading}
          style={({ pressed }) => [styles.btn, styles.facebook, pressed && styles.pressed, loading && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>Continue with Facebook</Text>
        </Pressable>
      )}

      {/* Kakao: 노랑 배경 + 검정 텍스트 */}
      {!!onKakao && (
        <Pressable
          onPress={onKakao}
          disabled={loading}
          style={({ pressed }) => [styles.btn, styles.kakao, pressed && styles.pressed, loading && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: '#191600' }]}>카카오로 계속하기</Text>
        </Pressable>
      )}

      {/* Phone */}
      {!!onPhone && (
        <Pressable
          onPress={onPhone}
          disabled={loading}
          style={({ pressed }) => [styles.btn, styles.phone, pressed && styles.pressed, loading && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>전화번호로 로그인</Text>
        </Pressable>
      )}

      {/* Email */}
      {!!onEmail && (
        <Pressable
          onPress={onEmail}
          disabled={loading}
          style={({ pressed }) => [styles.btn, styles.email, pressed && styles.pressed, loading && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>이메일로 로그인</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '86%', gap: 12, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btn: {
    height: BTN_H,
    borderRadius: RADIUS,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88, transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.7 },

  icon: { width: 20, height: 20, resizeMode: 'contain', marginRight: 8 },

  // Brand tokens
  apple: { backgroundColor: '#000' },
  google: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E6E6' },
  facebook: { backgroundColor: '#1877F2' }, // ✅ 추가
  kakao: { backgroundColor: '#FEE500' },
  phone: { backgroundColor: '#2F80ED' },
  email: { backgroundColor: '#9E9E9E' },

  btnText: { fontSize: 16, fontWeight: '600' },
});
