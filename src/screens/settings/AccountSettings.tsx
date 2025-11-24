// src/screens/settings/AccountSettings.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Info } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

const ACCENT = '#FF5A7A';
const HAIRLINE = '#ECEFF4';
const BG = '#F7F8FA';
const TEXT_MAIN = '#111827';
const TEXT_MUTED = '#6B7280';

type ProfileRow = {
  id: string;
  nickname: string | null;
  follow_id?: string | null;
  phone_number?: string | null;
  phone_verified?: boolean | null;
  show_nickname_to_friends?: boolean | null;
};

function validateFollowId(id: string): string | null {
  if (!id) {
    return '아이디를 입력해 주세요.';
  }

  // 길이
  if (id.length < 2 || id.length > 20) {
    return '아이디는 2~20자 사이여야 합니다.';
  }

  // 허용 문자만 있는지 체크 (영문, 숫자, 한글, . _)
  const allowedRegex = /^[a-z0-9._\uAC00-\uD7A3]+$/;
  if (!allowedRegex.test(id)) {
    return '영문, 숫자, 한글, ".", "_"만 사용할 수 있어요.';
  }

  // 시작/끝 특수문자 불가
  if (/^[._]/.test(id) || /[._]$/.test(id)) {
    return '아이디의 처음과 끝에는 ".", "_"를 사용할 수 없어요.';
  }

  // 연속된 특수문자 (.., __, ._, _.) 금지
  if (/[._]{2,}/.test(id) || /(\._|_\.)/.test(id)) {
    return '특수문자를 연속해서 사용할 수 없어요.';
  }

  // 공백 방지
  if (/\s/.test(id)) {
    return '공백은 사용할 수 없어요.';
  }

  return null;
}

