// src/screens/settings/support/CustomerCenterHome.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeScreen from '@/components/layout/SafeScreen';
import { useNavigation } from '@react-navigation/native';

// 아이콘 (Lucide)
import { 
  ChevronLeft, 
  Search, 
  ChevronRight, 
  Mail, 
  MessageCircle 
} from 'lucide-react-native';

// 테마 및 Supabase 컨텍스트
import { useAppTranslation } from '@/i18n/useAppTranslation';
import { useAppTheme } from '@/theme/useAppTheme';
import { createSupportTheme } from './supportTheme';
import { supabase } from '@/lib/supabase';
import i18next from 'i18next';

// 🎨 프리미엄 블랙 & 화이트 팔레트
/* ==================== 타입 정의 ==================== */
type FAQ = { id: string; title: string; };
type Category = { id: string; name: string; };
type PolicyType = 'privacy' | 'terms' | 'marketing';
type Policy = { id?: string; type: PolicyType; title: string; is_bold: boolean; locale?: string | null; };
type PolicyDbRow = { id: string; type: string; locale?: string | null; title: string; is_bold?: boolean | null; effective_date?: string | null; created_at?: string | null; };
type ArticleTitleRow = { id: string; title?: string | null; };
type ArticleTitleTranslationRow = { article_id: string; locale?: string | null; title?: string | null; };
type CategoryRow = { id: string; name?: string | null; };
type CategoryTranslationRow = { category_id: string; locale?: string | null; name?: string | null; };

const POLICY_TYPES: PolicyType[] = ['privacy', 'terms', 'marketing'];

const normalizePolicyLocale = (locale?: string | null) => {
  const raw = String(locale || 'ko').trim().toLowerCase().replace('_', '-');
  if (raw.startsWith('ko')) return 'ko';
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('id')) return 'id';
  if (raw.startsWith('hi')) return 'hi';
  if (raw.startsWith('ru')) return 'ru';
  if (raw.startsWith('ar')) return 'ar';
  if (raw.startsWith('vi')) return 'vi';
  if (raw.startsWith('tr')) return 'tr';
  if (raw.startsWith('th')) return 'th';
  if (raw.startsWith('it')) return 'it';
  return raw.slice(0, 2) || 'ko';
};

const uniqueLocales = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const buildLocalePriority = (appLocale: string) => uniqueLocales([appLocale, 'en', 'ko']);

const pickLocalizedValue = <T extends { locale?: string | null }>(
  rows: T[],
  localePriority: string[],
  getValue: (row: T) => string | null | undefined,
) => {
  for (const locale of localePriority) {
    const row = rows.find(item => normalizePolicyLocale(item.locale) === locale);
    const value = row ? getValue(row) : null;
    if (value && value.trim()) return value;
  }

  const fallback = rows.map(getValue).find(value => value && value.trim());
  return fallback || '';
};

const pickFaqTitle = (
  article: ArticleTitleRow,
  translations: ArticleTitleTranslationRow[],
  localePriority: string[],
) => {
  const translatedTitle = pickLocalizedValue(
    translations.filter(row => row.article_id === article.id),
    localePriority,
    row => row.title,
  );

  return translatedTitle || article.title || '';
};

const pickCategoryName = (
  category: CategoryRow,
  translations: CategoryTranslationRow[],
  localePriority: string[],
) => {
  const translatedName = pickLocalizedValue(
    translations.filter(row => row.category_id === category.id),
    localePriority,
    row => row.name,
  );

  return translatedName || category.name || '';
};

const getPolicyFallbackTitle = (type: PolicyType, t: any) => {
  switch (type) {
    case 'privacy':
      return t('settings:support.policy.privacyTitle', { defaultValue: '개인정보 처리방침' });
    case 'terms':
      return t('settings:support.policy.termsTitle', { defaultValue: 'CO·ONN 이용약관' });
    case 'marketing':
      return t('settings:support.policy.marketingTitle', { defaultValue: '마케팅 정보 수신 동의' });
    default:
      return t('settings:support.policy.title', { defaultValue: '약관 및 정책' });
  }
};

