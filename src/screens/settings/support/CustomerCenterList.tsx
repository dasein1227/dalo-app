// src/screens/settings/support/CustomerCenterList.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Animated,
  FlatList,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeScreen from '@/components/layout/SafeScreen';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Search, Check } from 'lucide-react-native';

// 테마 및 Supabase 연동
import { useAppTranslation } from '@/i18n/useAppTranslation';
import { useAppTheme } from '@/theme/useAppTheme';
import { createSupportTheme } from './supportTheme';
import { supabase } from '@/lib/supabase'; // 👈 프로젝트 환경에 맞게 경로 확인 필수
import i18next from 'i18next';

// 🎨 프리미엄 블랙 & 화이트 팔레트
/* ==================== 타입 정의 ==================== */
type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
};

type Article = {
  id: string;
  category_id: string;
  title: string;
  content: string;
};

type CategoryTranslationRow = {
  category_id: string;
  locale?: string | null;
  name?: string | null;
};

type ArticleTranslationRow = {
  article_id: string;
  locale?: string | null;
  title?: string | null;
  content?: string | null;
};

// UI 렌더링 및 필터링을 편하게 하기 위해 확장한 타입
type UIArticle = Article & {
  mainCatId: string;
  subCatId: string;
  subCatName: string;
};

const ALL_FILTER_VALUE = '__all__';

const normalizeSupportLocale = (locale?: string | null) => {
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
    const row = rows.find(item => normalizeSupportLocale(item.locale) === locale);
    const value = row ? getValue(row) : null;
    if (value && value.trim()) return value;
  }

  const fallback = rows.map(getValue).find(value => value && value.trim());
  return fallback || '';
};

