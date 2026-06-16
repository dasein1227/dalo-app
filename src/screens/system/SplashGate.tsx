import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Platform,
  Dimensions,
  StatusBar as NativeStatusBar,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";

import { supabase, resetSupabaseAuthStorage } from "@/lib/supabase";
import { getLangMemory, initLanguage } from "@/lib/lang";
import type { RootStackParamList } from "@/navigation/types";

const { width, height } = Dimensions.get("window");
const ONE_TIME_RESET_FLAG_KEY = "coonn_auth_reset_v3_done";

const extra: any =
  (Constants as any)?.expoConfig?.extra ||
  (Constants as any)?.manifest?.extra ||
  {};

const PHONE_VERIFICATION_REQUIRED =
  String(extra.EXPO_PUBLIC_PHONE_VERIFICATION_REQUIRED ?? "false").toLowerCase() === "true";

const AUTH_PATH = "auth/callback";

async function clearWithdrawnSession() {
  try {
    await supabase.auth.signOut();
  } catch {}

  try {
    await resetSupabaseAuthStorage();
  } catch {}
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return typeof value === "string" ? value : "";
}

function isOAuthCallbackUrl(url?: string | null) {
  if (!url) return false;

  try {
    const parsed = Linking.parse(url);
    const path = String(parsed.path ?? "").replace(/^\/+/, "");
    const qp = parsed.queryParams ?? {};
    const hasOAuthResult =
      !!firstQueryValue(qp.code) ||
      !!firstQueryValue(qp.error) ||
      !!firstQueryValue(qp.error_description);

    return (path === AUTH_PATH || url.includes(AUTH_PATH)) && hasOAuthResult;
  } catch {
    return url.includes(AUTH_PATH);
  }
}

type Dest = {
  name: keyof RootStackParamList | "ProfileSetup";
  state?: any;
  params?: any;
};

const AuroraBackground = () => {
  const translate1 = useRef(new Animated.Value(0)).current;
  const translate2 = useRef(new Animated.Value(0)).current;
  const breathing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createMoveLoop = (animValue: Animated.Value, duration: number, toValue: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    };

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    createMoveLoop(translate1, 12000, -width * 0.4);
    createMoveLoop(translate2, 15000, -height * 0.3);
  }, [breathing, translate1, translate2]);

  const opacityInterp = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const scaleInterp = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const animatedLayerStyle = {
    position: "absolute",
    width: width * 2.0,
    height: height * 2.0,
    top: -height * 0.4,
    left: -width * 0.5,
  } as const;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0F0524" }]}>
      <LinearGradient
        colors={["#0F0524", "#240b36", "#1a0b2e"] as const}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          animatedLayerStyle,
          {
            transform: [{ translateX: translate1 }, { translateY: translate2 }, { scale: scaleInterp }],
            opacity: 0.6,
          },
        ]}
      >
        <LinearGradient
          colors={["transparent", "#3a0ca3", "#7209b7", "transparent"] as const}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.7 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          animatedLayerStyle,
          {
            transform: [
              { translateX: Animated.multiply(translate2, -0.5) },
              { translateY: Animated.multiply(translate1, 0.5) },
            ],
            opacity: opacityInterp,
          },
        ]}
      >
        <LinearGradient
          colors={["transparent", "#4cc9f0", "#f72585", "transparent"] as const}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)" }]} />
    </View>
  );
};

export default function SplashGate() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const navigatedRef = useRef(false);
  const cancelledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        NativeStatusBar.setBarStyle("light-content");
        if (Platform.OS === "android") {
          NativeStatusBar.setTranslucent(true);
          NativeStatusBar.setBackgroundColor("transparent");
        }
      }, 100);
      return () => clearTimeout(timer);
    }, []),
  );

  const safeReset = useCallback(
    (dest: Dest) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;

      navigation.reset({
        index: 0,
        routes: [
          {
            name: dest.name as any,
            ...(dest.state ? { state: dest.state } : {}),
            ...(dest.params ? { params: dest.params } : {}),
          },
        ],
      });
    },
    [navigation],
  );

  useEffect(() => {
    cancelledRef.current = false;

    const run = async () => {
      try {
        try {
          const initialUrl = await Linking.getInitialURL().catch(() => null);

          if (!isOAuthCallbackUrl(initialUrl)) {
            const already = await AsyncStorage.getItem(ONE_TIME_RESET_FLAG_KEY);

            if (!already) {
              await resetSupabaseAuthStorage();
              await AsyncStorage.setItem(ONE_TIME_RESET_FLAG_KEY, "1");
            }
          }
        } catch {}

        const langDone = initLanguage().catch((e) => {
          console.warn("[SplashGate] language init failed:", e);
          return getLangMemory();
        });

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

        const routeDone = (async (): Promise<Dest> => {
          const initialLang = await langDone;

          const { data: sData, error: sErr } = await supabase.auth.getSession();
          if (sErr) return { name: "Login" };

          const session = sData?.session ?? null;
          const user = session?.user ?? null;
          if (!user) return { name: "Login" };

          const uid = user.id;

          await Promise.all([
            supabase
              .from("profiles_private")
              .upsert({ user_id: uid }, { onConflict: "user_id" }),
            supabase
              .from("profiles")
              .upsert(
                {
                  user_id: uid,
                  preferred_lang: initialLang,
                },
                { onConflict: "user_id", ignoreDuplicates: true },
              ),
          ]);

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("nickname, follow_id, onboarding_completed_at, terms_accepted, terms_accepted_at, phone_verified_at, account_status, withdrawn_at, deleted_at, deleted_reason, auth_delete_due_at")
            .eq("user_id", uid)
            .maybeSingle();

          if (profileError) throw profileError;

          const isWithdrawn =
            profile?.account_status === "withdrawn" ||
            Boolean(profile?.withdrawn_at) ||
            (profile?.deleted_reason === "user_withdrawal" && Boolean(profile?.deleted_at));

          if (isWithdrawn) {
            await clearWithdrawnSession();
            return { name: "Login" };
          }

          const hasAcceptedTerms = Boolean(profile?.terms_accepted_at) || profile?.terms_accepted === true;

          if (!hasAcceptedTerms) {
            return { name: "TermsConsent" };
          }

          if (PHONE_VERIFICATION_REQUIRED && !profile?.phone_verified_at) {
            return { name: "PhoneVerification" };
          }

          const hasProfileSetupCompleted = Boolean(profile?.onboarding_completed_at);
          const hasCoreProfile = Boolean(String(profile?.nickname ?? "").trim()) && Boolean(String(profile?.follow_id ?? "").trim());

          if (!hasProfileSetupCompleted && !hasCoreProfile) {
            return {
              name: "ProfileSetup",
              params: { nextRoute: "MainTabs" },
            };
          }

          if (!hasProfileSetupCompleted && hasCoreProfile) {
            await supabase
              .from("profiles")
              .update({ onboarding_completed_at: new Date().toISOString() })
              .eq("user_id", uid);
          }

          return {
            name: "MainTabs",
            state: { routes: [{ name: "MapMain" }] },
          };
        })();

        const [, dest] = await Promise.all([animDone, routeDone]);

        if (cancelledRef.current) return;
        safeReset(dest);
      } catch (e) {
        console.warn("[SplashGate] routing error:", e);
        if (cancelledRef.current) return;
        safeReset({ name: "Login" });
      }
    };

    void run();

    return () => {
      cancelledRef.current = true;
    };
  }, [fadeAnim, safeReset, scaleAnim]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AuroraBackground />
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
          fadeDuration={0}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F0524",
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
