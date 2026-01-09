// src/screens/business/BusinessRegister.tsx

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  Alert,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  Camera,
  FileText,
  User,
  Phone,
  Building2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

const BG = '#F7F8FA';
const CARD_BG = '#FFFFFF';
const TEXT_MAIN = '#111827';
const TEXT_MUTED = '#6B7280';
const ACCENT = '#2563EB';
const HAIRLINE = '#E5E7EB';

export default function BusinessRegister() {
  const navigation = useNavigation<any>();

  const [meId, setMeId] = useState<string>('');

  // 입력 상태
  const [licenseImgUri, setLicenseImgUri] = useState<string | null>(null); // 미리보기용 로컬 URI
  const [licenseStoragePath, setLicenseStoragePath] = useState<string | null>(
    null,
  ); // Supabase Storage 상의 경로

  const [licenseNum, setLicenseNum] = useState('');
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [contact, setContact] = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 유저 정보 가져오기
  const loadUser = useCallback(async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        throw new Error('로그인이 필요합니다.');
      }
      setMeId(user.id);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
      navigation.goBack();
    }
  }, [navigation]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // 사업자등록증 선택 + 업로드
  const handlePickLicense = async () => {
    try {
      if (!meId) {
        Alert.alert('오류', '유저 정보를 불러오지 못했습니다.');
        return;
      }

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          '권한 필요',
          '앨범 접근 권한이 필요합니다. 설정에서 권한을 허용해 주세요.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      // 취소
      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset || !asset.uri) {
        Alert.alert('오류', '이미지를 선택하지 못했습니다.');
        return;
      }

      setUploading(true);

      const uri = asset.uri;
      const fileExt =
        asset.fileName?.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `licenses/${meId}/${fileName}`;

      // React Native에서는 fetch(uri).arrayBuffer() 로 업로드
      const resp: any = await fetch(uri as any);
      const arrayBuffer: ArrayBuffer = await resp.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('business_licenses')
        .upload(filePath, arrayBuffer, {
          upsert: true,
          contentType: asset.mimeType ?? 'image/jpeg',
        });

      if (uploadError) {
        console.log('upload license error:', uploadError);
        Alert.alert(
          '업로드 실패',
          '사업자등록증 업로드 중 오류가 발생했습니다.',
        );
        return;
      }

      // 성공
      setLicenseImgUri(uri);
      setLicenseStoragePath(filePath);
      Alert.alert('업로드 완료', '사업자등록증 이미지가 업로드되었습니다.');
    } catch (e: any) {
      console.log('pick license error', e);
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  // 숫자 전용 필터 (사업자번호, 연락처)
  const handleChangeLicenseNum = (text: string) => {
    const onlyDigits = text.replace(/[^0-9]/g, '');
    setLicenseNum(onlyDigits);
  };

  const handleChangeContact = (text: string) => {
    const onlyDigits = text.replace(/[^0-9]/g, '');
    setContact(onlyDigits);
  };

  // 제출
  async function handleSubmit() {
    if (!meId) {
      Alert.alert('오류', '유저 정보를 불러오지 못했습니다.');
      return;
    }

    if (!licenseStoragePath || !licenseImgUri) {
      Alert.alert('필수 항목 누락', '사업자등록증 이미지를 업로드해 주세요.');
      return;
    }

    if (!licenseNum.trim() || !storeName.trim() || !ownerName.trim()) {
      Alert.alert(
        '필수 항목 누락',
        '사업자등록번호, 상호명, 대표자 이름은 필수입니다.',
      );
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.from('business_registrations').insert({
        user_id: meId,
        license_path: licenseStoragePath,
        license_num: licenseNum.trim(),
        store_name: storeName.trim(),
        owner_name: ownerName.trim(),
        contact: contact.trim() || null,
      });

      if (error) {
        console.log('business_register insert error:', error);
        throw error;
      }

      Alert.alert(
        '사업자 등록 신청 완료',
        '관리자가 승인 후 비즈니스 기능을 사용할 수 있습니다.',
        [
          {
            text: '확인',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // 등록증 업로드 + 필수 필드 다 채워져야 활성화
  const isValid =
    !!licenseStoragePath &&
    !!licenseNum.trim() &&
    !!storeName.trim() &&
    !!ownerName.trim();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      {/* 헤더 (BusinessUnregister 와 동일하게) */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={() => navigation.goBack()}
          hitSlop={10}
        >
          <ChevronLeft size={22} color={TEXT_MAIN} />
        </Pressable>
        <Text style={styles.headerTitle}>사업자 등록</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 등록증 업로드 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>사업자등록증</Text>
          <Text style={styles.sectionSubtitle}>
            사업자등록증 원본 이미지를 업로드해주세요.
          </Text>

          <Pressable
            style={styles.licenseUploadBox}
            onPress={uploading ? undefined : handlePickLicense}
          >
            {uploading ? (
              <View style={styles.licensePlaceholder}>
                <ActivityIndicator />
                <Text style={styles.licenseText}>업로드 중…</Text>
              </View>
            ) : licenseImgUri ? (
              <Image
                source={{ uri: licenseImgUri }}
                style={styles.licensePreview}
              />
            ) : (
              <View style={styles.licensePlaceholder}>
                <Camera size={32} color={TEXT_MUTED} />
                <Text style={styles.licenseText}>사업자등록증 업로드</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.noticeSmall}>
            ※ 주민등록번호가 있을 경우 가려서 업로드해 주세요.
          </Text>
          {licenseStoragePath && (
            <Text style={styles.noticeSmall}>• 업로드 완료됨</Text>
          )}
        </View>

        {/* 사업자 기본 정보 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>사업자 정보</Text>

          {/* 사업자등록번호 */}
          <View style={styles.inputRow}>
            <FileText size={18} color={TEXT_MUTED} />
            <TextInput
              value={licenseNum}
              onChangeText={handleChangeLicenseNum}
              placeholder="사업자등록번호 (숫자만 입력)"
              placeholderTextColor={TEXT_MUTED}
              style={styles.input}
              keyboardType="numeric"
            />
          </View>

          {/* 상호명 */}
          <View style={styles.inputRow}>
            <Building2 size={18} color={TEXT_MUTED} />
            <TextInput
              value={storeName}
              onChangeText={setStoreName}
              placeholder="상호명"
              placeholderTextColor={TEXT_MUTED}
              style={styles.input}
            />
          </View>

          {/* 대표자명 */}
          <View style={styles.inputRow}>
            <User size={18} color={TEXT_MUTED} />
            <TextInput
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="대표자 이름"
              placeholderTextColor={TEXT_MUTED}
              style={styles.input}
            />
          </View>

          {/* 연락처 */}
          <View style={styles.inputRow}>
            <Phone size={18} color={TEXT_MUTED} />
            <TextInput
              value={contact}
              onChangeText={handleChangeContact}
              placeholder="담당자 연락처 (선택)"
              placeholderTextColor={TEXT_MUTED}
              style={styles.input}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* 안내 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>안내 및 주의사항</Text>

          <Text style={styles.noticeLine}>
            • 제출한 정보는 CO·ONN 비즈니스 운영 인증을 위해서만 사용됩니다.
          </Text>
          <Text style={styles.noticeLine}>
            • 승인까지 일정 시간이 소요될 수 있습니다.
          </Text>
          <Text style={styles.noticeLine}>
            • 허위 제출 시 승인 거절 또는 계정 제재가 발생할 수 있습니다.
          </Text>
        </View>

        {/* 제출 버튼 */}
        <Pressable
          style={[
            styles.submitButton,
            (!isValid || submitting) && styles.submitButtonDisabled,
          ]}
          onPress={submitting ? undefined : handleSubmit}
          disabled={!isValid || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>등록 신청하기</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  header: {
    height: 54,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.select({ ios: 8, android: 4 }),
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    width: 34,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_MAIN,
  },
  headerRight: {
    width: 34,
  },

  scroll: {
    flex: 1,
    backgroundColor: BG,
  },

  sectionCard: {
    backgroundColor: CARD_BG,
    padding: 16,
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_MAIN,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginBottom: 12,
  },

  /** 업로드 영역 */
  licenseUploadBox: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  licensePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  licenseText: {
    marginTop: 6,
    fontSize: 12,
    color: TEXT_MUTED,
  },
  licensePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HAIRLINE,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: TEXT_MAIN,
  },

  noticeSmall: {
    marginTop: 8,
    fontSize: 11,
    color: TEXT_MUTED,
  },
  noticeLine: {
    fontSize: 13,
    color: TEXT_MAIN,
    marginBottom: 4,
  },

  submitButton: {
    backgroundColor: ACCENT,
    marginHorizontal: 14,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
