// src/screens/business/components/InfoTab.tsx
import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
} from 'react-native';
import { styles } from './bizStyles';
import { LabeledInput } from './LabeledInput';
import { ToggleRow } from './ToggleRow';
import { CategorySection } from './CategorySection';

type InfoTabProps = {
  oneLineIntro: string;
  description: string;

  // AI 브리핑
  aiBriefing: string;
  aiBriefingUpdatedAt: string | null;
  isAiGenerating: boolean;
  onPressGenerateAiBriefing: () => void;

  // 쿠폰 / 상품권
  minsaengCoupon: boolean | null;
  localGiftcard: boolean | null;

  // 편의시설
  facilities: string;
  parkingAvailable: boolean | null;
  parkingInfo: string;
  seatingInfo: string;
  paymentMethods: string;

  // SNS
  websiteUrl: string;
  instagramUrl: string;
  kakaoChannel: string;

  // 카테고리
  categoryMajor: string;
  categoryMinor: string;
  isAdultOnly: boolean | null;
  onPressSelectMajor: () => void;
  onPressSelectMinor: () => void;
  onChangeIsAdultOnly: (value: boolean | null) => void;

  // 회사 정보
  name: string;
  phone: string;
  address: string;
  detailAddress: string;
  openTime: string;
  closeTime: string;
  lastOrderTime: string;
  hasBreakTime: boolean;
  breakStartTime: string;
  breakEndTime: string;

  onChangeOneLineIntro: (text: string) => void;
  onChangeDescription: (text: string) => void;

  onChangeMinsaengCoupon: (value: boolean | null) => void;
  onChangeLocalGiftcard: (value: boolean | null) => void;

  onChangeFacilities: (text: string) => void;
  onChangeParkingAvailable: (value: boolean | null) => void;
  onChangeParkingInfo: (text: string) => void;
  onChangeSeatingInfo: (text: string) => void;
  onChangePaymentMethods: (text: string) => void;

  onChangeWebsiteUrl: (text: string) => void;
  onChangeInstagramUrl: (text: string) => void;
  onChangeKakaoChannel: (text: string) => void;

  onChangeName: (text: string) => void;
  onChangePhone: (text: string) => void;
  onChangeAddress: (text: string) => void;
  onChangeDetailAddress: (text: string) => void;

  onPressSearchAddress: () => void;
  onPressOpenMap: () => void;

  // 시간 선택은 부모(Create.tsx)의 OS TimePicker가 처리
  onPressOpenTime: () => void;
  onPressCloseTime: () => void;
  onPressLastOrderTime: () => void;

  onChangeHasBreakTime: (value: boolean) => void;
  onPressBreakStart: () => void;
  onPressBreakEnd: () => void;
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

// ===============================
//             InfoTab
// ===============================
const InfoTab: React.FC<InfoTabProps> = (props) => {
  const {
    oneLineIntro,
    description,

    // AI 브리핑
    aiBriefing,
    aiBriefingUpdatedAt,
    isAiGenerating,
    onPressGenerateAiBriefing,

    minsaengCoupon,
    localGiftcard,

    facilities,
    parkingAvailable,
    parkingInfo,
    seatingInfo,
    paymentMethods,

    websiteUrl,
    instagramUrl,
    kakaoChannel,

    // 카테고리
    categoryMajor,
    categoryMinor,
    isAdultOnly,
    onPressSelectMajor,
    onPressSelectMinor,
    onChangeIsAdultOnly,

    name,
    phone,
    address,
    detailAddress,
    openTime,
    closeTime,
    lastOrderTime,
    hasBreakTime,
    breakStartTime,
    breakEndTime,

    onChangeOneLineIntro,
    onChangeDescription,

    onChangeMinsaengCoupon,
    onChangeLocalGiftcard,

    onChangeFacilities,
    onChangeParkingAvailable,
    onChangeParkingInfo,
    onChangeSeatingInfo,
    onChangePaymentMethods,

    onChangeWebsiteUrl,
    onChangeInstagramUrl,
    onChangeKakaoChannel,

    onChangeName,
    onChangePhone,
    onChangeAddress,
    onChangeDetailAddress,

    onPressSearchAddress,
    onPressOpenMap,

    onPressOpenTime,
    onPressCloseTime,
    onPressLastOrderTime,

    onChangeHasBreakTime,
    onPressBreakStart,
    onPressBreakEnd,
  } = props;

  return (
    <View style={styles.tabContent}>
      {/* ================== 소개 ================== */}
      <View style={styles.card}>
        <SectionHeader title="소개" />

        <LabeledInput
          label="한줄 소개"
          value={oneLineIntro}
          onChangeText={onChangeOneLineIntro}
          placeholder="예) 사장님의 한줄 소개가 여기에 표시됩니다"
        />

        <LabeledInput
          label="가게 소개"
          value={description}
          onChangeText={onChangeDescription}
          placeholder="가게 소개를 자세히 적어 주세요."
          multiline
        />

        {/* ====== AI 브리핑 영역 (소개 밑) ====== */}
        <View style={{ marginTop: 14 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <Text style={styles.sectionTitle}>AI 브리핑</Text>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>점주 전용</Text>
            </View>
          </View>

          <Text style={styles.mutedText}>
            가게 정보와 방문자 피드를 바탕으로, 손님에게 보여줄 3줄 요약을 자동 생성합니다.
          </Text>

          {aiBriefing ? (
            <Text
              style={[styles.aiText, { marginTop: 6 }]}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              {aiBriefing}
            </Text>
          ) : (
            <Text
              style={[styles.mutedText, { marginTop: 6 }]}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              아직 생성된 브리핑이 없습니다. 아래 버튼을 눌러 첫 브리핑을 만들어 보세요.
            </Text>
          )}

          {aiBriefingUpdatedAt ? (
            <Text
              style={[
                styles.mutedText,
                { marginTop: 4, fontSize: 11 },
              ]}
            >
              마지막 업데이트: {aiBriefingUpdatedAt}
            </Text>
          ) : null}

          <View
            style={{
              marginTop: 10,
              alignItems: 'flex-end',
            }}
          >
            <Pressable
              style={[
                styles.aiGenerateButton,
                isAiGenerating && styles.aiGenerateButtonDisabled,
              ]}
              disabled={isAiGenerating}
              onPress={onPressGenerateAiBriefing}
            >
              <Text
                style={[
                  styles.aiGenerateButtonText,
                  isAiGenerating && styles.aiGenerateButtonTextDisabled,
                ]}
              >
                {isAiGenerating ? '생성 중…' : 'AI 브리핑 생성 / 재생성'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ================== 카테고리 / 연령제한 ================== */}
      <CategorySection
        categoryMajor={categoryMajor}
        categoryMinor={categoryMinor}
        onPressSelectMajor={onPressSelectMajor}
        onPressSelectMinor={onPressSelectMinor}
        isAdultOnly={isAdultOnly}
        onChangeIsAdultOnly={onChangeIsAdultOnly}
      />

      {/* ================== 민생회복 · 지역상품권 ================== */}
      <View style={styles.card}>
        <SectionHeader title="민생회복 · 지역상품권" />

        <ToggleRow
          label="민생회복 소비쿠폰"
          value={minsaengCoupon}
          onChange={onChangeMinsaengCoupon}
        />

        <View style={{ height: 8 }} />

        <ToggleRow
          label="지역사랑상품권"
          value={localGiftcard}
          onChange={onChangeLocalGiftcard}
        />
      </View>

      {/* ================== 편의시설 ================== */}
      <View style={styles.card}>
        <SectionHeader title="편의시설 및 서비스" />
        <LabeledInput
          label="편의시설/서비스"
          value={facilities}
          onChangeText={onChangeFacilities}
          placeholder="예) 단체석, 생일 이벤트, 포장 가능 등"
          multiline
        />
      </View>

      {/* ================== 주차 ================== */}
      <View style={styles.card}>
        <SectionHeader title="주차" />
        <ToggleRow
          label="주차 가능 여부"
          value={parkingAvailable}
          onChange={onChangeParkingAvailable}
        />
        <LabeledInput
          label="주차 안내"
          value={parkingInfo}
          onChangeText={onChangeParkingInfo}
          placeholder="예) 지하1층 유료주차장, 1시간 무료"
          multiline
        />
      </View>

      {/* ================== 좌석 ================== */}
      <View style={styles.card}>
        <SectionHeader title="좌석 · 공간" />
        <LabeledInput
          label="좌석/공간 정보"
          value={seatingInfo}
          onChangeText={onChangeSeatingInfo}
          placeholder="예) 바테이블 10석, 단체룸 2개"
          multiline
        />
      </View>

      {/* ================== 결제수단 ================== */}
      <View style={styles.card}>
        <SectionHeader title="결제수단" />
        <LabeledInput
          label="결제수단"
          value={paymentMethods}
          onChangeText={onChangePaymentMethods}
          placeholder="예) 카드, 현금, 제로페이"
          multiline
        />
      </View>

      {/* ================== SNS ================== */}
      <View style={styles.card}>
        <SectionHeader title="SNS" />
        <LabeledInput
          label="웹사이트"
          value={websiteUrl}
          onChangeText={onChangeWebsiteUrl}
          placeholder="https:// 로 시작하는 주소"
          autoCapitalize="none"
        />
        <LabeledInput
          label="인스타그램"
          value={instagramUrl}
          onChangeText={onChangeInstagramUrl}
          placeholder="프로필 또는 게시물 링크"
          autoCapitalize="none"
        />
        <LabeledInput
          label="카카오 채널"
          value={kakaoChannel}
          onChangeText={onChangeKakaoChannel}
          placeholder="@채널명 또는 링크"
          autoCapitalize="none"
        />
      </View>

      {/* ================== 회사 정보 ================== */}
      <View style={styles.card}>
        <SectionHeader title="회사 정보" />

        <LabeledInput
          label="가게 이름"
          value={name}
          onChangeText={onChangeName}
        />

        <LabeledInput
          label="연락처"
          value={phone}
          onChangeText={onChangePhone}
          placeholder="010-0000-0000"
          keyboardType="phone-pad"
        />

        {/* 주소 (큰 주소) */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>주소</Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={address}
              onChangeText={onChangeAddress}
              placeholder="가게 주소 입력"
            />
            <Pressable
              style={[styles.toggleButton, { marginLeft: 8 }]}
              onPress={onPressSearchAddress}
            >
              <Text style={styles.toggleButtonText}>검색</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, { marginLeft: 6 }]}
              onPress={onPressOpenMap}
            >
              <Text style={styles.toggleButtonText}>지도</Text>
            </Pressable>
          </View>
        </View>

        {/* 상세 주소 */}
        <LabeledInput
          label="상세 주소"
          value={detailAddress}
          onChangeText={onChangeDetailAddress}
          placeholder="예) 1층 101호 / OO빌딩 2층"
        />

        {/* 영업 시작 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>영업 시작</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressOpenTime}
          >
            <Text
              style={openTime ? { color: '#111827' } : styles.mutedText}
            >
              {openTime || '시작 시간 선택'}
            </Text>
          </Pressable>
        </View>

        {/* 영업 종료 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>영업 종료</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressCloseTime}
          >
            <Text
              style={closeTime ? { color: '#111827' } : styles.mutedText}
            >
              {closeTime || '종료 시간 선택'}
            </Text>
          </Pressable>
        </View>

        {/* 라스트 오더 */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>라스트 오더</Text>
          <Pressable
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={onPressLastOrderTime}
          >
            <Text
              style={lastOrderTime ? { color: '#111827' } : styles.mutedText}
            >
              {lastOrderTime || '라스트 오더 시간'}
            </Text>
          </Pressable>
        </View>

        {/* 브레이크 타임 */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>브레이크 타임</Text>
          <View style={styles.toggleButtons}>
            <Pressable
              style={[
                styles.toggleButton,
                !hasBreakTime && styles.toggleButtonActiveLight,
              ]}
              onPress={() => onChangeHasBreakTime(false)}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  !hasBreakTime && styles.toggleButtonTextActiveLight,
                ]}
              >
                없음
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.toggleButton,
                hasBreakTime && styles.toggleButtonActiveLight,
              ]}
              onPress={() => onChangeHasBreakTime(true)}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  hasBreakTime && styles.toggleButtonTextActiveLight,
                ]}
              >
                있음
              </Text>
            </Pressable>
          </View>
        </View>

        {hasBreakTime && (
          <>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>브레이크 시작</Text>
              <Pressable
                style={[styles.input, { justifyContent: 'center' }]}
                onPress={onPressBreakStart}
              >
                <Text
                  style={
                    breakStartTime ? { color: '#111827' } : styles.mutedText
                  }
                >
                  {breakStartTime || '시작 시간 선택'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>브레이크 종료</Text>
              <Pressable
                style={[styles.input, { justifyContent: 'center' }]}
                onPress={onPressBreakEnd}
              >
                <Text
                  style={
                    breakEndTime ? { color: '#111827' } : styles.mutedText
                  }
                >
                  {breakEndTime || '종료 시간 선택'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

export default InfoTab;
