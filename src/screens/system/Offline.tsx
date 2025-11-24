// src/screens/Offline.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '@/components/AppHeader';
import { useNavigation, useRoute } from '@react-navigation/native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type RetryRoute =
  | { name: string; params?: Record<string, any> }
  | null;

/**
 * params (선택):
 * - reason?: string           // 오프라인 사유 메시지
 * - retryRoute?: {name, params}  // 연결 복구 시 이동할 목적지
 * - autoBackOnOnline?: boolean   // true면 온라인 복귀 즉시 goBack()
 */
export default function Offline() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const reason: string | undefined = route?.params?.reason;
  const retryRoute: RetryRoute = route?.params?.retryRoute ?? null;
  const autoBackOnOnline: boolean = !!route?.params?.autoBackOnOnline;

  const [net, setNet] = useState<NetInfoState | null>(null);
  const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(setNet);
    // 초기값
    NetInfo.fetch().then(setNet).catch(() => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    // 온라인 복귀 시 동작
    if (retryRoute?.name) {
      try {
        navigation.reset({ index: 0, routes: [{ name: retryRoute.name, params: retryRoute.params ?? {} }] });
        return;
      } catch {
        // 실패 시 below
      }
    }
    if (autoBackOnOnline && navigation.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home' as any);
    }
  }, [isOnline, retryRoute, autoBackOnOnline, navigation]);

  const desc = useMemo(() => {
    if (reason?.trim()) return reason.trim();
    return '네트워크 연결을 확인해 주세요.\n와이파이 또는 모바일 데이터가 꺼져 있을 수 있어요.';
  }, [reason]);

  const onRetry = async () => {
    try {
      const cur = await NetInfo.fetch();
      if (cur.isConnected && cur.isInternetReachable !== false) {
        // 온라인이면 위 effect에서 자동 처리되지만 즉시 처리도 안전망으로
        if (retryRoute?.name) {
          navigation.reset({ index: 0, routes: [{ name: retryRoute.name, params: retryRoute.params ?? {} }] });
        } else if (navigation.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation.navigate('Home' as any);
        }
      }
    } catch {}
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') Linking.openURL('App-Prefs:root=WIFI').catch(() => Linking.openSettings());
    else Linking.openSettings().catch(() => {});
  };

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Home' as any }] });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader title="Offline" showBack />
      <View style={s.wrap}>
        <Text style={s.title}>오프라인 상태입니다</Text>
        <Text style={s.sub} numberOfLines={3}>{desc}</Text>

        <View style={{ height: 14 }} />

        <Pressable style={[s.btn, s.primary]} onPress={onRetry}>
          <Text style={s.primaryTxt}>{retryRoute?.name ? '다시 시도' : '연결 확인'}</Text>
        </Pressable>

        <View style={{ height: 8 }} />

        <Pressable style={[s.btn, s.ghost]} onPress={openSettings}>
          <Text style={s.ghostTxt}>설정 열기</Text>
        </Pressable>

        <View style={{ height: 8 }} />

        <Pressable style={[s.btn, s.ghost]} onPress={goHome}>
          <Text style={s.ghostTxt}>홈으로</Text>
        </Pressable>

        {!!__DEV__ && (
          <View style={s.debug}>
            <Text style={s.debugTxt}>isConnected: {String(net?.isConnected)}</Text>
            <Text style={s.debugTxt}>isInternetReachable: {String(net?.isInternetReachable)}</Text>
            <Text style={s.debugTxt}>retryRoute: {retryRoute ? JSON.stringify(retryRoute) : '(none)'}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  sub: { marginTop: 6, color: '#6b7280', textAlign: 'center' },

  btn: {
    height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    minWidth: 180,
  },
  primary: { backgroundColor: '#111827' },
  primaryTxt: { color: '#fff', fontWeight: '800' },
  ghost: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  ghostTxt: { color: '#111827', fontWeight: '800' },

  debug: {
    marginTop: 16, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fef3c7',
    alignSelf: 'stretch',
  },
  debugTxt: { color: '#92400e', fontSize: 12 },
});
