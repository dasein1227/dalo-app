import type { UIRenderMessage } from '../normalizeMessage';

export type MessageMediaKind = 'image' | 'video' | 'audio' | 'file';

export type MessageMediaItem = {
  uri: string;
  width?: number;
  height?: number;
  type: MessageMediaKind;
};

export type MessageMedia = {
  items: MessageMediaItem[];
  primaryAspect: number;
  isBundle: boolean;
};

function safeJsonParse(v: any): any | null {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;

  const s = v.trim();
  if (!s) return null;

  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isHttpUrl(s?: string | null) {
  return s ? /^https?:\/\//i.test(String(s).trim()) : false;
}

function isLocalUri(s?: string | null) {
  if (!s) return false;
  const t = String(s).trim();
  return /^file:\/\//i.test(t) || /^content:\/\//i.test(t);
}

function isUrlLike(v?: string | null) {
  return isHttpUrl(v) || isLocalUri(v);
}

function inferTypeFromUrl(url: string): MessageMediaKind {
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(lower)) return 'image';
  if (/\.(mp4|mov|avi|mkv|webm)$/i.test(lower)) return 'video';
  if (/\.(mp3|m4a|wav|ogg|aac)$/i.test(lower)) return 'audio';
  return 'file';
}

function clampAspect(a: number): number {
  if (!Number.isFinite(a) || a <= 0) return 1;
  return Math.max(0.5, Math.min(2.0, a));
}

function toPositiveNumber(v: any): number | undefined {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function pickMetaCandidates(msg: any): any[] {
  return [
    msg?.meta,
    msg?.metadata,
    msg?.meta_json,
    msg?.metaJson,
    msg?.extras,
    msg?.extra,
    msg?.payload,
    msg?.data,
    msg?.json,
    msg?.original_meta,
    msg?.originalMeta,
    msg?.original,
    msg?.content,
  ];
}

function pickMetaObject(msg: any): any | null {
  for (const c of pickMetaCandidates(msg)) {
    const o = safeJsonParse(c);
    if (o && typeof o === 'object') return o;
  }
  return null;
}

export function resolveMessageMedia(msg: UIRenderMessage | any, metaArg?: any): MessageMedia {
  const out: MessageMediaItem[] = [];
  const seen = new Set<string>();

  const pushUri = (uri: any, typeHint?: MessageMediaKind | null, w?: any, h?: any) => {
    const s = uri ? String(uri).trim() : '';
    if (!s || !isUrlLike(s)) return;
    if (seen.has(s)) return;
    seen.add(s);

    out.push({
      uri: s,
      type: typeHint ?? inferTypeFromUrl(s),
      width: toPositiveNumber(w),
      height: toPositiveNumber(h),
    });
  };

  const msgAny = msg as any;
  const meta = metaArg ?? pickMetaObject(msgAny);

  const declaredKind = String(msgAny?.kind ?? msgAny?.type ?? 'text').toLowerCase();
  const normalizedType: MessageMediaKind | null =
    declaredKind === 'image' || declaredKind === 'video' || declaredKind === 'audio' || declaredKind === 'file'
      ? declaredKind
      : null;

  const normalizedUrl = msgAny?.fileUrl ?? msgAny?.media_url ?? msgAny?.mediaUrl ?? null;
  const normalizedW = msgAny?.mediaWidth ?? msgAny?.media_width ?? null;
  const normalizedH = msgAny?.mediaHeight ?? msgAny?.media_height ?? null;
  if (normalizedUrl) pushUri(normalizedUrl, normalizedType, normalizedW, normalizedH);

  const content = msgAny?.content;
  if (typeof content === 'string') {
    const s = content.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      const arr = safeJsonParse(s);
      if (Array.isArray(arr)) {
        for (const it of arr) {
          if (typeof it === 'string') pushUri(it, normalizedType ?? 'image');
          else if (it && typeof it === 'object') {
            pushUri(it.uri ?? it.url ?? it.path ?? it.fileUrl ?? it.file_key ?? it.fileKey, normalizedType ?? 'image', it.width, it.height);
          }
        }
      }
    }
  }

  const arrays = [meta?.images, meta?.uris, meta?.media, meta?.items, meta?.files].filter(Array.isArray);
  for (const arr of arrays) {
    for (const it of arr) {
      if (typeof it === 'string') pushUri(it, normalizedType ?? 'image');
      else if (it && typeof it === 'object') {
        pushUri(it.uri ?? it.url ?? it.path ?? it.fileUrl ?? it.file_key ?? it.fileKey, it.type ?? normalizedType ?? null, it.width, it.height);
      }
    }
  }

  pushUri(msgAny?.content, normalizedType, msgAny?.mediaWidth, msgAny?.mediaHeight);
  pushUri(msgAny?.original, normalizedType, msgAny?.mediaWidth, msgAny?.mediaHeight);
  pushUri(meta?.uri ?? meta?.url ?? meta?.path ?? meta?.fileUrl ?? meta?.file_key ?? meta?.fileKey, normalizedType, meta?.width, meta?.height);

  const first = out[0];
  const firstAspect = first?.width && first?.height ? first.width / first.height : msgAny?.mediaAspect ?? msgAny?.media_aspect ?? 1;

  return {
    items: out,
    primaryAspect: clampAspect(Number(firstAspect) || 1),
    isBundle: out.length > 1,
  };
}
