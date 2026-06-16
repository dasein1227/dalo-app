import { StyleSheet } from 'react-native';

export type AlertThemeName = 'coonn_light' | 'coonn_dark';
export type CoonnAlertVariant = 'default' | 'danger';

export type CoonnAlertColorKey =
  | 'overlay'
  | 'modalBg'
  | 'title'
  | 'message'
  | 'primaryBtn'
  | 'primaryBtnPressed'
  | 'primaryBorder'
  | 'primaryText'
  | 'primaryActionText'
  | 'secondaryBtn'
  | 'secondaryBtnPressed'
  | 'secondaryBorder'
  | 'secondaryText'
  | 'rowPressed'
  | 'actionGroupBg'
  | 'actionGroupBorder'
  | 'border'
  | 'divider'
  | 'dangerBtn'
  | 'dangerBtnPressed'
  | 'dangerText'
  | 'dangerTextOnSolid'
  | 'disabledBtn'
  | 'disabledText'
  | 'indicator'
  | 'shadow';

export type CoonnAlertCustomTheme = {
  mode?: AlertThemeName;
  colors?: Partial<Record<CoonnAlertColorKey, string>>;
};

export type AlertTheme = AlertThemeName | CoonnAlertCustomTheme;

type CoonnAlertColors = Record<CoonnAlertColorKey, string>;

function getDefaultColors(themeName: AlertThemeName, variant: CoonnAlertVariant): CoonnAlertColors {
  const isDark = themeName === 'coonn_dark';
  const isDanger = variant === 'danger';

  return isDark
    ? {
        overlay: 'rgba(0, 0, 0, 0.74)',
        modalBg: '#000000',
        title: '#E7E7E7',
        message: '#A7A7A7',
        primaryBtn: isDanger ? '#B75A5A' : '#171717',
        primaryBtnPressed: isDanger ? '#A94F4F' : '#202020',
        primaryBorder: isDanger ? 'rgba(183, 90, 90, 0.34)' : 'rgba(255, 255, 255, 0.12)',
        primaryText: isDanger ? '#F8EEEE' : '#E7E7E7',
        primaryActionText: isDanger ? '#B75A5A' : '#E7E7E7',
        secondaryBtn: '#111111',
        secondaryBtnPressed: '#181818',
        secondaryBorder: 'rgba(255, 255, 255, 0.12)',
        secondaryText: '#B7B7B7',
        rowPressed: '#181818',
        actionGroupBg: '#111111',
        actionGroupBorder: 'rgba(255, 255, 255, 0.12)',
        border: 'rgba(255, 255, 255, 0.10)',
        divider: 'rgba(255, 255, 255, 0.10)',
        dangerBtn: '#B75A5A',
        dangerBtnPressed: '#A94F4F',
        dangerText: '#B75A5A',
        dangerTextOnSolid: '#F8EEEE',
        disabledBtn: '#101010',
        disabledText: '#666666',
        indicator: isDanger ? '#F8EEEE' : '#E7E7E7',
        shadow: '#000000',
      }
    : {
        overlay: 'rgba(0, 0, 0, 0.42)',
        modalBg: '#F8F9FA',
        title: '#111111',
        message: '#60656D',
        primaryBtn: isDanger ? '#C85A5A' : '#0A0A0A',
        primaryBtnPressed: isDanger ? '#B94F4F' : '#1A1A1A',
        primaryBorder: isDanger ? 'rgba(200, 90, 90, 0.28)' : 'rgba(0, 0, 0, 0.14)',
        primaryText: '#FFFFFF',
        primaryActionText: isDanger ? '#C85A5A' : '#0A0A0A',
        secondaryBtn: '#FFFFFF',
        secondaryBtnPressed: '#F1F2F4',
        secondaryBorder: 'rgba(0, 0, 0, 0.09)',
        secondaryText: '#555B63',
        rowPressed: '#F1F2F4',
        actionGroupBg: '#FFFFFF',
        actionGroupBorder: 'rgba(0, 0, 0, 0.09)',
        border: 'rgba(0, 0, 0, 0.08)',
        divider: 'rgba(0, 0, 0, 0.075)',
        dangerBtn: '#C85A5A',
        dangerBtnPressed: '#B94F4F',
        dangerText: '#C85A5A',
        dangerTextOnSolid: '#FFFFFF',
        disabledBtn: '#F0F1F3',
        disabledText: '#9A9EA6',
        indicator: '#FFFFFF',
        shadow: '#000000',
      };
}

export function createCoonnAlertTheme(theme: AlertTheme, variant: CoonnAlertVariant) {
  const themeName: AlertThemeName = typeof theme === 'string' ? theme : theme.mode ?? 'coonn_light';
  const customColors = typeof theme === 'string' ? undefined : theme.colors;
  const isDark = themeName === 'coonn_dark';
  const isDanger = variant === 'danger';
  const baseColors = getDefaultColors(themeName, variant);

  const colors: CoonnAlertColors = {
    ...baseColors,
    ...(customColors ?? {}),
  };

  colors.primaryBorder = customColors?.primaryBorder ?? customColors?.border ?? colors.primaryBorder;
  colors.secondaryBorder = customColors?.secondaryBorder ?? customColors?.border ?? colors.secondaryBorder;
  colors.actionGroupBorder = customColors?.actionGroupBorder ?? customColors?.border ?? colors.actionGroupBorder;
  colors.primaryActionText = customColors?.primaryActionText ?? colors.primaryActionText;

  return {
    isDark,
    isDanger,
    colors,
  } as const;
}

export type CoonnAlertTheme = ReturnType<typeof createCoonnAlertTheme>;

export function createCoonnAlertStyles(ui: CoonnAlertTheme) {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
    },
    overlay: {
      flex: 1,
    },
    centerWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 38,
    },
    alertBox: {
      width: '100%',
      maxWidth: 372,
      borderRadius: 26,
      borderWidth: StyleSheet.hairlineWidth,
      paddingTop: 28,
      paddingBottom: 20,
      paddingHorizontal: 24,
      shadowColor: ui.colors.shadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: ui.isDark ? 0 : 0.1,
      shadowRadius: 22,
      elevation: ui.isDark ? 0 : 8,
    },
    textContainer: {
      alignItems: 'center',
      marginBottom: 22,
    },
    title: {
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: -0.3,
      marginBottom: 10,
    },
    message: {
      fontSize: 14,
      fontWeight: '400',
      textAlign: 'center',
      lineHeight: 21,
      letterSpacing: -0.12,
    },
    buttonContainer: {
      flexDirection: 'row',
    },
    actionSheetButtons: {
      gap: 12,
    },
    actionGroup: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 18,
      overflow: 'hidden',
    },
    actionRow: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    actionRowText: {
      fontSize: 15,
      fontWeight: '500',
      textAlign: 'center',
      letterSpacing: -0.12,
    },
    actionDivider: {
      height: StyleSheet.hairlineWidth,
    },
    cancelStandaloneButton: {
      height: 52,
      borderRadius: 17,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelStandaloneText: {
      fontSize: 15,
      fontWeight: '500',
      letterSpacing: -0.12,
    },
    button: {
      flex: 1,
      height: 54,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cancelButton: {
      marginRight: 12,
    },
    confirmButtonWithCancel: {
      marginLeft: 0,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '500',
      letterSpacing: -0.12,
    },
    confirmText: {
      fontWeight: '600',
    },
  });
}
