// src/screens/settings/Home.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../../lib/i18n';
import { getInitialLang, saveLang, AppLang } from '../../lib/lang';
import { supabase } from '../../lib/supabase';
import {
  Search as SearchIcon,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react-native';

type ProfileRow = {
  id: string; // auth uid
  user_id?: string | null;
  nickname: string | null;
  avatar_url: string | null;
  preferred_lang?: string | null;

  auto_translate_default?: boolean | null;
  show_original_default?: boolean | null;
  beacon_profile_public_default?: boolean | null;

  terms_accepted?: boolean | null;
  is_admin?: boolean | null;

  translation_plan?: 'free' | 'basic' | 'premium' | null;
};

const ACCENT = '#FF5A7A';
const HAIRLINE = '#ECEFF4';
const BG = '#F7F8FA';

const LANGS: { code: AppLang | string; native: string }[] = [
  { code: 'ar', native: 'العربية' },
  { code: 'de', native: 'Deutsch' },
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'fr', native: 'Français' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'id', native: 'Bahasa Indonesia' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'pt', native: 'Português' },
  { code: 'ru', native: 'Русский' },
  { code: 'zh', native: '中文' },
];

function splitLangs(selected: string) {
  const cur = LANGS.find(l => l.code === selected);
  const rest = LANGS.filter(l => l.code !== selected);
  return { current: cur, others: rest };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ListRow({
  left,
  right,
  onPress,
  last,
  disabled,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && onPress && { opacity: 0.6 },
      ]}
    >
      <View style={{ flex: 1 }}>{left}</View>
      {right}
    </Pressable>
  );
}

