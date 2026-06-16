import { Dimensions, Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ensureOriginalCached, isRemoteHttpUrl } from '@/lib/media/chatMediaCache';

const { width: SCREEN_W } = Dimensions.get('window');
export const MAX_BUBBLE_PX = Math.min(420, Math.floor(SCREEN_W * 0.68));

export function isHttpUrl(s?: string | null) {
  return s ? /^https?:\/\//i.test(String(s).trim()) : false;
}

export function isLocalUri(s?: string | null) {
  if (!s) return false;
  const t = String(s).trim();
  return /^file:\/\//i.test(t) || /^content:\/\//i.test(t);
}

export function isMediaUri(s?: string | null) {
  return isHttpUrl(s) || isLocalUri(s);
}

export function isUrlLike(v?: string | null) {
  if (!v) return false;
  const s = String(v).trim();
  return s.startsWith('http') || s.startsWith('file') || s.startsWith('content');
}

export function formatAttachmentSize(value: any): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export function pickFileNameFromUrl(url?: string | null, fallbackLabel = 'File'): string {
  const raw = String(url ?? '').trim();
  if (!raw) return fallbackLabel;
  try {
    const parsed = new URL(raw);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last || fallbackLabel);
  } catch {
    return raw.split('/').pop()?.split('?')[0] || fallbackLabel;
  }
}

async function openLocalFileWithApp(localUri: string, mime?: string | null): Promise<boolean> {
  const uri = String(localUri ?? '').trim();
  if (!uri) return false;

  if (Platform.OS === 'android' && /^file:\/\//i.test(uri)) {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      const IntentLauncher = require('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: mime || '*/*',
        flags: 1,
      });
      return true;
    } catch {}
  }

  try {
    const canOpen = await Linking.canOpenURL(uri);
    if (canOpen) {
      await Linking.openURL(uri);
      return true;
    }
  } catch {}

  return false;
}

export async function openAttachmentFile(url: string, opts: { mime?: string | null; roomId?: number | null } = {}) {
  const target = String(url ?? '').trim();
  if (!target) return;

  try {
    const localUri = isRemoteHttpUrl(target)
      ? await ensureOriginalCached(target, { mime: opts.mime, roomId: opts.roomId })
      : target;

    if (localUri && await openLocalFileWithApp(localUri, opts.mime)) return;

    const available = await Sharing.isAvailableAsync();
    if (available && localUri) {
      await Sharing.shareAsync(localUri, { mimeType: opts.mime ?? undefined });
      return;
    }

    if (isRemoteHttpUrl(target)) await Linking.openURL(target);
  } catch {
    try {
      if (isRemoteHttpUrl(target)) await Linking.openURL(target);
    } catch {}
  }
}

export async function openUrl(url: string) {
  const u = String(url ?? '').trim();
  if (!u) return;
  try {
    const can = await Linking.canOpenURL(u);
    if (can) await Linking.openURL(u);
  } catch {}
}

export function buildSecureLinkPreview(url?: string | null, title?: string | null, linkLabel = 'Link') {
  const u = String(url ?? '').trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const host = parsed.host || linkLabel;
    return {
      __secureFixedLinkCard: true,
      url: u,
      title: String(title ?? '').trim() || host,
      site_name: host,
      description: '',
      image: null,
    };
  } catch {
    return {
      __secureFixedLinkCard: true,
      url: u,
      title: String(title ?? '').trim() || linkLabel,
      site_name: linkLabel,
      description: '',
      image: null,
    };
  }
}

export type SecureRenderablePayload = Record<string, any> & {
  kind?: string;
  text?: string | null;
  map?: any;
  attachments?: any[] | null;
  links?: any[] | null;
};

export function safeSecureNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Number(n) : null;
}

function isNonEmptyString(v: any): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function hasSecureAttachmentUrl(payload: any): boolean {
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  return attachments.some((a: any) => isUrlLike(a?.url) || isUrlLike(a?.uri));
}

export function isSecurePayloadRenderable(payload: unknown): payload is SecureRenderablePayload {
  if (!payload || typeof payload !== 'object') return false;

  const p = payload as SecureRenderablePayload;
  const kind = String(p.kind ?? 'text').toLowerCase();

  if (kind === 'map') {
    const map = p.map ?? p;
    return Number.isFinite(Number(map?.lat)) && Number.isFinite(Number(map?.lng));
  }

  if (kind === 'image') return hasSecureAttachmentUrl(p);
  if (kind === 'audio' || kind === 'video') return hasSecureAttachmentUrl(p);

  if (kind === 'file') {
    const first = Array.isArray(p.attachments) ? p.attachments[0] : null;
    return hasSecureAttachmentUrl(p) || isNonEmptyString(first?.fileName) || isNonEmptyString(first?.file_name);
  }

  const links = Array.isArray(p.links) ? p.links : [];
  const hasLink = links.some((l: any) => isUrlLike(l?.url));
  return isNonEmptyString(p.text) || hasLink;
}