const pickCategoryName = (
  category: Category,
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

const pickArticleText = (
  article: Article,
  translations: ArticleTranslationRow[],
  localePriority: string[],
) => {
  const sameArticleTranslations = translations.filter(row => row.article_id === article.id);

  const title = pickLocalizedValue(sameArticleTranslations, localePriority, row => row.title);
  const content = pickLocalizedValue(sameArticleTranslations, localePriority, row => row.content);

  return {
    title: title || article.title || '',
    content: content || article.content || '',
  };
};

/* ==================== 커스텀 프레서블 ==================== */
const SmartPressable = ({ onPress, style, pressColor, children }: any) => {
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
          isPressed && { backgroundColor: pressColor }
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

/* ==================== 메인 화면 ==================== */
export default function CustomerCenterList() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = createSupportTheme(appTheme);
  const { t } = useAppTranslation('settings');
  const appLocale = normalizeSupportLocale(i18next.resolvedLanguage || i18next.language || 'ko');
  const localePriority = useMemo(() => buildLocalePriority(appLocale), [appLocale]);

  // 필터 상태 관리 (이전 화면에서 넘어온 파라미터가 있으면 초기값으로 세팅)
  const [searchQuery, setSearchQuery] = useState(route.params?.keyword || '');
  const [activeCat, setActiveCat] = useState(route.params?.categoryId || 'all');
  const [activeSub, setActiveSub] = useState(ALL_FILTER_VALUE);

  // DB 데이터 상태 관리
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<UIArticle[]>([]);

  // 📡 데이터 Fetching
  useEffect(() => {
    const fetchListData = async () => {
      try {
        setLoading(true);

        // 1. 카테고리 전체 조회 (메인 & 서브 포함)
        const { data: catData, error: catError } = await supabase
          .from('cs_categories')
          .select('id, parent_id, name, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (catError) throw catError;

        const categoryRows = (catData ?? []) as Category[];
        let categoryTranslations: CategoryTranslationRow[] = [];
        const categoryIds = categoryRows.map(category => category.id);

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

        const localizedCategories: Category[] = categoryRows.map(category => ({
          ...category,
          name: pickCategoryName(category, categoryTranslations, localePriority),
        }));

        // 2. 게시글(Article) 조회 (발행된 글만)
        const { data: artData, error: artError } = await supabase
          .from('cs_articles')
          .select('id, category_id, title, content')
          .eq('status', 'published')
          .order('created_at', { ascending: false });

        if (artError) throw artError;

        const articleRows = (artData ?? []) as Article[];
        let articleTranslations: ArticleTranslationRow[] = [];
        const articleIds = articleRows.map(article => article.id);

        if (articleIds.length > 0) {
          const { data: articleTranslationData, error: articleTranslationError } = await supabase
            .from('cs_article_translations')
            .select('article_id, locale, title, content')
            .in('article_id', articleIds)
            .in('locale', localePriority);

          if (articleTranslationError) {
            console.warn('고객센터 게시글 번역 로딩 실패:', articleTranslationError);
          } else {
            articleTranslations = (articleTranslationData ?? []) as ArticleTranslationRow[];
          }
        }

        setCategories(localizedCategories);

        // 3. 필터링을 쉽게 하기 위해 카테고리 맵(Map) 생성
        const catMap = new Map<string, Category>();
        localizedCategories.forEach(c => catMap.set(c.id, c));

        // 4. Article 데이터에 상위 카테고리 ID와 서브 카테고리 이름을 매핑
        const uiArticles: UIArticle[] = articleRows.map(art => {
          const cat = catMap.get(art.category_id);
          const localizedArticle = pickArticleText(art, articleTranslations, localePriority);
          let mainCatId = 'all';
          let subCatId = ALL_FILTER_VALUE;
          let subCatName = t('settings:support.list.common');

          if (cat) {
            // 현재 카테고리에 parent_id가 있다면 서브, 없다면 본인이 메인
            mainCatId = cat.parent_id ? cat.parent_id : cat.id;
            subCatId = cat.id;
            subCatName = cat.name;
          }

          return {
            ...art,
            title: localizedArticle.title,
            content: localizedArticle.content,
            mainCatId,
            subCatId,
            subCatName,
          };
        });

        setArticles(uiArticles);
      } catch (error) {
        console.error('고객센터 리스트 로딩 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchListData();
  }, [localePriority, t]);

  // -------------------- 필터링 로직 -------------------- //

  // 카테고리 변경 핸들러
  const handleCatChange = (catId: string) => {
    setActiveCat(catId);
    setActiveSub(ALL_FILTER_VALUE);
  };

  // 1. 화면 상단에 그릴 '메인 카테고리 칩' 목록 생성
  const mainCategories = useMemo(() => {
    const mains = categories.filter(c => c.parent_id === null);
    return [{ id: 'all', name: t('settings:support.list.all') }, ...mains];
  }, [categories, t]);

  // 2. 현재 선택된 메인 카테고리에 속한 '서브 카테고리' 목록 생성
  const currentSubCategories = useMemo<Array<{ id: string; name: string }>>(() => {
    if (activeCat === 'all') return [];

    const subs = categories.filter(c => c.parent_id === activeCat);
    if (subs.length === 0) return [];

    return [
      { id: ALL_FILTER_VALUE, name: t('settings:support.list.all') },
      ...subs.map(s => ({ id: s.id, name: s.name })),
    ];
  }, [categories, activeCat, t]);

  // 3. 실제 화면에 뿌려줄 필터링된 게시글 목록
  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      // 검색어 필터 (대소문자 구분 없이 제목/본문 검색)
      const keyword = searchQuery.toLowerCase();
      const matchSearch = 
        article.title.toLowerCase().includes(keyword) || 
        article.content.toLowerCase().includes(keyword);
      
      // 메인 카테고리 필터
      const matchCat = activeCat === 'all' || article.mainCatId === activeCat;
      
      // 서브 카테고리 필터
      const matchSub = activeSub === ALL_FILTER_VALUE || article.subCatId === activeSub;

      return matchSearch && matchCat && matchSub;
    });
  }, [articles, searchQuery, activeCat, activeSub]);

  // --------------------------------------------------- //

  // 개별 리스트 아이템 렌더링
  const renderItem = ({ item }: { item: UIArticle }) => (
    <SmartPressable 
      onPress={() => navigation.navigate('CustomerCenterDetail', { articleId: item.id })}
      pressColor={colors.pressShadow}
      style={[styles.articleItem, { borderBottomColor: colors.borderSoft }]}
    >
      <Text style={[styles.articleSubLabel, { color: colors.textSub }]}>{item.subCatName}</Text>
      <Text style={[styles.articleTitle, { color: colors.textMain }]} numberOfLines={2}>
        {item.title}
      </Text>
      {/* ✅ DB의 \n 문자를 공백으로 변경하여 미리보기가 한 줄로 깔끔하게 나오도록 수정했습니다. */}
      <Text style={[styles.articleContent, { color: colors.textSub }]} numberOfLines={2}>
        {item.content.replace(/\\n|\n/g, ' ').replace(/[#*`_>]/g, '')} 
      </Text>
    </SmartPressable>
  );

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

      {/* 2. 상단 고정 영역 (검색창 + 필터) */}
      <View style={{ backgroundColor: colors.bg, zIndex: 10 }}>
        {/* 검색창 */}
        <View style={styles.searchSection}>
          <View style={[styles.searchContainer, { backgroundColor: colors.searchBg, borderColor: colors.searchBorder }]}>
            <Search size={20} color={colors.textSub} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.textMain }]}
              placeholder={t('settings:support.center.searchPlaceholder')}
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
          </View>
        </View>

        {/* 메인 카테고리 (가로 스크롤) */}
        <View style={[styles.catSection, { borderBottomColor: colors.divider }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {mainCategories.map(cat => {
              const isActive = activeCat === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => handleCatChange(cat.id)}
                  style={[
                    styles.catChip,
                    { borderColor: isActive ? colors.chipActiveBg : colors.chipBorder, backgroundColor: isActive ? colors.chipActiveBg : colors.chipBg },
                  ]}
                >
                  <Text style={[
                    styles.catChipText,
                    { color: isActive ? colors.chipActiveText : colors.textMain },
                    isActive && { fontWeight: '600' }
                  ]}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 서브 카테고리 (가로 스크롤) - 메인 카테고리가 '전체'가 아닐 때만 노출 */}
        {currentSubCategories.length > 0 && (
          <View style={[styles.subCatSection, { borderBottomColor: colors.borderSoft }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subCatScroll}>
              {currentSubCategories.map((sub, index) => {
                const isActive = activeSub === sub.id;
                return (
                  <View key={sub.id} style={styles.subCatWrapper}>
                    <Pressable onPress={() => setActiveSub(sub.id)} style={styles.subCatItem}>
                      {isActive && <Check size={14} color={colors.textMain} strokeWidth={3} style={{ marginRight: 4 }} />}
                      <Text style={[
                        styles.subCatText,
                        { color: isActive ? colors.textMain : colors.textSub },
                        isActive && { fontWeight: '600' }
                      ]}>
                        {sub.name}
                      </Text>
                    </Pressable>
                    {index !== currentSubCategories.length - 1 && (
                      <Text style={[styles.subCatDot, { color: colors.border }]}>·</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 검색 결과 카운트 */}
        <View style={[styles.resultCountSection, { backgroundColor: colors.bg }]}>
          <Text style={[styles.resultCountText, { color: colors.textMain }]}>
            {t('settings:support.list.result')} <Text style={{ color: colors.textSub, fontWeight: '500' }}>{loading ? '-' : filteredArticles.length}</Text>
          </Text>
        </View>
      </View>

      {/* 3. 리스트 영역 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMain} />
        </View>
      ) : (
        <FlatList
          data={filteredArticles}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Search size={40} color={colors.border} strokeWidth={1} style={{ marginBottom: 16 }} />
              <Text style={[styles.emptyText, { color: colors.textSub }]}>{t('settings:support.list.empty')}</Text>
            </View>
          }
        />
      )}

    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerInner: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  headerIcon: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.25 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchSection: { paddingHorizontal: 20, paddingVertical: 12 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16, height: 50 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, fontWeight: '500' },

  catSection: { borderBottomWidth: 8, paddingBottom: 16 },
  catScroll: { paddingHorizontal: 20, gap: 8 },
  catChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', alignItems: 'center' },
  catChipText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.3 },

  subCatSection: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  subCatScroll: { paddingHorizontal: 20, alignItems: 'center' },
  subCatWrapper: { flexDirection: 'row', alignItems: 'center' },
  subCatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  subCatText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.3 },
  subCatDot: { marginHorizontal: 10, fontSize: 13, fontWeight: '500' },

  resultCountSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  resultCountText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.25 },

  listContent: { paddingBottom: 40 },
  articleItem: { paddingVertical: 20, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  articleSubLabel: { fontSize: 12, fontWeight: '500', marginBottom: 8 },
  articleTitle: { fontSize: 16, fontWeight: '600', lineHeight: 23, marginBottom: 9, letterSpacing: -0.25 },
  articleContent: { fontSize: 14, lineHeight: 22, fontWeight: '400' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, fontWeight: '400' },
});