import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { X, RotateCcw } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type DateRange = { from?: Date | null; to?: Date | null };

type Props = {
  visible: boolean;
  onClose: () => void;

  theme: ChatTheme;

  dateRange: DateRange;
  onApply: (range: DateRange) => void;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameDay(a?: Date | null, b?: Date | null) {
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
function clampRange(r: DateRange): DateRange {
  const from = r.from ? startOfDay(r.from) : null;
  const to = r.to ? startOfDay(r.to) : null;
  if (from && to && from.getTime() > to.getTime()) return { from: to, to: from };
  return { from, to };
}
function formatDateK(d?: Date | null) {
  if (!d) return '선택 안 함';
  const x = startOfDay(d);
  const yy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}
function withAlpha(hex: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

function getMonthMatrix(baseMonth: Date) {
  const y = baseMonth.getFullYear();
  const m = baseMonth.getMonth();
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const start = new Date(y, m, 1 - firstDow);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      row.push(d);
    }
    weeks.push(row);
  }
  return weeks;
}

function isInRange(d: Date, from?: Date | null, to?: Date | null) {
  if (!from || !to) return false;
  const t = startOfDay(d).getTime();
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return t >= a && t <= b;
}

function addMonths(d: Date, delta: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  return x;
}

function kMonthTitle(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

type CalendarDialogProps = {
  visible: boolean;
  onClose: () => void;
  theme: ChatTheme;

  initialRange: DateRange;
  onConfirm: (range: DateRange) => void;
};

function CalendarDialog({ visible, onClose, theme, initialRange, onConfirm }: CalendarDialogProps) {
  const [range, setRange] = useState<DateRange>({ from: initialRange.from ?? null, to: initialRange.to ?? null });
  const [month, setMonth] = useState<Date>(() => {
    const base = initialRange.to ?? initialRange.from ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!visible) return;
    setRange({ from: initialRange.from ?? null, to: initialRange.to ?? null });
    const base = initialRange.to ?? initialRange.from ?? new Date();
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [visible, initialRange.from, initialRange.to]);

  const weeks = useMemo(() => getMonthMatrix(month), [month]);
  const mKey = useMemo(() => monthKey(month), [month]);

  const pickDay = useCallback((d: Date) => {
    const day = startOfDay(d);

    setRange((prev) => {
      const from = prev.from ? startOfDay(prev.from) : null;
      const to = prev.to ? startOfDay(prev.to) : null;

      if (!from && !to) return { from: day, to: null };

      if (from && !to) {
        if (day.getTime() < from.getTime()) return { from: day, to: from };
        return { from, to: day };
      }

      return { from: day, to: null };
    });
  }, []);

  const confirm = useCallback(() => {
    const fixed = clampRange(range);
    const final =
      fixed.from && !fixed.to
        ? { from: fixed.from, to: fixed.from }
        : { from: fixed.from ?? null, to: fixed.to ?? null };
    onConfirm(final);
    onClose();
  }, [range, onConfirm, onClose]);

  const clear = useCallback(() => {
    setRange({ from: null, to: null });
  }, []);

  const headerText = theme.headerText ?? '#111827';
  const cardBg = theme.inputBg ?? '#FFFFFF';
  const line = withAlpha(theme.dateTimeLine ?? '#E5E7EB', 0.72);

  const primary = theme.translateOn ?? '#2563EB';
  const subText = withAlpha(headerText, 0.78);
  const faintText = withAlpha(headerText, 0.30);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dialogBackdrop} onPress={onClose} />

      <View style={[styles.dialogCard, { backgroundColor: cardBg, borderColor: line }]}>
        <View style={styles.dialogTop}>
          <Pressable style={styles.iconBtn} onPress={onClose}>
            <X size={20} color={headerText} />
          </Pressable>

          <Text style={[styles.dialogTitle, { color: headerText }]}>날짜 선택</Text>

          <Pressable style={styles.iconBtn} onPress={clear}>
            <RotateCcw size={18} color={subText} />
          </Pressable>
        </View>

        <View style={styles.monthRow}>
          <Pressable style={styles.monthArrow} onPress={() => setMonth((m) => addMonths(m, -1))}>
            <Text style={[styles.monthArrowText, { color: headerText }]}>{'‹'}</Text>
          </Pressable>

          <Text style={[styles.monthTitle, { color: headerText }]}>{kMonthTitle(month)}</Text>

          <Pressable style={styles.monthArrow} onPress={() => setMonth((m) => addMonths(m, +1))}>
            <Text style={[styles.monthArrowText, { color: headerText }]}>{'›'}</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
            <Text key={w} style={[styles.weekText, { color: idx === 0 ? '#EF4444' : idx === 6 ? primary : subText }]}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid} key={mKey}>
          {weeks.map((row, wi) => (
            <View key={wi} style={styles.row}>
              {row.map((d, di) => {
                const inThisMonth = d.getMonth() === month.getMonth();
                const isStart = range.from ? sameDay(d, range.from) : false;
                const isEnd = range.to ? sameDay(d, range.to) : false;
                const inRange = isInRange(d, range.from ?? null, range.to ?? null);
                const selected = isStart || isEnd;

                const baseTextColor = !inThisMonth ? faintText : headerText;
                const weekendColor =
                  di === 0 ? '#EF4444' : di === 6 ? primary : baseTextColor;

                return (
                  <View key={`${wi}-${di}`} style={styles.cell}>
                    <View style={[styles.rangeStrip, { backgroundColor: inRange ? withAlpha(primary, 0.12) : 'transparent' }]} />
                    <Pressable style={[styles.dayBtn, selected && { backgroundColor: primary }]} onPress={() => pickDay(d)}>
                      <Text style={[styles.dayText, { color: selected ? '#fff' : weekendColor }]}>
                        {d.getDate()}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={[styles.footerLine, { backgroundColor: line }]} />

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={[styles.footerLabel, { color: subText }]}>선택</Text>
            <Text style={[styles.footerValue, { color: headerText }]}>
              {range.from ? formatDateK(range.from) : '선택 안 함'}
              {range.to ? ` ~ ${formatDateK(range.to)}` : ''}
            </Text>
          </View>

          <View style={styles.footerBtns}>
            <Pressable style={[styles.footerBtn, { backgroundColor: withAlpha(theme.inputFieldBg ?? '#F3F4F6', 0.92) }]} onPress={onClose}>
              <Text style={[styles.footerBtnText, { color: headerText }]}>취소</Text>
            </Pressable>

            <Pressable style={[styles.footerBtn, { backgroundColor: primary }]} onPress={confirm}>
              <Text style={[styles.footerBtnText, { color: '#fff' }]}>확인</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DatePickerSheet({ visible, onClose, theme, dateRange, onApply }: Props) {
  return (
    <CalendarDialog
      visible={visible}
      onClose={onClose}
      theme={theme}
      initialRange={dateRange}
      onConfirm={(r) => onApply(clampRange(r))}
    />
  );
}

const styles = StyleSheet.create({
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dialogCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: '18%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dialogTop: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dialogTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthRow: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  monthArrow: {
    width: 44,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: { fontSize: 28, fontWeight: '400' },
  monthTitle: { fontSize: 18, fontWeight: '600' },
  weekRow: {
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  weekText: {
    width: 40,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
  grid: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  cell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeStrip: {
    position: 'absolute',
    left: -6,
    right: -6,
    height: 26,
    borderRadius: 999,
  },
  dayBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerLine: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  footerLeft: { flex: 1 },
  footerLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  footerValue: { fontSize: 13, fontWeight: '600' },
  footerBtns: { flexDirection: 'row', gap: 8 },
  footerBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: { fontSize: 14, fontWeight: '600' },
});
