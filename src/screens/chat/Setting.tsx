// src/screens/chat/Setting.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';

type RouteParams = {
  roomId: string;
  roomName?: string;

  // 비콘 방 설정 값들 (없으면 기본값)
  memo?: string;
  maleCount?: number;
  femaleCount?: number;
  mixedCount?: number;
  totalCount?: number | null;

  // 공개 필터
  publicGender?: 'all' | 'male' | 'female';
  minAge?: number | null;
  maxAge?: number | null;
};

export default function ChatBeaconSettingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params: RouteParams = route.params ?? {};

  const initialRoomName = params.roomName ?? '';
  const [roomName, setRoomName] = useState(initialRoomName);
  const [memo, setMemo] = useState(params.memo ?? '');

  const [male, setMale] = useState(
    params.maleCount != null ? String(params.maleCount) : '0',
  );
  const [female, setFemale] = useState(
    params.femaleCount != null ? String(params.femaleCount) : '0',
  );
  const [mixed, setMixed] = useState(
    params.mixedCount != null ? String(params.mixedCount) : '0',
  );
  const [total, setTotal] = useState(
    params.totalCount != null ? String(params.totalCount) : '',
  );

  const [publicGender, setPublicGender] = useState<
    'all' | 'male' | 'female'
  >(params.publicGender ?? 'all');

  const [minAge, setMinAge] = useState(
    params.minAge != null ? String(params.minAge) : '',
  );
  const [maxAge, setMaxAge] = useState(
    params.maxAge != null ? String(params.maxAge) : '',
  );

  const isSaveEnabled = useMemo(() => {
    // 나중에 조건 더 넣어도 됨
    return true;
  }, []);

  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleSave = () => {
    // TODO: Supabase에 비콘 방 설정 저장하기
    // 일단은 값만 콘솔 / 로깅한다는 느낌으로 남겨두고 뒤로가기
    // console.log({ roomName, memo, male, female, mixed, total, publicGender, minAge, maxAge });

    navigation.goBack();
  };

  const handleLeaveRoom = () => {
    // TODO: 실제 방 나가기 로직 & 확인 Alert
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 공통 StatusBar 정책 */}
      <StatusBar
        backgroundColor="#ffffff"
        barStyle="dark-content"
        translucent={false}
      />

      {/* 상단 헤더 */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top > 0 ? 8 : 4,
            paddingBottom: 8,
          },
        ]}
      >
        <View style={styles.topBarLeft}>
          <Pressable
            onPress={handleGoBack}
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <ChevronLeft size={22} />
          </Pressable>
          <Text style={styles.topBarTitle}>방 설정</Text>
        </View>
        <View style={styles.topBarRight} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 안내 배너 */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              비콘 방의 참가 조건과 방 정보를 설정할 수 있습니다.
            </Text>
          </View>

          {/* 참가자 섹션 - 나중에 실제 리스트 붙이면 됨 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>참가자</Text>
            <View style={styles.card}>
              <View style={styles.participantRow}>
                <View style={styles.participantAvatarPlaceholder}>
                  <Text style={styles.participantInitial}>나</Text>
                </View>
                <View>
                  <Text style={styles.participantName}>영진이 (나)</Text>
                  <Text style={styles.participantMeta}>방장</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 방 설정 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>방 설정</Text>
            <View style={styles.card}>
              <Text style={styles.label}>방 제목</Text>
              <TextInput
                style={styles.textInput}
                value={roomName}
                onChangeText={setRoomName}
                placeholder="상태 문구 / 방 제목"
                placeholderTextColor="#cbd5f5"
              />
            </View>
          </View>

          {/* 메모 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>메모</Text>
            <View style={styles.card}>
              <TextInput
                style={[styles.textInput, styles.memoInput]}
                value={memo}
                onChangeText={setMemo}
                placeholder="간단 메모"
                placeholderTextColor="#cbd5f5"
                multiline
              />
            </View>
          </View>

          {/* 현재 인원 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>현재 인원 (방장이 입력)</Text>
            <View style={styles.card}>
              <View style={styles.row3}>
                <View style={styles.countField}>
                  <Text style={styles.smallLabel}>남</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={styles.countInput}
                    value={male}
                    onChangeText={setMale}
                  />
                </View>
                <View style={styles.countField}>
                  <Text style={styles.smallLabel}>여</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={styles.countInput}
                    value={female}
                    onChangeText={setFemale}
                  />
                </View>
                <View style={styles.countField}>
                  <Text style={styles.smallLabel}>혼성</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={styles.countInput}
                    value={mixed}
                    onChangeText={setMixed}
                  />
                </View>
              </View>

              <View style={[styles.row3, { marginTop: 12 }]}>
                <View style={[styles.countField, { flex: 1 }]}>
                  <Text style={styles.smallLabel}>총</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={styles.countInput}
                    value={total}
                    onChangeText={setTotal}
                    placeholder="(비우면 자동 합산)"
                    placeholderTextColor="#cbd5f5"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* 공개 성별 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>공개 성별</Text>
            <View style={[styles.card, styles.inlineCard]}>
              <Pressable
                style={[
                  styles.chip,
                  publicGender === 'all' && styles.chipActive,
                ]}
                onPress={() => setPublicGender('all')}
              >
                <Text
                  style={[
                    styles.chipText,
                    publicGender === 'all' && styles.chipTextActive,
                  ]}
                >
                  전체
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.chip,
                  publicGender === 'male' && styles.chipActive,
                ]}
                onPress={() => setPublicGender('male')}
              >
                <Text
                  style={[
                    styles.chipText,
                    publicGender === 'male' && styles.chipTextActive,
                  ]}
                >
                  남성
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.chip,
                  publicGender === 'female' && styles.chipActive,
                ]}
                onPress={() => setPublicGender('female')}
              >
                <Text
                  style={[
                    styles.chipText,
                    publicGender === 'female' && styles.chipTextActive,
                  ]}
                >
                  여성
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 연령대 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>연령대</Text>
            <View style={[styles.card, styles.rowAge]}>
              <View style={styles.ageField}>
                <Text style={styles.smallLabel}>최소</Text>
                <TextInput
                  keyboardType="number-pad"
                  style={styles.countInput}
                  value={minAge}
                  onChangeText={setMinAge}
                  placeholder="예: 20"
                  placeholderTextColor="#cbd5f5"
                />
              </View>
              <Text style={styles.ageDash}>~</Text>
              <View style={styles.ageField}>
                <Text style={styles.smallLabel}>최대</Text>
                <TextInput
                  keyboardType="number-pad"
                  style={styles.countInput}
                  value={maxAge}
                  onChangeText={setMaxAge}
                  placeholder="예: 39"
                  placeholderTextColor="#cbd5f5"
                />
              </View>
            </View>
          </View>

          {/* 저장 / 나가기 */}
          <View style={styles.footer}>
            <Pressable
              style={[
                styles.saveButton,
                !isSaveEnabled && styles.saveButtonDisabled,
              ]}
              disabled={!isSaveEnabled}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>설정 저장</Text>
            </Pressable>

            <Pressable
              style={styles.leaveButton}
              onPress={handleLeaveRoom}
            >
              <Text style={styles.leaveButtonText}>방 나가기</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ───────────────── styles ───────────────── */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  /* header */
  topBar: {
    height: 54,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    padding: 6,
    marginRight: 4,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },

  infoBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  infoBannerText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },

  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  inlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  label: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 6,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  memoInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  row3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  countField: {
    flex: 1,
    marginRight: 8,
  },
  smallLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  countInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },

  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  chipText: {
    fontSize: 13,
    color: '#475569',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  rowAge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ageField: {
    flex: 1,
  },
  ageDash: {
    marginHorizontal: 8,
    fontSize: 16,
    color: '#64748b',
  },

  /* 참가자 */
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  participantInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  participantName: {
    fontSize: 14,
    color: '#0f172a',
  },
  participantMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#94a3b8',
  },

  /* footer */
  footer: {
    marginTop: 32,
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  leaveButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#b91c1c',
  },
});
