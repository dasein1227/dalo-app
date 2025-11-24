// src/screens/business/Create.tsx
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, MapPin, Info as InfoIcon, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

const BG = '#F7F8FA';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT_MAIN = '#111827';
const TEXT_MUTED = '#6B7280';
const ACCENT = '#FF5A7A';

type RouteParams = {
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
};

const CATEGORY_OPTIONS = [
  { id: 'restaurant', label: '음식점', emoji: '🍽️', isAdultDefault: false },
  { id: 'pub', label: '호프/펍', emoji: '🍺', isAdultDefault: true },
  { id: 'bar', label: '바/라운지', emoji: '🍸', isAdultDefault: true },
  { id: 'cafe', label: '카페', emoji: '☕', isAdultDefault: false },
  { id: 'club', label: '클럽', emoji: '🎧', isAdultDefault: true },
  { id: 'etc', label: '기타', emoji: '🏠', isAdultDefault: false },
];

function getCategoryEmoji(categoryId: string | null) {
  const found = CATEGORY_OPTIONS.find((c) => c.id === categoryId);
  return found?.emoji ?? '🏠';
}

const BusinessCreateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isAdult, setIsAdult] = useState(false);
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(params.initialAddress ?? '');
  const [lat, setLat] = useState<number | null>(params.initialLat ?? null);
  const [lng, setLng] = useState<number | null>(params.initialLng ?? null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleSelectCategory = useCallback((id: string) => {
    setCategoryId(id);
    const found = CATEGORY_OPTIONS.find((c) => c.id === id);
    if (found) {
      setIsAdult(found.isAdultDefault);
    }
  }, []);

  const handleOpenLocationPicker = useCallback(() => {
    // TODO: 나중에 실제 위치 선택 화면으로 연결
    // 예: navigation.navigate('BusinessLocationPicker', { lat, lng, address })
    Alert.alert(
      '위치 선택',
      '지도에서 위치를 선택하는 화면은 나중에 연결하면 돼.\n지금은 더미 액션이야.',
    );
    // 데모용으로 임시 좌표 세팅하고 싶으면 아래처럼:
    // setLat(37.5665);
    // setLng(126.9780);
  }, []);

  const validate = () => {
    if (!name.trim()) {
      Alert.alert('가게 이름', '가게 이름을 입력해 주세요.');
      return false;
    }
    if (!categoryId) {
      Alert.alert('카테고리', '카테고리를 선택해 주세요.');
      return false;
    }
    if (!address.trim()) {
      Alert.alert('주소', '주소를 입력해 주세요.');
      return false;
    }
    if (lat == null || lng == null) {
      Alert.alert('위치', '지도에서 정확한 위치를 선택해 주세요.');
      return false;
    }
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    try {
      setIsSubmitting(true);

      // 🔑 로그인된 유저 가져오기 (store 훅 안 쓰고 직접)
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) {
        console.error('getUser error', userErr);
        Alert.alert('오류', '로그인 정보를 가져오지 못했습니다.');
        return;
      }
      if (!user) {
        Alert.alert('로그인 필요', '비즈니스를 등록하려면 로그인해야 합니다.');
        return;
      }

      const { data, error } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: name.trim(),
          category: categoryId,
          is_adult: isAdult,
          description: description.trim() || null,
          phone: phone.trim() || null,
          address: address.trim(),
          lat,
          lng,
        })
        .select()
        .single();

      if (error) {
        console.error('Create business error', error);
        Alert.alert(
          '오류',
          error.message || '비즈니스를 등록하는 중 문제가 발생했습니다.',
        );
        return;
      }

      Alert.alert('완료', '비즈니스가 등록되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            // 나중에 BusinessDetail 로 바로 이동해도 됨
            // navigation.replace('BusinessDetail', { businessId: data.id });
            navigation.goBack();
          },
        },
      ]);
    } catch (e: any) {
      console.error(e);
      Alert.alert('오류', '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [name, categoryId, isAdult, description, phone, address, lat, lng, navigation]);

  const isSubmitDisabled =
    isSubmitting || !name.trim() || !categoryId || !address.trim() || lat == null || lng == null;

  const headerEmoji = getCategoryEmoji(categoryId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" translucent={false} />

      {/* 상단 헤더 (공통 규칙) */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={10} style={styles.headerLeft}>
          <ChevronLeft size={22} color={TEXT_MAIN} />
        </Pressable>
        <Text style={styles.headerTitle}>비즈니스 등록</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* 비콘 메인 느낌의 상단 카드 */}
          <View style={styles.topCard}>
            <View style={styles.topIconWrapper}>
              <Text style={styles.topIconText}>{headerEmoji}</Text>
            </View>
            <View style={styles.topInfo}>
              <Text style={styles.topTitle}>{name || '가게 이름을 입력해 주세요'}</Text>
              <Text style={styles.topSubtitle}>
                {categoryId
                  ? CATEGORY_OPTIONS.find((c) => c.id === categoryId)?.label
                  : '카테고리를 선택해 주세요'}
              </Text>
            </View>
          </View>

          {/* 필수 정보 카드 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>기본 정보</Text>

            <View style={styles.field}>
              <Text style={styles.label}>가게 이름</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 더리얼펍"
                placeholderTextColor={TEXT_MUTED}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>카테고리</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {CATEGORY_OPTIONS.map((cat) => {
                  const active = cat.id === categoryId;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => handleSelectCategory(cat.id)}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                    >
                      <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                      <Text
                        style={[
                          styles.categoryLabel,
                          active && styles.categoryLabelActive,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>성인 업소 여부</Text>
                <Text style={styles.helperText}>
                  술집·유흥업소는 19세 미만에게 노출되지 않습니다.
                </Text>
              </View>
              <Switch
                value={isAdult}
                onValueChange={setIsAdult}
                trackColor={{ false: '#D1D5DB', true: ACCENT }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* 위치 정보 카드 */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>위치 · 주소</Text>
              <Pressable style={styles.locationButton} onPress={handleOpenLocationPicker}>
                <MapPin size={16} color="#FFFFFF" />
                <Text style={styles.locationButtonText}>지도에서 위치 선택</Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>주소</Text>
              <TextInput
                style={styles.input}
                placeholder="도로명 주소를 입력해 주세요"
                placeholderTextColor={TEXT_MUTED}
                value={address}
                onChangeText={setAddress}
              />
            </View>

            <View style={styles.coordsRow}>
              <View style={styles.coordBox}>
                <Text style={styles.coordLabel}>위도</Text>
                <Text style={styles.coordValue}>
                  {lat != null ? lat.toFixed(6) : '-'}
                </Text>
              </View>
              <View style={styles.coordBox}>
                <Text style={styles.coordLabel}>경도</Text>
                <Text style={styles.coordValue}>
                  {lng != null ? lng.toFixed(6) : '-'}
                </Text>
              </View>
            </View>

            <View style={styles.helperRow}>
              <InfoIcon size={14} color={TEXT_MUTED} />
              <Text style={styles.helperText}>
                위치는 나중에 편집 화면에서 다시 수정할 수 있습니다.
              </Text>
            </View>
          </View>

          {/* 설명/연락처 카드 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>설명 · 연락처</Text>

            <View style={styles.field}>
              <Text style={styles.label}>가게 설명</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="가게 분위기, 특징, 예약 안내 등을 적어 주세요."
                placeholderTextColor={TEXT_MUTED}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>전화번호</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 02-1234-5678"
                keyboardType="phone-pad"
                placeholderTextColor={TEXT_MUTED}
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </View>

          {/* 하단 버튼 */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.submitButton, isSubmitDisabled && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>비즈니스 등록하기</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default BusinessCreateScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 54,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.select({ ios: 8, android: 4 }),
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerLeft: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_MAIN,
  },
  headerRight: {
    width: 32,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  topCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  topIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F6',
    marginRight: 12,
  },
  topIconText: {
    fontSize: 30,
  },
  topInfo: {
    flex: 1,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_MAIN,
  },
  topSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: TEXT_MUTED,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_MAIN,
    marginBottom: 10,
  },
  field: {
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_MAIN,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: TEXT_MAIN,
    backgroundColor: '#FFFFFF',
  },
  multilineInput: {
    height: 96,
  },
  categoryRow: {
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  categoryChipActive: {
    borderColor: ACCENT,
    backgroundColor: '#FFF1F3',
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 4,
  },
  categoryLabel: {
    fontSize: 13,
    color: TEXT_MUTED,
  },
  categoryLabelActive: {
    color: ACCENT,
    fontWeight: '600',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  locationButtonText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  coordsRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 8,
  },
  coordBox: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
    backgroundColor: '#F9FAFB',
  },
  coordLabel: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  coordValue: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_MAIN,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  helperText: {
    marginLeft: 4,
    fontSize: 11,
    color: TEXT_MUTED,
  },
  footer: {
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 12,
    backgroundColor: ACCENT,
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    marginLeft: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
