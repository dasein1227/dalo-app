// src/screens/system/PostLoginRouter.tsx
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";
import { supabase } from "@/lib/supabase";

export default function PostLoginRouter() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!user) {
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          return;
        }

        const uid = user.id;

        // ───────── 기본행 보장 (public/private) ─────────
        await supabase.from("profiles_public").upsert(
          { user_id: uid },
          { onConflict: "user_id" }
        );
        await supabase.from("profiles_private").upsert(
          { user_id: uid },
          { onConflict: "user_id" }
        );

        // ───────── 약관 / 언어 확인 ─────────
        const { data: pri } = await supabase
          .from("profiles_private")
          .select("terms_accepted_at")
          .eq("user_id", uid)
          .maybeSingle();

        const { data: pub } = await supabase
          .from("profiles_public")
          .select("nickname, language_code")
          .eq("user_id", uid)
          .maybeSingle();

        if (!pri?.terms_accepted_at) {
          navigation.reset({ index: 0, routes: [{ name: "TermsConsent" }] });
          return;
        }

        if (!pub?.nickname || !pub?.language_code) {
          await supabase
            .from("profiles_public")
            .update({
              nickname: pub?.nickname ?? (user.email ?? "user").split("@")[0],
              language_code: pub?.language_code ?? "ko",
            })
            .eq("user_id", uid);
        }

        // ───────── 전화번호 인증 체크 ─────────
        // profiles 테이블 행 보장 (id = uid)
        await supabase.from("profiles").upsert(
          { id: uid },
          { onConflict: "id" }
        );

        const { data: phoneRow } = await supabase
          .from("profiles")
          .select("phone_verified")
          .eq("id", uid)
          .maybeSingle();

        // 인증 안됨 → PhoneVerification 이동
        if (!phoneRow?.phone_verified) {
          navigation.reset({
            index: 0,
            routes: [{ name: "PhoneVerification" }],
          });
          return;
        }

        // ───────── 메인 진입 ─────────
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "MainTabs",
              state: { routes: [{ name: "MapMain" }] },
            },
          ],
        });
      } catch (err) {
        console.warn("Router error:", err);
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    })();
  }, [navigation]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
      }}
    >
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}
