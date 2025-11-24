// src/screens/system/SplashGate.tsx
import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, Image, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import type { RootStackParamList } from "@/navigation/types";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export default function SplashGate() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // 1) 로고 페이드 + 살짝 확대
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
    ]).start();

    // 2) 세션 체크 후 라우팅
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (session) {
        navigation.reset({
          index: 0,
          routes: [{ name: "PostLoginRouter" }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: "Login" }],
        });
      }
    }, 1600);

    return () => clearTimeout(timer);
  }, [navigation, fadeAnim, scaleAnim]);

  return (
    <View style={s.root}>
      {/* 로그인 화면과 동일한 배경 그라데이션 */}
      <LinearGradient
        colors={["#833ab4", "#fd1d1d", "#fcb045"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.gradientBg}
      />

      {/* 로고 애니메이션 */}
      <Animated.View
        style={[
          s.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require("../../../assets/co-onn.png")}
          style={s.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
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
