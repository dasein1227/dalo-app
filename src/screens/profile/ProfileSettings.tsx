// src/screens/profile/ProfileSettings.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

type ProfileRow = {
  id: string;
  nickname: string | null;
  status_message: string | null;
  avatar_url: string | null;
  private_avatar_url: string | null;
};

export default function ProfileSettingsScreen() {
  const navigation = useNavigation<any>();

  // auth id
  const [myId, setMyId] = useState<string | null>(null);

  // loading / saving
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // editable state
  const [nickname, setNickname] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [privateAvatarUrl, setPrivateAvatarUrl] = useState<string | undefined>(
    undefined
  );

  // ===== load my profile =====
  const loadMe = useCallback(async () => {
    try {
      setInitialLoading(true);

      // who am i
      const { data: authRes } = await supabase.auth.getUser();
      const uid = authRes?.user?.id ?? null;
      if (!uid) throw new Error('로그인이 필요합니다.');
      setMyId(uid);

      // get profile
      const { data, error } = (await supabase
        .from('profiles')
        .select(
          [
            'id',
            'nickname',
            'status_message',
            'avatar_url',
            'private_avatar_url',
          ].join(',')
        )
        .eq('id', uid)
        .maybeSingle()) as {
        data: ProfileRow | null;
        error: any;
      };

      if (error) throw error;
      if (!data) throw new Error('프로필을 불러올 수 없습니다.');

      setNickname(data.nickname ?? '');
      setStatusMsg(data.status_message ?? '');
      setAvatarUrl(data.avatar_url ?? undefined);
      setPrivateAvatarUrl(data.private_avatar_url ?? undefined);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
      navigation.goBack();
    } finally {
      setInitialLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // ===== pick avatar (공개용) =====
  const pickPublicAvatar = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.9,
      });
      if (res.canceled) return;
      const img = res.assets?.[0];
      if (!img?.uri) return;
      // TODO: supabase.storage 업로드 -> URL 저장 로직
      setAvatarUrl(img.uri);
      Alert.alert(
        '안내',
        '지금은 미리보기만 바뀐 상태입니다. 업로드 로직은 이후에 연결할게요.'
      );
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '이미지를 선택할 수 없습니다.');
    }
  }, []);

  // ===== pick avatar (비공개용) =====
  const pickPrivateAvatar = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.9,
      });
      if (res.canceled) return;
      const img = res.assets?.[0];
      if (!img?.uri) return;
      // TODO: supabase.storage 업로드 -> URL 저장 로직
      setPrivateAvatarUrl(img.uri);
      Alert.alert(
        '안내',
        '지금은 미리보기만 바뀐 상태입니다. 업로드 로직은 이후에 연결할게요.'
      );
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '이미지를 선택할 수 없습니다.');
    }
  }, []);

  // ===== save profile =====
  const saveProfile = useCallback(async () => {
    if (!myId) {
      Alert.alert('오류', '로그인이 필요합니다.');
      return;
    }

    const payload: any = {
      nickname: nickname.trim(),
      status_message: statusMsg.trim(),
      avatar_url: avatarUrl ?? null,
      private_avatar_url: privateAvatarUrl ?? null,
    };

    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', myId);

      if (error) throw error;

      Alert.alert('완료', '프로필이 저장되었습니다.', [
        {
          text: '확인',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? '프로필을 저장할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  }, [myId, nickname, statusMsg, avatarUrl, privateAvatarUrl, navigation]);

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      {/* ===== header ===== */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerSide}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>

        <Text style={styles.headerTitle}>프로필 설정</Text>

        <Pressable
          style={styles.headerSideRight}
          disabled={saving}
          onPress={saveProfile}
        >
          <Text
            style={[styles.saveTxt, saving && { opacity: 0.4 }]}
          >
            완료
          </Text>
        </Pressable>
      </View>

      {/* ===== body ===== */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        {/* 아바타들 */}
        <Text style={styles.sectionLabel}>프로필 사진</Text>
        <View style={styles.avatarRow}>
          <Pressable onPress={pickPublicAvatar} style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackTxt}>공개</Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeTxt}>변경</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={pickPrivateAvatar}
            style={styles.avatarWrap}
          >
            {privateAvatarUrl ? (
              <Image
                source={{ uri: privateAvatarUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackTxt}>비공개</Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeTxt}>변경</Text>
            </View>
          </Pressable>
        </View>

        <Text style={styles.helperTxt}>
          비공개 사진은 비공개 방 / 비공개 비콘에서만 보여요.
        </Text>

        {/* 닉네임 */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
          닉네임
        </Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="닉네임을 입력하세요"
          style={styles.input}
        />

        {/* 상태메시지 */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
          남기는 말
        </Text>
        <TextInput
          value={statusMsg}
          onChangeText={setStatusMsg}
          placeholder="상태 메시지를 입력하세요"
          style={[styles.input, { height: 80 }]}
          multiline
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#6b7280', marginTop: 8 },

  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  headerSide: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideRight: {
    minWidth: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeTxt: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  saveTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  scrollBody: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 20,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  avatarRow: {
    flexDirection: 'row',
    columnGap: 20,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#e5e7eb',
  },
  avatarFallback: {
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#00000099',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editBadgeTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },

  helperTxt: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
});
