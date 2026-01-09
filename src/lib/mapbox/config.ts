import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const MAPBOX_ACCESS_TOKEN: string | null =
  typeof extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN === 'string' &&
  extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.trim()
    ? extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.trim()
    : null;
