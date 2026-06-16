import { Platform, UIManager } from 'react-native';

let didEnable = false;

export function enableLayoutAnimationOnce() {
  if (didEnable) return;
  didEnable = true;

  const isNewArchitectureEnabled = Boolean(
    (globalThis as any).nativeFabricUIManager
  );

  if (
    Platform.OS === 'android' &&
    !isNewArchitectureEnabled &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}