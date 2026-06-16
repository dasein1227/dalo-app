// src/screens/chat/ChatRoomGate.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Crown, Edit3 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SafeScreen from '@/components/layout/SafeScreen';
import { useAppTheme } from '@/theme/useAppTheme';
import { supabase } from '@/lib/supabase';
import { syncChatRooms } from '@/lib/chatSync/roomSync';
import { createChatRoomGateTheme } from './ChatRoomGate.theme';
import OpenProfileJoinModal, { type OpenProfileJoinSelection } from './openProfiles/OpenProfileJoinModal';

type GateKind = 'open' | 'business';

type HostProfile = {
  name: string | null;
  avatarUrl: string | null;
};

type MyOpenRoomMembership = {
  openProfileId: string | null;
  roomNickname: string | null;
  roomAvatarUrl: string | null;
  roomAvatarVisible: boolean;
};

type OpenGateData = {
  room_id: number;
  title: string;
  cover_image_url: string | null;
  description: string | null;
  tags: string[];
  category: string | null;
  member_count: number;
  max_members: number | null;
  is_joined: boolean;
  is_editable: boolean;
  created_at: string | null;
  host: HostProfile;
};

type BusinessGateData = {
  business_id: string;
  name: string;
  category: string | null;
  category_major: string | null;
  category_minor: string | null;
  short_intro: string | null;
  one_line_intro: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  detail_address: string | null;
  is_open_now: boolean | null;
  open_time: string | null;
  close_time: string | null;
  main_image_url: string | null;
  hero_image_url: string | null;
  logo_image_url: string | null;
  rating: number | null;
  review_count: number;
  existing_room_id: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function firstRpcRow<T = any>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  if (data && typeof data === 'object') return data as T;
  return null;
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function cleanNullable(value: unknown): string | null {
  const text = cleanString(value);
  return text || null;
}

function numericOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roomIdFromJoinRpc(data: unknown, fallback: number): number {
  if (Array.isArray(data)) {
    const row = data[0] as any;
    const next = Number(row?.room_id ?? row?.id ?? row);
    return Number.isFinite(next) && next > 0 ? next : fallback;
  }

  if (data && typeof data === 'object') {
    const row = data as any;
    const next = Number(row?.room_id ?? row?.id);
    return Number.isFinite(next) && next > 0 ? next : fallback;
  }

  const next = Number(data);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function isMissingJoinProfileRpc(error: any): boolean {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42883' || message.includes('join_open_chat_room_v2') || message.includes('function') && message.includes('does not exist');
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function getInitial(value: string | null | undefined, fallback = 'C') {
  const text = cleanString(value);
  return (text.slice(0, 1) || fallback).toUpperCase();
}

function normalizeTag(tag: string) {
  return cleanString(tag).replace(/^#+/, '');
}


function hostProfileFromOpenGateRow(row: any): HostProfile {
  return {
    name:
      cleanNullable(row?.owner_nickname) ||
      cleanNullable(row?.owner_name) ||
      cleanNullable(row?.host_nickname) ||
      cleanNullable(row?.host_name) ||
      cleanNullable(row?.creator_nickname) ||
      cleanNullable(row?.creator_name),
    avatarUrl:
      cleanNullable(row?.owner_avatar_url) ||
      cleanNullable(row?.ownerAvatarUrl) ||
      cleanNullable(row?.host_avatar_url) ||
      cleanNullable(row?.hostAvatarUrl) ||
      cleanNullable(row?.creator_avatar_url) ||
      cleanNullable(row?.creatorAvatarUrl),
  };
}

function hasHostProfile(profile: HostProfile) {
  return !!(profile.name || profile.avatarUrl);
}
async function fetchOpenHostProfile(roomId: number): Promise<HostProfile> {
  try {
    const { data: members, error: memberError } = await supabase
      .from('chat_members')
      .select('user_id, role')
      .eq('room_id', roomId)
      .eq('active', true)
      .in('role', ['host', 'owner', 'admin', 'operator'])
      .limit(1);

    if (memberError) throw memberError;

    const hostUserId = cleanNullable((members as any[])?.[0]?.user_id);
    if (!hostUserId) return { name: null, avatarUrl: null };

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, id, nickname, follow_id, avatar_url')
      .or(`user_id.eq.${hostUserId},id.eq.${hostUserId}`)
      .limit(1);

    if (profileError) throw profileError;

    const profile = (profiles as any[])?.[0] ?? null;
    return {
      name: cleanNullable(profile?.nickname) || cleanNullable(profile?.follow_id),
      avatarUrl: cleanNullable(profile?.avatar_url),
    };
  } catch {
    return { name: null, avatarUrl: null };
  }
}


async function fetchMyOpenRoomMembership(roomId: number): Promise<MyOpenRoomMembership | null> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const userId = userData?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('chat_members')
      .select('open_profile_id, room_nickname, room_avatar_url, room_avatar_visible')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      openProfileId: cleanNullable((data as any).open_profile_id),
      roomNickname: cleanNullable((data as any).room_nickname),
      roomAvatarUrl: cleanNullable((data as any).room_avatar_url),
      roomAvatarVisible: (data as any).room_avatar_visible !== false,
    };
  } catch {
    return null;
  }
}

function hasRoomOpenProfile(membership: MyOpenRoomMembership | null) {
  if (!membership) return false;
  return !!membership.openProfileId && !!membership.roomNickname;
}

export default function ChatRoomGate() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation('chat');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createChatRoomGateTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);

  const kind = cleanString(route.params?.kind) as GateKind;
  const roomId = Number(route.params?.roomId ?? route.params?.room_id ?? 0);
  const businessId = cleanString(route.params?.businessId ?? route.params?.business_id);

  const [openData, setOpenData] = useState<OpenGateData | null>(null);
  const [businessData, setBusinessData] = useState<BusinessGateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [openProfileJoinVisible, setOpenProfileJoinVisible] = useState(false);
  const [needsOpenProfileSelection, setNeedsOpenProfileSelection] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const isBusiness = kind === 'business';
  const isOpen = kind === 'open';

  const ctaFullHeight = Math.max(insets.bottom, 12) + 74;

  // Layout rule: hero image takes about 60% of the screen.
  // The collapsed information sheet starts around 55%, leaving a subtle 5% overlap
  // that hides the hero/sheet seam without making the sheet feel too high.
  const heroHeight = Math.round(clamp(windowHeight * 0.6, 360, windowHeight * 0.62));
  const sheetOverlap = Math.round(clamp(windowHeight * 0.05, 26, 44));
  const sheetTopCollapsed = Math.max(insets.top + 230, heroHeight - sheetOverlap);
  const collapsedSheetHeight = Math.max(220, windowHeight - ctaFullHeight - sheetTopCollapsed);
  const expandedSheetHeight = Math.max(
    collapsedSheetHeight,
    windowHeight - insets.top - ctaFullHeight - 18,
  );
  const heroInfoTop = Math.max(insets.top + 104, sheetTopCollapsed - 122);

  const animatedSheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedSheetHeight, expandedSheetHeight],
  });

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: sheetExpanded ? 1 : 0,
      useNativeDriver: false,
      damping: 24,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [sheetAnim, sheetExpanded]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy < -18) setSheetExpanded(true);
        else if (gesture.dy > 18) setSheetExpanded(false);
      },
    }),
    [],
  );

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);

        if (isOpen && roomId > 0) {
          const { data, error } = await supabase.rpc('get_open_chat_room_profile_v1', {
            p_room_id: roomId,
          });
          if (error) throw error;
          const row = firstRpcRow<any>(data);
          if (!row) throw new Error('open_gate_not_found');

          const rpcHost = hostProfileFromOpenGateRow(row);
          const effectiveRoomId = Number(row.room_id ?? roomId);
          const host = hasHostProfile(rpcHost)
            ? rpcHost
            : await fetchOpenHostProfile(effectiveRoomId);
          const myMembership = row.is_joined === true
            ? await fetchMyOpenRoomMembership(effectiveRoomId)
            : null;
          if (!alive) return;

          setNeedsOpenProfileSelection(row.is_joined === true && !hasRoomOpenProfile(myMembership));

          setOpenData({
            room_id: effectiveRoomId,
            title: cleanString(row.title) || cleanString(route.params?.initialTitle) || t('openProfile.common.openChat'),
            cover_image_url: cleanNullable(row.cover_image_url ?? route.params?.initialCoverUrl),
            description: cleanNullable(row.description),
            tags: Array.isArray(row.tags) ? row.tags.map(cleanString).filter(Boolean).slice(0, 12) : [],
            category: cleanNullable(row.category),
            member_count: Number(row.member_count ?? 0) || 0,
            max_members: numericOrNull(row.max_members),
            is_joined: row.is_joined === true,
            is_editable: row.is_editable === true,
            created_at: cleanNullable(row.created_at),
            host,
          });
          return;
        }

        if (isBusiness && businessId) {
          const { data, error } = await supabase.rpc('get_business_chat_gate_v1', {
            p_business_id: businessId,
          });
          if (error) throw error;
          const row = firstRpcRow<any>(data);
          if (!row) throw new Error('business_gate_not_found');
          if (!alive) return;

          setNeedsOpenProfileSelection(false);
          setBusinessData({
            business_id: cleanString(row.business_id),
            name: cleanString(row.name) || t('openProfile.common.business'),
            category: cleanNullable(row.category),
            category_major: cleanNullable(row.category_major),
            category_minor: cleanNullable(row.category_minor),
            short_intro: cleanNullable(row.short_intro),
            one_line_intro: cleanNullable(row.one_line_intro),
            description: cleanNullable(row.description),
            phone: cleanNullable(row.phone),
            address: cleanNullable(row.address),
            detail_address: cleanNullable(row.detail_address),
            is_open_now: row.is_open_now === null || row.is_open_now === undefined ? null : row.is_open_now === true,
            open_time: cleanNullable(row.open_time),
            close_time: cleanNullable(row.close_time),
            main_image_url: cleanNullable(row.main_image_url),
            hero_image_url: cleanNullable(row.hero_image_url),
            logo_image_url: cleanNullable(row.logo_image_url),
            rating: numericOrNull(row.rating),
            review_count: Number(row.review_count ?? 0) || 0,
            existing_room_id: numericOrNull(row.existing_room_id),
          });
          return;
        }

        throw new Error('invalid_gate_params');
      } catch {
        if (!alive) return;
        Alert.alert(t('openProfile.common.notice'), t('openProfile.gate.loadFailed'));
        navigation.goBack();
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, [businessId, isBusiness, isOpen, navigation, roomId, route.params?.initialCoverUrl, route.params?.initialTitle, t]);

  const goChat = (
    nextRoomId: number,
    title: string,
    avatarUrl?: string | null,
    type?: string,
    subtype?: string | null,
    nextBusinessId?: string | null,
  ) => {
    navigation.replace('Chat', {
      id: nextRoomId,
      room_id: nextRoomId,
      roomId: nextRoomId,
      title,
      roomTitle: title,
      avatar_url: avatarUrl ?? null,
      room_avatar_url: avatarUrl ?? null,
      cover_image_url: avatarUrl ?? null,
      type: type ?? (isBusiness ? 'dm' : 'open'),
      roomType: type ?? (isBusiness ? 'dm' : 'open'),
      subtype: subtype ?? (isBusiness ? 'business_dm' : null),
      business_id: nextBusinessId ?? businessData?.business_id ?? null,
      source: isBusiness ? 'business_gate' : 'open_chat_gate',
    });
  };

  const joinOpenRoomWithProfile = async (profile: OpenProfileJoinSelection): Promise<number> => {
    if (!openData) throw new Error('open_gate_not_found');

    try {
      const { data, error } = await supabase.rpc('join_open_chat_room_v2', {
        p_room_id: openData.room_id,
        p_open_profile_id: profile.id,
      });

      if (error) throw error;
      return roomIdFromJoinRpc(data, openData.room_id);
    } catch (error: any) {
      if (!isMissingJoinProfileRpc(error)) throw error;

      const { data, error: legacyError } = await supabase.rpc('join_open_chat_room_v1', {
        p_room_id: openData.room_id,
      });
      if (legacyError) throw legacyError;

      const nextRoomId = roomIdFromJoinRpc(data, openData.room_id);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const userId = userData?.user?.id;
      if (!userId) throw new Error('session_not_found');

      const { error: updateError } = await supabase
        .from('chat_members')
        .update({
          open_profile_id: profile.id,
          room_nickname: cleanString(profile.nickname) || t('openProfile.common.user'),
          room_avatar_url: cleanNullable(profile.avatar_url),
          room_avatar_visible: true,
          room_status_message: cleanNullable(profile.status_message),
          room_profile_updated_at: new Date().toISOString(),
        })
        .eq('room_id', nextRoomId)
        .eq('user_id', userId);

      if (updateError) throw updateError;
      return nextRoomId;
    }
  };

  const handleJoinWithOpenProfile = async (profile: OpenProfileJoinSelection) => {
    if (submitting || !openData) return;

    try {
      setSubmitting(true);
      const nextRoomId = await joinOpenRoomWithProfile(profile);
      await syncChatRooms({ reason: 'join_open_chat_room_gate_profile', force: true, minIntervalMs: 0 });
      setOpenProfileJoinVisible(false);
      setNeedsOpenProfileSelection(false);
      setOpenData((prev) => prev ? { ...prev, is_joined: true } : prev);
      goChat(nextRoomId, openData.title, openData.cover_image_url, 'open');
    } catch (error) {
      Alert.alert(t('openProfile.common.notice'), t('openProfile.gate.joinFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimaryPress = async () => {
    if (submitting) return;

    if (isOpen && openData && (!openData.is_joined || needsOpenProfileSelection)) {
      setOpenProfileJoinVisible(true);
      return;
    }

    try {
      setSubmitting(true);

      if (isOpen && openData) {
        goChat(openData.room_id, openData.title, openData.cover_image_url, 'open');
        return;
      }

      if (isBusiness && businessData) {
        const nextExistingRoom = Number(businessData.existing_room_id ?? 0);
        if (Number.isFinite(nextExistingRoom) && nextExistingRoom > 0) {
          goChat(
            nextExistingRoom,
            businessData.name,
            businessData.main_image_url || businessData.hero_image_url || businessData.logo_image_url,
            'dm',
            'business_dm',
            businessData.business_id,
          );
          return;
        }

        const { data, error } = await supabase.rpc('start_business_chat_v1', {
          p_business_id: businessData.business_id,
        });
        if (error) throw error;

        const nextRoomId = Number(data);
        await syncChatRooms({ reason: 'start_business_chat_gate', force: true, minIntervalMs: 0 });
        goChat(
          nextRoomId,
          businessData.name,
          businessData.main_image_url || businessData.hero_image_url || businessData.logo_image_url,
          'dm',
          'business_dm',
          businessData.business_id,
        );
      }
    } catch {
      Alert.alert(t('openProfile.common.notice'), t('openProfile.common.tryAgain'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpenProfile = () => {
    if (!isOpen || !openData?.is_editable) return;
    navigation.navigate('OpenChatProfileEdit', {
      roomId: openData.room_id,
      initialTitle: openData.title,
      initialCoverUrl: openData.cover_image_url,
    });
  };

  const title = isBusiness ? businessData?.name : openData?.title;
  const coverUrl = isBusiness
    ? businessData?.main_image_url || businessData?.hero_image_url || businessData?.logo_image_url || null
    : openData?.cover_image_url || null;
  const thumbnailUrl = isBusiness
    ? businessData?.logo_image_url || businessData?.main_image_url || businessData?.hero_image_url || null
    : openData?.host.avatarUrl || null;
  const intro = isBusiness
    ? businessData?.one_line_intro || businessData?.short_intro || businessData?.description || null
    : openData?.description || null;
  const heroCategory = isBusiness
    ? businessData?.category_major || businessData?.category || t('openProfile.common.business')
    : openData?.category || t('openProfile.common.openChat');
  const ctaText = isBusiness
    ? businessData?.existing_room_id
      ? t('openProfile.gate.enterChat')
      : t('openProfile.gate.startConsult')
    : openData?.is_joined
      ? needsOpenProfileSelection
        ? t('openProfile.gate.selectProfileEnter')
        : t('openProfile.gate.enterChat')
      : t('openProfile.gate.joinOpenChat');
  const createdAtText = isOpen ? formatDate(openData?.created_at) : null;
  const businessAddress = [businessData?.address, businessData?.detail_address].filter(Boolean).join(' ');
  const businessCategoryText = [businessData?.category_major || businessData?.category, businessData?.category_minor]
    .filter(Boolean)
    .join(' · ');
  const businessHoursText = isBusiness && businessData
    ? [
        businessData.is_open_now === null ? null : businessData.is_open_now ? t('openProfile.gate.openNow') : t('openProfile.gate.closed'),
        businessData.open_time || businessData.close_time
          ? `${businessData.open_time || '-'} - ${businessData.close_time || '-'}`
          : null,
      ].filter(Boolean).join(' · ')
    : null;
  const openMetaText = isOpen && openData
    ? [
        openData.max_members
          ? t('openProfile.gate.participantsWithMax', { count: openData.member_count, max: openData.max_members })
          : t('openProfile.gate.participants', { count: openData.member_count }),
        createdAtText ? t('openProfile.gate.createdAt', { date: createdAtText }) : null,
      ].filter(Boolean).join(' · ')
    : null;
  const hostName = openData?.host.name || t('openProfile.gate.host');

  return (
    <SafeScreen
      backgroundColor={ui.colors.sheet}
      includeTopInset={false}
      includeBottomInset={false}
      style={styles.root}
      contentStyle={styles.contentRoot}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={ui.colors.loading} />
        </View>
      ) : (
        <>
          <View style={[styles.heroWrap, { height: heroHeight }]}> 
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroFallbackText}>{getInitial(title, isBusiness ? 'B' : 'O')}</Text>
              </View>
            )}
            <LinearGradient
              colors={[
                'rgba(0,0,0,0.08)',
                'rgba(0,0,0,0.04)',
                'rgba(0,0,0,0.22)',
                'rgba(0,0,0,0.68)',
              ]}
              locations={[0, 0.42, 0.72, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>

          <View style={[styles.topActions, { top: insets.top + 10 }]}> 
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topIconButton}>
              <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2.05} />
            </Pressable>
            {isOpen && openData?.is_editable ? (
              <Pressable onPress={handleEditOpenProfile} hitSlop={10} style={styles.topIconButton}>
                <Edit3 size={18} color="#FFFFFF" strokeWidth={2.05} />
              </Pressable>
            ) : (
              <View style={styles.topIconSpacer} />
            )}
          </View>

          <View style={[styles.heroInfo, { top: heroInfoTop }]}> 
            <View style={styles.heroCategoryPill}>
              <Text style={styles.heroCategoryText} numberOfLines={1}>{heroCategory}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
            {openMetaText ? <Text style={styles.heroMetaText} numberOfLines={1}>{openMetaText}</Text> : null}
            {isBusiness && businessData ? (
              <Text style={styles.heroMetaText} numberOfLines={1}>
                {[businessCategoryText || t('openProfile.common.business'), businessHoursText].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>

          <Animated.View style={[styles.sheet, { height: animatedSheetHeight, bottom: ctaFullHeight }]}> 
            <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
              <Pressable onPress={() => setSheetExpanded((prev) => !prev)} hitSlop={8} style={styles.sheetHandleButton}>
                <View style={styles.sheetHandle} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={sheetExpanded}
              bounces={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              <View style={styles.profileRow}>
                <View style={styles.avatarWrap}>
                  {thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} style={styles.avatar} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{getInitial(isBusiness ? title : hostName, isBusiness ? 'B' : 'O')}</Text>
                    </View>
                  )}
                  {isOpen ? (
                    <View style={styles.hostBadge}>
                      <Crown size={10} color={ui.colors.hostBadgeIcon} strokeWidth={2.2} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.profileTextWrap}>
                  <Text style={styles.profileTitle} numberOfLines={1}>{isBusiness ? title : hostName}</Text>
                  {isBusiness ? (
                    <Text style={styles.profileSubtitle} numberOfLines={1}>{businessCategoryText || t('openProfile.common.business')}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.descriptionSection}>
                <Text style={[styles.bodyText, !intro ? styles.bodyTextEmpty : null]}>
                  {intro || (isOpen ? t('openProfile.gate.introEmpty') : '')}
                </Text>
              </View>

              {isOpen && openData?.tags?.length ? (
                <View style={styles.tagSection}>
                  <View style={styles.tagWrap}>
                    {openData.tags.map((tag) => {
                      const safeTag = normalizeTag(tag);
                      if (!safeTag) return null;
                      return (
                        <View key={safeTag} style={styles.tagChip}>
                          <Text style={styles.tagText}>#{safeTag}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {isBusiness && businessData ? (
                <View style={styles.infoSection}>
                  {!!businessAddress && (
                    <View style={styles.infoRow}>                      <Text style={styles.infoText}>{businessAddress}</Text>
                    </View>
                  )}
                  {!!businessHoursText && (
                    <View style={styles.infoRow}>                      <Text style={styles.infoText}>{businessHoursText}</Text>
                    </View>
                  )}
                  {!!businessData.phone && (
                    <View style={styles.infoRow}>                      <Text style={styles.infoText}>{businessData.phone}</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>

          <View style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}> 
            <Pressable
              onPress={handlePrimaryPress}
              disabled={submitting}
              style={[styles.ctaButton, submitting ? styles.ctaButtonDisabled : null]}
            >
              {submitting ? (
                <ActivityIndicator color={ui.colors.ctaText} />
              ) : (
                <Text style={styles.ctaText}>{ctaText}</Text>
              )}
            </Pressable>
          </View>

          <OpenProfileJoinModal
            visible={openProfileJoinVisible && isOpen && !!openData && (!openData.is_joined || needsOpenProfileSelection)}
            roomTitle={openData?.title}
            submitting={submitting}
            onCancel={() => {
              if (!submitting) setOpenProfileJoinVisible(false);
            }}
            onSelectProfile={handleJoinWithOpenProfile}
          />
        </>
      )}
    </SafeScreen>
  );
}

function createStyles(ui: ReturnType<typeof createChatRoomGateTheme>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: ui.colors.sheet,
    },
    contentRoot: {
      flex: 1,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
      backgroundColor: ui.colors.sheet,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.sheet,
    },
    heroWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1,
      overflow: 'hidden',
      backgroundColor: ui.colors.heroFallback,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.heroFallback,
    },
    heroFallbackText: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 68,
      fontWeight: '700',
    },
    topActions: {
      position: 'absolute',
      left: 18,
      right: 18,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topIconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    topIconSpacer: {
      width: 34,
      height: 34,
    },
    heroInfo: {
      position: 'absolute',
      left: 28,
      right: 28,
      zIndex: 10,
    },
    heroCategoryPill: {
      alignSelf: 'flex-start',
      minHeight: 28,
      paddingHorizontal: 11,
      paddingTop: 0,
      paddingBottom: 0,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
      marginBottom: 12,
    },
    heroCategoryText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 24,
      lineHeight: 31,
      fontWeight: '750' as any,
      letterSpacing: -0.6,
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 7,
    },
    heroMetaText: {
      marginTop: 8,
      color: 'rgba(255,255,255,0.9)',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: -0.2,
      textShadowColor: 'rgba(0,0,0,0.22)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 30,
      backgroundColor: ui.colors.sheet,
      borderTopLeftRadius: ui.radius.sheet,
      borderTopRightRadius: ui.radius.sheet,
      overflow: 'hidden',
    },
    sheetHandleArea: {
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHandleButton: {
      width: 96,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHandle: {
      width: 44,
      height: 4,
      borderRadius: 3,
      backgroundColor: ui.colors.handle,
    },
    sheetScrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 26,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 14,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.colors.border,
    },
    avatarWrap: {
      position: 'relative',
      width: 38,
      height: 38,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: ui.colors.surfaceSoft,
    },
    avatarFallback: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.surfaceSoft,
    },
    avatarFallbackText: {
      color: ui.colors.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    hostBadge: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: 17,
      height: 17,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.hostBadgeBg,
      borderWidth: 1.5,
      borderColor: ui.colors.sheet,
    },
    profileTextWrap: {
      flex: 1,
      minWidth: 0,
      marginLeft: 11,
    },
    profileTitle: {
      color: ui.colors.text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      letterSpacing: -0.35,
    },
    profileSubtitle: {
      marginTop: 3,
      color: ui.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      letterSpacing: -0.15,
    },
    descriptionSection: {
      paddingTop: 18,
      paddingBottom: 18,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.colors.border,
    },
    bodyText: {
      minHeight: 75,
      color: ui.colors.textSecondary,
      fontSize: 16,
      lineHeight: 25,
      fontWeight: '400',
      letterSpacing: -0.25,
    },
    bodyTextEmpty: {
      color: ui.colors.textMuted,
    },
    tagSection: {
      paddingTop: 16,
      paddingBottom: 1,
    },
    infoSection: {
      paddingTop: 16,
      paddingBottom: 1,
    },
    tagWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 8,
      rowGap: 8,
      paddingBottom: 18,
    },
    tagChip: {
      minHeight: 29,
      paddingHorizontal: 9,
      borderRadius: 15,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.colors.tagBg,
    },
    tagText: {
      color: ui.colors.link,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingBottom: 12,
    },
    infoText: {
      flex: 1,
      minWidth: 0,
      color: ui.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400',
      letterSpacing: -0.15,
    },
    ctaWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 40,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: ui.colors.sheet,
    },
    ctaButton: {
      height: 52,
      borderRadius: ui.radius.button,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.ctaBg,
    },
    ctaButtonDisabled: {
      opacity: 0.55,
    },
    ctaText: {
      color: ui.colors.ctaText,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '750' as any,
      letterSpacing: -0.2,
    },
  });
}
