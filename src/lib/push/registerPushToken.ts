import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';

export type PushProvider = 'fcm' | 'apns';
export type PushPlatform = 'ios' | 'android';
export type PushEnvironment = 'production' | 'sandbox' | 'development';

type RegisterPushTokenRpcRow = {
  id: number;
  token_uid: string;
  user_id: string;
  provider: PushProvider;
  platform: PushPlatform;
  environment: PushEnvironment;
  app_scope: string;
  is_active: boolean;
  is_valid: boolean;
  registered_at: string;
  last_seen_at: string;
};

type NativePushToken = {
  provider: PushProvider;
  platform: PushPlatform;
  environment: PushEnvironment;
  token: string;
};

type EnsurePushTokenRegisteredOptions = {
  reason?: string;
};

type DisablePushTokenOptions = {
  reason?: string;
};

type CachedRegistration = {
  tokenUid: string;
  userId: string;
  provider: PushProvider;
  platform: PushPlatform;
  environment: PushEnvironment;
  appScope: string;
  updatedAt: string;
};

const STORAGE_KEYS = {
  installationId: '@coonn/push/installation-id',
  deviceId: '@coonn/push/device-id',
  registration: '@coonn/push/registration',
} as const;

const DEFAULT_ANDROID_CHANNEL_ID = 'default';
const DEFAULT_APP_SCOPE = 'default';