export default function AccountSettings() {
  const navigation = useNavigation<any>();

  const [meId, setMeId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [followId, setFollowId] = useState<string>('');
  const [originalFollowId, setOriginalFollowId] = useState<string>('');
  const [followIdError, setFollowIdError] = useState<string | null>(null);

  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);

  // 새 토글 상태
  const [showNicknameToFriends, setShowNicknameToFriends] =
    useState<boolean>(true);
  const [originalShowNicknameToFriends, setOriginalShowNicknameToFriends] =
    useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);

  const [idInfoOpen, setIdInfoOpen] = useState<boolean>(false); // 팝업용 (필요하면 Modal 연결)

  // ---- 프로필 로드 ----
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        throw new Error('로그인이 필요합니다.');
      }

      setMeId(user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, nickname, follow_id, phone_number, phone_verified, show_nickname_to_friends',
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const row = (data ?? null) as ProfileRow | null;

      setNickname(row?.nickname ?? '');
      const currentId = (row?.follow_id ?? '').toLowerCase();
      setFollowId(currentId);
      setOriginalFollowId(currentId);
      setFollowIdError(null);

      setPhoneNumber(row?.phone_number ?? null);
      setPhoneVerified(!!row?.phone_verified);

      const flag = row?.show_nickname_to_friends ?? true; // 컬럼 없으면 기본 true 라고 가정
      setShowNicknameToFriends(!!flag);
      setOriginalShowNicknameToFriends(!!flag);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- 입력 핸들러 ----
  const handleChangeFollowId = (text: string) => {
    // 사용자가 "@abc" 이런 식으로 넣어도 잘라내기
    const withoutAt = text.startsWith('@') ? text.slice(1) : text;

    // 허용 문자 이외 제거 (영문, 숫자, 한글, . _ 만 살림)
    const cleaned = withoutAt.replace(/[^a-zA-Z0-9._\uAC00-\uD7A3]/g, '');

    const lowered = cleaned.toLowerCase();
    setFollowId(lowered);

    const err = validateFollowId(lowered);
    setFollowIdError(err);
  };

  // ---- 중복 체크 ----
  const checkAvailability = useCallback(
    async (id: string): Promise<string | null> => {
      const basicErr = validateFollowId(id);
      if (basicErr) return basicErr;

      if (!meId) return '유저 정보를 불러오지 못했습니다.';

      try {
        setChecking(true);
        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('follow_id', id)
          .neq('id', meId);

        if (error) {
          console.log('check follow_id error', error);
          return '아이디 중복 확인 중 오류가 발생했습니다.';
        }

        if ((count ?? 0) > 0) {
          return '이미 사용 중인 아이디입니다.';
        }

        return null;
      } finally {
        setChecking(false);
      }
    },
    [meId],
  );

  const handleBlurFollowId = async () => {
    if (!followId) return;
    // 변경된 경우에만 중복 체크
    if (followId === originalFollowId) return;
    const err = await checkAvailability(followId);
    setFollowIdError(err);
  };

  // ---- 저장 ----
  const handleSave = async () => {
    if (!meId) {
      Alert.alert('오류', '유저 정보를 불러오지 못했습니다.');
      return;
    }

    const trimmed = followId.trim().toLowerCase();

    // follow_id 를 바꿨을 때만 형식/중복 검사
    if (trimmed !== originalFollowId) {
      const errBasic = validateFollowId(trimmed);
      if (errBasic) {
        setFollowIdError(errBasic);
        Alert.alert('확인', errBasic);
        return;
      }

      const errDup = await checkAvailability(trimmed);
      if (errDup) {
        setFollowIdError(errDup);
        Alert.alert('중복 확인', errDup);
        return;
      }
    }

    try {
      setSaving(true);

      const payload: Partial<ProfileRow> = {
        show_nickname_to_friends: showNicknameToFriends,
      };
      if (trimmed !== originalFollowId) {
        payload.follow_id = trimmed;
      }

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', meId);

      if (error) throw error;

      setOriginalFollowId(trimmed);
      setFollowId(trimmed);
      setFollowIdError(null);

      setOriginalShowNicknameToFriends(showNicknameToFriends);

      Alert.alert('저장 완료', '계정 정보가 저장되었습니다.');
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    followId !== originalFollowId ||
    showNicknameToFriends !== originalShowNicknameToFriends;

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.headerLeft}
        >
          <ChevronLeft size={22} color={TEXT_MAIN} />
        </Pressable>
        <Text style={styles.headerTitle}>계정 정보</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 안내 텍스트 */}
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>CO·ONN 아이디</Text>
          <Text style={styles.introText}>
            친구가 @아이디로 나를 검색하고 팔로우할 수 있어요.
            {'\n'}한 번 정해두면 나를 찾는 대표 주소가 됩니다.
          </Text>
        </View>

        {/* 아이디 입력 박스 */}
        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>CO·ONN 아이디</Text>

            <Pressable
              style={styles.labelInfoBtn}
              hitSlop={8}
              onPress={() => {
                Alert.alert(
                  '아이디 생성 규칙',
                  [
                    '• 사용 가능: 영문, 숫자, 한글, ".", "_"',
                    '• 길이 2–20자',
                    '• 특수문자 연속 사용 불가 (.., __, ._, _.)',
                    '• 시작/끝에 특수문자 불가',
                    '• 공백 불가',
                    '• 저장 시 소문자로 변환',
                  ].join('\n'),
                );
              }}
            >
              <Info size={18} color={TEXT_MUTED} />
            </Pressable>
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.atSymbol}>@</Text>
            <TextInput
              value={followId}
              onChangeText={handleChangeFollowId}
              onBlur={handleBlurFollowId}
              style={styles.textInput}
              placeholder="아이디 입력 (예: youngjin_coonn)"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
            />
          </View>

          <View style={styles.helperRow}>
            {checking && (
              <Text style={styles.helperChecking}>중복 확인 중…</Text>
            )}
            {!checking && !followIdError && followId.length >= 2 && (
              <Text style={styles.helperOk}>사용 가능한 형식입니다.</Text>
            )}
            {followIdError && (
              <Text style={styles.helperError}>{followIdError}</Text>
            )}
          </View>

          <Text style={styles.subHint}>
            • 아이디는 추후 정책에 따라 변경 횟수가 제한될 수 있어요.
          </Text>
        </View>

        {/* 닉네임 표시 (읽기 전용) */}
        <View style={styles.card}>
          <Text style={styles.subLabel}>현재 닉네임</Text>
          <Text style={styles.subValue}>
            {nickname || '(설정되지 않음)'}
          </Text>
          <Text style={styles.subHint}>
            • 닉네임은 프로필 편집 화면에서 변경할 수 있어요.
          </Text>
        </View>

        {/* ✅ 친구에게 닉네임으로 보일지 토글 */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>친구에게 닉네임으로 표시</Text>
              <Text style={styles.toggleDesc}>
                끄면 모든 사람에게 @아이디로만 보이고,
                {'\n'}켜면 친구 관계인 사람에게는 닉네임으로 보여요.
              </Text>
            </View>
            <Switch
              value={showNicknameToFriends}
              onValueChange={setShowNicknameToFriends}
            />
          </View>
        </View>

        {/* 전화번호 / 재인증 */}
        <View style={styles.card}>
          <Text style={styles.subLabel}>전화번호</Text>

          {phoneNumber ? (
            <Text style={styles.subValue}>
              {phoneNumber} {phoneVerified ? '(인증됨)' : '(미인증)'}
            </Text>
          ) : (
            <Text style={styles.subValue}>(미등록)</Text>
          )}

          <Text style={styles.subHint}>
            • 지인 찾기, 통화 기능을 위해 1회 인증이 필요합니다.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.reverifyButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => navigation.navigate('PhoneVerification')}
          >
            <Text style={styles.reverifyText}>
              {phoneVerified ? '전화번호 재인증하기' : '전화번호 인증하기'}
            </Text>
          </Pressable>
        </View>

        {/* 저장 버튼 */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              (!hasChanges || !!followIdError || saving) &&
                styles.saveButtonDisabled,
              pressed &&
                !saving &&
                hasChanges &&
                !followIdError && { opacity: 0.85 },
            ]}
            onPress={handleSave}
            disabled={!hasChanges || !!followIdError || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>저장하기</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  loadingText: { marginTop: 8, color: '#6b7280' },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: TEXT_MAIN },
  headerLeft: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },

  introBox: {
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT_MAIN,
    marginBottom: 4,
  },
  introText: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 20,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    marginBottom: 12,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  labelInfoBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    backgroundColor: '#F9FAFB',
  },
  atSymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_MAIN,
    paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },

  helperRow: {
    marginTop: 6,
    minHeight: 18,
  },
  helperChecking: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
  helperOk: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  helperError: {
    fontSize: 12,
    color: '#EF4444',
  },

  subHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },

  subLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginBottom: 4,
  },
  subValue: {
    fontSize: 14,
    color: TEXT_MAIN,
    marginBottom: 4,
  },

  // 토글 박스
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleDesc: {
    marginTop: 2,
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 18,
  },

  footer: {
    marginTop: 8,
  },
  saveButton: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  saveButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  reverifyButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reverifyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
