// src/screens/chat/components/MessageActions/DeleteTypeModal.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

export type MomentDeleteConfig = {
  delaySeconds: number;
  readBased: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;

  theme: ChatTheme;

  // ✅ eligibility (computed by parent)
  canDeleteAll: boolean;
  canMomentDelete: boolean;

  onDeleteMine: () => void;
  onDeleteAll: () => void;
  onConfirmMoment: (cfg: MomentDeleteConfig) => void;
};

type DeleteChoice = 'MINE' | 'ALL' | 'MOMENT';

function formatDelay(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${ss}초`;
}

function withAlpha(hex: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  const h = (hex || '').replace('#', '').trim();

  let r = 0;
  let g = 0;
  let b = 0;

  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return `rgba(0,0,0,${a})`;
  }

  return `rgba(${r},${g},${b},${a})`;
}

export default function DeleteTypeModal({
  visible,
  onClose,
  theme,
  canDeleteAll,
  canMomentDelete,
  onDeleteMine,
  onDeleteAll,
  onConfirmMoment,
}: Props) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const mins = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const [choice, setChoice] = useState<DeleteChoice>('MINE');
  const [hour, setHour] = useState(0);
  const [min, setMin] = useState(10);
  const [readBased, setReadBased] = useState(false);

  // cancel confirm
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);

  // reset on open
  useEffect(() => {
    if (!visible) return;

    setChoice('MINE');
    setHour(0);
    setMin(10);
    setReadBased(false);
    setCancelConfirmVisible(false);
  }, [visible]);

  // if eligibility changes while open, keep state safe
  useEffect(() => {
    if (!visible) return;
    if (choice === 'ALL' && !canDeleteAll) setChoice('MINE');
    if (choice === 'MOMENT' && !canMomentDelete) setChoice('MINE');
  }, [visible, choice, canDeleteAll, canMomentDelete]);

  const delaySeconds = useMemo(() => hour * 3600 + min * 60, [hour, min]);

  const momentLabel = useMemo(() => {
    if (delaySeconds <= 0) return '시간을 선택하세요';
    if (readBased) return `읽은 후 ${formatDelay(delaySeconds)} 뒤 삭제`;
    return `${formatDelay(delaySeconds)} 후 삭제`;
  }, [delaySeconds, readBased]);

  const isAllEnabled = canDeleteAll;
  const isMomentEnabled = canMomentDelete;

  const momentExpanded = choice === 'MOMENT' && isMomentEnabled;

  const canSubmit = useMemo(() => {
    if (choice === 'MINE') return true;
    if (choice === 'ALL') return isAllEnabled;
    if (choice === 'MOMENT') return isMomentEnabled && delaySeconds > 0;
    return false;
  }, [choice, isAllEnabled, isMomentEnabled, delaySeconds]);

  // ✅ "확인"이 곧 실행
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    onClose();

    try {
      if (choice === 'MINE') {
        onDeleteMine();
        return;
      }

      if (choice === 'ALL') {
        onDeleteAll();
        return;
      }

      // MOMENT
      onConfirmMoment({ delaySeconds, readBased });
    } catch {
      // no-op (상위에서 toast/log 처리 가능)
    }
  }, [
    canSubmit,
    choice,
    onClose,
    onDeleteMine,
    onDeleteAll,
    onConfirmMoment,
    delaySeconds,
    readBased,
  ]);

  const needsCancelConfirm = useMemo(() => {
    // "취소 확인": 모먼트/모두에게 삭제를 선택한 상태에서 실수로 닫히는 것을 방지
    if (choice === 'ALL') return true;
    if (choice === 'MOMENT') return true;
    return false;
  }, [choice]);

  const attemptClose = useCallback(() => {
    if (!needsCancelConfirm) {
      onClose();
      return;
    }
    setCancelConfirmVisible(true);
  }, [needsCancelConfirm, onClose]);

  const RadioRow = useCallback(
    ({
      label,
      value,
      disabled,
    }: {
      label: string;
      value: DeleteChoice;
      disabled?: boolean;
    }) => {
      const selected = choice === value;

      const tint = theme.headerText;
      const rowBg = theme.inputFieldBg ?? withAlpha(tint, 0.06);
      const rowBorder = withAlpha(tint, 0.12);

      return (
        <Pressable
          onPress={() => {
            if (disabled) return;
            setChoice(value);
          }}
          disabled={!!disabled}
          style={[
            styles.row,
            {
              backgroundColor: rowBg,
              borderColor: rowBorder,
              opacity: disabled ? 0.45 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.radioOuter,
              {
                borderColor: withAlpha(tint, selected ? 0.95 : 0.5),
                backgroundColor: theme.headerBg,
              },
            ]}
          >
            {selected && <View style={[styles.radioInner, { backgroundColor: tint }]} />}
          </View>

          <Text style={[styles.rowLabel, { color: theme.headerText }]}>{label}</Text>
        </Pressable>
      );
    },
    [choice, theme.headerBg, theme.headerText, theme.inputFieldBg],
  );

  const ToggleRow = useMemo(() => {
    const tint = theme.headerText;
    const trackOff = withAlpha(tint, 0.18);
    const trackOn = withAlpha(tint, 0.55);
    const knobBg = theme.inputBg;

    return (
      <Pressable
        onPress={() => setReadBased((v) => !v)}
        style={styles.toggleRow}
        hitSlop={8}
      >
        <Text style={[styles.toggleLabel, { color: theme.headerText }]}>읽은 뒤에 삭제</Text>

        <View
          style={[
            styles.toggleTrack,
            {
              backgroundColor: readBased ? trackOn : trackOff,
              borderColor: withAlpha(tint, 0.22),
            },
          ]}
        >
          <View
            style={[
              styles.toggleKnob,
              {
                backgroundColor: knobBg,
                transform: [{ translateX: readBased ? 18 : 2 }],
              },
            ]}
          />
        </View>
      </Pressable>
    );
  }, [readBased, theme.headerText, theme.inputBg]);

  const tint = theme.headerText;
  const cardBg = theme.inputFieldBg ?? withAlpha(tint, 0.06);
  const cardBorder = withAlpha(tint, 0.12);

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={attemptClose}>
        <Pressable style={styles.backdrop} onPress={attemptClose} />

        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: theme.inputBg }]}>
            <Text style={[styles.title, { color: theme.headerText }]}>삭제</Text>

            {/* ✅ 라디오 박스 영역 */}
            <View style={styles.list}>
              <RadioRow label="나에게만 삭제" value="MINE" />
              <RadioRow label="모두에게 삭제" value="ALL" disabled={!isAllEnabled} />
              <RadioRow label="모먼트 삭제" value="MOMENT" disabled={!isMomentEnabled} />
            </View>

            {/* ✅ 모먼트 삭제 선택 시 자동 확장 / 비활성화 시 축소 */}
            {momentExpanded && (
              <View style={[styles.momentBox, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {/* 타이머(시간설정) */}
                <Text style={[styles.sectionTitle, { color: theme.headerText }]}>타이머</Text>

                <View style={styles.pickerRow}>
                  <View
                    style={[
                      styles.pickerWrap,
                      { backgroundColor: cardBg, borderColor: cardBorder },
                    ]}
                  >
                    <Picker
                      selectedValue={hour}
                      onValueChange={(v) => setHour(Number(v))}
                      style={[styles.picker, { color: theme.headerText }]}
                      dropdownIconColor={theme.headerText}
                      itemStyle={Platform.OS === 'ios' ? { color: theme.headerText } : undefined}
                    >
                      {hours.map((h) => (
                        <Picker.Item key={`h_${h}`} label={`${String(h).padStart(2, '0')}`} value={h} />
                      ))}
                    </Picker>
                    <Text style={[styles.unit, { color: theme.headerText }]}>시간</Text>
                  </View>

                  <View
                    style={[
                      styles.pickerWrap,
                      { backgroundColor: cardBg, borderColor: cardBorder },
                    ]}
                  >
                    <Picker
                      selectedValue={min}
                      onValueChange={(v) => setMin(Number(v))}
                      style={[styles.picker, { color: theme.headerText }]}
                      dropdownIconColor={theme.headerText}
                      itemStyle={Platform.OS === 'ios' ? { color: theme.headerText } : undefined}
                    >
                      {mins.map((m) => (
                        <Picker.Item key={`m_${m}`} label={`${String(m).padStart(2, '0')}`} value={m} />
                      ))}
                    </Picker>
                    <Text style={[styles.unit, { color: theme.headerText }]}>분</Text>
                  </View>
                </View>

                {/* 읽은뒤 삭제 on/off 버튼 */}
                <View style={styles.toggleWrap}>{ToggleRow}</View>

                <Text style={[styles.momentLabel, { color: theme.headerText }]}>{momentLabel}</Text>
              </View>
            )}

            {/* 하단 버튼 */}
            <View style={styles.bottomRow}>
              <Pressable
                style={[
                  styles.bottomBtn,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
                onPress={attemptClose}
              >
                <Text style={[styles.bottomBtnText, { color: theme.headerText }]}>취소</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.bottomBtn,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                    opacity: canSubmit ? 1 : 0.45,
                  },
                ]}
                disabled={!canSubmit}
                onPress={handleSubmit}
              >
                <Text style={[styles.bottomBtnText, { color: theme.headerText }]}>확인</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ 취소 확인 */}
      <Modal
        visible={cancelConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelConfirmVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCancelConfirmVisible(false)} />

        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.confirmSheet, { backgroundColor: theme.inputBg }]}>
            <Text style={[styles.confirmTitle, { color: theme.headerText }]}>취소하시겠어요?</Text>
            <Text style={[styles.confirmDesc, { color: withAlpha(theme.headerText, 0.78) }]}>
              선택한 설정은 저장되지 않습니다.
            </Text>

            <View style={styles.confirmRow}>
              <Pressable
                style={[
                  styles.confirmBtn,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
                onPress={() => setCancelConfirmVisible(false)}
              >
                <Text style={[styles.confirmBtnText, { color: theme.headerText }]}>계속 설정</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmBtn,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
                onPress={() => {
                  setCancelConfirmVisible(false);
                  onClose();
                }}
              >
                <Text style={[styles.confirmBtnText, { color: theme.headerText }]}>취소하기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },

  title: {
    fontSize: 18,
    fontWeight: '700', 
    includeFontPadding: false,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },

  list: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    gap: 8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700', 
    includeFontPadding: false,
  },

  momentBox: {
    marginTop: 10,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700', 
    includeFontPadding: false,
    paddingBottom: 10,
    paddingHorizontal: 2,
  },

  pickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
  },
  picker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 140 : 54,
  },
  unit: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    opacity: 0.75,
    textAlign: 'center',
    paddingTop: 2,
  },

  toggleWrap: {
    paddingTop: 12,
    paddingHorizontal: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700', 
    includeFontPadding: false,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },

  momentLabel: {
    fontSize: 12,
    fontWeight: '500', 
    includeFontPadding: false,
    opacity: 0.86,
    paddingTop: 12,
    paddingHorizontal: 2,
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 14,
  },
  bottomBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bottomBtnText: {
    fontSize: 13,
    fontWeight: '700', 
    includeFontPadding: false,
  },

  // cancel confirm modal
  confirmSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    includeFontPadding: false,
    paddingBottom: 6,
  },
  confirmDesc: {
    fontSize: 12,
    fontWeight: '500', 
    includeFontPadding: false,
    paddingBottom: 12,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700', 
    includeFontPadding: false,
  },
});