export default function SettingsHome() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [meId, setMeId] = useState<string>('');
  const [prof, setProf] = useState<ProfileRow | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // 언어
  const [lang, setLang] = useState<AppLang | string>('en');
  const [langOpen, setLangOpen] = useState(false);

  // DB 토글 상태
  const [profilePublicDefault, setProfilePublicDefault] = useState(false);
  const [autoTranslateDefault, setAutoTranslateDefault] = useState(false);
  const [showOriginalDefault, setShowOriginalDefault] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t('errors.auth.loginRequired', '로그인이 필요합니다.'));

      setMeId(user.id);
      setAuthEmail(user.email ?? null);

      const { data: p, error } = await supabase
        .from('profiles')
        .select(
          [
            'id',
            'user_id',
            'nickname',
            'avatar_url',
            'preferred_lang',
            'auto_translate_default',
            'show_original_default',
            'beacon_profile_public_default',
            'terms_accepted',
            'is_admin',
          ].join(','),
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const row = (p ?? null) as ProfileRow | null;
      setProf(row);

      setProfilePublicDefault(!!row?.beacon_profile_public_default);
      setAutoTranslateDefault(!!row?.auto_translate_default);
      setShowOriginalDefault(
        row?.show_original_default === undefined || row?.show_original_default === null
          ? true
          : !!row.show_original_default,
      );
      setIsAdmin(!!row?.is_admin);

      // 언어 초기화 (스토리지 → DB → i18n 순)
      const initial = await getInitialLang();
      setLang(String(initial || row?.preferred_lang || i18n.language || 'en'));
    } catch (e: any) {
      Alert.alert(t('errors.common', '오류'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfileFlags = async (patch: Partial<ProfileRow>) => {
    if (!meId) return;
    const prev = {
      beacon_profile_public_default: profilePublicDefault,
      auto_translate_default: autoTranslateDefault,
      show_original_default: showOriginalDefault,
    };

    try {
      setSaving(true);
      await supabase.from('profiles').update(patch).eq('id', meId);
    } catch (e: any) {
      // 롤백
      setProfilePublicDefault(!!prev.beacon_profile_public_default);
      setAutoTranslateDefault(!!prev.auto_translate_default);
      setShowOriginalDefault(!!prev.auto_translate_default);
      Alert.alert(t('errors.common', '오류'), e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleProfilePublic = async (next: boolean) => {
    setProfilePublicDefault(next);
    await updateProfileFlags({ beacon_profile_public_default: next });
  };

  const toggleAutoTranslate = async (next: boolean) => {
    setAutoTranslateDefault(next);
    await updateProfileFlags({ auto_translate_default: next });
  };

  const toggleShowOriginal = async (next: boolean) => {
    setShowOriginalDefault(next);
    await updateProfileFlags({ show_original_default: next });
  };

  const changeLanguage = async (code: string) => {
    try {
      setLang(code);
      await i18n.changeLanguage(code);
      await saveLang(code as AppLang);
      setLangOpen(false);

      if (meId) {
        await supabase.from('profiles').update({ preferred_lang: code }).eq('id', meId);
      }
    } catch (e: any) {
      Alert.alert(t('errors.common', '오류'), e?.message ?? String(e));
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      Alert.alert(t('settings.logout', '로그아웃'), t('settings.logoutDone', '로그아웃되었습니다.'));
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e: any) {
      Alert.alert(t('errors.common', '오류'), e?.message ?? String(e));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>{t('common.loading', '불러오는 중…')}</Text>
      </SafeAreaView>
    );
  }

  const { current, others } = splitLangs(String(lang));

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.headerLeft}
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.home_title', '설정')}</Text>
        <Pressable
          onPress={() =>
            Alert.alert(
              t('settings.search.title', '설정 검색'),
              t('settings.search.soon', '설정 검색 기능은 곧 제공될 예정입니다.'),
            )
          }
          hitSlop={8}
          style={styles.headerRight}
        >
          <SearchIcon size={20} color="#111827" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* 프로필 카드 - 여기에서 AccountSettings로 이동 */}
        <Pressable
          style={styles.profile}
          onPress={() =>
            navigation.navigate('AccountSettings', {
              user_id: meId,
              isMe: true,
            })
          }
        >
          {prof?.avatar_url ? (
            <Image source={{ uri: prof.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {prof?.nickname?.trim()?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {prof?.nickname?.trim() || t('settings.me.noName', '(이름 없음)')}
            </Text>
            {authEmail ? (
              <Text style={styles.subName}>{authEmail}</Text>
            ) : (
              <Text style={styles.subName}>
                {t('settings.me.profileManage', '프로필 관리')}
              </Text>
            )}
          </View>
          <Text style={styles.chev}>{t('common.manage', '관리')}</Text>
        </Pressable>

        {/* 1. 계정 / 보안 */}
        <Section title={t('settings.account.title', '개인 / 보안')}>
          <ListRow
            left={
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{t('settings.account.editProfile', '프로필 편집')}</Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            onPress={() => navigation.navigate('Edit')}
          />
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>
                  {t('settings.account.profilePublicDefault', '비콘에서 내 프로필 기본 공개')}
                </Text>
                <Text style={styles.rowCaption}>
                  {t(
                    'settings.account.profilePublicHint',
                    '비콘 생성 시 기본값으로 사용됩니다. 개별 비콘에서 변경 가능.',
                  )}
                </Text>
              </View>
            }
            right={
              <View style={styles.switchWrap}>
                <Switch
                  value={profilePublicDefault}
                  onValueChange={toggleProfilePublic}
                  trackColor={{ false: '#E5E7EB', true: ACCENT }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor="#E5E7EB"
                  disabled={saving}
                />
              </View>
            }
            last
          />
        </Section>

        {/* 2. 친구 / 소셜 */}
        <Section title={t('settings.friends.title', '친구')}>
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>
                  {t('settings.friends.manage', '친구 관리')}
                </Text>
                <Text style={styles.rowCaption}>
                  {t('settings.friends.caption', '차단, 추천 친구, 공개 범위')}
                </Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            last
            onPress={() =>
              Alert.alert(
                t('settings.friends.title', '친구'),
                t('settings.friends.soon', '친구 설정 화면은 추후 제공될 예정입니다.'),
              )
            }
          />
        </Section>

        {/* 3. 알림 */}
        <Section title={t('settings.notification.title', '알림')}>
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>
                  {t('settings.notification.manage', '알림 설정')}
                </Text>
                <Text style={styles.rowCaption}>
                  {t('settings.notification.caption', '푸시, 소리, 진동')}
                </Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            last
            onPress={() =>
              Alert.alert(
                t('settings.notification.title', '알림'),
                t('settings.notification.soon', '알림 설정 화면은 추후 연결될 예정입니다.'),
              )
            }
          />
        </Section>

        {/* 4. 화면 / 테마 / 언어 */}
        <Section title={t('settings.display.title', '화면 및 언어')}>
          {/* 언어 */}
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>{t('settings.language.title', '언어')}</Text>
                <Text style={styles.rowValue}>{current?.native || lang}</Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            onPress={() => setLangOpen(true)}
          />

          {/* 테마 */}
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>{t('settings.theme.title', '테마')}</Text>
                <Text style={styles.rowCaption}>
                  {t('settings.theme.caption', '라이트 / 다크 모드')}
                </Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            last
            onPress={() => navigation.navigate('ThemeSettings')}
          />
        </Section>

        {/* 5. 채팅 (번역 기본값) */}
        <Section title={t('settings.chat.title', '채팅')}>
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>
                  {t('settings.translate.autoDefault', '메시지 자동 번역')}
                </Text>
                <Text style={styles.rowCaption}>
                  {t('settings.translate.autoDefaultHint', '새 채팅의 기본값으로 사용됩니다.')}
                </Text>
              </View>
            }
            right={
              <View style={styles.switchWrap}>
                <Switch
                  value={autoTranslateDefault}
                  onValueChange={toggleAutoTranslate}
                  trackColor={{ false: '#E5E7EB', true: ACCENT }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor="#E5E7EB"
                  disabled={saving}
                />
              </View>
            }
          />

          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>
                  {t('settings.translate.showOriginal', '번역과 함께 원문 표시')}
                </Text>
                <Text style={styles.rowCaption}>
                  {t(
                    'settings.translate.showOriginalHint',
                    '켜 두면 번역 메시지 아래에 원문이 함께 표시됩니다.',
                  )}
                </Text>
              </View>
            }
            right={
              <View style={styles.switchWrap}>
                <Switch
                  value={showOriginalDefault}
                  onValueChange={toggleShowOriginal}
                  trackColor={{ false: '#E5E7EB', true: ACCENT }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor="#E5E7EB"
                  disabled={saving}
                />
              </View>
            }
            last
          />
        </Section>

        {/* 6. 데이터 & 저장공간 */}
        <Section title={t('settings.storage.title', '데이터 및 저장공간')}>
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>
                  {t('settings.storage.clearCache', '캐시 정리')}
                </Text>
                <Text style={styles.rowCaption}>
                  {t('settings.storage.clearCacheHint', '임시파일 삭제')}
                </Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            last
            onPress={() =>
              Alert.alert(
                t('settings.storage.clearCache', '캐시 정리'),
                t(
                  'settings.storage.soon',
                  '캐시 삭제 로직은 아직 연결되지 않았습니다. 추후 업데이트될 예정입니다.',
                ),
              )
            }
          />
        </Section>

        {/* 7. 실험실 */}
        <Section title={t('settings.labs.title', '실험실')}>
          <ListRow
            left={
              <View>
                <Text style={styles.rowTitle}>{t('settings.labs.features', '실험실 기능')}</Text>
                <Text style={styles.rowCaption}>
                  {t('settings.labs.caption', '새로운 기능을 먼저 사용해 보세요.')}
                </Text>
              </View>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            last
            onPress={() =>
              Alert.alert(
                t('settings.labs.title', '실험실'),
                t('settings.labs.soon', '실험실 기능 화면은 준비 중입니다.'),
              )
            }
          />
        </Section>

        {/* 8. 고객지원 / 로그아웃 / 버전 */}
        <Section title={t('settings.support.title', '고객지원')}>
          <ListRow
            left={
              <Text style={styles.rowTitle}>
                {t('settings.support.notice', '공지사항')}
              </Text>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            onPress={() =>
              Alert.alert(
                t('settings.support.notice', '공지사항'),
                t('settings.support.soon', '공지사항 화면은 추후 연결될 예정입니다.'),
              )
            }
          />
          <ListRow
            left={
              <Text style={styles.rowTitle}>
                {t('settings.support.guide', '앱 안내 가이드')}
              </Text>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            onPress={() =>
              Alert.alert(
                t('settings.support.guide', '앱 안내 가이드'),
                t('settings.support.soon', '앱 가이드는 준비 중입니다.'),
              )
            }
          />
          <ListRow
            left={
              <Text style={styles.rowTitle}>
                {t('settings.support.cs', '고객센터 / 운영정책')}
              </Text>
            }
            right={<ChevronRight size={18} color="#D1D5DB" />}
            onPress={() =>
              Alert.alert(
                t('settings.support.cs', '고객센터 / 운영정책'),
                t('settings.support.soon', '고객센터 화면은 추후 연결될 예정입니다.'),
              )
            }
          />
          <ListRow
            left={
              <Text style={[styles.rowTitle, { color: ACCENT }]}>
                {t('settings.logout', '로그아웃')}
              </Text>
            }
            onPress={signOut}
            last
          />
          <Text style={styles.versionTxt}>
            {t('settings.version', '앱 버전')} 1.0.0
          </Text>
        </Section>

        {/* 관리자 섹션 */}
        {isAdmin && (
          <Section title={t('settings.admin.title', '관리자')}>
            <ListRow
              left={
                <Text style={styles.rowTitle}>
                  {t('settings.admin.console', '관리자 콘솔')}
                </Text>
              }
              right={<ChevronRight size={18} color="#D1D5DB" />}
              last
              onPress={() =>
                Alert.alert('Admin', '관리자 전용 화면은 라우팅 준비 후 연결할게요.')
              }
            />
          </Section>
        )}
      </ScrollView>

      {/* 언어 선택 모달 */}
      <Modal
        visible={langOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLangOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {t('settings.language.select', '언어 선택')}
            </Text>

            {current && (
              <View style={styles.langRow}>
                <Text style={styles.langLabel}>
                  {current.native}{' '}
                  <Text style={{ color: '#9CA3AF' }}>
                    {t('settings.language.inUse', '(사용 중)')}
                  </Text>
                </Text>
                <Text style={styles.redDot}>●</Text>
              </View>
            )}
            <View style={styles.hr} />

            {others.map((l, idx) => {
              const lastRow = idx === others.length - 1;
              return (
                <Pressable
                  key={String(l.code)}
                  onPress={() => changeLanguage(String(l.code))}
                  style={({ pressed }) => [
                    styles.langRow,
                    !lastRow && styles.rowDivider,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.langLabel}>{l.native}</Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ==================== Styles ==================== */
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
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

  profile: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#e5e7eb' },
  avatarFallback: {
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: '800', fontSize: 20 },
  name: { fontSize: 16, fontWeight: '800', color: '#111827' },
  subName: { color: '#9CA3AF', fontSize: 13, marginTop: 2 },
  chev: { color: '#9ca3af', fontWeight: '800' },

  section: {
    marginTop: 12,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: BG,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
  },

  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowCaption: { marginTop: 2, color: '#6b7280', fontSize: 13 },
  rowValue: { marginTop: 2, fontWeight: '700', color: '#111827', fontSize: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },

  go: { color: ACCENT, fontWeight: '800' },
  versionTxt: {
    marginTop: 10,
    textAlign: 'center',
    color: '#9AA1AB',
    fontSize: 12,
    paddingBottom: 8,
  },

  switchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE, marginBottom: 6 },

  langRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  langLabel: { fontSize: 15, color: '#111827', fontWeight: '700' },
  redDot: { color: ACCENT, fontSize: 12, fontWeight: '800' },
});
