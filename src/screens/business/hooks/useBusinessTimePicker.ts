// src/screens/business/hooks/useBusinessTimePicker.ts

import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { DateTimePickerEvent } from '@react-native-community/datetimepicker';

// 수정할 수 있는 시간 필드 키 정의
export type TimeFieldKey = 
  | 'open_time' 
  | 'close_time' 
  | 'last_order_time' 
  | 'break_start_time' 
  | 'break_end_time';

export function useBusinessTimePicker() {
  const [visible, setVisible] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [targetField, setTargetField] = useState<TimeFieldKey | null>(null);
  
  // 변경 시 실행할 콜백 함수 저장 (Closure 문제 방지 위해 Ref 대신 State 사용하되, 함수형 업데이트 주의)
  const [onConfirmRef, setOnConfirmRef] = useState<{ fn: (time: string) => void } | null>(null);

  // 문자열 "HH:mm" -> Date 객체 변환
  const parseTime = useCallback((timeStr?: string | null) => {
    const d = new Date();
    if (!timeStr) return d;
    
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      d.setHours(h);
      d.setMinutes(m);
      d.setSeconds(0);
      d.setMilliseconds(0);
    }
    return d;
  }, []);

  // 피커 열기 함수
  const openTimePicker = useCallback((
    field: TimeFieldKey, 
    currentTime: string | null | undefined, 
    onConfirm: (val: string) => void
  ) => {
    setTargetField(field);
    setCurrentDate(parseTime(currentTime));
    setOnConfirmRef({ fn: onConfirm }); // 객체로 감싸서 저장
    setVisible(true);
  }, [parseTime]);

  // 피커 변경 핸들러
  const handleTimeChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    // 안드로이드는 선택/취소 즉시 닫힘
    if (Platform.OS === 'android') {
      setVisible(false);
    }

    if (event.type === 'dismissed') return;

    if (selectedDate) {
      setCurrentDate(selectedDate);
      
      // 안드로이드는 확인 버튼이 내장되어 있어 즉시 반영
      // iOS는 'onChange'가 스크롤 할 때마다 발생하므로, 별도 '완료' 버튼에서 확정하거나 실시간 반영 선택
      // 여기서는 실시간 반영 로직 채택 (단, iOS는 모달 닫을 때 최종 적용하도록 UI 구성 필요 가능성 있음)
      
      const hh = selectedDate.getHours().toString().padStart(2, '0');
      const mm = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      if (onConfirmRef?.fn) {
        onConfirmRef.fn(timeStr);
      }
    }
  }, [onConfirmRef]);

  // 강제로 닫기 (iOS용)
  const closePicker = useCallback(() => {
    setVisible(false);
    setTargetField(null);
    setOnConfirmRef(null);
  }, []);

  return {
    visible,
    currentDate,
    targetField,
    openTimePicker,
    handleTimeChange,
    closePicker,
  };
}