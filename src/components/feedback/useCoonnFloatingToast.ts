// src/components/feedback/useCoonnFloatingToast.ts

import { useCallback, useState } from 'react';

import type { CoonnFloatingToastTone } from './CoonnFloatingToast.theme';

export type CoonnFloatingToastState = {
  visible: boolean;
  message: string;
  tone: CoonnFloatingToastTone;
  showMark: boolean;
};

export type ShowCoonnFloatingToastParams = {
  message: string;
  tone?: CoonnFloatingToastTone;
  showMark?: boolean;
};

const EMPTY_TOAST: CoonnFloatingToastState = {
  visible: false,
  message: '',
  tone: 'default',
  showMark: false,
};

export function useCoonnFloatingToast() {
  const [toast, setToast] = useState<CoonnFloatingToastState>(EMPTY_TOAST);

  const showToast = useCallback((params: ShowCoonnFloatingToastParams | string) => {
    if (typeof params === 'string') {
      setToast({ visible: true, message: params, tone: 'default', showMark: false });
      return;
    }

    setToast({
      visible: true,
      message: params.message,
      tone: params.tone ?? 'default',
      showMark: params.showMark ?? false,
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast(EMPTY_TOAST);
  }, []);

  return { toast, showToast, hideToast } as const;
}
