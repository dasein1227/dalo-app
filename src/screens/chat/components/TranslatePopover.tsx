// src/screens/chat/components/TranslatePopover.tsx
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';

import type { TranslationTier, TranslationTone } from '../hooks/useChatUIState';
import type { ChatTheme } from '../theme/chatTheme';
import { TRANSLATE_MODAL_THEMES } from '../theme/chatTheme';
import type { resolveRoomType } from '../theme/chatTheme';

type RoomTypeResolved = ReturnType<typeof resolveRoomType>;

type Props = {
  visible: boolean;
  onClose: () => void;

  // ✅ 룸 타입 기반 테마 분기(지금 Chat.tsx에서 resolveRoomType 결과를 넘김)
  roomType: RoomTypeResolved;

  // ✅ theme (Chat.tsx에서 전달) - TranslatePopover는 modal 테이블 테마 우선 적용
  theme?: ChatTheme;

  // ✅ 번역 ON/OFF
  autoTranslate: boolean;
  onToggleAutoTranslate: () => void;

  // ✅ 표시 토글 (원문/번역문) ✅ 추가
  showTranslatedOnly: boolean;
  onToggleShowTranslatedOnly: () => void;

  // 실제 요금제 (user_tier: free / mid / high)
  userTier: TranslationTier;

  // 내가 설정한 번역 등급 (profiles.translation_tier)
  translationTier: TranslationTier;
  setTranslationTier: (tier: TranslationTier) => void;

  // 톤
  translationTone: TranslationTone;
  setTranslationTone: (tone: TranslationTone) => void;

  // ✅ 받을 언어(내 화면) = view_lang
  viewLang: string | null;
  settingLang: string | null;
  onChangeViewLang: (lang: string) => void;

  // ✅ 보낼 언어(상대에게) = preferred_lang
  preferredLang: string | null;
  onChangePreferredLang: (lang: string) => void;

  // ✅ 상대방 언어(기본값 계산용)
  peerViewLang: string | null;
  peerSettingLang: string | null;

  onPressUpgrade: () => void;
};

const TONE_OPTIONS: { value: TranslationTone; label: string; desc: string }[] = [
  { value: 'business', label: '비즈니스', desc: '전문적인 비즈니스 환경에 최적화된 가장 정중하고 신뢰감 있는 문체로 번역합니다.' },
  { value: 'polite', label: '정중함', desc: '상대방에 대한 예의를 갖추면서도 부드럽고 매끄러운 사회적 대화 톤을 제공합니다.' },
  { value: 'casual', label: '친근함', desc: '가까운 사이의 소통을 위해 생동감 넘치고 자연스러운 일상 구어체로 번역합니다.' },
  { value: 'neutral', label: '중립적', desc: '개인적인 감정이나 어조를 배제하고 정보 전달의 명확성에 집중한 표준 문체입니다.' },
  { value: 'creative', label: '창의적', desc: '원문의 핵심 의미는 엄격히 유지하면서, 상황에 맞는 풍부하고 세련된 표현을 더합니다.' },
];

const TIER_OPTIONS: { value: TranslationTier; label: string; desc: string }[] = [
  { value: 'free', label: 'Basic', desc: '번역 기능이 제한된 기본 채팅 모드입니다' },
  { value: 'mid', label: 'Standard', desc: '글로벌 표준 엔진을 활용한 정밀 번역을 제공합니다.' },
  { value: 'high', label: 'Premium', desc: 'GPT 기반 맞춤형 번역으로 대화의 문맥과 톤을 완벽히 재현합니다.' },
];

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'EN', label: '영어' },
  { code: 'ES', label: '스페인어' },
  { code: 'FR', label: '프랑스어' },
  { code: 'DE', label: '독일어' },
  { code: 'IT', label: '이탈리아어' },
  { code: 'PT', label: '포르투갈어' },
  { code: 'NL', label: '네덜란드어' },
  { code: 'PL', label: '폴란드어' },
  { code: 'RU', label: '러시아어' },
  { code: 'JA', label: '일본어' },
  { code: 'KO', label: '한국어' },
  { code: 'ZH', label: '중국어' },
  { code: 'TR', label: '터키어' },
  { code: 'SV', label: '스웨덴어' },
  { code: 'ID', label: '인도네시아어' },
  { code: 'TH', label: '태국어' },
  { code: 'UK', label: '우크라이나어' },
  { code: 'RO', label: '루마니아어' },
  { code: 'CS', label: '체코어' },
  { code: 'DA', label: '덴마크어' },
  { code: 'EL', label: '그리스어' },
  { code: 'FI', label: '핀란드어' },
  { code: 'HU', label: '헝가리어' },
  { code: 'SK', label: '슬로바키아어' },
  { code: 'SL', label: '슬로베니아어' },
  { code: 'BG', label: '불가리아어' },
  { code: 'ET', label: '에스토니아어' },
  { code: 'LT', label: '리투아니아어' },
  { code: 'LV', label: '라트비아어' },
  { code: 'AR', label: '아랍어' },
];

