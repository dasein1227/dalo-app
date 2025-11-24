// src/screens/legal/TermsConsent.tsx
import React, { useState } from 'react';
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

  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAgree = async () => {
    if (!agreed || busy) return;
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

      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: uid,
            terms_accepted: true,
            terms_accepted_at: now,
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
      {/* 로그인과 톤을 맞춘 그라데이션 (살짝 부드럽게) */}
      <LinearGradient
        colors={['#833ab4', '#fd1d1d', '#fcb045']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 살짝 어두운 오버레이로 채도 정리 */}
      <View style={styles.overlay} />

      <StatusBar style="light" />

      <SafeAreaView style={styles.safe}>
        {/* 상단 바: 최대한 심플하게 */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
          >
            <Text style={styles.backTxt}>
              {t('common.close', '닫기')}
            </Text>
          </Pressable>
          <Text style={styles.topTitle}>
            {t('legal.consent_title', '약관 동의')}
          </Text>
          <View style={{ width: 40 }} />
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
              onPress={() => setAgreed((v) => !v)}
              style={styles.allAgreeRow}
            >
              <View
                style={[
                  styles.checkboxOuter,
                  agreed && styles.checkboxOuterOn,
                ]}
              >
                {agreed && <View style={styles.checkboxInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.allAgreeLabel}>
                  {t('legal.consent_all', '전체 동의')}
                </Text>
                <Text style={styles.allAgreeSub}>
                  {t(
                    'legal.consent_all_desc',
                    '필수 항목(이용약관, 개인정보 처리방침)에 모두 동의합니다.',
                  )}
                </Text>
              </View>
            </Pressable>

            {/* 항목 리스트 (스크롤 가능) */}
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 이용약관 */}
              <View style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <Text style={styles.badgeRequired}>필수</Text>
                  <Text style={styles.itemTitle}>
                    {t('legal.terms_tab', '서비스 이용약관')}
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
              </View>
              <Text style={styles.itemDesc}>
                {t(
                  'legal.terms_desc',
                  '서비스 이용 조건, 계정, 이용 제한, 책임 범위 등에 대한 내용을 포함합니다.',
                )}
              </Text>

              {/* 개인정보 처리방침 */}
              <View style={[styles.itemRow, { marginTop: 10 }]}>
                <View style={styles.itemLeft}>
                  <Text style={styles.badgeRequired}>필수</Text>
                  <Text style={styles.itemTitle}>
                    {t('legal.privacy_tab', '개인정보 처리방침')}
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
              </View>
              <Text style={styles.itemDesc}>
                {t(
                  'legal.privacy_desc',
                  '수집하는 정보, 이용 목적, 보관 기간, 제3자 제공 및 파기 절차를 설명합니다.',
                )}
              </Text>

              {/* 선택 마케팅 (UI 전용) */}
              <View style={[styles.itemRow, { marginTop: 10 }]}>
                <View style={styles.itemLeft}>
                  <Text style={styles.badgeOptional}>선택</Text>
                  <Text style={styles.itemTitle}>
                    {t('legal.marketing_title', '혜택·이벤트 알림 수신')}
                  </Text>
                </View>
              </View>
              <Text style={styles.itemDesc}>
                {t(
                  'legal.marketing_desc',
                  '신규 기능, 이벤트, 할인 및 제휴 소식을 받아보실 수 있습니다. 동의하지 않아도 서비스 이용에는 제한이 없습니다.',
                )}
              </Text>
            </ScrollView>

            {/* CTA 버튼 (Apple 느낌: 활성 시만 은은한 그라데이션) */}
            {agreed && !busy ? (
              <Pressable onPress={handleAgree} style={styles.submitBtnWrap}>
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
              <View style={[styles.submitBtnWrap, styles.submitBtnDisabled]}>
                <Text style={styles.submitBtnDisabledText}>
                  {ctaLabel}
                </Text>
              </View>
            )}

            <Text style={styles.footerNote}>
              {t(
                'legal.consent_footer',
                '추후 설정 > 약관 및 개인정보 메뉴에서 동의 내용을 다시 확인하고 변경하실 수 있습니다.',
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
    backgroundColor: 'rgba(0,0,0,0.14)', // 채도 살짝 눌러서 고급스럽게
  },
  safe: {
    flex: 1,
    alignItems: 'center',
  },

  topRow: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backTxt: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '500',
  },
  topTitle: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '600',
  },

  cardWrap: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    // 카드가 위에서 살짝 떨어진 느낌 (팝업)
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxHeight: 540,
    backgroundColor: '#ffffff',
    borderRadius: 16,
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
    marginBottom: 10,
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
  checkboxOuter: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#9ca3af',
    marginRight: 8,
    marginTop: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  checkboxOuterOn: {
    borderColor: '#ffffff',
  },
  checkboxInner: {
    width: 9,
    height: 9,
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
    paddingBottom: 4,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeRequired: {
    fontSize: 9,
    fontWeight: '700',
    color: '#b91c1c',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
    marginRight: 6,
  },
  badgeOptional: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369a1',
    paddingHorizontal: 5,
    paddingVertical: 2,
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
    marginTop: 3,
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 17,
  },
  linkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
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

