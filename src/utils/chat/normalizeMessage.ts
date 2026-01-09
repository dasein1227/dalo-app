export type UIRenderMessage = {
  id: string;
  roomId: number;
  senderId: string;

  content: string | null;
  original: string | null;
  kind: string;

  createdAt: number;
  isMine: boolean;

  link_preview?: string | null;
  link_preview_url?: string | null;
  link_preview_status?: string | null;

  fileType?: string | null;
  fileUrl?: string | null;
};

function coerceToMs(v: any): number {
  if (v == null) return 1;

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 1;
    return v < 1_000_000_000_000 ? Math.floor(v * 1000) : Math.floor(v);
  }

  const s = String(v).trim();
  if (!s) return 1;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 1;
    return n < 1_000_000_000_000 ? Math.floor(n * 1000) : Math.floor(n);
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t);

  return 1;
}

function toStrOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length ? s : null;
}

function isHttpUrl(s?: string | null) {
  if (!s) return false;
  return /^https?:\/\//i.test(s.trim());
}
function isLocalUri(s?: string | null) {
  if (!s) return false;
  const t = s.trim();
  return /^file:\/\//i.test(t) || /^content:\/\//i.test(t);
}

export function normalizeMessage(m: any, myId: string): UIRenderMessage {
  const id = String(m?.id ?? '');

  const roomId = Number(m?.room_id ?? m?.roomId ?? 0);
  const senderId = String(m?.sender_id ?? m?.senderId ?? '');

  const rawContent = toStrOrNull(m?.content ?? null);
  const rawOriginal = toStrOrNull(m?.original ?? null);

  let kind: string = String(m?.kind ?? m?.type ?? 'text');
  let content: string | null = rawContent;

  let url: string | null = null;
  let fileType: string | null = null;

  if (typeof content === 'string') {
    const t = content.trim();

    if (t.startsWith('[image]')) {
      kind = 'image';
      content = t.replace('[image]', '').trim();
    } else if (t.startsWith('[audio]')) {
      kind = 'audio';
      content = t.replace('[audio]', '').trim();
    } else if (t.startsWith('[video]')) {
      kind = 'video';
      content = t.replace('[video]', '').trim();
    } else if (t.startsWith('[file]')) {
      kind = 'file';
      content = t.replace('[file]', '').trim();
    } else if (t.startsWith('[map]')) {
      kind = 'map';
      content = t.replace('[map]', '').trim();
    }
  }

  if (typeof content === 'string') {
    const raw = content.trim();

    const isPureUrl =
      (isHttpUrl(raw) || isLocalUri(raw)) &&
      !raw.includes(' ') &&
      raw.length < 2048;

    if (isPureUrl) {
      url = raw;

      const lower = raw.toLowerCase().split('?')[0].split('#')[0];

      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) {
        kind = 'image';
        fileType = 'image';
      } else if (/\.(mp4|mov|avi|mkv|webm)$/i.test(lower)) {
        kind = 'video';
        fileType = 'video';
      } else if (/\.(mp3|m4a|wav|ogg)$/i.test(lower)) {
        kind = 'audio';
        fileType = 'audio';
      } else if (/\.(pdf|zip|doc|docx|ppt|pptx|xls|xlsx)$/i.test(lower)) {
        kind = 'file';
        fileType = 'file';
      }
    }
  }

  const createdAt = coerceToMs(
    m?.created_at ??
      m?.createdAt ??
      m?.created_at_ms ??
      m?.created_at_epoch ??
      null,
  );

  return {
    id,
    roomId,
    senderId,

    content,
    original: rawOriginal,

    kind,
    createdAt,

    isMine: senderId === String(myId),

    link_preview: toStrOrNull(m?.link_preview ?? m?.linkPreview ?? null),
    link_preview_url: toStrOrNull(m?.link_preview_url ?? m?.linkPreviewUrl ?? null),
    link_preview_status: toStrOrNull(m?.link_preview_status ?? m?.linkPreviewStatus ?? null),

    fileType,
    fileUrl: url,
  };
}
