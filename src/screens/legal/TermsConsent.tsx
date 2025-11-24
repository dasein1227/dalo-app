// src/screens/legal/TermsConsent.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TermsConsent() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  // 개별 동의 상태
  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false); // 선택

  const [busy, setBusy] = useState(false);

  // 전체 동의 ↔ 개별 항목 동기화
  useEffect(() => {
    const allOn = agreeTerms && agreePrivacy && agreeMarketing;
    if (agreeAll !== allOn) {
      setAgreeAll(allOn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreeTerms, agreePrivacy, agreeMarketing]);

  const toggleAll = () => {
    const next = !agreeAll;
    setAgreeAll(next);
    setAgreeTerms(next);
    setAgreePrivacy(next);
    setAgreeMarketing(next);
  };

  const canSubmit = agreeTerms && agreePrivacy && !busy;

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // 온보딩 중 바로 들어온 경우 로그인 화면로 복귀
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' as any }],
      });
    }
  };

  const handleAgree = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        Alert.alert(
          t('common.error', '오류'),
          t('legal.error_no_user', '로그인 정보가 없습니다.'),
        );
        return;
      }

      const now = new Date().toISOString();

      // 필수 동의 저장 (선택 마케팅은 추후 컬럼 생기면 연동)
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: uid,
            terms_accepted: true,
            terms_accepted_at: now,
            // marketing_opt_in: agreeMarketing, // 나중에 컬럼 생기면 사용
          },
          { onConflict: 'user_id' },
        );

      if (error) {
        console.warn('terms upsert error:', error);
        Alert.alert(
          t('common.error', '오류'),
          t('legal.error_save', '동의 저장 중 문제가 발생했습니다.'),
        );
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } finally {
      setBusy(false);
    }
  };

  const ctaLabel = busy
    ? t('legal.processing', '처리 중...')
    : t('legal.consent_cta', '동의하고 계속하기');

  return (
    <View style={styles.root}>
      {/* 로그인과 톤을 맞춘 그라데이션 */}
      <LinearGradient
        colors={['#833ab4', '#fd1d1d', '#fcb045']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 채도 살짝 눌러주는 오버레이 */}
      <View style={styles.overlay} />
      <StatusBar style="light" />

      <SafeAreaView style={styles.safe}>
        {/* 상단: Close만 (Apple 느낌으로 최소화) */}
        <View style={styles.topRow}>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
          >
            <Text style={styles.backTxt}>
              {t('common.close', '닫기')}
            </Text>
          </Pressable>
          <View />
        </View>

        {/* 중앙 플로팅 카드 */}
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            {/* 상단 요약 */}
            <Text style={styles.summaryTitle}>
              {t(
                'legal.consent_summary_title',
                'CO·ONN 이용을 위한 필수 동의',
              )}
            </Text>
            <Text style={styles.summaryText}>
              {t(
                'legal.consent_summary_body',
                '서비스 이용약관 및 개인정보 처리방침에 동의해 주시면 CO·ONN의 위치 기반 소셜 기능을 이용하실 수 있습니다.',
              )}
            </Text>
            <Text style={styles.summaryMeta}>
              {t(
                'legal.last_updated',
                '최종 업데이트: 2025. 11. 01',
              )}
            </Text>

            {/* 전체 동의 */}
            <Pressable
              onPress={toggleAll}
              style={styles.allAgreeRow}
            >
              <View
                style={[
                  styles.checkboxOuterBig,
                  agreeAll && styles.checkboxOuterBigOn,
                ]}
              >
                {agreeAll && <View style={styles.checkboxInnerBig} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.allAgreeLabel}>
                  {t('legal.consent_all', '전체 동의')}
                </Text>
                <Text style={styles.allAgreeSub}>
                  {t(
                    'legal.consent_all_desc',
                    '필수 및 선택 항목에 모두 동의합니다. 각 항목은 아래에서 개별로 변경할 수 있습니다.',
                  )}
                </Text>
              </View>
            </Pressable>

            {/* 항목 리스트 */}
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {/* (필수) 서비스 이용약관 */}
              <Pressable
                style={styles.itemRow}
                onPress={() => setAgreeTerms((v) => !v)}
              >
                <View style={styles.itemCheckCol}>
                  <View
                    style={[
                      styles.checkboxSm,
                      agreeTerms && styles.checkboxSmOn,
                    ]}
                  >
                    {agreeTerms && (
                      <View style={styles.checkboxSmInner} />
                    )}
                  </View>
                </View>
                <View style={styles.itemTextCol}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.badgeRequired}>필수</Text>
                    <Text style={styles.itemTitle}>
                      {t('legal.terms_tab', '서비스 이용약관')}
                    </Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    {t(
                      'legal.terms_desc',
                      '서비스 이용 조건, 계정, 이용 제한, 책임 범위 등에 대한 내용을 포함합니다.',
                    )}
                  </Text>
                </View>
                <Pressable
                  onPress={() => navigation.navigate('TermsPrivacy')}
                  hitSlop={8}
                >
                  <Text style={styles.linkText}>
                    {t('legal.view_detail', '보기')}
                  </Text>
                </Pressable>
              </Pressable>

              {/* (필수) 개인정보 처리방침 */}
              <Pressable
                style={styles.itemRow}
                onPress={() => setAgreePrivacy((v) => !v)}
              >
                <View style={styles.itemCheckCol}>
                  <View
                    style={[
                      styles.checkboxSm,
                      agreePrivacy && styles.checkboxSmOn,
                    ]}
                  >
                    {agreePrivacy && (
                      <View style={styles.checkboxSmInner} />
                    )}
                  </View>
                </View>
                <View style={styles.itemTextCol}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.badgeRequired}>필수</Text>
                    <Text style={styles.itemTitle}>
                      {t('legal.privacy_tab', '개인정보 처리방침')}
                    </Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    {t(
                      'legal.privacy_desc',
                      '수집하는 정보, 이용 목적, 보관 기간, 제3자 제공 및 파기 절차를 설명합니다.',
                    )}
                  </Text>
                </View>
                <Pressable
                  onPress={() => navigation.navigate('TermsPrivacy')}
                  hitSlop={8}
                >
                  <Text style={styles.linkText}>
                    {t('legal.view_detail', '보기')}
                  </Text>
                </Pressable>
              </Pressable>

              {/* (선택) 마케팅 알림 */}
              <Pressable
                style={styles.itemRow}
                onPress={() => setAgreeMarketing((v) => !v)}
              >
                <View style={styles.itemCheckCol}>
                  <View
                    style={[
                      styles.checkboxSm,
                      agreeMarketing && styles.checkboxSmOn,
                    ]}
                  >
                    {agreeMarketing && (
                      <View style={styles.checkboxSmInner} />
                    )}
                  </View>
                </View>
                <View style={styles.itemTextCol}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.badgeOptional}>선택</Text>
                    <Text style={styles.itemTitle}>
                      {t('legal.marketing_title', '혜택·이벤트 알림 수신')}
                    </Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    {t(
                      'legal.marketing_desc',
                      '신규 기능, 이벤트, 할인 및 제휴 소식을 받아보실 수 있습니다. 동의하지 않아도 서비스 이용에는 제한이 없습니다.',
                    )}
                  </Text>
                </View>
                <View style={{ width: 32 }} />
              </Pressable>
            </ScrollView>

            {/* CTA */}
            {canSubmit ? (
              <Pressable
                onPress={handleAgree}
                style={styles.submitBtnWrap}
              >
                <LinearGradient
                  colors={['#111827', '#4b5563']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitBtnGrad}
                >
                  <Text style={styles.submitBtnText}>
                    {ctaLabel}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View
                style={[
                  styles.submitBtnWrap,
                  styles.submitBtnDisabled,
                ]}
              >
                <Text style={styles.submitBtnDisabledText}>
                  {ctaLabel}
                </Text>
              </View>
            )}

            <Text style={styles.footerNote}>
              {t(
                'legal.consent_footer',
                '추후 설정 > 약관 및 개인정보 메뉴에서 언제든지 동의 내용을 다시 확인하고 변경하실 수 있습니다.',
              )}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  safe: {
    flex: 1,
    alignItems: 'center',
  },

  topRow: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backTxt: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '500',
  },

  cardWrap: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxHeight: 560,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,253,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 4,
  },
  summaryMeta: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 8,
  },

  allAgreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10,
  },
  checkboxOuterBig: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: '#9ca3af',
    marginRight: 9,
    marginTop: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  checkboxOuterBigOn: {
    borderColor: '#ffffff',
  },
  checkboxInnerBig: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  allAgreeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  allAgreeSub: {
    fontSize: 11,
    color: '#e5e7eb',
  },

  listScroll: {
    flexGrow: 0,
    marginTop: 2,
    marginBottom: 6,
  },
  listContent: {
    paddingBottom: 2,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
  },
  itemCheckCol: {
    paddingTop: 2,
    marginRight: 4,
  },
  itemTextCol: {
    flex: 1,
    paddingRight: 6,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  checkboxSm: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.2,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxSmOn: {
    borderColor: '#111827',
  },
  checkboxSmInner: {
    width: 8,
    height: 8,
    borderRadius: 2.5,
    backgroundColor: '#111827',
  },
  badgeRequired: {
    fontSize: 9,
    fontWeight: '700',
    color: '#b91c1c',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
    marginRight: 6,
  },
  badgeOptional: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369a1',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    marginRight: 6,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  itemDesc: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 17,
    marginTop: 1,
  },
  linkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    paddingTop: 2,
  },

  submitBtnWrap: {
    marginTop: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  submitBtnGrad: {
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  submitBtnDisabled: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabledText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
  },

  footerNote: {
    marginTop: 4,
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