const TIER_WEIGHT: Record<TranslationTier, number> = { free: 0, mid: 1, high: 2 };

function normalizeLang(v: string | null | undefined) {
  const s = String(v ?? '').trim();
  return s ? s.toUpperCase() : null;
}

function labelByLang(code: string) {
  const hit = LANGUAGE_OPTIONS.find((x) => x.code === code);
  return hit ? hit.label : code;
}

function canSelectTier(userTier: TranslationTier, target: TranslationTier) {
  if (userTier === 'free') return false;
  if (userTier === 'mid') return target !== 'high';
  return true;
}

function shouldShowUpgradeButton(userTier: TranslationTier, optionTier: TranslationTier) {
  if (userTier === 'high') return false;
  return TIER_WEIGHT[optionTier] > TIER_WEIGHT[userTier];
}

// ✅ Row (전체 라인 클릭)
type RowProps = {
  title: string;
  desc?: string | null;
  selected?: boolean;
  disabled?: boolean;
  rightText?: string | null;
  rightSubText?: string | null;
  onPress?: () => void;

  // ✅ theme tokens
  baseText: string;
  subText: string;
  selectedBg: string;
  activeText: string;
  disabledText: string;
  radioColor: string;
  upgradeColor: string;
};

const OptionRow = React.memo(function OptionRow({
  title,
  desc,
  selected,
  disabled,
  rightText,
  rightSubText,
  onPress,

  baseText,
  subText,
  selectedBg,
  activeText,
  disabledText,
  radioColor,
  upgradeColor,
}: RowProps) {
  return (
    <Pressable
      style={[
        styles.rowButton,
        selected && !disabled ? { backgroundColor: selectedBg } : null,
        disabled ? styles.rowButtonDisabled : null,
      ]}
      disabled={!onPress || disabled}
      onPress={onPress}
      hitSlop={22}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(17,24,39,0.06)' } : undefined}
    >
      <View style={{ flex: 1 }} pointerEvents="none">
        <Text
          style={[
            styles.rowLabel,
            { color: baseText },
            selected && !disabled ? { color: activeText } : null,
            disabled ? { color: disabledText } : null,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {!!desc && (
          <Text
            style={[
              styles.rowDesc,
              { color: subText },
              selected && !disabled ? { color: activeText } : null,
              disabled ? { color: disabledText } : null,
            ]}
          >
            {desc}
          </Text>
        )}
      </View>

      {!!rightSubText && (
        <Text style={[styles.rightSub, { color: subText }]} pointerEvents="none">
          {rightSubText}
        </Text>
      )}

      {!!rightText && (
        <Text style={[styles.rightAssist, { color: upgradeColor }]} pointerEvents="none">
          {rightText}
        </Text>
      )}

      <View
        style={[
          styles.radioOuter,
          { borderColor: radioColor },
          selected && !disabled ? { borderColor: radioColor, backgroundColor: selectedBg } : null,
          disabled ? { borderColor: 'rgba(148,163,184,0.35)', backgroundColor: 'rgba(148,163,184,0.12)' } : null,
        ]}
        pointerEvents="none"
      >
        {selected && !disabled && <View style={[styles.radioInner, { backgroundColor: radioColor }]} />}
      </View>
    </Pressable>
  );
});

export default function TranslatePopover({
  visible,
  onClose,
  roomType,
  theme, // eslint-disable-line @typescript-eslint/no-unused-vars

  autoTranslate,
  onToggleAutoTranslate,

  // ✅ 추가
  showTranslatedOnly,
  onToggleShowTranslatedOnly,

  userTier,
  translationTier,
  setTranslationTier,

  translationTone,
  setTranslationTone,

  viewLang,
  settingLang,
  onChangeViewLang,

  preferredLang,
  onChangePreferredLang,

  peerViewLang,
  peerSettingLang,

  onPressUpgrade,
}: Props) {
  // ✅ 기본: 전부 닫힘
  const [tierOpen, setTierOpen] = React.useState(false);
  const [toneOpen, setToneOpen] = React.useState(false);
  const [sendLangOpen, setSendLangOpen] = React.useState(false);
  const [recvLangOpen, setRecvLangOpen] = React.useState(false);

  const toneDisabled = !(userTier === 'high' && translationTier === 'high');

  // ✅ 상대방 기본 언어(보낼 언어 기본값/표기용)
  const peerDefaultSendLang =
    normalizeLang(peerViewLang) || normalizeLang(peerSettingLang) || null;

  const effectiveReceiveLang = normalizeLang(viewLang) || normalizeLang(settingLang) || 'KO';
  const effectiveSendLang =
    normalizeLang(preferredLang) ||
    peerDefaultSendLang ||
    'KO';

  const tierLabel = React.useMemo(() => {
    const t = TIER_OPTIONS.find((x) => x.value === translationTier);
    return t ? t.label : String(translationTier).toUpperCase();
  }, [translationTier]);

  const toneLabel = React.useMemo(() => {
    const t = TONE_OPTIONS.find((x) => x.value === translationTone);
    return t ? t.label : String(translationTone);
  }, [translationTone]);

  const sendLangLabel = React.useMemo(
    () => `${labelByLang(effectiveSendLang)} (${effectiveSendLang})`,
    [effectiveSendLang],
  );
  const recvLangLabel = React.useMemo(
    () => `${labelByLang(effectiveReceiveLang)} (${effectiveReceiveLang})`,
    [effectiveReceiveLang],
  );

  const handleSelectTier = React.useCallback(
    (value: TranslationTier) => {
      const selectable = canSelectTier(userTier, value);
      const showUpgrade = shouldShowUpgradeButton(userTier, value);

      if (selectable) {
        setTranslationTier(value);
        return;
      }
      if (showUpgrade) onPressUpgrade();
    },
    [userTier, setTranslationTier, onPressUpgrade],
  );

  const handleSelectTone = React.useCallback(
    (tone: TranslationTone) => {
      if (toneDisabled) return;
      setTranslationTone(tone);
    },
    [toneDisabled, setTranslationTone],
  );

  // ✅ TranslatePopover는 "TRANSLATE_MODAL_THEMES" 표를 우선 사용
  const modalTheme = React.useMemo(() => {
    return TRANSLATE_MODAL_THEMES[roomType] ?? TRANSLATE_MODAL_THEMES.dm;
  }, [roomType]);

  const textMain = modalTheme.baseText;
  const textSub = React.useMemo(() => {
    if (typeof textMain === 'string' && textMain.startsWith('#') && textMain.length === 7) {
      return `${textMain}AA`;
    }
    return 'rgba(15,23,42,0.55)';
  }, [textMain]);

  const cardBg = modalTheme.modalBg;
  const blockBg = modalTheme.highlightBg;
  const selectedBg = modalTheme.highlightBg;

  const activeText = modalTheme.activeText;
  const radioColor = modalTheme.radio;
  const upgradeColor = modalTheme.upgradeBtn;

  const closeBg = modalTheme.closeBtn;
  const closeText = '#FFFFFF';

  const toggleOnBg = modalTheme.translateOnBg;
  const toggleOffBg = modalTheme.translateOffBg;
  const toggleTextOn = modalTheme.translateOnText;
  const toggleTextOff = modalTheme.translateOffText;

  const dropdownHitSlop = 28;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.dragBar} />

          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: textMain }]}>번역 설정</Text>

            {/* ✅ 오른쪽: 토글 2개(번역ON/OFF + 원문/번역문) */}
            <View style={styles.headerToggles}>
              <Pressable
                onPress={onToggleAutoTranslate}
                hitSlop={18}
                style={[
                  styles.togglePill,
                  { backgroundColor: autoTranslate ? toggleOnBg : toggleOffBg },
                ]}
              >
                <Text
                  style={[
                    styles.togglePillText,
                    { color: autoTranslate ? toggleTextOn : toggleTextOff },
                  ]}
                >
                  {autoTranslate ? '번역 ON' : '번역 OFF'}
                </Text>
              </Pressable>

              <Pressable
                onPress={onToggleShowTranslatedOnly}
                hitSlop={18}
                style={[
                  styles.togglePill,
                  { backgroundColor: showTranslatedOnly ? toggleOnBg : toggleOffBg },
                ]}
              >
                <Text
                  style={[
                    styles.togglePillText,
                    { color: showTranslatedOnly ? toggleTextOn : toggleTextOff },
                  ]}
                >
                  {showTranslatedOnly ? '번역문' : '원문'}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={{ maxHeight: 650 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* ===== 요금제 ===== */}
            <Pressable
              style={[styles.dropdownBlock, { backgroundColor: blockBg }]}
              onPress={() => setTierOpen((v) => !v)}
              hitSlop={dropdownHitSlop}
            >
              <View pointerEvents="none">
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.sectionTitle, { color: textMain }]}>요금제</Text>
                      <Text style={[styles.sectionInlineValue, { color: textMain }]}>{tierLabel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.sectionToggle, { color: textSub }]}>{tierOpen ? '▲' : '▼'}</Text>
                </View>

                <Text style={[styles.sectionDesc, { color: textSub }]}>
                  "대화의 깊이에 맞는 최적의 번역 엔진을 경험하세요. Premium(HIGH) 플랜은 단순 번역을 넘어 AI가 문맥을 분석하여 가장 자연스러운 대화 톤을 구현합니다."
                </Text>
              </View>
            </Pressable>

            {tierOpen && (
              <View style={{ marginTop: 10 }}>
                {TIER_OPTIONS.map((t) => {
                  const selected = t.value === translationTier;
                  const selectable = canSelectTier(userTier, t.value);
                  const showUpgrade = shouldShowUpgradeButton(userTier, t.value);
                  return (
                    <OptionRow
                      key={t.value}
                      title={t.label}
                      desc={t.desc}
                      selected={selected && selectable}
                      disabled={!selectable && !showUpgrade}
                      rightText={showUpgrade ? '업그레이드' : null}
                      onPress={() => handleSelectTier(t.value)}
                      baseText={textMain}
                      subText={textSub}
                      selectedBg={selectedBg}
                      activeText={activeText}
                      disabledText={'rgba(148,163,184,0.9)'}
                      radioColor={radioColor}
                      upgradeColor={upgradeColor}
                    />
                  );
                })}
              </View>
            )}

            {/* ===== 톤 ===== */}
            <Pressable
              style={[styles.dropdownBlock, { marginTop: 14, backgroundColor: blockBg }]}
              onPress={() => setToneOpen((v) => !v)}
              hitSlop={dropdownHitSlop}
            >
              <View pointerEvents="none">
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.sectionTitle, { color: textMain }]}>톤</Text>
                      <Text style={[styles.sectionInlineValue, { color: textMain }]}>{toneLabel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.sectionToggle, { color: textSub }]}>{toneOpen ? '▲' : '▼'}</Text>
                </View>

                <Text style={[styles.sectionDesc, { color: textSub }]}>
                  "Premium 전용 기능입니다. 선택하신 페르소나에 맞춰 AI가 문장의 어조와 뉘앙스를 세밀하게 조정합니다. 비즈니스, 일상 등 상황에 맞는 최적의 품격을 더해보세요."
                </Text>
              </View>
            </Pressable>

            {toneOpen && (
              <View style={{ marginTop: 10 }}>
                {TONE_OPTIONS.map((opt) => {
                  const selected = opt.value === translationTone;
                  return (
                    <OptionRow
                      key={opt.value}
                      title={opt.label}
                      desc={opt.desc}
                      selected={selected && !toneDisabled}
                      disabled={toneDisabled}
                      onPress={() => handleSelectTone(opt.value)}
                      baseText={textMain}
                      subText={textSub}
                      selectedBg={selectedBg}
                      activeText={activeText}
                      disabledText={'rgba(148,163,184,0.9)'}
                      radioColor={radioColor}
                      upgradeColor={upgradeColor}
                    />
                  );
                })}

                {toneDisabled && (
                  <Text style={[styles.infoText, { color: textSub }]}>
                    톤 설정은 HIGH 요금제에서 번역 등급을 HIGH로 선택했을 때만 활성화됩니다.
                  </Text>
                )}
              </View>
            )}

            {/* ===== 보낼 언어(preferred) ===== */}
            <Pressable
              style={[styles.dropdownBlock, { marginTop: 14, backgroundColor: blockBg }]}
              onPress={() => setSendLangOpen((v) => !v)}
              hitSlop={dropdownHitSlop}
            >
              <View pointerEvents="none">
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.sectionTitle, { color: textMain }]}>보낼 언어</Text>
                      <Text style={[styles.sectionInlineValue, { color: textMain }]}>{sendLangLabel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.sectionToggle, { color: textSub }]}>{sendLangOpen ? '▲' : '▼'}</Text>
                </View>

                <Text style={[styles.sectionDesc, { color: textSub }]}>
                  "상대방에게 어떤 언어로 메시지를 전달할지 결정합니다. 별도로 지정하지 않으면 상대방이 사용하는 시스템 언어에 맞춰 AI가 자동 번역하여 전송합니다."
                </Text>
              </View>
            </Pressable>

            {sendLangOpen && (
              <View style={{ marginTop: 10 }}>
                {LANGUAGE_OPTIONS.map((opt) => {
                  const selected = opt.code === effectiveSendLang;
                  const isPeerDefault = !!peerDefaultSendLang && opt.code === peerDefaultSendLang;

                  return (
                    <OptionRow
                      key={`send-${opt.code}`}
                      title={opt.label}
                      desc={null}
                      rightSubText={opt.code}
                      rightText={isPeerDefault ? '상대 기본' : null}
                      selected={selected}
                      onPress={() => onChangePreferredLang(opt.code)}
                      baseText={textMain}
                      subText={textSub}
                      selectedBg={selectedBg}
                      activeText={activeText}
                      disabledText={'rgba(148,163,184,0.9)'}
                      radioColor={radioColor}
                      upgradeColor={upgradeColor}
                    />
                  );
                })}
              </View>
            )}

            {/* ===== 받을 언어(view) ===== */}
            <Pressable
              style={[styles.dropdownBlock, { marginTop: 14, backgroundColor: blockBg }]}
              onPress={() => setRecvLangOpen((v) => !v)}
              hitSlop={dropdownHitSlop}
            >
              <View pointerEvents="none">
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.sectionTitle, { color: textMain }]}>받을 언어</Text>
                      <Text style={[styles.sectionInlineValue, { color: textMain }]}>{recvLangLabel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.sectionToggle, { color: textSub }]}>{recvLangOpen ? '▲' : '▼'}</Text>
                </View>

                <Text style={[styles.sectionDesc, { color: textSub }]}>
                  "채팅방에 들어오는 모든 메시지를 내가 가장 편한 언어로 실시간 변환하여 표시합니다. 글로벌 소통의 장벽 없는 대화를 즐겨보세요."
                </Text>
              </View>
            </Pressable>

            {recvLangOpen && (
              <View style={{ marginTop: 10 }}>
                {LANGUAGE_OPTIONS.map((opt) => {
                  const selected = opt.code === effectiveReceiveLang;
                  return (
                    <OptionRow
                      key={`recv-${opt.code}`}
                      title={opt.label}
                      desc={null}
                      rightSubText={opt.code}
                      selected={selected}
                      onPress={() => onChangeViewLang(opt.code)}
                      baseText={textMain}
                      subText={textSub}
                      selectedBg={selectedBg}
                      activeText={activeText}
                      disabledText={'rgba(148,163,184,0.9)'}
                      radioColor={radioColor}
                      upgradeColor={upgradeColor}
                    />
                  );
                })}
              </View>
            )}
          </ScrollView>

          <Pressable
            style={[styles.closeBtn, { backgroundColor: closeBg }]}
            onPress={onClose}
            hitSlop={16}
          >
            <Text style={[styles.closeBtnTxt, { color: closeText }]}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },

  card: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dragBar: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    marginBottom: 8,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerToggles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  togglePill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '900',
  },

  dropdownBlock: {
    marginTop: 16,
    minHeight: 92,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flex: 1,
    paddingRight: 12,
  },

  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  sectionInlineValue: {
    fontSize: 12,
    fontWeight: '900',
    opacity: 0.78,
  },

  sectionToggle: {
    fontSize: 12,
  },
  sectionDesc: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
  },

  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  rowButtonDisabled: { opacity: 0.55 },

  rowLabel: { fontSize: 13, fontWeight: '900' },
  rowDesc: { marginTop: 3, fontSize: 11 },

  rightSub: {
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 10,
    marginRight: 6,
  },

  rightAssist: {
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 8,
    marginRight: 6,
  },

  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },

  infoText: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
  },

  closeBtn: {
    marginTop: 16,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  closeBtnTxt: {
    fontSize: 13,
    fontWeight: '900',
  },
});
