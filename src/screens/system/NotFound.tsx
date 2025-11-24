// src/screens/NotFound.tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppHeader from '@/components/AppHeader';

type RetryRoute =
  | { name: string; params?: Record<string, any> }
  | null;

export default function NotFound() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // 선택 파라미터: { reason?: string, retryRoute?: { name, params } }
  const reason: string | undefined = route?.params?.reason;
  const retryRoute: RetryRoute = route?.params?.retryRoute ?? null;

  const desc = useMemo(() => {
    if (reason?.trim()) return reason.trim();
    return '요청하신 화면을 찾을 수 없어요. 경로나 파라미터가 올바른지 확인해 주세요.';
  }, [reason]);

  const canGoBack = navigation.canGoBack?.() ?? false;

  const onRetry = () => {
    if (retryRoute?.name) {
      try {
        navigation.navigate(retryRoute.name, retryRoute.params ?? {});
        return;
      } catch {
        // 실패 시 홈으로
      }
    }
    // 안전 폴백: 홈 탭(또는 메인)으로
    navigation.reset({ index: 0, routes: [{ name: 'Home' as any }] });
  };

  const goHome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Home' as any }] });
  };

  const goBackSafe = () => {
    if (canGoBack) navigation.goBack();
    else goHome();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader title="Not Found" showBack />
      <View style={s.wrap}>
        <Text style={s.title}>페이지를 찾을 수 없어요</Text>
        <Text style={s.sub} numberOfLines={3}>{desc}</Text>

        <View style={{ height: 12 }} />

        <Pressable style={[s.btn, s.primary]} onPress={onRetry}>
          <Text style={s.primaryTxt}>{retryRoute?.name ? '다시 시도' : '홈으로 이동'}</Text>
        </Pressable>

        <View style={{ height: 8 }} />

        <Pressable style={[s.btn, s.ghost]} onPress={goBackSafe}>
          <Text style={s.ghostTxt}>{canGoBack ? '이전으로' : '홈으로'}</Text>
        </Pressable>

        {/* (선택) 빠른 이동 단축키들 */}
        <View style={s.quickRow}>
          <Pressable style={s.quick} onPress={() => navigation.navigate('Friends' as any)}>
            <Text style={s.quickTxt}>친구</Text>
          </Pressable>
          <Pressable style={s.quick} onPress={() => navigation.navigate('MeStack' as any)}>
            <Text style={s.quickTxt}>설정</Text>
          </Pressable>
        </View>

        {/* 디버그 힌트(개발 중 도움) */}
        {!!__DEV__ && (
          <View style={s.debug}>
            <Text style={s.debugTxt}>route.name: {String(route?.name ?? '-')}</Text>
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

  quickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  quick: {
    paddingHorizontal: 12, height: 36, borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  quickTxt: { color: '#111827', fontWeight: '800' },

  debug: {
    marginTop: 16, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fef3c7',
    alignSelf: 'stretch',
  },
  debugTxt: { color: '#92400e', fontSize: 12 },
});
