import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { useBizStyles } from './bizStyles';
import { LabeledInput } from './LabeledInput';
import { ToggleRow } from './ToggleRow';
import { CategorySection } from './CategorySection';
import { Camera, Store } from 'lucide-react-native';


type BusinessCurrencyCode =
  | 'KRW'
  | 'USD'
  | 'AUD'
  | 'CAD'
  | 'NZD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CNY'
  | 'HKD'
  | 'TWD'
  | 'SGD'
  | 'THB'
  | 'VND'
  | 'PHP'
  | 'IDR'
  | 'MYR'
  | 'INR'
  | 'AED'
  | 'SAR'
  | 'TRY'
  | 'RUB'
  | 'BRL'
  | 'MXN'
  | 'CHF';

const BUSINESS_CURRENCY_OPTIONS: Array<{
  code: BusinessCurrencyCode;
  label: string;
}> = [
  { code: 'KRW', label: '₩ KRW' },
  { code: 'USD', label: '$ USD' },
  { code: 'AUD', label: 'A$ AUD' },
  { code: 'CAD', label: 'C$ CAD' },
  { code: 'NZD', label: 'NZ$ NZD' },
  { code: 'EUR', label: '€ EUR' },
  { code: 'GBP', label: '£ GBP' },
  { code: 'JPY', label: '¥ JPY' },
  { code: 'CNY', label: '¥ CNY' },
  { code: 'HKD', label: 'HK$ HKD' },
  { code: 'TWD', label: 'NT$ TWD' },
  { code: 'SGD', label: 'S$ SGD' },
  { code: 'THB', label: '฿ THB' },
  { code: 'VND', label: '₫ VND' },
  { code: 'PHP', label: '₱ PHP' },
  { code: 'IDR', label: 'Rp IDR' },
  { code: 'MYR', label: 'RM MYR' },
  { code: 'INR', label: '₹ INR' },
  { code: 'AED', label: 'د.إ AED' },
  { code: 'SAR', label: '﷼ SAR' },
  { code: 'TRY', label: '₺ TRY' },
  { code: 'RUB', label: '₽ RUB' },
  { code: 'BRL', label: 'R$ BRL' },
  { code: 'MXN', label: 'MX$ MXN' },
  { code: 'CHF', label: 'CHF' },
];

export type AiBriefingLanguageCode =
  | 'ko'
  | 'en'
  | 'ja'
  | 'zh'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'id'
  | 'hi'
  | 'ru'
  | 'ar'
  | 'vi'
  | 'tr'
  | 'th'
  | 'it';

const AI_BRIEFING_LANGUAGE_OPTIONS: Array<{
  code: AiBriefingLanguageCode;
  label: string;
  shortLabel: string;
}> = [
  { code: 'ko', label: '한국어', shortLabel: 'KO' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'ja', label: '日本語', shortLabel: 'JA' },
  { code: 'zh', label: '中文', shortLabel: 'ZH' },
  { code: 'es', label: 'Español', shortLabel: 'ES' },
  { code: 'pt', label: 'Português', shortLabel: 'PT' },
  { code: 'fr', label: 'Français', shortLabel: 'FR' },
  { code: 'de', label: 'Deutsch', shortLabel: 'DE' },
  { code: 'id', label: 'Indonesia', shortLabel: 'ID' },
  { code: 'hi', label: 'हिन्दी', shortLabel: 'HI' },
  { code: 'ru', label: 'Русский', shortLabel: 'RU' },
  { code: 'ar', label: 'العربية', shortLabel: 'AR' },
  { code: 'vi', label: 'Tiếng Việt', shortLabel: 'VI' },
  { code: 'tr', label: 'Türkçe', shortLabel: 'TR' },
  { code: 'th', label: 'ไทย', shortLabel: 'TH' },
  { code: 'it', label: 'Italiano', shortLabel: 'IT' },
];

const AI_BRIEFING_LANGUAGE_CODE_SET = new Set<string>(
  AI_BRIEFING_LANGUAGE_OPTIONS.map((option) => option.code),
);

