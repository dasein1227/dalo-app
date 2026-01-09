// src/screens/Offline.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '@/components/AppHeader';
import { useNavigation, useRoute } from '@react-navigation/native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

type RetryRoute = { name: string; params?: Record<string, any> } | null;

/**
 * params (선택):
 * - reason?: string              // 오프라인 사유 메시지
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
    NetInfo.fetch().then(setNet).catch(() => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOnline) return;

    if (retryRoute?.name) {
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: retryRoute.name, params: retryRoute.params ?? {} }],
        });
        return;
      } catch {
        // fallthrough
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
        if (retryRoute?.name) {
          navigation.reset({
            index: 0,
            routes: [{ name: retryRoute.name, params: retryRoute.params ?? {} }],
          });
        } else if (navigation.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation.navigate('Home' as any);
        }
      }
    } catch {}
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:root=WIFI').catch(() => Linking.openSettings());
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Home' as any }] });

  return (
    <View style={styles.root}>
      {/* ✅ SplashGate/Login과 동일: StatusBar 투명 */}
      <StatusBar translucent backgroundColor="transparent" style="light" />

      {/* ✅ 동일한 톤의 배경 그라데이션 */}
      <LinearGradient
        colors={['#833ab4', '#fd1d1d', '#fcb045']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* SafeArea는 컨텐츠만 감싸고 배경은 root가 담당 */}
      <SafeAreaView style={styles.safe}>
        {/* 헤더가 흰 배경 전제일 수 있어 대비 보강 레이어 */}
        <View style={styles.headerBg}>
          <AppHeader title="Offline" showBack />
        </View>

        <View style={s.wrap}>
          <Text style={s.title}>오프라인 상태입니다</Text>
          <Text style={s.sub} numberOfLines={3}>
            {desc}
          </Text>

          <View style={{ height: 14 }} />

          <Pressable style={[s.btn, s.primary]} onPress={onRetry}>
            <Text style={s.primaryTxt}>
              {retryRoute?.name ? '다시 시도' : '연결 확인'}
            </Text>
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
              <Text style={s.debugTxt}>
                isInternetReachable: {String(net?.isInternetReachable)}
              </Text>
              <Text style={s.debugTxt}>
                retryRoute: {retryRoute ? JSON.stringify(retryRoute) : '(none)'}
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  safe: { flex: 1 },
  headerBg: {
    // 헤더 뒤에 반투명 딤을 깔아서 흰 헤더/검정 글자든 뭐든 읽히게
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },

  // 배경이 어두워질 수 있으니 텍스트 대비 변경
  title: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  sub: { marginTop: 6, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },

  btn: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
  },
  primary: {
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  primaryTxt: { color: '#fff', fontWeight: '800' },

  ghost: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  ghostTxt: { color: '#fff', fontWeight: '800' },

  debug: {
    marginTop: 16,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(253,230,138,0.6)',
    backgroundColor: 'rgba(254,243,199,0.9)',
    alignSelf: 'stretch',
  },
  debugTxt: { color: '#92400e', fontSize: 12 },
});
