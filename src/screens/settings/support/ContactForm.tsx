import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeScreen from '@/components/layout/SafeScreen';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronDown, Mail, Send, Check } from 'lucide-react-native';

import { useAppTranslation } from '@/i18n/useAppTranslation';
import { useAppTheme } from '@/theme/useAppTheme';
import { createSupportTheme } from './supportTheme';
import { supabase } from '@/lib/supabase';
import i18next from 'i18next';

const CONTENT_BOX_HEIGHT = 260;
const CONTENT_INPUT_HEIGHT = 258;
const SCROLLBAR_MIN_THUMB = 34;
const SCROLLBAR_RAIL_WIDTH = 12;

type CsCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number | null;
  is_active: boolean | null;
};

type CsCategoryTranslationRow = {
  category_id: string;
  locale?: string | null;
  name?: string | null;
};

type InquiryCategoryOption = {
  id: string;
  name: string;
  displayName: string;
};

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
  category: CsCategory,
  translations: CsCategoryTranslationRow[],
  localePriority: string[],
) => {
  const translatedName = pickLocalizedValue(
    translations.filter(row => row.category_id === category.id),
    localePriority,
    row => row.name,
  );

  return translatedName || category.name || '';
};

export default function ContactForm() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = createSupportTheme(appTheme);
  const { t } = useAppTranslation('settings');
  const appLocale = normalizeSupportLocale(i18next.resolvedLanguage || i18next.language || 'ko');
  const localePriority = useMemo(() => buildLocalePriority(appLocale), [appLocale]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const contentInputRef = useRef<TextInput>(null);
  const [categories, setCategories] = useState<CsCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [contentViewportHeight, setContentViewportHeight] = useState(CONTENT_INPUT_HEIGHT);
  const [contentHeight, setContentHeight] = useState(CONTENT_INPUT_HEIGHT);
  const [contentScrollY, setContentScrollY] = useState(0);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        setBootLoading(true);
        setCategoriesLoading(true);

        const [{ data: authData }, { data: categoryData, error: categoryError }] = await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('cs_categories')
            .select('id, parent_id, name, sort_order, is_active')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        ]);

        if (!mounted) return;

        if (authData?.user?.email) {
          setEmail(authData.user.email);
        }

        if (categoryError) {
          throw categoryError;
        }

        const categoryRows = (categoryData ?? []) as CsCategory[];
        let categoryTranslations: CsCategoryTranslationRow[] = [];
        const categoryIds = categoryRows.map(category => category.id);

        if (categoryIds.length > 0) {
          const { data: categoryTranslationData, error: categoryTranslationError } = await supabase
            .from('cs_category_translations')
            .select('category_id, locale, name')
            .in('category_id', categoryIds)
            .in('locale', localePriority);

          if (categoryTranslationError) {
            console.warn('문의 카테고리 번역 로딩 실패:', categoryTranslationError);
          } else {
            categoryTranslations = (categoryTranslationData ?? []) as CsCategoryTranslationRow[];
          }
        }

        if (!mounted) return;

        setCategories(
          categoryRows.map(category => ({
            ...category,
            name: pickCategoryName(category, categoryTranslations, localePriority),
          })),
        );
      } catch (error) {
        console.error('문의 폼 초기 로딩 실패:', error);
        if (mounted) {
          Alert.alert(t('settings:support.alert.error'), t('settings:support.contact.loadFail'));
        }
      } finally {
        if (mounted) {
          setBootLoading(false);
          setCategoriesLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [localePriority, t]);

  const categoryOptions = useMemo<InquiryCategoryOption[]>(() => {
    if (!categories.length) return [];

    const byId = new Map(categories.map(category => [category.id, category]));
    const parentIds = new Set(categories.map(category => category.parent_id).filter(Boolean) as string[]);

    const leafCategories = categories.filter(category => !parentIds.has(category.id));
    const source = leafCategories.length > 0 ? leafCategories : categories;

    return source.map(category => {
      const parentName = category.parent_id ? byId.get(category.parent_id)?.name : null;
      return {
        id: category.id,
        name: category.name,
        displayName: parentName ? `${parentName} · ${category.name}` : category.name,
      };
    });
  }, [categories]);

  const selectedCategory = useMemo(
    () => categoryOptions.find(category => category.id === selectedCategoryId) ?? null,
    [categoryOptions, selectedCategoryId],
  );

  useEffect(() => {
    if (!categoryOptions.length) {
      if (selectedCategoryId) setSelectedCategoryId('');
      return;
    }

    const stillValid = categoryOptions.some(category => category.id === selectedCategoryId);
    if (!stillValid) {
      setSelectedCategoryId(categoryOptions[0].id);
    }
  }, [categoryOptions, selectedCategoryId]);

  const submitDisabled =
    loading ||
    !email.trim() ||
    !content.trim() ||
    !selectedCategory ||
    categoriesLoading;

  const scrollbarMetrics = useMemo(() => {
    const viewport = Math.max(contentViewportHeight, 1);
    const fullContent = Math.max(contentHeight, viewport);
    const maxScroll = Math.max(fullContent - viewport, 0);
    const showScrollbar = maxScroll > 2;

    if (!showScrollbar) {
      return {
        showScrollbar: true,
        thumbHeight: viewport,
        thumbTop: 0,
      };
    }

    const rawThumbHeight = (viewport / fullContent) * viewport;
    const thumbHeight = Math.max(SCROLLBAR_MIN_THUMB, Math.min(rawThumbHeight, viewport));
    const availableTrack = Math.max(viewport - thumbHeight, 0);
    const progress = maxScroll > 0 ? Math.min(Math.max(contentScrollY / maxScroll, 0), 1) : 0;
    const thumbTop = availableTrack * progress;

    return {
      showScrollbar: true,
      thumbHeight,
      thumbTop,
    };
  }, [contentHeight, contentScrollY, contentViewportHeight]);

  const handleContentInputScroll = (event: any) => {
    const nativeEvent = event?.nativeEvent as any;
    const contentOffsetY = Math.max(Number(nativeEvent?.contentOffset?.y ?? 0), 0);
    const nextContentHeight = Math.max(
      CONTENT_INPUT_HEIGHT,
      Math.ceil(Number(nativeEvent?.contentSize?.height ?? contentHeight ?? CONTENT_INPUT_HEIGHT)),
    );
    const nextViewportHeight = Math.max(
      1,
      Math.ceil(Number(nativeEvent?.layoutMeasurement?.height ?? contentViewportHeight ?? CONTENT_INPUT_HEIGHT)),
    );

    setContentScrollY(contentOffsetY);
    setContentHeight(nextContentHeight);
    setContentViewportHeight(nextViewportHeight);
  };

  const textInputScrollProps: any = {
    onScroll: handleContentInputScroll,
    scrollEventThrottle: 16,
    showsVerticalScrollIndicator: false,
  };

  const handleSubmit = async () => {
    if (!email.trim() || !content.trim()) {
      Alert.alert(t('settings:support.alert.notice'), t('settings:support.contact.required'));
      return;
    }

    if (!selectedCategory) {
      Alert.alert(t('settings:support.alert.notice'), t('settings:support.contact.categoryRequired'));
      return;
    }

    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from('inquiries').insert({
        user_id: user?.id || null,
        category: selectedCategory.name,
        reply_email: email.trim(),
        content: content.trim(),
      });

      if (error) throw error;

      Alert.alert(t('settings:support.contact.successTitle'), t('settings:support.contact.successDesc'), [
        { text: t('settings:support.action.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('문의 접수 실패:', error);
      Alert.alert(t('settings:support.alert.error'), t('settings:support.contact.submitFail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeScreen
      backgroundColor={colors.bg}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 4,
            backgroundColor: colors.bg,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerInner}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerIcon}>
            <ChevronLeft size={22} color={colors.textMain} strokeWidth={2.1} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textMain }]}>{t('settings:support.contact.title')}</Text>
          <View style={styles.headerIcon} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.mainWrapper}>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={[styles.formContent, { paddingBottom: 10 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.guideText, { color: colors.textSub }]}>
              {t('settings:support.contact.guide')}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textMain }]}>{t('settings:support.contact.category')}</Text>
              <Pressable
                style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => {
                  if (!categoryOptions.length || categoriesLoading) return;
                  setCategoryModalVisible(true);
                }}
                disabled={!categoryOptions.length || categoriesLoading}
              >
                <Text
                  style={[
                    styles.inputText,
                    { color: selectedCategory ? colors.textMain : colors.textSub },
                  ]}
                  numberOfLines={1}
                >
                  {categoriesLoading
                    ? t('settings:support.contact.categoryLoading')
                    : selectedCategory?.displayName ?? t('settings:support.contact.categoryPlaceholder')}
                </Text>
                {categoriesLoading ? (
                  <ActivityIndicator size="small" color={colors.textSub} />
                ) : (
                  <ChevronDown size={20} color={colors.textSub} />
                )}
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textMain }]}>{t('settings:support.contact.email')}</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Mail size={18} color={colors.textSub} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: colors.textMain }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('settings:support.contact.emailPlaceholder')}
                  placeholderTextColor={colors.textSub}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={[styles.inputGroup, styles.contentGroup]}>
              <Text style={[styles.label, { color: colors.textMain }]}>{t('settings:support.contact.content')}</Text>
              <View
                style={[
                  styles.textAreaWrapper,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}
                onLayout={event => {
                  const nextViewportHeight = Math.max(1, Math.ceil(event.nativeEvent.layout.height - 2));
                  setContentViewportHeight(nextViewportHeight);
                }}
              >
                <View style={styles.textAreaRow}>
                  <TextInput
                    ref={contentInputRef}
                    style={[styles.textArea, { color: colors.textMain }]}
                    value={content}
                    onChangeText={setContent}
                    placeholder={t('settings:support.contact.contentPlaceholder')}
                    placeholderTextColor={colors.textSub}
                    multiline
                    textAlignVertical="top"
                    scrollEnabled
                    autoCorrect={false}
                    keyboardAppearance={appTheme.isDark ? 'dark' : 'light'}
                    onContentSizeChange={event => {
                      const nextHeight = Math.max(
                        CONTENT_INPUT_HEIGHT,
                        Math.ceil(event.nativeEvent.contentSize.height),
                      );
                      setContentHeight(nextHeight);
                    }}
                    {...textInputScrollProps}
                  />

                  <View
                    pointerEvents="none"
                    style={[styles.scrollbarRail, { backgroundColor: colors.scrollbarRailBg }]}
                  >
                    <View
                      style={[
                        styles.scrollbarTrack,
                        { backgroundColor: colors.scrollbarTrack },
                      ]}
                    >
                      <View
                        style={[
                          styles.scrollbarThumb,
                          {
                            backgroundColor: colors.scrollbarThumb,
                            height: scrollbarMetrics.thumbHeight,
                            transform: [{ translateY: scrollbarMetrics.thumbTop }],
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.bg,
                borderTopColor: colors.borderSoft,
                paddingBottom: 12,
              },
            ]}
          >
            <Pressable
              style={[
                styles.submitBtn,
                { backgroundColor: submitDisabled ? colors.border : colors.btnBg },
              ]}
              onPress={handleSubmit}
              disabled={submitDisabled}
            >
              {loading ? (
                <ActivityIndicator color={colors.btnText} />
              ) : (
                <>
                  <Send
                    size={18}
                    color={submitDisabled ? colors.textSub : colors.btnText}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.submitBtnText,
                      { color: submitDisabled ? colors.textSub : colors.btnText },
                    ]}
                  >
                    {t('settings:support.contact.submit')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        transparent
        animationType="fade"
        visible={categoryModalVisible}
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <Pressable
          style={[
            styles.modalBackdrop,
            {
              backgroundColor: colors.modalBackdrop,
              paddingBottom: Math.max(insets.bottom + 16, 16),
            },
          ]}
          onPress={() => setCategoryModalVisible(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderSoft }]}>
              <Text style={[styles.modalTitle, { color: colors.textMain }]}>{t('settings:support.contact.categorySelect')}</Text>
            </View>

            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              showsVerticalScrollIndicator={false}
            >
              {categoryOptions.map(category => {
                const active = category.id === selectedCategoryId;
                return (
                  <Pressable
                    key={category.id}
                    style={[styles.modalItem, { borderBottomColor: colors.divider }]}
                    onPress={() => {
                      setSelectedCategoryId(category.id);
                      setCategoryModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalItemText, { color: colors.textMain }]}>
                      {category.displayName}
                    </Text>
                    {active ? <Check size={18} color={colors.textMain} strokeWidth={2.1} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {bootLoading ? (
        <View style={[styles.bootLoadingOverlay, { backgroundColor: colors.bg }]}>
          <ActivityIndicator size="large" color={colors.textMain} />
        </View>
      ) : null}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardArea: { flex: 1 },

  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerInner: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerIcon: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.25 },

  mainWrapper: { flex: 1 },
  formScroll: { flex: 1 },
  formContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  guideText: { fontSize: 14, lineHeight: 22, fontWeight: '400', marginBottom: 28 },

  inputGroup: { marginBottom: 24 },
  contentGroup: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 9 },

  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    gap: 12,
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },

  textAreaWrapper: {
    height: CONTENT_BOX_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: 'hidden',
  },
  textAreaRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  textArea: {
    flex: 1,
    height: CONTENT_INPUT_HEIGHT,
    fontSize: 15,
    lineHeight: 24,
    paddingLeft: 16,
    paddingRight: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  scrollbarRail: {
    width: 14,
    marginVertical: 6,
    marginRight: 6,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollbarTrack: {
    flex: 1,
    width: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  scrollbarThumb: {
    width: 8,
    borderRadius: 999,
    opacity: 1,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: 15, fontWeight: '600' },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalCard: {
    maxHeight: '72%',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  modalHeader: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  modalList: {
    maxHeight: 420,
  },
  modalListContent: {
    paddingVertical: 4,
  },
  modalItem: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modalItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },

  bootLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
