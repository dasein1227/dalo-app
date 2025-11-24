// src/screens/beacons/Edit.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from '@react-navigation/native';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';
import * as Location from 'expo-location';

/* ─────────────────────────────────
 * Types
 * ───────────────────────────────── */
type BeaconRow = {
  id: string;

  title: string;
  description: string | null;

  visibility: 'public' | 'friends' | 'private';

  expires_at: string | null;

  // 위치
  lat: number | null;
  lng: number | null;

  // 입장 방식
  require_approval: boolean | null;

  // 인원
  male_quota: number | null;
  female_quota: number | null;
  mix_quota: number | null;

  // 연령
  min_age: number | null;
  max_age: number | null;
};

/* 작은 숫자 스텝퍼 (남/여/혼성 인원용) */
function QuotaStepper({
  label,
  value,
  setValue,
  accent,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  accent: string;
}) {
  const dec = () => setValue(Math.max(0, value - 1));
  const inc = () => setValue(Math.min(99, value + 1));
  return (
    <View style={styles.quotaBox}>
      <Text style={[styles.quotaLabel, { color: accent }]}>{label}</Text>
      <View style={styles.quotaRow}>
        <Pressable style={styles.quotaBtn} onPress={dec}>
          <Text style={styles.quotaBtnTxt}>{'<'}</Text>
        </Pressable>
        <Text style={[styles.quotaValue, { color: accent }]}>{value}</Text>
        <Pressable style={styles.quotaBtn} onPress={inc}>
          <Text style={styles.quotaBtnTxt}>{'>'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─────────────────────────────────
 * Main
 * ───────────────────────────────── */
export default function BeaconEdit() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const beaconId = route.params?.beaconId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 원본(필요하면 비교용으로 쓸 수 있음)
  const [beacon, setBeacon] = useState<BeaconRow | null>(null);

  // 기본 정보
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [visibility, setVisibility] = useState<
    'public' | 'friends' | 'private'
  >('public');
  const [expiresAt, setExpiresAt] = useState<string>('');

  // 위치
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // 참여 방식
  // false = 자유 참여(open), true = 승인 후 참여(approval)
  const [requireApproval, setRequireApproval] = useState<boolean>(false);

  // 인원 제한
  const [maleQuota, setMaleQuota] = useState<number>(0);
  const [femaleQuota, setFemaleQuota] = useState<number>(0);
  const [mixQuota, setMixQuota] = useState<number>(0);

  // 연령대
  const [minAge, setMinAge] = useState<number>(20);
  const [maxAge, setMaxAge] = useState<number>(35);

  /* ── Load (현재 비콘 상태로 초기화) */
  const load = useCallback(async () => {
    try {
      setLoading(true);

      // Supabase 타입 캐스팅 우회
      const { data, error } = (await supabase
        .from('beacons')
        .select(
          [
            'id',
            'title',
            'description',
            'visibility',
            'expires_at',
            'lat',
            'lng',
            'require_approval',
            'male_quota',
            'female_quota',
            'mix_quota',
            'min_age',
            'max_age',
          ].join(',')
        )
        .eq('id', beaconId)
        .maybeSingle()) as unknown as {
        data: BeaconRow | null;
        error: any;
      };

      if (error) throw error;
      if (!data) throw new Error('비콘을 찾을 수 없습니다.');

      const b = data;
      setBeacon(b);

      // 기본 정보
      setTitle(b.title ?? '');
      setDesc(b.description ?? '');
      setVisibility(b.visibility ?? 'public');
      setExpiresAt(b.expires_at ?? '');

      // 위치
      setLat(Number.isFinite(b.lat as any) ? b.lat : null);
      setLng(Number.isFinite(b.lng as any) ? b.lng : null);

      // 참여 방식
      setRequireApproval(!!b.require_approval);

      // 현재 인원 (그대로 세팅)
      setMaleQuota(Number.isFinite(b.male_quota as any) ? b.male_quota! : 0);
      setFemaleQuota(
        Number.isFinite(b.female_quota as any) ? b.female_quota! : 0
      );
      setMixQuota(Number.isFinite(b.mix_quota as any) ? b.mix_quota! : 0);

      // 연령대
      setMinAge(Number.isFinite(b.min_age as any) ? b.min_age! : 20);
      setMaxAge(Number.isFinite(b.max_age as any) ? b.max_age! : 35);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [beaconId, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── MapPicker에서 좌표 받아오기 */
  useFocusEffect(
    useCallback(() => {
      const picked = route.params?.pickedLocation as
        | { lat: number; lng: number }
        | undefined;
      if (
        picked &&
        Number.isFinite(picked.lat) &&
        Number.isFinite(picked.lng)
      ) {
        setLat(picked.lat);
        setLng(picked.lng);
        // 한 번 쓰고 파라미터 초기화
        navigation.setParams({ pickedLocation: undefined });
      }
    }, [route.params, navigation])
  );

  /* ── 현재 위치로 갱신 */
  const useCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          '권한 필요',
          '현재 위치를 사용하려면 위치 권한이 필요합니다.'
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      Alert.alert('위치 갱신', '현재 위치로 설정되었습니다.');
    } catch (e: any) {
      Alert.alert(
        '위치 가져오기 실패',
        e?.message ?? '위치를 불러올 수 없습니다.'
      );
    }
  }, []);

  /* ── Save */
  const save = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('제목을 입력하세요.');
      return;
    }

    // 만료일 파싱
    const expiresStr = expiresAt.trim();
    let expires: string | null = null;
    if (expiresStr) {
      if (Number.isNaN(Date.parse(expiresStr))) {
        Alert.alert('만료일 형식 오류', '예) 2025-12-31 23:59');
        return;
      }
      expires = new Date(expiresStr).toISOString();
    }

    // 인원 총합 → max_members
    const maxMembersCalc =
      (Number.isFinite(maleQuota) ? maleQuota : 0) +
      (Number.isFinite(femaleQuota) ? femaleQuota : 0) +
      (Number.isFinite(mixQuota) ? mixQuota : 0);

    const patch = {
      title: title.trim(),
      description: desc.trim(),
      visibility,
      expires_at: expires,

      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,

      require_approval: requireApproval,

      male_quota: Number.isFinite(maleQuota) ? maleQuota : null,
      female_quota: Number.isFinite(femaleQuota) ? femaleQuota : null,
      mix_quota: Number.isFinite(mixQuota) ? mixQuota : null,
      max_members: maxMembersCalc > 0 ? maxMembersCalc : null,

      min_age: Number.isFinite(minAge) ? minAge : null,
      max_age: Number.isFinite(maxAge) ? maxAge : null,
    };

    try {
      setSaving(true);

      const { error } = await supabase
        .from('beacons')
        .update(patch)
        .eq('id', beaconId);
      if (error) throw error;

      Alert.alert('수정 완료', '비콘 정보가 저장되었습니다.', [
        {
          text: '확인',
          onPress: () =>
            navigation.navigate('MapMain', {
              highlightBeaconId: beaconId,
            }),
        },
      ]);
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [
    title,
    desc,
    visibility,
    expiresAt,
    lat,
    lng,
    requireApproval,
    maleQuota,
    femaleQuota,
    mixQuota,
    minAge,
    maxAge,
    beaconId,
    navigation,
  ]);

  const openMapPicker = () => {
    navigation.navigate('MapPicker', {
      lat: lat ?? undefined,
      lng: lng ?? undefined,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      {/* NOTE: 전역 header 정책과 맞춰야 하면 AppHeader 대신 공용 헤더 넣어도 됨 */}
      <AppHeader title="비콘 수정" showBack />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 제목 */}
        <Text style={styles.label}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="비콘 제목을 입력하세요"
          style={styles.input}
        />

        {/* 설명 */}
        <Text style={styles.label}>설명</Text>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder="간단한 설명을 입력하세요"
          style={[styles.input, { height: 90 }]}
          multiline
        />

        {/* 공개 범위 */}
        <Text style={styles.label}>공개 범위</Text>
        <View style={styles.rowWrap}>
          {(['public', 'friends', 'private'] as const).map((v) => (
            <Pressable
              key={v}
              style={[styles.tag, visibility === v && styles.tagOn]}
              onPress={() => setVisibility(v)}
            >
              <Text
                style={[styles.tagTxt, visibility === v && styles.tagTxtOn]}
              >
                {v === 'public'
                  ? '전체 공개'
                  : v === 'friends'
                  ? '친구만'
                  : '비공개'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 참여 방식 */}
        <Text style={styles.label}>참여 방식</Text>
        <View style={styles.rowWrap}>
          <Pressable
            style={[styles.tag, !requireApproval && styles.tagOn]}
            onPress={() => setRequireApproval(false)}
          >
            <Text
              style={[styles.tagTxt, !requireApproval && styles.tagTxtOn]}
            >
              자유 참여
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tag, requireApproval && styles.tagOn]}
            onPress={() => setRequireApproval(true)}
          >
            <Text
              style={[styles.tagTxt, requireApproval && styles.tagTxtOn]}
            >
              승인 후 참여
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hintTxt}>
          자유 참여: 누구나 즉시 참여 가능{'\n'}
          승인 후 참여: 방장의 승인이 있어야 참여 가능
        </Text>

        {/* 현재 인원 / 허용 인원 */}
        <Text style={styles.label}>현재 인원 / 허용 인원</Text>
        <View style={styles.quotaRowWrap}>
          <QuotaStepper
            label="남"
            value={maleQuota}
            setValue={setMaleQuota}
            accent="#3B82F6"
          />
          <QuotaStepper
            label="여"
            value={femaleQuota}
            setValue={setFemaleQuota}
            accent="#EC4899"
          />
          <QuotaStepper
            label="혼성"
            value={mixQuota}
            setValue={setMixQuota}
            accent="#6B7280"
          />
        </View>

        {/* 연령대 */}
        <Text style={styles.label}>연령대</Text>
        <View style={styles.ageRow}>
          <View style={styles.ageField}>
            <Text style={styles.ageFieldLabel}>최소</Text>
            <TextInput
              style={styles.ageInput}
              keyboardType="number-pad"
              value={String(minAge ?? '')}
              onChangeText={(t) => {
                const n = parseInt(t, 10);
                setMinAge(!Number.isNaN(n) ? n : 0);
              }}
            />
          </View>
          <Text style={styles.ageDash}>-</Text>
          <View style={styles.ageField}>
            <Text style={styles.ageFieldLabel}>최대</Text>
            <TextInput
              style={styles.ageInput}
              keyboardType="number-pad"
              value={String(maxAge ?? '')}
              onChangeText={(t) => {
                const n = parseInt(t, 10);
                setMaxAge(!Number.isNaN(n) ? n : 0);
              }}
            />
          </View>
        </View>

        {/* 위치 */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>위치</Text>
          <View style={styles.cardRow}>
            <Text style={styles.meta}>
              {Number.isFinite(lat as any) && Number.isFinite(lng as any)
                ? `(${lat?.toFixed(5)}, ${lng?.toFixed(5)})`
                : '지정 안 됨'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Number.isFinite(lat as any) && Number.isFinite(lng as any) && (
                <Pressable
                  style={[styles.btnSm, styles.btnGhost]}
                  onPress={() => {
                    setLat(null);
                    setLng(null);
                  }}
                >
                  <Text style={styles.btnGhostTxt}>해제</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.btnSm, styles.btnGhost]}
                onPress={useCurrentLocation}
              >
                <Text style={styles.btnGhostTxt}>현재 위치</Text>
              </Pressable>
              <Pressable
                style={[styles.btnSm, styles.btnPrimary]}
                onPress={openMapPicker}
              >
                <Text style={styles.btnPrimaryTxt}>지도에서 선택</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* 만료일 */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>만료일</Text>
          <TextInput
            value={expiresAt}
            onChangeText={setExpiresAt}
            placeholder="예) 2025-12-31 23:59 (비우면 제한 없음)"
            style={styles.input}
          />
          <View style={[styles.rowWrap, { marginTop: 8 }]}>
            <Pressable
              style={styles.quick}
              onPress={() => setExpiresAt('')}
            >
              <Text style={styles.quickTxt}>없음</Text>
            </Pressable>
            <Pressable
              style={styles.quick}
              onPress={() => setExpiresAt(quickExpire(3))}
            >
              <Text style={styles.quickTxt}>+3시간</Text>
            </Pressable>
            <Pressable
              style={styles.quick}
              onPress={() => setExpiresAt(quickExpire(12))}
            >
              <Text style={styles.quickTxt}>+12시간</Text>
            </Pressable>
            <Pressable
              style={styles.quick}
              onPress={() => setExpiresAt(quickExpire(24))}
            >
              <Text style={styles.quickTxt}>+24시간</Text>
            </Pressable>
            <Pressable
              style={styles.quick}
              onPress={() => setExpiresAt(quickExpire(72))}
            >
              <Text style={styles.quickTxt}>+3일</Text>
            </Pressable>
          </View>
        </View>

        {/* 저장 */}
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveTxt}>
            {saving ? '저장 중…' : '저장'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#6b7280', marginTop: 8 },

  label: {
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 6,
    marginTop: 16,
    color: '#111827',
  },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },

  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  tag: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagOn: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tagTxt: { fontWeight: '700', color: '#111827' },
  tagTxtOn: { color: '#fff' },

  hintTxt: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginTop: 6,
  },

  quotaRowWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quotaBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  quotaLabel: {
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 6,
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  quotaBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  quotaBtnTxt: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6b7280',
  },
  quotaValue: {
    fontSize: 24,
    fontWeight: '900',
    minWidth: 34,
    textAlign: 'center',
  },

  ageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    columnGap: 12,
  },
  ageField: {
    flex: 1,
  },
  ageFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 4,
  },
  ageInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111827',
    textAlign: 'center',
  },
  ageDash: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    paddingBottom: 8,
  },

  cardRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: { color: '#6b7280', fontWeight: '700' },

  btnSm: {
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  btnPrimary: { backgroundColor: '#111827' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  btnGhostTxt: { color: '#111827', fontWeight: '800' },

  quick: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickTxt: { fontWeight: '700', color: '#111827' },

  saveBtn: {
    marginTop: 26,
    backgroundColor: '#111827',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

/* ── 도우미: 만료일 빠른 설정 */
function quickExpire(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
