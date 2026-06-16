// src/screens/business/MyBusinessList.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Star, Store, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import { createBusinessOwnerTheme, type BusinessOwnerTheme } from './BusinessOwner.theme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

type BusinessSummary = {
  id: string;
  name: string;
  category: string | null;
  category_major: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  hero_image_url: string | null;
  logo_image_url: string | null;
  is_open_now: boolean | null;
  is_active: boolean;
  visitor_feed_count: number | null;
};

type Styles = ReturnType<typeof createStyles>;

type DashboardHeaderProps = {
  count: number;
  styles: Styles;
  t: (key: string, options?: any) => string;
};

const DashboardHeader = ({ count, styles, t }: DashboardHeaderProps) => {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.headerTextBox}>
        <Text style={styles.headerEyebrow}>{t('business:list.headerEyebrow')}</Text>
        <Text style={styles.headerTitle}>{t('business:list.title')}</Text>
        <Text style={styles.headerSubtitle}>
          {t('business:list.subtitle', { count })}
        </Text>
      </View>
    </View>
  );
};

type BusinessCardProps = {
  item: BusinessSummary;
  index: number;
  onPress: (id: string) => void;
  styles: Styles;
  ui: BusinessOwnerTheme;
  t: (key: string, options?: any) => string;
};

const BusinessCard = React.memo(({ item, index, onPress, styles, ui, t }: BusinessCardProps) => {
  const imageUrl = item.hero_image_url || item.logo_image_url;
  const categoryLabel = item.category_major || item.category || t('business:common.etc');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 260,
        delay: Math.min(index * 50, 180),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay: Math.min(index * 50, 180),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, index, translateY]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.985, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
  };

  return (
    <Animated.View style={[styles.cardAnimated, { opacity: fadeAnim, transform: [{ translateY }, { scale: scaleAnim }] }]}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => onPress(item.id)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.imageSection}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.bgImage} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderBg}>
              <Store size={34} color={ui.iconMuted} strokeWidth={1.7} />
            </View>
          )}

          <LinearGradient colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.62)']} style={StyleSheet.absoluteFill} />

          <View style={styles.badgesContainer}>
            {item.is_open_now ? (
              <View style={[styles.badge, styles.badgeOpen]}>
                <Clock size={10} color="#FFFFFF" strokeWidth={2} style={styles.badgeIcon} />
                <Text style={styles.badgeText}>{t('business:status.open')}</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeClosed]}>
                <Text style={styles.badgeText}>{t('business:status.preparing')}</Text>
              </View>
            )}

            {!item.is_active && (
              <View style={[styles.badge, styles.badgePending]}>
                <Text style={styles.badgeText}>{t('business:status.pending')}</Text>
              </View>
            )}
          </View>

          <View style={styles.imageContent}>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryText}>{categoryLabel}</Text>
            </View>
            <Text style={styles.storeName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.locationRow}>
              <MapPin size={12} color="#E5E7EB" strokeWidth={2} />
              <Text style={styles.locationText} numberOfLines={1}>{item.address || t('business:list.addressEmpty')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <Star size={14} color={ui.warning} fill={ui.warning} strokeWidth={1.7} />
              <Text style={styles.statValue}>{item.rating?.toFixed(1) || '0.0'}</Text>
            </View>
            <Text style={styles.statLabel}>{t('business:list.rating')}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <TrendingUp size={14} color={ui.success} strokeWidth={1.9} />
              <Text style={styles.statValue}>{item.visitor_feed_count || 0}</Text>
            </View>
            <Text style={styles.statLabel}>{t('business:list.visitorFeed')}</Text>
          </View>

          <View style={styles.manageArea}>
            <Text style={styles.manageText}>{t('business:actions.manage')}</Text>
            <ChevronRight size={16} color={ui.iconMuted} strokeWidth={2} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const MyBusinessListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createBusinessOwnerTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const showListToast = useCallback(
    (message: string, tone: 'default' | 'success' | 'warning' | 'danger' = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );

  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyBusinesses = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase
        .from('businesses')
        .select(`
          id, name, category, category_major, address,
          rating, review_count, hero_image_url, logo_image_url,
          is_open_now, is_active, created_at, visitor_feed_count
        `)
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBusinesses((data ?? []) as BusinessSummary[]);
    } catch {
      showListToast(t('business:list.loadFail'), 'danger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showListToast, t]);

  useFocusEffect(
    useCallback(() => {
      fetchMyBusinesses();
    }, [fetchMyBusinesses]),
  );

  const handleCreateNew = () => navigation.navigate('BusinessManager', { businessId: null });
  const handleEdit = (id: string) => navigation.navigate('BusinessManager', { businessId: id });

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyCircle}>
        <Store size={42} color={ui.iconMuted} strokeWidth={1.7} />
      </View>
      <Text style={styles.emptyTitle}>{t('business:list.emptyTitle')}</Text>
      <Text style={styles.emptyDesc}>{t('business:list.emptyDesc')}</Text>
      <Pressable style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]} onPress={handleCreateNew}>
        <Text style={styles.ctaButtonText}>{t('business:list.register')}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{
          backgroundColor: ui.headerBg,
          borderBottomColor: ui.headerBorder,
        }}
        titleComponent={
          <View style={styles.globalHeaderRow}>
            <View style={styles.globalHeaderLeft}>
              <HeaderIconButton onPress={() => navigation.goBack()}>
                <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2.1} />
              </HeaderIconButton>
              <Text style={styles.globalHeaderTitle}>{t('business:common.center')}</Text>
            </View>
            <HeaderIconButton onPress={handleCreateNew}>
              <Plus size={21} color={ui.headerIcon} strokeWidth={2.1} />
            </HeaderIconButton>
          </View>
        }
      />

      <FlatList
        data={loading ? [] : businesses}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <BusinessCard item={item} index={index} onPress={handleEdit} styles={styles} ui={ui} t={t} />}
        ListHeaderComponent={<DashboardHeader count={businesses.length} styles={styles} t={t} />}
        ListEmptyComponent={loading ? <ActivityIndicator style={styles.loadingIndicator} color={ui.textPrimary} /> : EmptyState}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 10) + 30 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchMyBusinesses();
            }}
            tintColor={ui.textPrimary}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        bottomOffset={Math.max(insets.bottom + 28, 36)}
        onHidden={hideToast}
      />
    </SafeScreen>
  );
};

