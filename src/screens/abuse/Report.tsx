// src/screens/abuse/Report.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

/**
 * route.params:
 * - target_id: string  (신고 대상 ID — 예: user_id, room_id 등)
 * - target_type: 'user' | 'room' | 'beacon' | 'message'
 */
export default function AbuseReport() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const targetId = route.params?.target_id as string | undefined;
  const targetType = (route.params?.target_type ?? 'user') as
    | 'user'
    | 'room'
    | 'beacon'
    | 'message';

  const [category, setCategory] = useState<string>('기타');
  const [details, setDetails] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const categories = [
    '욕설 / 비방',
    '스팸 / 광고',
    '사기 / 금전 요구',
    '음란물 / 불쾌한 콘텐츠',
    '개인정보 노출',
    '기타',
  ];

  const submit = async () => {
    if (!details.trim()) {
      Alert.alert('신고 사유를 입력하세요.');
      return;
    }
    if (!targetId) {
      Alert.alert('신고 대상을 찾을 수 없습니다.');
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      const { error } = await supabase.from('abuse_reports').insert({
        reporter_id: user.id,
        target_id: targetId,
        target_type: targetType,
        category,
        details: details.trim(),
        status: 'pending', // 기본 상태
      });
      if (error) throw error;

      Alert.alert('신고 완료', '신고가 접수되었습니다. 운영팀이 검토 후 조치합니다.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '신고 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={st.page}>
      <AppHeader title="신고하기" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={st.label}>신고 대상</Text>
          <Text style={st.valueTxt}>
            {targetType === 'user'
              ? `사용자 ID: ${targetId}`
              : targetType === 'room'
              ? `채팅방 ID: ${targetId}`
              : targetType === 'beacon'
              ? `비콘 ID: ${targetId}`
              : `메시지 ID: ${targetId}`}
          </Text>

          <Text style={st.label}>신고 사유</Text>
          <View style={st.catWrap}>
            {categories.map((c) => (
              <Pressable
                key={c}
                style={[st.catBtn, category === c && st.catBtnOn]}
                onPress={() => setCategory(c)}
              >
                <Text style={[st.catTxt, category === c && st.catTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={st.label}>상세 내용</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="신고 사유를 구체적으로 작성해주세요."
            multiline
            style={[st.input, { height: 120 }]}
          />

          <Pressable
            style={[st.btn, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={st.btnTxt}>신고 제출</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ================= Styles ================= */
const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  label: { fontWeight: '700', fontSize: 15, marginTop: 16, color: '#111827' },
  valueTxt: { color: '#6b7280', marginTop: 4, fontWeight: '600' },

  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  catBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  catBtnOn: { backgroundColor: '#111827', borderColor: '#111827' },
  catTxt: { color: '#111827', fontWeight: '700' },
  catTxtOn: { color: '#fff' },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginTop: 8,
  },

  btn: {
    marginTop: 28,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
