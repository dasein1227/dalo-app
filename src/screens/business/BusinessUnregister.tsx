// src/screens/business/BusinessUnregister.tsx

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, AlertTriangle } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

const BG = '#F7F8FA';
const CARD_BG = '#FFFFFF';
const TEXT_MAIN = '#111827';
const TEXT_MUTED = '#6B7280';
const ACCENT = '#FF5A7A';
const HAIRLINE = '#ECEFF4';

type ProfileRow = {
  id: string;
  is_business?: boolean | null;
};

export default function BusinessUnregister() {
  const navigation = useNavigation<any>();

  const [meId, setMeId] = useState<string>('');
  const [isBusiness, setIsBusiness] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

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
        .select('id, is_business')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const row = (data ?? null) as ProfileRow | null;
      setIsBusiness(row?.is_business ?? false);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmUnregister = () => {
    if (!meId) {
      Alert.alert('오류', '유저 정보를 불러오지 못했습니다.');
      return;
    }

    Alert.alert(
      '사업자 등록 해지',
      '정말 사업자 등록을 해지하시겠어요?\n\n비즈니스 전용 기능과 비콘 노출이 제한될 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해지하기',
          style: 'destructive',
          onPress: doUnregister,
        },
      ],
    );
  };

  const doUnregister = async () => {
    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('profiles')
        .update({ is_business: false })
        .eq('id', meId);

      if (error) throw error;

      setIsBusiness(false);

      Alert.alert('해지 완료', '사업자 등록이 해지되었습니다.', [
        {
          text: '확인',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !isBusiness || submitting;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#ffffff"
          translucent={false}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
        translucent={false}
      />

      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          hitSlop={8}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={22} color={TEXT_MAIN} />
        </Pressable>

        <Text style={styles.headerTitle}>사업자 등록 해지</Text>

        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 경고 카드 */}
        <View style={styles.card}>
          <View style={styles.warningRow}>
            <View style={styles.warningIconWrap}>
              <AlertTriangle size={20} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>해지 전에 꼭 확인해 주세요</Text>
              <Text style={styles.cardSubtitle}>
                사업자 등록을 해지하면 CO·ONN 비즈니스 기능 이용에 제한이 생길 수 있어요.
              </Text>
            </View>
          </View>

          <View style={styles.bulletBox}>
            <Text style={styles.bullet}>
              • 비즈니스 비콘 생성 및 관리가 제한됩니다.
            </Text>
            <Text style={styles.bullet}>
              • 추후 다시 사업자 등록을 통해 재신청할 수 있습니다.
            </Text>
            <Text style={styles.bullet}>
              • 이미 노출된 콘텐츠는 서비스 정책에 따라 유지되거나 숨김 처리될 수 있습니다.
            </Text>
          </View>
        </View>

        {/* 상태 안내 */}
        <View style={styles.card}>
          <Text style={styles.label}>현재 상태</Text>
          <Text style={styles.statusText}>
            {isBusiness
              ? '현재 사업자 회원으로 등록된 계정입니다.'
              : '현재 사업자 회원이 아닌 계정입니다.'}
          </Text>
          {!isBusiness && (
            <Text style={styles.statusSub}>
              이미 사업자 해지가 되었거나, 아직 사업자 등록을 하지 않은 계정입니다.
            </Text>
          )}
        </View>

        {/* 해지 버튼 */}
        <Pressable
          style={[
            styles.unregButton,
            disabled && styles.unregButtonDisabled,
          ]}
          disabled={disabled}
          onPress={confirmUnregister}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.unregButtonText}>
              {isBusiness ? '사업자 등록 해지하기' : '사업자 회원이 아닙니다'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: TEXT_MUTED,
  },

  header: {
    height: 54,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.select({ ios: 8, android: 4 }),
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    width: 34,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  headerRight: {
    width: 34,
  },

  scroll: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    padding: 16,
    marginBottom: 14,
  },

  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: TEXT_MUTED,
  },

  bulletBox: {
    marginTop: 12,
  },
  bullet: {
    fontSize: 13,
    color: TEXT_MAIN,
    marginBottom: 4,
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginBottom: 6,
  },
  statusText: {
    fontSize: 14,
    color: TEXT_MAIN,
    marginBottom: 4,
  },
  statusSub: {
    fontSize: 12,
    color: TEXT_MUTED,
  },

  unregButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unregButtonDisabled: {
    backgroundColor: '#FECACA',
  },
  unregButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
