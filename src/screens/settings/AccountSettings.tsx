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
  friend_code?: string | null;
  phone_number?: string | null;
  phone_verified?: boolean | null;
  show_nickname_to_friends?: boolean | null;
  is_business?: boolean | null;
};

export default function AccountSettings() {
  const navigation = useNavigation<any>();

  const [meId, setMeId] = useState<string>('');

  const [nickname, setNickname] = useState('');

  const [followId, setFollowId] = useState('');
  const [originalFollowId, setOriginalFollowId] = useState('');
  const [followIdError, setFollowIdError] = useState<string | null>(null);
  const [checkingFollow, setCheckingFollow] = useState(false);

  const [friendCode, setFriendCode] = useState('');
  const [originalFriendCode, setOriginalFriendCode] = useState('');
  const [friendCodeError, setFriendCodeError] = useState<string | null>(null);
  const [checkingFriend, setCheckingFriend] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [showNicknameToFriends, setShowNicknameToFriends] = useState(true);
  const [originalShowNicknameToFriends, setOriginalShowNicknameToFriends] =
    useState(true);

  const [isBusiness, setIsBusiness] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------
  // ⚡ VALIDATION
  // ---------------------------------------------------------

  const validateFollowId = (id: string): string | null => {
    if (!id) return '아이디를 입력해 주세요.';
    if (id.length < 2 || id.length > 20) return '아이디는 2~20자 사이여야 합니다.';
    const allowed = /^[a-z0-9._\uAC00-\uD7A3]+$/;
    if (!allowed.test(id)) return '영문, 숫자, 한글, ".", "_"만 사용할 수 있어요.';
    if (/^[._]/.test(id) || /[._]$/.test(id))
      return '아이디의 처음과 끝에는 ".", "_"를 사용할 수 없어요.';
    if (/[._]{2,}|(\._|_\.)/.test(id))
      return '특수문자를 연속해서 사용할 수 없어요.';
    if (/\s/.test(id)) return '공백은 사용할 수 없어요.';
    return null;
  };

  const validateFriendCode = (code: string): string | null => {
    if (!code) return null;
    if (code.length < 4 || code.length > 20)
      return '친구 코드는 4~20자 사이여야 합니다.';
    const regex = /^[a-z0-9_\uAC00-\uD7A3]+$/;
    if (!regex.test(code)) return '영문 소문자, 숫자, 한글, "_"만 사용할 수 있어요.';
    return null;
  };

  // ---------------------------------------------------------
  // ⚡ LOAD PROFILE + 사업자 이중 체크
  // ---------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('로그인이 필요합니다.');
      setMeId(user.id);

      // 1) 프로필 기본 정보
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, nickname, follow_id, friend_code, phone_number, phone_verified, show_nickname_to_friends, is_business'
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const row = (data ?? null) as ProfileRow | null;

      setNickname(row?.nickname ?? '');

      const f = (row?.follow_id ?? '').toLowerCase();
      setFollowId(f);
      setOriginalFollowId(f);

      const fc = (row?.friend_code ?? '').toLowerCase();
      setFriendCode(fc);
      setOriginalFriendCode(fc);

      setPhoneNumber(row?.phone_number ?? null);
      setPhoneVerified(!!row?.phone_verified);

      const flag = row?.show_nickname_to_friends ?? true;
      setShowNicknameToFriends(flag);
      setOriginalShowNicknameToFriends(flag);

      // 기본값: profiles.is_business
      let bizFlag = row?.is_business ?? false;

      // 2) business_registrations 에서 승인 여부 이중 체크
      const { data: reg, error: regError } = await supabase
        .from('business_registrations')
        .select('status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!regError && reg?.status === 'approved') {
        bizFlag = true;
      }

      setIsBusiness(bizFlag);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------
  // ⚡ ID CHANGE
  // ---------------------------------------------------------

  const handleChangeFollowId = (text: string) => {
    const cleaned = text.startsWith('@') ? text.slice(1) : text;
    const filtered = cleaned.replace(/[^a-zA-Z0-9._\uAC00-\uD7A3]/g, '');
    const lowered = filtered.toLowerCase();
    setFollowId(lowered);
    setFollowIdError(validateFollowId(lowered));
  };

  const checkFollowId = useCallback(
    async (id: string) => {
      const basic = validateFollowId(id);
      if (basic) return basic;

      try {
        setCheckingFollow(true);
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('follow_id', id)
          .neq('id', meId);

        if ((count ?? 0) > 0) return '이미 사용 중인 아이디입니다.';
        return null;
      } finally {
        setCheckingFollow(false);
      }
    },
    [meId]
  );

  const handleBlurFollowId = async () => {
    if (!followId || followId === originalFollowId) return;
    const err = await checkFollowId(followId);
    setFollowIdError(err);
  };

  // ---------------------------------------------------------
  // ⚡ FRIEND CODE CHANGE
  // ---------------------------------------------------------

  const handleChangeFriendCode = (text: string) => {
    const noSpace = text.replace(/\s+/g, '').toLowerCase();
    const filtered = noSpace.replace(/[^a-z0-9_\uAC00-\uD7A3]/g, '');
    setFriendCode(filtered);
    setFriendCodeError(validateFriendCode(filtered));
  };

  const checkFriendCode = useCallback(
    async (code: string) => {
      const basic = validateFriendCode(code);
      if (basic) return basic;
      if (!code) return null;

      try {
        setCheckingFriend(true);
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('friend_code', code)
          .neq('id', meId);

        if ((count ?? 0) > 0) return '이미 사용 중인 친구 코드입니다.';
        return null;
      } finally {
        setCheckingFriend(false);
      }
    },
    [meId]
  );

  const handleBlurFriendCode = async () => {
    if (friendCode === originalFriendCode) return;
    if (!friendCode) {
      setFriendCodeError(null);
      return;
    }
    const err = await checkFriendCode(friendCode);
    setFriendCodeError(err);
  };

  // ---------------------------------------------------------
  // ⚡ SAVE
  // ---------------------------------------------------------

  const handleSave = async () => {
    try {
      setSaving(true);

      const f = followId.trim().toLowerCase();
      const fc = friendCode.trim().toLowerCase();

      if (f !== originalFollowId) {
        const e1 = validateFollowId(f);
        if (e1) return Alert.alert('확인', e1);
        const e2 = await checkFollowId(f);
        if (e2) return Alert.alert('중복 확인', e2);
      }

      if (fc !== originalFriendCode) {
        const e1 = validateFriendCode(fc);
        if (e1) return Alert.alert('확인', e1);
        const e2 = await checkFriendCode(fc);
        if (e2) return Alert.alert('중복 확인', e2);
      }

      const payload: any = {
        show_nickname_to_friends: showNicknameToFriends,
      };

      if (f !== originalFollowId) payload.follow_id = f;
      if (fc !== originalFriendCode) payload.friend_code = fc || null;

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', meId);

      if (error) throw error;

      setOriginalFollowId(f);
      setOriginalFriendCode(fc);
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
    friendCode !== originalFriendCode ||
    showNicknameToFriends !== originalShowNicknameToFriends;

  // ---------------------------------------------------------
  // ⚡ LOADING
  // ---------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------
  // ⚡ RENDER
  // ---------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          hitSlop={8}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={22} color={TEXT_MAIN} />
        </Pressable>

        <Text style={styles.headerTitle}>계정 정보</Text>

        <View style={styles.headerRight}>
          {isBusiness ? (
            <Pressable
              hitSlop={8}
              style={styles.bizBtn}
              onPress={() => navigation.navigate('BusinessUnregister')}
            >
              <Text style={styles.bizBtnDanger}>사업자 해지</Text>
            </Pressable>
          ) : (
            <Pressable
              hitSlop={8}
              style={styles.bizBtn}
              onPress={() => navigation.navigate('BusinessRegister')}
            >
              <Text style={styles.bizBtnText}>사업자 등록</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* BODY */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* INTRO */}
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>CO·ONN 아이디 & 친구 코드</Text>
          <Text style={styles.introText}>
            • @아이디는 공개 프로필과 팔로우에 사용돼요.{'\n'}
            • 친구 코드는 내가 알려준 사람만 나에게 친구 요청을 보낼 수 있어요.
          </Text>
        </View>

        {/* FOLLOW ID */}
        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>CO·ONN 아이디</Text>
            <Pressable
              style={styles.labelInfoBtn}
              hitSlop={8}
              onPress={() =>
                Alert.alert(
                  '아이디 규칙',
                  [
                    '• 사용 가능: 영문, 숫자, 한글, ".", "_"',
                    '• 길이 2–20자',
                    '• 특수문자 연속 불가',
                    '• 시작/끝 특수문자 불가',
                    '• 공백 없음',
                  ].join('\n')
                )
              }
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
              placeholder="아이디 입력"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.helperRow}>
            {checkingFollow && (
              <Text style={styles.helperChecking}>중복 확인 중…</Text>
            )}
            {!checkingFollow && !followIdError && followId.length >= 2 && (
              <Text style={styles.helperOk}>사용 가능</Text>
            )}
            {followIdError && (
              <Text style={styles.helperError}>{followIdError}</Text>
            )}
          </View>
        </View>

        {/* FRIEND CODE */}
        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>친구 코드</Text>
            <Pressable
              style={styles.labelInfoBtn}
              hitSlop={8}
              onPress={() =>
                Alert.alert(
                  '친구 코드 규칙',
                  [
                    '• 영문 소문자, 숫자, 한글, "_" 사용 가능',
                    '• 길이 4–20자',
                    '• 공백 없음',
                  ].join('\n')
                )
              }
            >
              <Info size={18} color={TEXT_MUTED} />
            </Pressable>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              value={friendCode}
              onChangeText={handleChangeFriendCode}
              onBlur={handleBlurFriendCode}
              style={styles.textInput}
              placeholder="친구 코드 입력"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.helperRow}>
            {checkingFriend && (
              <Text style={styles.helperChecking}>중복 확인 중…</Text>
            )}
            {!checkingFriend &&
              !friendCodeError &&
              friendCode.length >= 4 && (
                <Text style={styles.helperOk}>사용 가능</Text>
              )}
            {friendCodeError && (
              <Text style={styles.helperError}>{friendCodeError}</Text>
            )}
          </View>
        </View>

        {/* NICKNAME */}
        <View style={styles.card}>
          <Text style={styles.subLabel}>현재 닉네임</Text>
          <Text style={styles.subValue}>{nickname || '(설정되지 않음)'}</Text>
          <Text style={styles.subHint}>프로필 편집에서 변경할 수 있어요.</Text>
        </View>

        {/* NICKNAME TOGGLE */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>친구에게 닉네임으로 표시</Text>
              <Text style={styles.toggleDesc}>
                끄면 모든 사람에게 @아이디로만 표시됩니다.
              </Text>
            </View>

            <Switch
              value={showNicknameToFriends}
              onValueChange={setShowNicknameToFriends}
            />
          </View>
        </View>

        {/* PHONE NUMBER */}
        <View style={styles.card}>
          <Text style={styles.subLabel}>전화번호</Text>

          <Text style={styles.subValue}>
            {phoneNumber
              ? `${phoneNumber} ${phoneVerified ? '(인증됨)' : '(미인증)'}`
              : '(미등록)'}
          </Text>

          <Pressable
            style={styles.reverifyButton}
            onPress={() => navigation.navigate('PhoneVerification')}
          >
            <Text style={styles.reverifyText}>
              {phoneVerified ? '전화번호 재인증하기' : '전화번호 인증하기'}
            </Text>
          </Pressable>
        </View>

        {/* SAVE */}
        <View style={styles.footer}>
          <Pressable
            style={[
              styles.saveButton,
              (!hasChanges ||
                !!followIdError ||
                !!friendCodeError ||
                saving) &&
                styles.saveButtonDisabled,
            ]}
            disabled={
              !hasChanges || !!followIdError || !!friendCodeError || saving
            }
            onPress={handleSave}
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

// ---------------------------------------------------------
// ⭐ STYLES
// ---------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 8, color: TEXT_MUTED },

  header: {
    height: 54,
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 8, android: 4 }),
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerLeft: { width: 34, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  headerRight: { width: 70, alignItems: 'flex-end' },

  bizBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  bizBtnText: { fontSize: 12, fontWeight: '700', color: ACCENT },
  bizBtnDanger: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 40,
  },

  introBox: { marginBottom: 16 },
  introTitle: { fontSize: 16, fontWeight: '800', color: TEXT_MAIN },
  introText: { fontSize: 13, color: TEXT_MUTED, lineHeight: 20, marginTop: 4 },

  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    marginBottom: 12,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  label: { fontSize: 14, fontWeight: '700', color: TEXT_MAIN },

  labelInfoBtn: { paddingHorizontal: 4, paddingVertical: 2 },

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
    color: TEXT_MUTED,
    marginRight: 4,
  },

  textInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_MAIN,
    paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },

  helperRow: { minHeight: 18, marginTop: 4 },
  helperChecking: { fontSize: 12, color: TEXT_MUTED },
  helperOk: { fontSize: 12, color: '#16A34A', fontWeight: '700' },
  helperError: { fontSize: 12, color: '#EF4444' },

  subLabel: { fontSize: 13, fontWeight: '700', color: TEXT_MAIN },
  subValue: { fontSize: 14, color: TEXT_MAIN, marginTop: 2 },
  subHint: { fontSize: 12, color: TEXT_MUTED, marginTop: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleDesc: { fontSize: 12, color: TEXT_MUTED, marginTop: 4 },

  reverifyButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  reverifyText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  footer: { marginTop: 8 },

  saveButton: {
    backgroundColor: ACCENT,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: '#FCA5A5' },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