const normalizeAiBriefingLanguage = (value?: string | null): AiBriefingLanguageCode => {
  const base = String(value || 'ko').split('-')[0]?.toLowerCase() || 'ko';
  return AI_BRIEFING_LANGUAGE_CODE_SET.has(base) ? (base as AiBriefingLanguageCode) : 'ko';
};

type InfoTabProps = {
  oneLineIntro: string;
  description: string;

  // ✅ AI 브리핑
  aiBriefing: string;
  aiBriefingUpdatedAt: string | null;
  savedAiBriefing?: string | null;
  savedAiBriefingUpdatedAt?: string | null;

  isAiGenerating: boolean;
  aiBriefingLanguage?: AiBriefingLanguageCode;
  onChangeAiBriefingLanguage?: (value: AiBriefingLanguageCode) => void;
  onPressGenerateAiBriefing: (lang: AiBriefingLanguageCode) => void | Promise<void>;

  // ✅ 로고 관련 Props 추가
  logoImageUrl: string | null;
  onPressLogo: () => void;

  // 메뉴/가격 공통 통화
  businessCurrency: BusinessCurrencyCode;
  onChangeBusinessCurrency: (value: BusinessCurrencyCode) => void;

  // (기존 props)
  minsaengCoupon: boolean | null;
  localGiftcard: boolean | null;
  facilities: string;
  parkingAvailable: boolean | null;
  parkingInfo: string;
  seatingInfo: string;
  paymentMethods: string;
  websiteUrl: string;
  instagramUrl: string;
  kakaoChannel: string;
  categoryMajor: string;
  categoryMinor: string;
  isAdultOnly: boolean | null;
  onPressSelectMajor: () => void;
  onPressSelectMinor: () => void;
  onChangeIsAdultOnly: (value: boolean | null) => void;
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
  onPressOpenTime: () => void;
  onPressCloseTime: () => void;
  onPressLastOrderTime: () => void;
  onChangeHasBreakTime: (value: boolean) => void;
  onPressBreakStart: () => void;
  onPressBreakEnd: () => void;
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => {
  const styles = useBizStyles();

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
};

const InfoTab: React.FC<InfoTabProps> = (props) => {
  const {
    oneLineIntro, description,
    aiBriefing, aiBriefingUpdatedAt, savedAiBriefing, savedAiBriefingUpdatedAt, isAiGenerating, aiBriefingLanguage, onChangeAiBriefingLanguage, onPressGenerateAiBriefing,
    logoImageUrl, onPressLogo, // ✅ 추가됨
    businessCurrency, onChangeBusinessCurrency,
    minsaengCoupon, localGiftcard, facilities, parkingAvailable, parkingInfo, seatingInfo, paymentMethods,
    websiteUrl, instagramUrl, kakaoChannel, categoryMajor, categoryMinor, isAdultOnly, onPressSelectMajor, onPressSelectMinor, onChangeIsAdultOnly,
    name, phone, address, detailAddress, openTime, closeTime, lastOrderTime, hasBreakTime, breakStartTime, breakEndTime,
    onChangeOneLineIntro, onChangeDescription, onChangeMinsaengCoupon, onChangeLocalGiftcard,
    onChangeFacilities, onChangeParkingAvailable, onChangeParkingInfo, onChangeSeatingInfo, onChangePaymentMethods,
    onChangeWebsiteUrl, onChangeInstagramUrl, onChangeKakaoChannel, onChangeName, onChangePhone, onChangeAddress, onChangeDetailAddress,
    onPressSearchAddress, onPressOpenTime, onPressCloseTime, onPressLastOrderTime, onChangeHasBreakTime, onPressBreakStart, onPressBreakEnd,
  } = props;
  const { t, i18n } = useTranslation();
  const styles = useBizStyles();

  const displayAiBriefing = (aiBriefing && aiBriefing.trim().length > 0) 
    ? aiBriefing 
    : (savedAiBriefing && savedAiBriefing.trim().length > 0) ? savedAiBriefing : '';

  const displayAiDate = aiBriefingUpdatedAt || savedAiBriefingUpdatedAt;
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [aiLanguageModalVisible, setAiLanguageModalVisible] = useState(false);
  const [internalAiBriefingLanguage, setInternalAiBriefingLanguage] =
    useState<AiBriefingLanguageCode>(() => normalizeAiBriefingLanguage(i18n.language));

  const selectedAiBriefingLanguage =
    aiBriefingLanguage ?? internalAiBriefingLanguage;

  const selectedAiBriefingLanguageOption = useMemo(
    () =>
      AI_BRIEFING_LANGUAGE_OPTIONS.find(
        (option) => option.code === selectedAiBriefingLanguage,
      ) ?? AI_BRIEFING_LANGUAGE_OPTIONS[0],
    [selectedAiBriefingLanguage],
  );

  const selectedCurrencyOption = useMemo(
    () =>
      BUSINESS_CURRENCY_OPTIONS.find((option) => option.code === businessCurrency) ??
      BUSINESS_CURRENCY_OPTIONS[0],
    [businessCurrency],
  );

  const handleSelectBusinessCurrency = (code: BusinessCurrencyCode) => {
    onChangeBusinessCurrency(code);
    setCurrencyModalVisible(false);
  };

  const handleSelectAiBriefingLanguage = (code: AiBriefingLanguageCode) => {
    if (onChangeAiBriefingLanguage) {
      onChangeAiBriefingLanguage(code);
    } else {
      setInternalAiBriefingLanguage(code);
    }
    setAiLanguageModalVisible(false);
  };

  const handlePressGenerateAiBriefing = () => {
    void onPressGenerateAiBriefing(selectedAiBriefingLanguage);
  };

  return (
    <>
      <View style={styles.tabContent}>
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.intro')} />
        <LabeledInput label={t('business:info.field.oneLineIntro')} value={oneLineIntro} onChangeText={onChangeOneLineIntro} placeholder={t('business:info.placeholder.oneLineIntro')} />
        <LabeledInput label={t('business:info.field.description')} value={description} onChangeText={onChangeDescription} placeholder={t('business:info.placeholder.description')} multiline />

        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.sectionTitle}>{t('business:info.section.ai')}</Text>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{t('business:info.aiOwnerOnly')}</Text>
            </View>
          </View>
          <Text style={styles.mutedText}>{t('business:info.aiDesc')}</Text>

          {displayAiBriefing ? (
            <Text style={[styles.aiText, { marginTop: 6 }]}>{displayAiBriefing}</Text>
          ) : (
            <Text style={[styles.mutedText, { marginTop: 6 }]}>{t('business:info.aiEmpty')}</Text>
          )}

          {displayAiDate && <Text style={[styles.mutedText, { marginTop: 4, fontSize: 11 }]}>{t('business:info.aiUpdated', { date: displayAiDate })}</Text>}

          <View style={localStyles.aiControlBlock}>
            <Text style={localStyles.aiControlLabel}>
              {t('business:info.aiLanguage')}
            </Text>
            <View style={localStyles.aiControlRow}>
              <Pressable
                style={localStyles.aiLanguageSelectButton}
                onPress={() => setAiLanguageModalVisible(true)}
                disabled={isAiGenerating}
              >
                <Text style={localStyles.aiLanguageSelectText} numberOfLines={1}>
                  {selectedAiBriefingLanguageOption.label}
                </Text>
                <Text style={localStyles.aiLanguageSelectChevron}>›</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.aiGenerateButton,
                  localStyles.aiGenerateButtonInline,
                  isAiGenerating && styles.aiGenerateButtonDisabled,
                  localStyles.aiGenerateButtonCentered,
                ]}
                disabled={isAiGenerating}
                onPress={handlePressGenerateAiBriefing}
              >
                <Text
                  style={[
                    styles.aiGenerateButtonText,
                    localStyles.aiGenerateButtonTextCentered,
                  ]}
                  numberOfLines={1}
                >
                  {isAiGenerating ? t('business:info.aiGenerating') : t('business:info.aiGenerate')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <CategorySection categoryMajor={categoryMajor} categoryMinor={categoryMinor} onPressSelectMajor={onPressSelectMajor} onPressSelectMinor={onPressSelectMinor} isAdultOnly={isAdultOnly} onChangeIsAdultOnly={onChangeIsAdultOnly} />
      
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.coupon')} />
        <ToggleRow label={t('business:info.field.minsaengCoupon')} value={minsaengCoupon} onChange={onChangeMinsaengCoupon} />
        <View style={{ height: 8 }} />
        <ToggleRow label={t('business:info.field.localGiftcard')} value={localGiftcard} onChange={onChangeLocalGiftcard} />
      </View>
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.facilities')} />
        <LabeledInput label={t('business:info.field.facilities')} value={facilities} onChangeText={onChangeFacilities} placeholder={t('business:info.placeholder.facilities')} multiline />
      </View>
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.parking')} />
        <ToggleRow label={t('business:info.field.parkingAvailable')} value={parkingAvailable} onChange={onChangeParkingAvailable} />
        <LabeledInput label={t('business:info.field.parkingInfo')} value={parkingInfo} onChangeText={onChangeParkingInfo} placeholder={t('business:info.placeholder.parkingInfo')} multiline />
      </View>
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.seating')} />
        <LabeledInput label={t('business:info.field.seatingInfo')} value={seatingInfo} onChangeText={onChangeSeatingInfo} placeholder={t('business:info.placeholder.seatingInfo')} multiline />
      </View>
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.payment')} />
        <LabeledInput label={t('business:info.field.paymentMethods')} value={paymentMethods} onChangeText={onChangePaymentMethods} placeholder={t('business:info.placeholder.paymentMethods')} multiline />
      </View>
      <View style={styles.card}>
        <SectionHeader title="SNS" />
        <LabeledInput label={t('business:info.field.website')} value={websiteUrl} onChangeText={onChangeWebsiteUrl} placeholder="https://..." autoCapitalize="none" />
        <LabeledInput label={t('business:info.field.instagram')} value={instagramUrl} onChangeText={onChangeInstagramUrl} placeholder={t('business:info.placeholder.link')} autoCapitalize="none" />
        <LabeledInput label={t('business:info.field.kakaoChannel')} value={kakaoChannel} onChangeText={onChangeKakaoChannel} placeholder={t('business:info.placeholder.kakaoChannel')} autoCapitalize="none" />
      </View>
      
      {/* ✅ 회사 정보 섹션 (로고 추가) */}
      <View style={styles.card}>
        <SectionHeader title={t('business:info.section.company')} />
        
        {/* 로고 업로드 UI */}
        <View style={styles.logoContainer}>
          <Pressable onPress={onPressLogo} style={styles.logoWrapper}>
            {logoImageUrl ? (
              <Image source={{ uri: logoImageUrl }} style={styles.logoImage} resizeMode="cover" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Store size={32} color={styles.__iconMuted.color} />
                <Text style={styles.logoText}>{t('business:info.logoRegister')}</Text>
              </View>
            )}
            {/* 카메라 뱃지 */}
            <View style={styles.cameraBadge}>
              <Camera size={14} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.logoHelpText}>{t('business:info.logoHelp')}</Text>
        </View>

        <LabeledInput label={t('business:info.field.storeName')} value={name} onChangeText={onChangeName} />
        <LabeledInput label={t('business:info.field.phone')} value={phone} onChangeText={onChangePhone} placeholder="010-0000-0000" keyboardType="phone-pad" />
        <View style={localStyles.fieldBlock}>
          <Text style={localStyles.blockLabel}>
            {t('business:info.field.currency')}
          </Text>
          <Pressable
            style={localStyles.currencySelectButton}
            onPress={() => setCurrencyModalVisible(true)}
          >
            <Text style={localStyles.currencySelectText} numberOfLines={1} ellipsizeMode="tail">
              {selectedCurrencyOption.label}
            </Text>
            <Text style={localStyles.currencySelectChevron}>›</Text>
          </Pressable>
          <Text style={[styles.mutedText, localStyles.fieldHelp]}>
            {t('business:info.currencyHelp')}
          </Text>
        </View>

        <View style={localStyles.fieldBlock}>
          <Text style={localStyles.blockLabel}>
            {t('business:info.field.address')}
          </Text>
          <View style={localStyles.addressSearchRow}>
            <TextInput
              style={[styles.input, localStyles.addressInput]}
              value={address}
              onChangeText={onChangeAddress}
              placeholder={t('business:info.placeholder.address')}
              placeholderTextColor={styles.__placeholder.color}
              multiline={false}
              numberOfLines={1}
              textAlignVertical="center"
            />
            <Pressable
              style={localStyles.addressSearchButton}
              onPress={onPressSearchAddress}
              hitSlop={8}
            >
              <Text style={localStyles.addressSearchButtonText}>
                {t('business:info.search')}
              </Text>
            </Pressable>
          </View>
        </View>
        <LabeledInput label={t('business:info.field.detailAddress')} value={detailAddress} onChangeText={onChangeDetailAddress} placeholder={t('business:info.placeholder.detailAddress')} />
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>{t('business:info.field.openTime')}</Text>
          <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={onPressOpenTime}>
            <Text style={openTime ? styles.inputValueText : styles.mutedText}>{openTime || t('business:common.select')}</Text>
          </Pressable>
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>{t('business:info.field.closeTime')}</Text>
          <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={onPressCloseTime}>
            <Text style={closeTime ? styles.inputValueText : styles.mutedText}>{closeTime || t('business:common.select')}</Text>
          </Pressable>
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>{t('business:info.field.lastOrder')}</Text>
          <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={onPressLastOrderTime}>
            <Text style={lastOrderTime ? styles.inputValueText : styles.mutedText}>{lastOrderTime || t('business:common.select')}</Text>
          </Pressable>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('business:info.field.breakTime')}</Text>
          <View style={styles.toggleButtons}>
            <Pressable style={[styles.toggleButton, !hasBreakTime && styles.toggleButtonActiveLight]} onPress={() => onChangeHasBreakTime(false)}>
              <Text style={[styles.toggleButtonText, !hasBreakTime && styles.toggleButtonTextActiveLight]}>{t('business:common.notUse')}</Text>
            </Pressable>
            <Pressable style={[styles.toggleButton, hasBreakTime && styles.toggleButtonActiveLight]} onPress={() => onChangeHasBreakTime(true)}>
              <Text style={[styles.toggleButtonText, hasBreakTime && styles.toggleButtonTextActiveLight]}>{t('business:common.use')}</Text>
            </Pressable>
          </View>
        </View>
        {hasBreakTime && (
          <>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>{t('business:info.field.start')}</Text>
              <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={onPressBreakStart}>
                <Text style={breakStartTime ? styles.inputValueText : styles.mutedText}>{breakStartTime || t('business:common.select')}</Text>
              </Pressable>
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>{t('business:info.field.end')}</Text>
              <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={onPressBreakEnd}>
                <Text style={breakEndTime ? styles.inputValueText : styles.mutedText}>{breakEndTime || t('business:common.select')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      </View>

      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <Pressable
          style={localStyles.modalBackdrop}
          onPress={() => setCurrencyModalVisible(false)}
        >
          <Pressable style={localStyles.currencyModalCard}>
            <View style={localStyles.currencyModalHeader}>
              <Text style={localStyles.currencyModalTitle}>
                {t('business:info.field.currency')}
              </Text>
              <Pressable
                style={localStyles.currencyModalClose}
                onPress={() => setCurrencyModalVisible(false)}
                hitSlop={8}
              >
                <Text style={localStyles.currencyModalCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              style={localStyles.currencyModalList}
              contentContainerStyle={localStyles.currencyModalListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {BUSINESS_CURRENCY_OPTIONS.map((option) => {
                const selected = businessCurrency === option.code;

                return (
                  <Pressable
                    key={option.code}
                    style={[
                      localStyles.currencyOptionRow,
                      selected && localStyles.currencyOptionRowActive,
                    ]}
                    onPress={() => handleSelectBusinessCurrency(option.code)}
                  >
                    <Text
                      style={[
                        localStyles.currencyOptionText,
                        selected && localStyles.currencyOptionTextActive,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {option.label}
                    </Text>
                    {selected ? (
                      <Text style={localStyles.currencyOptionCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={aiLanguageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAiLanguageModalVisible(false)}
      >
        <Pressable
          style={localStyles.modalBackdrop}
          onPress={() => setAiLanguageModalVisible(false)}
        >
          <Pressable style={localStyles.currencyModalCard}>
            <View style={localStyles.currencyModalHeader}>
              <Text style={localStyles.currencyModalTitle}>
                {t('business:info.aiLanguage')}
              </Text>
              <Pressable
                style={localStyles.currencyModalClose}
                onPress={() => setAiLanguageModalVisible(false)}
                hitSlop={8}
              >
                <Text style={localStyles.currencyModalCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              style={localStyles.currencyModalList}
              contentContainerStyle={localStyles.currencyModalListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {AI_BRIEFING_LANGUAGE_OPTIONS.map((option) => {
                const selected = selectedAiBriefingLanguage === option.code;

                return (
                  <Pressable
                    key={option.code}
                    style={[
                      localStyles.currencyOptionRow,
                      selected && localStyles.currencyOptionRowActive,
                    ]}
                    onPress={() => handleSelectAiBriefingLanguage(option.code)}
                  >
                    <View style={localStyles.languageOptionLeft}>
                      <Text style={localStyles.languageOptionCode}>
                        {option.shortLabel}
                      </Text>
                      <Text
                        style={[
                          localStyles.currencyOptionText,
                          selected && localStyles.currencyOptionTextActive,
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {option.label}
                      </Text>
                    </View>
                    {selected ? (
                      <Text style={localStyles.currencyOptionCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};



const localStyles = StyleSheet.create({
  fieldBlock: {
    marginTop: 2,
    marginBottom: 14,
  },
  blockLabel: {
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: -0.1,
  },
  fieldHelp: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 15,
  },
  aiControlBlock: {
    marginTop: 12,
  },
  aiControlLabel: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: -0.08,
  },
  aiControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiLanguageSelectButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7DCE3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiLanguageSelectText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: -0.1,
  },
  aiLanguageSelectChevron: {
    marginLeft: 8,
    fontSize: 20,
    lineHeight: 20,
    color: '#9CA3AF',
    transform: [{ rotate: '90deg' }],
  },
  aiGenerateButtonInline: {
    marginLeft: 8,
    height: 40,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  aiGenerateButtonCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiGenerateButtonTextCentered: {
    lineHeight: 17,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  currencySelectButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7DCE3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currencySelectText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: -0.15,
  },
  currencySelectChevron: {
    marginLeft: 12,
    fontSize: 24,
    lineHeight: 24,
    color: '#9CA3AF',
    transform: [{ rotate: '90deg' }],
  },
  addressSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressInput: {
    flex: 1,
    height: 44,
    minHeight: 44,
    paddingVertical: 0,
  },
  addressSearchButton: {
    width: 64,
    height: 40,
    marginLeft: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7DCE3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressSearchButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.34)',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  currencyModalCard: {
    maxHeight: '72%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  currencyModalHeader: {
    minHeight: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF0F3',
  },
  currencyModalTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.25,
    includeFontPadding: false,
  },
  currencyModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyModalCloseText: {
    marginTop: -1,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '400',
    color: '#6B7280',
  },
  currencyModalList: {
    maxHeight: 420,
  },
  currencyModalListContent: {
    paddingVertical: 8,
  },
  currencyOptionRow: {
    height: 46,
    minHeight: 46,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currencyOptionRowActive: {
    backgroundColor: '#F3F4F6',
  },
  currencyOptionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '400',
    color: '#374151',
    letterSpacing: -0.12,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  currencyOptionTextActive: {
    color: '#111827',
    fontWeight: '500',
  },
  currencyOptionCheck: {
    marginLeft: 12,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '500',
    color: '#111827',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  languageOptionLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageOptionCode: {
    width: 34,
    marginRight: 10,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: '#9CA3AF',
    letterSpacing: -0.05,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

export default InfoTab;
