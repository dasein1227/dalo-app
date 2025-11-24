// src/screens/permissions/Request.tsx
import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

type Boolish = boolean | null;

export default function PermissionsRequest() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [locGranted, setLocGranted] = useState<Boolish>(null);
  const [bgGranted, setBgGranted] = useState<Boolish>(null);     // ✅ 배경 위치
  const [notiGranted, setNotiGranted] = useState<Boolish>(null);
  const [loading, setLoading] = useState(false);

  const readGranted = (res: Location.PermissionResponse) =>
    res.status === Location.PermissionStatus.GRANTED;

  const refresh = useCallback(async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      setLocGranted(readGranted(fg));
      const bg = await Location.getBackgroundPermissionsAsync();
      setBgGranted(readGranted(bg));
      const ns = await Notifications.getPermissionsAsync();
      setNotiGranted(ns.granted === true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const askLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocGranted(status === Location.PermissionStatus.GRANTED);
    } catch { setLocGranted(false); }
  };

  const askBackgroundLocation = async () => {
    try {
      // 배경 위치는 항상 포그라운드 허용 후 요청
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== Location.PermissionStatus.GRANTED) {
        const req = await Location.requestForegroundPermissionsAsync();
        setLocGranted(req.status === Location.PermissionStatus.GRANTED);
        if (req.status !== Location.PermissionStatus.GRANTED) return;
      }
      const bg = await Location.requestBackgroundPermissionsAsync();
      setBgGranted(bg.status === Location.PermissionStatus.GRANTED);
    } catch { setBgGranted(false); }
  };

  const ensureAndroidChannel = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [300, 250, 300],
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
  };

  const askNotifications = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted' || (status as unknown as string) === 'provisional';
      setNotiGranted(granted);
      await ensureAndroidChannel();
    } catch { setNotiGranted(false); }
  };

  const openSettings = () => Linking.openSettings();

  const onContinue = async () => {
    // ✅ 배경 위치는 선택이므로 어떤 상태든 통과
    try {
      setLoading(true);
      await AsyncStorage.setItem('permissions.v1', JSON.stringify({
        location: !!locGranted,
        location_background: !!bgGranted,   // 저장만 해둠 (선택)
        notifications: !!notiGranted,
        at: Date.now(),
      }));
      nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } finally { setLoading(false); }
  };

  const Row = ({
    title, desc, granted, onPress, hint
  }: {
    title: string; desc: string; granted: Boolish; onPress: () => void; hint?: string;
  }) => (
    <View style={s.card} accessibilityRole="summary">
      <Text style={s.title}>{title}</Text>
      <Text style={s.desc}>{desc}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      <View style={s.rowBtns}>
        <Pressable
          onPress={onPress}
          style={[s.btn, granted ? s.btnGhost : undefined]}
          accessibilityRole="button"
          accessibilityLabel={granted ? t('permissions.allowed') : t('permissions.allow_now')}
        >
          <Text style={[s.btnText, granted ? s.btnTextDark : s.btnTextLight]}>
            {granted ? t('permissions.allowed') : t('permissions.allow_now')}
          </Text>
        </Pressable>
        {!granted && (
          <Pressable
            onPress={openSettings}
            style={[s.btn, s.btnGhost]}
            accessibilityRole="button"
            accessibilityLabel={t('permissions.open_settings')}
          >
            <Text style={s.btnTextDark}>{t('permissions.open_settings')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const primaryCtaLabel = locGranted ? t('common.continue') : t('permissions.continue_without_location');

  return (
    <SafeAreaView style={s.wrap}>
      {/* 프로젝트 기본 정책 */}
      <StatusBar backgroundColor="#fff" barStyle="dark-content" translucent={false} />

      <Text style={s.header}>{t('permissions.title')}</Text>
      <Text style={s.sub}>{t('permissions.subtitle')}</Text>

      {/* 1) 위치(포그라운드) - 권장 */}
      <Row
        title={t('permissions.location_title')}
        desc={t('permissions.location_desc')}
        granted={locGranted}
        onPress={askLocation}
      />

      {/* 2) 배경 위치 - 선택 */}
      <Row
        title={t('permissions.background_location_title')}
        desc={t('permissions.background_location_desc')}
        hint={t('permissions.background_location_hint')}
        granted={bgGranted}
        onPress={askBackgroundLocation}
      />

      {/* 3) 알림 - 선택 */}
      <Row
        title={t('permissions.notifications_title')}
        desc={t('permissions.notifications_desc')}
        granted={notiGranted}
        onPress={askNotifications}
      />

      <Pressable
        onPress={onContinue}
        disabled={loading}
        style={[s.primary, !locGranted ? s.primarySoft : undefined]}
        accessibilityRole="button"
        accessibilityLabel={primaryCtaLabel}
      >
        <Text style={s.primaryText}>{primaryCtaLabel}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 18 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  sub: { color: '#666', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { color: '#666', marginTop: 4, lineHeight: 20 },
  hint: { color: '#8A8A8A', marginTop: 6, fontSize: 12, lineHeight: 18 },
  rowBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2F80ED' },
  btnGhost: { backgroundColor: '#E9EEF9' },
  btnText: { fontWeight: '600' },
  btnTextLight: { color: '#fff' },
  btnTextDark: { color: '#111' },
  primary: {
    marginTop: 10,
    backgroundColor: '#2F80ED',
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySoft: { backgroundColor: '#6B7280' },
  primaryText: { color: '#fff', fontWeight: '700' },
});
