import i18next from 'i18next';
import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';

export type MessageLinkPreview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
};

export type ResolvedLinkPreview = {
  rawPreview: MessageLinkPreview | null;
  msgUrlFromText: string | null;
  effectivePreview: MessageLinkPreview | null;
  textWithoutUrl: string;
  textIsOnlyUrl: boolean;
  clickableUrlOnly: boolean;
  shouldShowSkeleton: boolean;
  showLPCard: boolean;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

export function normalizeUrlForCompare(u?: string | null) {
  return String(u ?? '').trim().replace(/[)\],.?!]+$/g, '');
}

function isHttpUrl(s?: string | null) {
  return s ? /^https?:\/\//i.test(String(s).trim()) : false;
}

function chatText(key: string, options?: Record<string, unknown>) {
  return String(i18next.t(`chat:${key}`, options ?? {}));
}

function pickFirstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const clean = value.trim();
      if (clean) return clean;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) return item.trim();
        if (item && typeof item === 'object') {
          const nested = pickFirstString(item.url, item.secure_url, item.src, item.content);
          if (nested) return nested;
        }
      }
    }
    if (value && typeof value === 'object') {
      const nested = pickFirstString(value.url, value.secure_url, value.src, value.content);
      if (nested) return nested;
    }
  }
  return null;
}

export function hostFromUrl(u?: string | null) {
  try {
    return new URL(u || '').host || '';
  } catch {
    return '';
  }
}

export function extractFirstUrlFromText(s?: string | null) {
  const m = String(s ?? '').match(URL_REGEX);
  return m ? normalizeUrlForCompare(m[0]) : null;
}

export function stripUrlsFromText(s?: string | null) {
  const raw = String(s ?? '');
  if (!raw) return '';
  return raw
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\t ]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safePickLinkPreview(msg: any): MessageLinkPreview | null {
  const raw = msg?.link_preview ?? msg?.linkPreview ?? msg?.linkPreviewObj ?? null;
  if (!raw) return null;

  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!obj || typeof obj !== 'object') return null;

  const url = normalizeUrlForCompare(String(obj.url ?? obj.URL ?? '').trim());
  if (!isHttpUrl(url)) return null;

  return {
    url,
    title: obj.title ?? obj.ogTitle ?? null,
    description: obj.description ?? obj.ogDescription ?? null,
    image: pickFirstString(
      obj.image,
      obj.image_url,
      obj.imageUrl,
      obj.thumbnail,
      obj.thumbnail_url,
      obj.thumbnailUrl,
      obj.thumb_url,
      obj.thumbUrl,
      obj.ogImage,
      obj.og_image,
      obj.twitterImage,
      obj.twitter_image,
      obj?.openGraph?.image,
      obj?.open_graph?.image,
    ),
    site_name: obj.site_name ?? obj.siteName ?? obj.ogSiteName ?? null,
  };
}

export function resolveLinkPreview(msg: UIRenderMessage | any, displayText: string): ResolvedLinkPreview {
  const rawPreview = safePickLinkPreview(msg);
  const msgUrlFromText = extractFirstUrlFromText(displayText);
  const linkPreviewStatus = String(msg?.link_preview_status ?? msg?.linkPreviewStatus ?? '').trim();

  const effectivePreview: MessageLinkPreview | null = (() => {
    if (rawPreview?.url) return rawPreview;

    const url =
      normalizeUrlForCompare(String(msg?.link_preview_url ?? msg?.linkPreviewUrl ?? '').trim()) ||
      msgUrlFromText;

    if (!url || !isHttpUrl(url)) return null;

    const host = hostFromUrl(url);

    return {
      url,
      title: host || chatText('linkPreview.link'),
      description: null,
      image: null,
      site_name: host || null,
    };
  })();

  const hasPreview = !!effectivePreview?.url;
  const kind = String(msg?.kind ?? msg?.type ?? 'text');
  const showLPCard = hasPreview && (kind === 'text' || kind === 'notice');

  const textWithoutUrl = showLPCard ? stripUrlsFromText(displayText) : String(displayText ?? '').trim();
  const textIsOnlyUrl = showLPCard && !!String(displayText ?? '').trim() && !textWithoutUrl;
  const clickableUrlOnly = !showLPCard && isHttpUrl(displayText);

  const shouldShowSkeleton =
    !!msgUrlFromText &&
    !rawPreview?.url &&
    (linkPreviewStatus === 'pending' || linkPreviewStatus === '') &&
    (kind === 'text' || kind === 'notice');

  return {
    rawPreview,
    msgUrlFromText,
    effectivePreview,
    textWithoutUrl,
    textIsOnlyUrl,
    clickableUrlOnly,
    shouldShowSkeleton,
    showLPCard,
  };
}
