import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  createCoonnAlertStyles,
  createCoonnAlertTheme,
  type AlertTheme,
  type CoonnAlertVariant,
} from './CoonnAlert.theme';

export type { AlertTheme, CoonnAlertVariant } from './CoonnAlert.theme';

interface CoonnAlertProps {
  visible: boolean;
  theme?: AlertTheme;
  variant?: CoonnAlertVariant;

  title: string;
  message?: string;

  confirmText?: string;
  cancelText?: string;

  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;

  secondaryConfirmText?: string;
  onSecondaryConfirm?: () => void | Promise<void>;
  secondaryVariant?: CoonnAlertVariant;

  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  dismissOnBackButton?: boolean;
  confirmLoading?: boolean;
  disabled?: boolean;
  onConfirmError?: (error: unknown) => void;
}

export default function CoonnAlert({
  visible,
  theme = 'coonn_light',
  variant = 'default',
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
  secondaryConfirmText,
  onSecondaryConfirm,
  secondaryVariant = 'danger',
  singleButton = false,
  dismissOnBackdrop = false,
  dismissOnBackButton,
  confirmLoading = false,
  disabled = false,
  onConfirmError,
}: CoonnAlertProps) {
  const [mounted, setMounted] = useState(visible);
  const [internalLoading, setInternalLoading] = useState(false);

  const opacityAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const translateYAnim = useRef(new Animated.Value(visible ? 0 : 8)).current;

  const isComponentMountedRef = useRef(true);
  const openRafRef = useRef<number | null>(null);

  const ui = useMemo(() => createCoonnAlertTheme(theme, variant), [theme, variant]);
  const styles = useMemo(() => createCoonnAlertStyles(ui), [ui]);

  const isBusy = disabled || confirmLoading || internalLoading;
  const canShowCancel = !singleButton && !!onCancel;
  const canShowSecondary = !singleButton && !!secondaryConfirmText && !!onSecondaryConfirm;

  const allowBackButtonDismiss =
    typeof dismissOnBackButton === 'boolean'
      ? dismissOnBackButton
      : dismissOnBackdrop;

  useEffect(() => {
    isComponentMountedRef.current = true;

    return () => {
      isComponentMountedRef.current = false;

      if (openRafRef.current !== null) {
        cancelAnimationFrame(openRafRef.current);
        openRafRef.current = null;
      }

      opacityAnim.stopAnimation();
      scaleAnim.stopAnimation();
      translateYAnim.stopAnimation();
    };
  }, [opacityAnim, scaleAnim, translateYAnim]);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();

      if (isComponentMountedRef.current) {
        setMounted(true);
      }

      if (openRafRef.current !== null) {
        cancelAnimationFrame(openRafRef.current);
        openRafRef.current = null;
      }

      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = null;

        if (!isComponentMountedRef.current) return;

        opacityAnim.stopAnimation();
        scaleAnim.stopAnimation();
        translateYAnim.stopAnimation();

        Animated.parallel([
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 55,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });

      return;
    }

    if (!mounted) return;

    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }

    opacityAnim.stopAnimation();
    scaleAnim.stopAnimation();
    translateYAnim.stopAnimation();

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 8,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || !isComponentMountedRef.current) return;

      setMounted(false);
      setInternalLoading(false);
    });
  }, [mounted, opacityAnim, scaleAnim, translateYAnim, visible]);

  const handleCancel = useCallback(() => {
    if (isBusy) return;
    onCancel?.();
  }, [isBusy, onCancel]);

  const handleBackdropPress = useCallback(() => {
    if (!dismissOnBackdrop) return;
    handleCancel();
  }, [dismissOnBackdrop, handleCancel]);

  const handleRequestClose = useCallback(() => {
    if (!allowBackButtonDismiss) return;
    handleCancel();
  }, [allowBackButtonDismiss, handleCancel]);

  const runAction = useCallback(
    async (action: () => void | Promise<void>) => {
      if (isBusy) return;

      try {
        const result = action();

        if (result && typeof (result as Promise<void>).then === 'function') {
          if (isComponentMountedRef.current) {
            setInternalLoading(true);
          }

          await result;
        }
      } catch (error) {
        onConfirmError?.(error);
      } finally {
        if (isComponentMountedRef.current) {
          setInternalLoading(false);
        }
      }
    },
    [isBusy, onConfirmError],
  );

  const getSolidActionBackground = (actionVariant: CoonnAlertVariant, pressed: boolean) => {
    if (isBusy) return ui.colors.disabledBtn;
    if (actionVariant === 'danger') {
      return pressed ? ui.colors.dangerBtnPressed : ui.colors.dangerBtn;
    }
    return pressed ? ui.colors.primaryBtnPressed : ui.colors.primaryBtn;
  };

  const getSolidActionTextColor = (actionVariant: CoonnAlertVariant) => {
    if (isBusy) return ui.colors.disabledText;
    if (actionVariant === 'danger') return ui.colors.dangerTextOnSolid;
    return ui.colors.primaryText;
  };

  const getListActionTextColor = (actionVariant: CoonnAlertVariant) => {
    if (isBusy) return ui.colors.disabledText;
    if (actionVariant === 'danger') return ui.colors.dangerText;
    return ui.colors.primaryActionText;
  };

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
      hardwareAccelerated={Platform.OS === 'android'}
    >
      <View
        style={styles.modalRoot}
        accessibilityViewIsModal
        importantForAccessibility="yes"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackdropPress}
          disabled={!dismissOnBackdrop || isBusy}
          accessibilityRole="button"
          accessibilityLabel="알림창 바깥 영역"
        >
          <Animated.View
            style={[
              styles.overlay,
              {
                backgroundColor: ui.colors.overlay,
                opacity: opacityAnim,
              },
            ]}
          />
        </Pressable>

        <View pointerEvents="box-none" style={styles.centerWrap}>
          <Animated.View
            accessibilityRole="alert"
            style={[
              styles.alertBox,
              {
                backgroundColor: ui.colors.modalBg,
                borderColor: ui.colors.border,
                opacity: opacityAnim,
                transform: [
                  { scale: scaleAnim },
                  { translateY: translateYAnim },
                ],
              },
            ]}
          >
            <View style={styles.textContainer}>
              <Text
                style={[styles.title, { color: ui.colors.title }]}
                numberOfLines={3}
              >
                {title}
              </Text>

              {!!message && (
                <Text style={[styles.message, { color: ui.colors.message }]}>
                  {message}
                </Text>
              )}
            </View>

            {canShowSecondary ? (
              <View style={styles.actionSheetButtons}>
                <View
                  style={[
                    styles.actionGroup,
                    {
                      backgroundColor: ui.colors.actionGroupBg,
                      borderColor: ui.colors.actionGroupBorder,
                    },
                  ]}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionRow,
                      {
                        backgroundColor:
                          pressed && !isBusy ? ui.colors.rowPressed : 'transparent',
                      },
                    ]}
                    onPress={() => runAction(onConfirm)}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={confirmText}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={getListActionTextColor(variant)} />
                    ) : (
                      <Text
                        style={[
                          styles.actionRowText,
                          { color: getListActionTextColor(variant) },
                        ]}
                      >
                        {confirmText}
                      </Text>
                    )}
                  </Pressable>

                  <View style={[styles.actionDivider, { backgroundColor: ui.colors.divider }]} />

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionRow,
                      {
                        backgroundColor:
                          pressed && !isBusy ? ui.colors.rowPressed : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      if (onSecondaryConfirm) void runAction(onSecondaryConfirm);
                    }}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={secondaryConfirmText}
                  >
                    <Text
                      style={[
                        styles.actionRowText,
                        { color: getListActionTextColor(secondaryVariant) },
                      ]}
                    >
                      {secondaryConfirmText}
                    </Text>
                  </Pressable>
                </View>

                {canShowCancel && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.cancelStandaloneButton,
                      {
                        backgroundColor:
                          pressed && !isBusy
                            ? ui.colors.secondaryBtnPressed
                            : ui.colors.secondaryBtn,
                        borderColor: ui.colors.secondaryBorder,
                      },
                    ]}
                    onPress={handleCancel}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={cancelText}
                  >
                    <Text
                      style={[
                        styles.cancelStandaloneText,
                        { color: isBusy ? ui.colors.disabledText : ui.colors.secondaryText },
                      ]}
                    >
                      {cancelText}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                {canShowCancel && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      styles.cancelButton,
                      {
                        backgroundColor:
                          pressed && !isBusy
                            ? ui.colors.secondaryBtnPressed
                            : ui.colors.secondaryBtn,
                        borderColor: ui.colors.secondaryBorder,
                      },
                    ]}
                    onPress={handleCancel}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={cancelText}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: isBusy ? ui.colors.disabledText : ui.colors.secondaryText },
                      ]}
                    >
                      {cancelText}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    canShowCancel && styles.confirmButtonWithCancel,
                    {
                      backgroundColor: getSolidActionBackground(variant, pressed),
                      borderColor: ui.colors.primaryBorder,
                    },
                  ]}
                  onPress={() => runAction(onConfirm)}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel={confirmText}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color={getSolidActionTextColor(variant)} />
                  ) : (
                    <Text
                      style={[
                        styles.buttonText,
                        styles.confirmText,
                        { color: getSolidActionTextColor(variant) },
                      ]}
                    >
                      {confirmText}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