export default MyBusinessListScreen;

function createStyles(ui: BusinessOwnerTheme) {
  return StyleSheet.create({
    pressed: { opacity: ui.pressedOpacity },
    container: {
      flex: 1,
      backgroundColor: ui.background,
    },
    globalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minWidth: 0,
      flex: 1,
    },
    globalHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      flex: 1,
    },
    globalHeaderTitle: {
      flexShrink: 1,
      fontSize: 17,
      fontWeight: '700',
      color: ui.headerText,
      letterSpacing: -0.2,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    headerTextBox: { flex: 1, paddingRight: 14 },
    headerEyebrow: {
      fontSize: 13,
      fontWeight: '700',
      color: ui.textSecondary,
      marginBottom: 5,
    },
    headerTitle: {
      fontSize: 25,
      lineHeight: 31,
      fontWeight: '800',
      color: ui.textPrimary,
      letterSpacing: -0.8,
      marginBottom: 6,
    },
    headerSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    highlightText: {
      fontWeight: '800',
      color: ui.textPrimary,
    },
    createButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.primaryButtonBackground,
      ...ui.shadowSoft,
    },
    cardAnimated: { marginBottom: 14 },
    card: {
      overflow: 'hidden',
      borderRadius: ui.radius.container,
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      ...ui.shadowSoft,
    },
    imageSection: {
      height: 174,
      position: 'relative',
      justifyContent: 'flex-end',
      backgroundColor: ui.imagePlaceholder,
    },
    bgImage: { ...StyleSheet.absoluteFillObject },
    placeholderBg: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.imagePlaceholder,
    },
    badgesContainer: {
      position: 'absolute',
      top: 14,
      left: 14,
      right: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: ui.radius.pill,
    },
    badgeIcon: { marginRight: 3 },
    badgeOpen: { backgroundColor: ui.success },
    badgeClosed: { backgroundColor: 'rgba(107, 114, 128, 0.92)' },
    badgePending: { backgroundColor: ui.warning },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    imageContent: {
      paddingHorizontal: 15,
      paddingBottom: 15,
      zIndex: 1,
    },
    categoryTag: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: ui.radius.pill,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
      borderWidth: ui.hairline,
      borderColor: 'rgba(255, 255, 255, 0.22)',
      marginBottom: 7,
    },
    categoryText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    storeName: {
      color: '#FFFFFF',
      fontSize: 22,
      lineHeight: 27,
      fontWeight: '800',
      letterSpacing: -0.6,
      marginBottom: 4,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    locationText: {
      flex: 1,
      color: '#E5E7EB',
      fontSize: 12,
      fontWeight: '600',
    },
    statsSection: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      paddingVertical: 12,
      backgroundColor: ui.surface,
      borderTopWidth: ui.hairline,
      borderTopColor: ui.divider,
    },
    statItem: { minWidth: 70 },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    statValue: {
      marginLeft: 4,
      fontSize: 15,
      fontWeight: '800',
      color: ui.textPrimary,
      letterSpacing: -0.2,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: ui.textSecondary,
    },
    statDivider: {
      width: ui.hairline,
      height: 26,
      backgroundColor: ui.divider,
      marginHorizontal: 14,
    },
    manageArea: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
    },
    manageText: {
      fontSize: 13,
      fontWeight: '800',
      color: ui.textPrimary,
      marginRight: 2,
    },
    loadingIndicator: { marginTop: 70 },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
      paddingVertical: 48,
      borderRadius: ui.radius.container,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      backgroundColor: ui.surface,
    },
    emptyCircle: {
      width: 82,
      height: 82,
      borderRadius: 41,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.control,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      marginBottom: 18,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: ui.textPrimary,
      letterSpacing: -0.4,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textSecondary,
      textAlign: 'center',
      marginBottom: 22,
    },
    ctaButton: {
      height: 48,
      paddingHorizontal: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ui.radius.container,
      backgroundColor: ui.primaryButtonBackground,
    },
    ctaButtonText: {
      color: ui.primaryButtonText,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
  });
}
