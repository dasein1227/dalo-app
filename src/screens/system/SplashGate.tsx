import React, { useEffect, useRef } from "react";
import {
  View,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";

import { supabase, resetSupabaseAuthStorage } from "@/lib/supabase";
import type { RootStackParamList } from "@/navigation/types";

const ONE_TIME_RESET_FLAG_KEY = "coonn_auth_reset_v3_done";

type Dest = {
  name: keyof RootStackParamList;
  state?: any;
};

export default function SplashGate() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const navigatedRef = useRef(false);
  const cancelledRef = useRef(false);

  const safeReset = (dest: Dest) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    navigation.reset({
      index: 0,
      routes: [{ name: dest.name as any, ...(dest.state ? { state: dest.state } : {}) }],
    });
  };

  /**
   * ✅ ANDROID EDGE-TO-EDGE (BOTTOM WHITE BAR FIX)
   */
  useEffect(() => {
    if (Platform.OS === "android") {
      (async () => {
        try {
          await NavigationBar.setPositionAsync("absolute");
          await NavigationBar.setBackgroundColorAsync("transparent");
          await NavigationBar.setButtonStyleAsync("light");
          await NavigationBar.setVisibilityAsync("visible");
        } catch (_) {
          // silent
        }
      })();
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    const run = async () => {
      try {
        // 0) Supabase auth 1회 초기화 (레이스 방지: 라우팅 전에 보장)
        try {
          const already = await AsyncStorage.getItem(ONE_TIME_RESET_FLAG_KEY);
          if (!already) {
            await resetSupabaseAuthStorage();
            await AsyncStorage.setItem(ONE_TIME_RESET_FLAG_KEY, "1");
          }
        } catch {}

        // 1) 애니메이션 완료 Promise
        const animDone = new Promise<void>((resolve) => {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 1000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]).start(() => resolve());
        });

        // 2) 라우팅 체크 Promise (PostLoginRouter 로직 흡수)
        const routeDone = (async (): Promise<Dest> => {
          // ✅ 2-1) 세션 확인
          const { data: sData, error: sErr } = await supabase.auth.getSession();
          if (sErr) return { name: "Login" };

          const session = sData?.session ?? null;
          const user = session?.user ?? null;
          if (!user) return { name: "Login" };

          const uid = user.id;

          // ✅ 2-2) 기본행 보장(public/private) - 병렬
          await Promise.all([
            supabase
              .from("profiles_public")
              .upsert({ user_id: uid }, { onConflict: "user_id" }),
            supabase
              .from("profiles_private")
              .upsert({ user_id: uid }, { onConflict: "user_id" }),
          ]);

          // ✅ 2-3) 약관/언어/닉네임 체크 - 병렬
          const [{ data: pri }, { data: pub }] = await Promise.all([
            supabase
              .from("profiles_private")
              .select("terms_accepted_at")
              .eq("user_id", uid)
              .maybeSingle(),
            supabase
              .from("profiles_public")
              .select("nickname, language_code")
              .eq("user_id", uid)
              .maybeSingle(),
          ]);

          if (!pri?.terms_accepted_at) return { name: "TermsConsent" };

          if (!pub?.nickname || !pub?.language_code) {
            await supabase
              .from("profiles_public")
              .update({
                nickname: pub?.nickname ?? (user.email ?? "user").split("@")[0],
                language_code: pub?.language_code ?? "ko",
              })
              .eq("user_id", uid);
          }

          // ✅ 2-4) 전화번호 인증 체크
          await supabase.from("profiles").upsert({ id: uid }, { onConflict: "id" });

          const { data: phoneRow } = await supabase
            .from("profiles")
            .select("phone_verified")
            .eq("id", uid)
            .maybeSingle();

          if (!phoneRow?.phone_verified) return { name: "PhoneVerification" };

          // ✅ 2-5) 메인 진입
          return {
            name: "MainTabs",
            state: { routes: [{ name: "MapMain" }] },
          };
        })();

        // ✅ 핵심: 둘 다 끝나는 즉시 이동 (고정 1600ms 제거)
        const [, dest] = await Promise.all([animDone, routeDone]);

        if (cancelledRef.current) return;
        safeReset(dest);
      } catch (e) {
        console.warn("[SplashGate] routing error:", e);
        if (cancelledRef.current) return;
        safeReset({ name: "Login" });
      }
    };

    run();

    return () => {
      cancelledRef.current = true;
    };
  }, [fadeAnim, scaleAnim, navigation]);

  return (
    <View style={styles.root}>
      {/* ✅ 상단 StatusBar 투명 */}
      <StatusBar translucent backgroundColor="transparent" style="light" />

      <LinearGradient
        colors={["#833ab4", "#fd1d1d", "#fcb045"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBg}
      />

      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require("../../../assets/co-onn.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  logoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 260,
    height: 260,
  },
});
