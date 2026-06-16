export type MessageMediaKind = 'image' | 'video' | 'audio' | 'file';

export type MessageMediaItem = {
  uri: string;
  originalUri?: string;
  thumbUri?: string;
  width?: number;
  height?: number;
  fileName?: string;
  mime?: string;
  fileSize?: number;
  type: MessageMediaKind;
};

export type MessageMedia = {
  items: MessageMediaItem[];
  primaryAspect: number;
  isBundle: boolean;
};

function isHttpUrl(s?: string | null) { return s ? /^https?:\/\//i.test(String(s).trim()) : false; }
function isLocalUri(s?: string | null) { const t = String(s ?? '').trim(); return /^file:\/\//i.test(t) || /^content:\/\//i.test(t); }
function isUrlLike(v?: string | null) { return isHttpUrl(v) || isLocalUri(v); }
function inferTypeFromUrl(url: string): MessageMediaKind {
  const lower = String(url).toLowerCase().split('?')[0].split('#')[0];
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(lower)) return 'image';
  if (/\.(mp4|mov|m4v|avi|mkv|webm|3gp|3gpp)$/i.test(lower)) return 'video';
  if (/\.(mp3|m4a|wav|ogg|aac)$/i.test(lower)) return 'audio';
  return 'file';
}
function clampAspect(a: number): number { if (!Number.isFinite(a) || a <= 0) return 1; return Math.max(0.5, Math.min(2.0, a)); }
function toPositiveNumber(v: any): number | undefined { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined; }
function normalizeAttachmentType(v: any, url: string): MessageMediaKind {
  const t = String(v ?? '').trim().toLowerCase();
  if (t === 'image' || t === 'photo' || t === 'images') return 'image';
  if (t === 'video' || t === 'movie') return 'video';
  if (t === 'audio' || t === 'voice') return 'audio';
  if (t === 'file' || t === 'document') return 'file';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return inferTypeFromUrl(url);
}

function safeJsonParse(v: any) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  let cur: any = v;
  for (let i = 0; i < 2; i += 1) {
    if (typeof cur !== 'string') break;
    const s = cur.trim();
    if (!s) return null;
    try { cur = JSON.parse(s); } catch { return null; }
  }
  return cur && typeof cur === 'object' ? cur : null;
}

function pickOriginalImages(msg: any): any[] {
  const candidates = [
    msg?.original,
    msg?._raw?.original,
    msg?.meta,
    msg?.metadata,
    msg?._raw?.meta,
    msg?._raw?.metadata,
  ];

  for (const c of candidates) {
    const parsed = safeJsonParse(c);
    if (!parsed) continue;

    const attachments = parsed?.attachments;
    if (Array.isArray(attachments) && attachments.length) return attachments;

    const images = parsed?.images;
    if (Array.isArray(images) && images.length) return images;

    const direct = parsed?.media_url ?? parsed?.mediaUrl ?? parsed?.file_url ?? parsed?.fileUrl ?? parsed?.url ?? parsed?.uri;
    if (direct) return [parsed];
  }

  return [];
}

export function resolveMessageMedia(msg: any, kindOverride?: any): MessageMedia {
  const out: MessageMediaItem[] = [];
  const declaredKind = String(kindOverride ?? msg?.kind ?? msg?.type ?? msg?._raw?.kind ?? msg?._raw?.type ?? 'text').toLowerCase();
  const seen = new Set<string>();

  const pushItem = (args: { uri?: any; originalUri?: any; thumbUri?: any; typeHint?: any; width?: any; height?: any; fileName?: any; mime?: any; fileSize?: any }) => {
    const original = args.originalUri ? String(args.originalUri).trim() : args.uri ? String(args.uri).trim() : '';
    const thumb = args.thumbUri ? String(args.thumbUri).trim() : '';
    const display = thumb && isUrlLike(thumb) ? thumb : original;
    if (!display || !isUrlLike(display) || seen.has(original || display)) return;
    seen.add(original || display);
    out.push({
      uri: display,
      originalUri: original || display,
      thumbUri: thumb && isUrlLike(thumb) ? thumb : undefined,
      type: normalizeAttachmentType(args.typeHint, original || display),
      width: toPositiveNumber(args.width),
      height: toPositiveNumber(args.height),
      fileName: typeof args.fileName === 'string' && args.fileName.trim() ? args.fileName.trim() : undefined,
      mime: typeof args.mime === 'string' && args.mime.trim() ? args.mime.trim() : undefined,
      fileSize: toPositiveNumber(args.fileSize),
    });
  };

  const attachments = Array.isArray(msg?.attachments) ? msg.attachments : [];
  for (const att of attachments) {
    pushItem({
      originalUri: att?.url ?? att?.uri ?? att?.fileUrl ?? att?.file_url,
      thumbUri: att?.thumb_url ?? att?.thumbUrl ?? att?.thumbnail_url ?? att?.thumbnailUrl,
      typeHint: att?.type ?? att?.mediaType ?? att?.media_type ?? att?.kind ?? att?.message_kind ?? att?.mime ?? att?.contentType ?? declaredKind,
      width: att?.width,
      height: att?.height,
      fileName: att?.fileName ?? att?.file_name ?? att?.filename ?? att?.name,
      mime: att?.mime ?? att?.contentType,
      fileSize: att?.fileSize ?? att?.file_size ?? att?.size,
    });
  }

  if (!out.length) {
    const images = pickOriginalImages(msg);
    for (const img of images) {
      const originalUri = typeof img === 'string' ? img : img?.uri ?? img?.url ?? img?.fileUrl ?? img?.file_url;
      const thumbUri = typeof img === 'object' ? img?.thumb_url ?? img?.thumbUrl ?? img?.thumbnail_url ?? img?.thumbnailUrl : null;
      const typeHint = typeof img === 'object'
        ? img?.type ?? img?.mediaType ?? img?.media_type ?? img?.kind ?? img?.message_kind ?? img?.mime ?? img?.contentType ?? declaredKind
        : declaredKind;
      pushItem({ originalUri, thumbUri, typeHint, width: img?.width, height: img?.height, fileName: img?.fileName ?? img?.file_name ?? img?.filename ?? img?.name, mime: img?.mime ?? img?.contentType, fileSize: img?.fileSize ?? img?.file_size ?? img?.size });
    }
  }

  if (!out.length) {
    const fallbackUrl = msg?.fileUrl ?? msg?.media_url ?? msg?.mediaUrl ?? null;
    if (fallbackUrl) {
      pushItem({
        originalUri: fallbackUrl,
        thumbUri: msg?.thumb_url ?? msg?.thumbUrl ?? msg?._raw?.thumb_url ?? null,
        typeHint: declaredKind,
        width: msg?.mediaWidth ?? msg?.media_width ?? null,
        height: msg?.mediaHeight ?? msg?.media_height ?? null,
        fileName: msg?.fileName ?? msg?.file_name ?? msg?.filename ?? msg?.name ?? msg?._raw?.file_name ?? null,
        mime: msg?.mime ?? msg?.media_mime ?? msg?._raw?.media_mime ?? null,
        fileSize: msg?.fileSize ?? msg?.file_size ?? msg?.size ?? null,
      });
    }
  }

  const first = out[0];
  const firstAspect = first?.width && first?.height ? first.width / first.height : Number(msg?.mediaAspect ?? msg?.media_aspect ?? 1) || 1;
  return { items: out, primaryAspect: clampAspect(firstAspect), isBundle: out.length > 1 };
}

export default resolveMessageMedia;