function nowIso() {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getExpoExtra(): Record<string, any> {
  return (
    (Constants as any)?.expoConfig?.extra ||
    (Constants as any)?.manifest?.extra ||
    {}
  );
}

function getAppScope(): string {
  const extra = getExpoExtra();

  const explicitScope =
    normalizeString(extra.EXPO_PUBLIC_PUSH_APP_SCOPE) ||
    normalizeString(extra.PUSH_APP_SCOPE);

  const iosBundleId = normalizeString((Constants as any)?.expoConfig?.ios?.bundleIdentifier);
  const androidPackage = normalizeString((Constants as any)?.expoConfig?.android?.package);
  const easChannel = normalizeString(extra.eas?.channel);
  const releaseChannel = normalizeString((Constants as any)?.expoConfig?.releaseChannel);

  return (
    explicitScope ||
    iosBundleId ||
    androidPackage ||
    easChannel ||
    releaseChannel ||
    DEFAULT_APP_SCOPE
  );
}

function getPlatform(): PushPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function getEnvironment(provider: PushProvider): PushEnvironment {
  if (provider === 'apns') {
    return __DEV__ ? 'sandbox' : 'production';
  }
  return __DEV__ ? 'development' : 'production';
}

function getLocale(): string | null {
  const locale = (Intl as any)?.DateTimeFormat?.().resolvedOptions?.().locale;
  return normalizeString(locale);
}

function getTimeZone(): string | null {
  const tz = (Intl as any)?.DateTimeFormat?.().resolvedOptions?.().timeZone;
  return normalizeString(tz);
}

function getAppVersion(): string | null {
  return normalizeString((Constants as any)?.expoConfig?.version);
}

function getOsVersion(): string | null {
  if (typeof Platform.Version === 'string') return normalizeString(Platform.Version);
  if (typeof Platform.Version === 'number') return String(Platform.Version);
  return null;
}

function getDeviceModel(): string | null {
  const constants = (Platform as any)?.constants ?? {};
  return (
    normalizeString(constants.Model) ||
    normalizeString(constants.model) ||
    normalizeString(constants.Brand ? `${constants.Brand} ${constants.Model ?? ''}` : null)
  );
}

function createPseudoRandomId(prefix: string): string {
  const seed = `${Date.now()}-${Math.random()}-${Math.random()}-${Math.random()}`;
  const compact = seed.replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${compact}`;
}

async function getOrCreateStorageId(storageKey: string, prefix: string): Promise<string> {
  const existing = await AsyncStorage.getItem(storageKey);
  if (isNonEmptyString(existing)) {
    return existing.trim();
  }

  const next = createPseudoRandomId(prefix);
  await AsyncStorage.setItem(storageKey, next);
  return next;
}

export async function getOrCreateInstallationId(): Promise<string> {
  return getOrCreateStorageId(STORAGE_KEYS.installationId, 'inst');
}

export async function getOrCreateDeviceId(): Promise<string> {
  return getOrCreateStorageId(STORAGE_KEYS.deviceId, 'device');
}

export async function readCachedPushRegistration(): Promise<CachedRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.registration);
    if (!isNonEmptyString(raw)) return null;

    const parsed = JSON.parse(raw) as CachedRegistration | null;
    if (!parsed || !isNonEmptyString(parsed.tokenUid) || !isNonEmptyString(parsed.userId)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('[push/register] readCachedPushRegistration failed:', error);
    return null;
  }
}

async function writeCachedPushRegistration(value: CachedRegistration | null): Promise<void> {
  if (!value) {
    await AsyncStorage.removeItem(STORAGE_KEYS.registration);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEYS.registration, JSON.stringify(value));
}

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(DEFAULT_ANDROID_CHANNEL_ID, {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFFFFF',
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    if (
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return (
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    console.warn('[push/register] ensureNotificationPermission failed:', error);
    return false;
  }
}

function extractExpoDeviceTokenData(raw: unknown): string | null {
  if (typeof raw === 'string') {
    return normalizeString(raw);
  }

  if (raw && typeof raw === 'object') {
    return normalizeString((raw as any).data);
  }

  return null;
}

export async function resolveNativePushToken(): Promise<NativePushToken | null> {
  try {
    const raw = await Notifications.getDevicePushTokenAsync();
    const token = extractExpoDeviceTokenData(raw);

    if (!token) {
      return null;
    }

    if (Platform.OS === 'ios') {
      return {
        provider: 'apns',
        platform: 'ios',
        environment: getEnvironment('apns'),
        token,
      };
    }

    return {
      provider: 'fcm',
      platform: 'android',
      environment: getEnvironment('fcm'),
      token,
    };
  } catch (error) {
    console.warn('[push/register] getDevicePushTokenAsync failed:', error);
    return null;
  }
}

function buildCapabilities() {
  return {
    alert: true,
    badge: true,
    sound: true,
    provider_direct: true,
    expo_notifications: true,
  };
}

function buildMetadata(reason: string | undefined) {
  return {
    source: 'app_bootstrap',
    reason: normalizeString(reason) ?? 'unspecified',
    dev: __DEV__,
    appOwnership: normalizeString((Constants as any)?.appOwnership),
    executionEnvironment: normalizeString((Constants as any)?.executionEnvironment),
  };
}

function normalizeRpcRow(
  data: RegisterPushTokenRpcRow[] | RegisterPushTokenRpcRow | null | undefined,
) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[push/register] getSession failed:', error);
      return null;
    }
    return normalizeString(data.session?.user?.id);
  } catch (error) {
    console.warn('[push/register] getCurrentUserId failed:', error);
    return null;
  }
}

export async function ensurePushTokenRegistered(
  options: EnsurePushTokenRegisteredOptions = {},
): Promise<RegisterPushTokenRpcRow | null> {
  const reason = normalizeString(options.reason) ?? 'unspecified';

  const userId = await getCurrentUserId();
  if (!userId) {
    console.log('[push/register] skip register: no authenticated session');
    return null;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) {
    console.log('[push/register] skip register: notifications not granted');
    return null;
  }

  const nativeToken = await resolveNativePushToken();
  if (!nativeToken?.token) {
    console.warn('[push/register] skip register: no native token resolved');
    return null;
  }

  const installationId = await getOrCreateInstallationId();
  const deviceId = await getOrCreateDeviceId();
  const appScope = getAppScope();

  const params = {
    p_provider: nativeToken.provider,
    p_platform: nativeToken.platform,
    p_environment: nativeToken.environment,
    p_token: nativeToken.token,
    p_app_scope: appScope,
    p_device_id: deviceId,
    p_installation_id: installationId,
    p_app_version: getAppVersion(),
    p_os_version: getOsVersion(),
    p_device_model: getDeviceModel(),
    p_locale: getLocale(),
    p_timezone: getTimeZone(),
    p_capabilities: buildCapabilities(),
    p_metadata: buildMetadata(reason),
  };

  const { data, error } = await supabase.rpc('register_push_token', params);
  if (error) {
    console.warn('[push/register] register_push_token failed:', error, { reason });
    return null;
  }

  const row = normalizeRpcRow(data as any);
  if (!row?.token_uid) {
    console.warn('[push/register] register_push_token returned empty row:', data);
    return null;
  }

  await writeCachedPushRegistration({
    tokenUid: row.token_uid,
    userId,
    provider: row.provider,
    platform: row.platform,
    environment: row.environment,
    appScope: row.app_scope,
    updatedAt: nowIso(),
  });

  console.log('[push/register] registered', {
    reason,
    provider: row.provider,
    platform: row.platform,
    environment: row.environment,
    tokenUid: row.token_uid,
  });

  return row;
}

export async function disableCurrentPushToken(
  options: DisablePushTokenOptions = {},
): Promise<boolean> {
  const cached = await readCachedPushRegistration();
  if (!cached?.tokenUid) {
    return false;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn('[push/register] disable skipped: no authenticated session');
    return false;
  }

  if (cached.userId !== userId) {
    console.warn('[push/register] disable skipped: cached token belongs to another user');
    return false;
  }

  const reason = normalizeString(options.reason) ?? 'user_disabled';

  const { data, error } = await supabase.rpc('disable_push_token', {
    p_token_uid: cached.tokenUid,
    p_reason: reason,
  });

  if (error) {
    console.warn('[push/register] disable_push_token failed:', error);
    return false;
  }

  if (data === true) {
    await writeCachedPushRegistration(null);
    console.log('[push/register] disabled token', { tokenUid: cached.tokenUid, reason });
    return true;
  }

  return false;
}

export async function handleSignedOutPushToken(): Promise<void> {
  try {
    await disableCurrentPushToken({ reason: 'signed_out' });
  } catch (error) {
    console.warn('[push/register] handleSignedOutPushToken failed:', error);
  }
}

export async function disableCurrentPushTokenBeforeSignOut(
  reason = 'signed_out',
): Promise<boolean> {
  return disableCurrentPushToken({ reason });
}