const buildVisiblePolicies = (rows: PolicyDbRow[], appLocale: string, t: any): Policy[] => {
  const normalizedRows = rows
    .filter((row) => POLICY_TYPES.includes(row.type as PolicyType))
    .map((row) => ({
      ...row,
      type: row.type as PolicyType,
      locale: normalizePolicyLocale(row.locale),
      is_bold: row.is_bold ?? false,
    }));

  const localePriority = uniqueLocales([appLocale, 'en', 'ko']);

  return POLICY_TYPES.map((type) => {
    const sameTypeRows = normalizedRows.filter((row) => row.type === type);
    const picked =
      localePriority
        .map((locale) => sameTypeRows.find((row) => row.locale === locale))
        .find(Boolean) || sameTypeRows[0];

    return {
      id: picked?.id,
      type,
      title: picked?.title || getPolicyFallbackTitle(type, t),
      is_bold: picked?.is_bold ?? false,
      locale: picked?.locale,
    };
  });
};
type CompanyInfo = {
  name: string;
  ceo: string;
  regNum: string;
  businessNum: string;
  address: string;
  csPhone: string;
  host: string;
};

/* ==================== 커스텀 프레서블 컴포넌트 ==================== */
// 1. 일반 터치 (투명 배경에 스케일 + 투명도)
const SmartPressable = ({ onPress, style, children }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const opacityValue = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.parallel([
      Animated.spring(scaleValue, { toValue: 0.98, useNativeDriver: true }),
      Animated.timing(opacityValue, { toValue: 0.7, duration: 100, useNativeDriver: true })
    ]).start();
  };
  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacityValue, { toValue: 1, duration: 150, useNativeDriver: true })
    ]).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={style}>
      <Animated.View style={[styles.pressableFill, { transform: [{ scale: scaleValue }] }, { opacity: opacityValue }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

// 2. 약관 전용 터치 (스케일 + 텍스트 배경색 음영)
const PolicyPressable = ({ onPress, style, pressColor, children }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  const onPressIn = () => {
    setIsPressed(true);
    Animated.spring(scaleValue, { toValue: 0.98, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    setIsPressed(false);
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View 
        style={[
          style, 
          { transform: [{ scale: scaleValue }] },
          isPressed && { backgroundColor: pressColor, borderRadius: 8 }
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

// 3. ✅ 카드 전용 터치 (안쪽 배경색이 부자연스러운 현상 해결)
const ContactCardPressable = ({ onPress, colors, children }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  const onPressIn = () => {
    setIsPressed(true);
    Animated.spring(scaleValue, { toValue: 0.98, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    setIsPressed(false);
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ width: '100%' }}>
      <Animated.View 
        style={[
          styles.contactCard, 
          { 
            transform: [{ scale: scaleValue }],
            // 눌렸을 때 음영 색상으로 변경, 평소엔 카드 배경색
            backgroundColor: isPressed ? colors.pressShadow : colors.innerCardBg,
            borderColor: colors.border 
          }
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

/* ==================== 메인 화면 ==================== */
export default function CustomerCenterHome() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = createSupportTheme(appTheme);
  const { t } = useAppTranslation('settings');
  const appLocale = normalizePolicyLocale(i18next.resolvedLanguage || i18next.language || 'ko');
  const localePriority = buildLocalePriority(appLocale);
  
  // 검색어 상태
  const [searchQuery, setSearchQuery] = useState('');

  // DB 연동 상태 관리
  const [loading, setLoading] = useState(true);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    const fetchCSData = async () => {
      try {
        setLoading(true);

        const { data: faqData, error: faqError } = await supabase
          .from('cs_articles')
          .select('id, title')
          .eq('is_faq', true)
          .eq('status', 'published')
          .limit(5);
        if (faqError) throw faqError;

        const faqRows = (faqData ?? []) as ArticleTitleRow[];
        let faqTranslations: ArticleTitleTranslationRow[] = [];
        const faqIds = faqRows.map(row => row.id);

        if (faqIds.length > 0) {
          const { data: faqTranslationData, error: faqTranslationError } = await supabase
            .from('cs_article_translations')
            .select('article_id, locale, title')
            .in('article_id', faqIds)
            .in('locale', localePriority);

          if (faqTranslationError) {
            console.warn('FAQ 번역 로딩 실패:', faqTranslationError);
          } else {
            faqTranslations = (faqTranslationData ?? []) as ArticleTitleTranslationRow[];
          }
        }

        setFaqs(
          faqRows.map(row => ({
            id: row.id,
            title: pickFaqTitle(row, faqTranslations, localePriority),
          })),
        );

        const { data: catData, error: catError } = await supabase
          .from('cs_categories')
          .select('id, name')
          .is('parent_id', null)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (catError) throw catError;

        const categoryRows = (catData ?? []) as CategoryRow[];
        let categoryTranslations: CategoryTranslationRow[] = [];
        const categoryIds = categoryRows.map(row => row.id);

        if (categoryIds.length > 0) {
          const { data: categoryTranslationData, error: categoryTranslationError } = await supabase
            .from('cs_category_translations')
            .select('category_id, locale, name')
            .in('category_id', categoryIds)
            .in('locale', localePriority);

          if (categoryTranslationError) {
            console.warn('고객센터 카테고리 번역 로딩 실패:', categoryTranslationError);
          } else {
            categoryTranslations = (categoryTranslationData ?? []) as CategoryTranslationRow[];
          }
        }

        setCategories(
          categoryRows.map(row => ({
            id: row.id,
            name: pickCategoryName(row, categoryTranslations, localePriority),
          })),
        );

        const { data: policyData } = await supabase
          .from('policies')
          .select('id, type, locale, title, is_bold, effective_date, created_at')
          .eq('is_active', true)
          .in('type', POLICY_TYPES)
          .order('effective_date', { ascending: false })
          .order('created_at', { ascending: false });
        setPolicies(buildVisiblePolicies((policyData ?? []) as PolicyDbRow[], appLocale, t));

        const { data: companyData } = await supabase
          .from('company_info')
          .select('company_name, ceo_name, business_reg_num, telecom_sales_num, address, cs_phone, hosting_provider')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (companyData) {
          setCompanyInfo({
            name: companyData.company_name,
            ceo: companyData.ceo_name,
            regNum: companyData.business_reg_num,
            businessNum: companyData.telecom_sales_num,
            address: companyData.address,
            csPhone: companyData.cs_phone,
            host: companyData.hosting_provider
          });
        }
      } catch (error) {
        console.error('CS 데이터 로딩 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCSData();
  }, [appLocale, t]);

  const handleSearch = () => {
    if (searchQuery.trim() === '') return;
    navigation.navigate('CustomerCenterList', { keyword: searchQuery });
  };

  return (
    <SafeScreen
      backgroundColor={colors.bg}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      
      {/* 1. 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: colors.bg, borderBottomColor: colors.borderSoft }]}>
        <View style={styles.headerInner}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerIcon}>
            <ChevronLeft size={22} color={colors.textMain} strokeWidth={2.1}/>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textMain }]}>{t('settings:support.center.title')}</Text>
          <View style={styles.headerIcon} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMain} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          <View style={styles.heroSection}>
            <Text style={[styles.heroText, { color: colors.textMain }]}>
              {t('settings:support.center.hero')}
            </Text>
            <View style={[styles.searchContainer, { backgroundColor: colors.searchBg, borderColor: colors.searchBorder }]}>
              <Search size={20} color={colors.textSub} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.textMain }]}
                placeholder={t('settings:support.center.searchPlaceholder')}
                placeholderTextColor={colors.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
            </View>
          </View>

          <View style={[styles.thickDivider, { backgroundColor: colors.divider }]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSub }]}>{t('settings:support.center.faq')}</Text>
            <View style={[styles.helpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {faqs.map((faq, index) => (
                <Pressable
                  key={faq.id}
                  onPress={() => navigation.navigate('CustomerCenterDetail', { articleId: faq.id })}
                  style={({ pressed }) => [
                    styles.faqRow,
                    index !== faqs.length - 1 && {
                      borderBottomColor: colors.borderSoft,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                    pressed && { backgroundColor: colors.pressShadow },
                  ]}
                  hitSlop={4}
                >
                  <Text style={[styles.qIcon, { color: colors.faqQ }]}>Q.</Text>
                  <Text style={[styles.faqText, { color: colors.textMain }]} numberOfLines={1} ellipsizeMode="tail">
                    {faq.title}
                  </Text>
                  <View pointerEvents="none" style={styles.rowChevron}>
                    <ChevronRight size={16} color={colors.textSub} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.thickDivider, { backgroundColor: colors.divider }]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSub }]}>{t('settings:support.center.categories')}</Text>
            <View style={[styles.categoryGrid, { backgroundColor: colors.categoryBg, borderColor: colors.categoryBorder }]}>
              {categories.map((cat, index) => (
                <Pressable
                  key={cat.id}
                  style={({ pressed }) => [
                    styles.categoryItem,
                    {
                      borderBottomColor: colors.borderSoft,
                      borderLeftColor: 'transparent',
                      borderLeftWidth: 0,
                      backgroundColor: pressed ? colors.pressShadow : 'transparent',
                    },
                  ]}
                  onPress={() => navigation.navigate('CustomerCenterList', { categoryId: cat.id })}
                  hitSlop={4}
                >
                  <Text style={[styles.categoryText, { color: colors.textMain }]} numberOfLines={1} ellipsizeMode="tail">
                    {cat.name}
                  </Text>
                  <View pointerEvents="none" style={styles.categoryChevron}>
                    <ChevronRight size={14} color={colors.textSub} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ✅ 5. 직접 문의 영역 (배경 터치 이펙트 픽스) */}
          <View style={[styles.contactSection, { backgroundColor: colors.contactSectionBg }]}>
            <Text style={[styles.contactTitle, { color: colors.textMain }]}>
              {t('settings:support.center.contactTitle')}
            </Text>
            
            <ContactCardPressable onPress={() => navigation.navigate('ContactForm')} colors={colors}>
              <View style={styles.contactIconArea}>
                <Mail size={26} color={colors.icon} strokeWidth={1.5} />
              </View>
              <View style={styles.contactCardText}>
                <View style={styles.contactCardTitleRow}>
                  <Text style={[styles.contactCardTitle, { color: colors.textMain }]}>{t('settings:support.contact.title')}</Text>
                  <ChevronRight size={18} color={colors.textSub} style={{ marginLeft: 4, marginTop: 1 }} strokeWidth={2.1}/>
                </View>
                <Text style={[styles.contactCardDesc, { color: colors.textSub }]}>{t('settings:support.center.emailDesc')}</Text>
              </View>
            </ContactCardPressable>

            <ContactCardPressable onPress={() => {/* 챗봇 연결 */}} colors={colors}>
              <View style={styles.contactIconArea}>
                <MessageCircle size={26} color={colors.icon} strokeWidth={1.5} />
              </View>
              <View style={styles.contactCardText}>
                <View style={styles.contactCardTitleRow}>
                  <Text style={[styles.contactCardTitle, { color: colors.textMain }]}>{t('settings:support.center.aiTitle')}</Text>
                  <ChevronRight size={18} color={colors.textSub} style={{ marginLeft: 4, marginTop: 1 }} strokeWidth={2.1} />
                </View>
                <Text style={[styles.contactCardDesc, { color: colors.textSub }]}>{t('settings:support.center.aiDesc')}</Text>
              </View>
            </ContactCardPressable>
          </View>

          <View style={styles.policySection}>
            <Text style={[styles.sectionTitle, { color: colors.textSub, marginBottom: 8 }]}>{t('settings:support.center.policies')}</Text>
            <View style={[styles.policyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {policies.map((policy, index) => (
                <Pressable
                  key={policy.id}
                  onPress={() => navigation.navigate('PolicyViewer', { type: policy.type })}
                  style={({ pressed }) => [
                    styles.policyRow,
                    index !== policies.length - 1 && {
                      borderBottomColor: colors.borderSoft,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                    pressed && { backgroundColor: colors.pressShadow },
                  ]}
                  hitSlop={4}
                >
                  <Text
                    style={[
                      styles.policyText,
                      { color: colors.textMain },
                      policy.is_bold && { fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {policy.title}
                  </Text>
                  <View pointerEvents="none" style={styles.rowChevron}>
                    <ChevronRight size={16} color={colors.textSub} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {companyInfo && (
            <View style={styles.footerSection}>
              <Text style={[styles.footerCompany, { color: colors.textMain }]}>
                {companyInfo.name}
              </Text>
              <Text style={[styles.footerText, { color: colors.textSub }]}>
                {t('settings:support.company.ceo')}: {companyInfo.ceo}   {t('settings:support.company.regNum')}: {companyInfo.regNum}{'\n'}
                {t('settings:support.company.businessNum')}: {companyInfo.businessNum}{'\n'}
                {t('settings:support.company.address')}: {companyInfo.address}{'\n'}
                {t('settings:support.company.cs')}: {companyInfo.csPhone}{'\n'}
                {t('settings:support.company.host')}: {companyInfo.host}
              </Text>
            </View>
          )}

        </ScrollView>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pressableFill: { width: '100%' },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerInner: {
    height: 52, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16,
  },
  headerIcon: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.25 },
  
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 60 },

  heroSection: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 24 },
  heroText: { fontSize: 22, fontWeight: '600', lineHeight: 31, marginBottom: 22, letterSpacing: -0.45 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16, height: 52,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, fontWeight: '400' },

  thickDivider: { height: 8, width: '100%' },

  section: { paddingHorizontal: 20, paddingVertical: 22 },
  sectionTitle: { fontSize: 12, fontWeight: '500', marginBottom: 14, letterSpacing: 0.1 },
  
  helpCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, overflow: 'hidden' },
  faqRow: { minHeight: 56, paddingVertical: 16, paddingLeft: 16, paddingRight: 42, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  qIcon: { fontSize: 16, fontWeight: '600', marginRight: 10, width: 22 },
  faqText: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, fontWeight: '600', marginRight: 8 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderRadius: 20, overflow: 'hidden' },
  categoryItem: {
    width: '100%',
    minHeight: 56,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 42,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    position: 'relative',
  },
  categoryText: {
    width: '100%',
    minWidth: 0,
    textAlign: 'left',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  categoryChevron: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    width: 22,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rowChevron: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    width: 20,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  /* 직접 문의 영역 */
  contactSection: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 30, alignItems: 'center', marginBottom: 10 },
  contactTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 22, letterSpacing: -0.25 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    paddingVertical: 18, paddingHorizontal: 18, borderRadius: 20, marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contactIconArea: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  contactCardText: { flex: 1 },
  contactCardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  contactCardTitle: { fontSize: 15, fontWeight: '500', letterSpacing: -0.15 },
  contactCardDesc: { fontSize: 12, fontWeight: '500' },

  /* 약관 및 정책 섹션 */
  policySection: { paddingHorizontal: 20, paddingVertical: 20 },
  policyCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, overflow: 'hidden' },
  policyRow: { minHeight: 56, paddingVertical: 16, paddingLeft: 16, paddingRight: 42, justifyContent: 'center', position: 'relative' },
  policyText: { width: '100%', minWidth: 0, fontSize: 15, lineHeight: 21, fontWeight: '600' },

  /* 푸터 섹션 */
  footerSection: { 
    paddingHorizontal: 28, 
    paddingBottom: 40, 
    paddingTop: 10, 
    alignItems: 'flex-start' 
  },
  footerCompany: { 
    fontSize: 14, 
    fontWeight: '600', 
    marginBottom: 10 
  },
  footerText: { 
    fontSize: 12, 
    lineHeight: 20, 
    textAlign: 'left', 
    fontWeight: '400' 
  },
});