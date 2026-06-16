import { DeviceEventEmitter } from 'react-native';
import * as Haptics from 'expo-haptics';

export function emitOpenMessageActions(args: {
  disabled?: boolean;
  message: any;
  momentCancelable?: boolean;
  copyText?: string;
}) {
  const { disabled = false, message, momentCancelable = false, copyText = '' } = args;
  if (disabled) return;

  try {
    void Haptics.selectionAsync();
  } catch {}

  try {
    DeviceEventEmitter.emit('chat:openMessageActions', {
      message,
      momentCancelable,
      ui: { copyText: String(copyText ?? '') },
    });
  } catch {}
}
