import { supabase } from '@/lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';

const CHAT_R2_DOMAIN = 'https://pub-6ab255ed95204d98aedd5093727677d5.r2.dev';
const FN_BASE = process.env.EXPO_PUBLIC_FN_BASE!;

type UploadVariantInput = {
  roomId: number;
  localUri: string;
  mimeType: string;
  ext: string;
  variant: 'medium' | 'thumb' | 'audio' | 'file';
  uploadId?: string | null;
  hash?: string | null;
};

type UploadVariantResult = {
  publicUrl: string;
  meta: any;
  msgId?: string | null;
  size: number;
  mimeType: string;
};

export type UploadChatImageResult = {
  url: string;
  thumbUrl?: string | null;
  thumb_url?: string | null;
  meta: any;
  msgId?: string | null;
};

function warnR2Domain(publicUrl?: string | null) {
  const url = String(publicUrl ?? '').trim();
  if (!url) return;
  if (!url.startsWith(CHAT_R2_DOMAIN)) {
    console.warn(`⚠️ R2 Domain Mismatch! Expected ${CHAT_R2_DOMAIN}, got ${url}`);
  }
}

function positiveNumber(v: any): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inferProvider(publicUrl?: string | null): string | null {
  const u = String(publicUrl ?? '').toLowerCase();
  if (!u) return null;
  if (u.includes('.r2.dev') || u.includes('cloudflare')) return 'cloudflare';
  if (u.includes('amazonaws.com') || u.includes('s3.')) return 'aws';
  return null;
}

function createUploadId(): string {
  try {
    const anyCrypto = Crypto as any;
    if (typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function stableClientHash(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'nohash';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

async function uploadVariant(input: UploadVariantInput): Promise<UploadVariantResult> {
  const response = await fetch(input.localUri);
  const blob = await response.blob();
  const size = blob.size;
  const mimeType = blob.type || input.mimeType;

  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token ?? '';

  const presignRes = await fetch(`${FN_BASE}/upload-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      roomId: input.roomId,
      mime: mimeType,
      size,
      variant: input.variant,
      ext: input.ext,
      uploadId: input.uploadId || undefined,
      hash: input.hash || stableClientHash(input.localUri),
    }),
  });

  if (!presignRes.ok) {
    throw new Error(`presign failed(${input.variant}): ${await presignRes.text()}`);
  }

  const { uploadUrl, publicUrl, meta, msgId } = await presignRes.json();
  warnR2Domain(publicUrl);

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });

  if (!putRes.ok) {
    throw new Error(`R2 upload failed(${input.variant}): ${await putRes.text()}`);
  }

  return { publicUrl, meta, msgId, size, mimeType };
}

export async function uploadChatImage(roomId: number, localUri: string, isAudio: boolean = false): Promise<UploadChatImageResult> {
  if (isAudio) {
    const uploaded = await uploadVariant({
      roomId,
      localUri,
      mimeType: 'audio/m4a',
      ext: 'm4a',
      variant: 'audio',
      uploadId: createUploadId(),
      hash: stableClientHash(localUri),
    });

    const meta = {
      ...(uploaded.meta ?? {}),
      mime: uploaded.mimeType,
      file_size: uploaded.size,
      fileSize: uploaded.size,
      provider: uploaded.meta?.provider ?? inferProvider(uploaded.publicUrl),
    };

    return { url: uploaded.publicUrl, meta, msgId: uploaded.msgId ?? null };
  }

  const uploadId = createUploadId();

  const medium = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 1440 } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
  );

  const main = await uploadVariant({
    roomId,
    localUri: medium.uri,
    mimeType: 'image/jpeg',
    ext: 'jpg',
    variant: 'medium',
    uploadId,
    hash: stableClientHash(localUri),
  });

  let thumbUrl: string | null = null;
  let thumbSize: number | null = null;

  try {
    const thumb = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 512 } }],
      { compress: 0.68, format: ImageManipulator.SaveFormat.JPEG },
    );

    const uploadedThumb = await uploadVariant({
      roomId,
      localUri: thumb.uri,
      mimeType: 'image/jpeg',
      ext: 'jpg',
      variant: 'thumb',
      uploadId,
      hash: stableClientHash(localUri),
    });

    thumbUrl = uploadedThumb.publicUrl;
    thumbSize = uploadedThumb.size;
  } catch (e) {
    // 썸네일 업로드 실패가 메시지 전송 실패로 이어지면 UX가 더 나빠진다.
    // 이 경우 원본/중간본 URL을 thumb_url로도 기록하고, 클라이언트 로컬 썸네일 캐시가 작은 파일을 생성한다.
    thumbUrl = main.publicUrl;
    thumbSize = null;
  }

  const width = positiveNumber((medium as any)?.width);
  const height = positiveNumber((medium as any)?.height);
  const aspect = width && height ? width / height : null;
  const provider = main.meta?.provider ?? inferProvider(main.publicUrl);

  const meta = {
    ...(main.meta ?? {}),
    width,
    height,
    aspect,
    mime: main.mimeType || 'image/jpeg',
    file_size: main.size,
    fileSize: main.size,
    provider,
    thumb_url: thumbUrl,
    thumbUrl,
    thumbnail_url: thumbUrl,
    thumbnailUrl: thumbUrl,
    thumb_file_size: thumbSize,
    thumbFileSize: thumbSize,
  };

  return {
    url: main.publicUrl,
    thumbUrl,
    thumb_url: thumbUrl,
    meta,
    msgId: main.msgId ?? null,
  };
}


export type UploadChatFileInput = {
  roomId: number;
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type UploadChatFileResult = {
  url: string;
  meta: any;
  msgId?: string | null;
};

function cleanFileName(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'file';
  const last = raw.split('/').pop()?.split('\\').pop() ?? raw;
  return last.replace(/[\u0000-\u001f]/g, '').slice(0, 180) || 'file';
}

function extFromFileName(fileName?: string | null, mimeType?: string | null): string {
  const name = cleanFileName(fileName).toLowerCase();
  const match = name.match(/\.([a-z0-9]{1,12})$/i);
  if (match?.[1]) return match[1].replace(/[^a-z0-9]/g, '') || 'bin';
  const mime = String(mimeType ?? '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip')) return 'zip';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
  if (mime.includes('spreadsheetml') || mime.includes('excel')) return 'xlsx';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'pptx';
  if (mime.includes('plain')) return 'txt';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('x-m4v')) return 'm4v';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('x-matroska')) return 'mkv';
  if (mime.includes('3gpp') || mime.includes('3gp')) return '3gp';
  if (mime.startsWith('video/')) return 'mp4';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('m4a')) return 'm4a';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('wav')) return 'wav';
  if (mime.startsWith('audio/')) return 'm4a';
  return 'bin';
}

export async function uploadChatFile(input: UploadChatFileInput): Promise<UploadChatFileResult> {
  const fileName = cleanFileName(input.fileName);
  const mimeType = String(input.mimeType ?? '').trim() || 'application/octet-stream';
  const ext = extFromFileName(fileName, mimeType);

  const uploaded = await uploadVariant({
    roomId: input.roomId,
    localUri: input.localUri,
    mimeType,
    ext,
    variant: 'file',
    uploadId: createUploadId(),
    hash: stableClientHash(`${fileName}:${input.localUri}`),
  });

  const meta = {
    ...(uploaded.meta ?? {}),
    file_name: fileName,
    fileName,
    name: fileName,
    mime: uploaded.mimeType || mimeType,
    contentType: uploaded.mimeType || mimeType,
    file_size: uploaded.size,
    fileSize: uploaded.size,
    size: uploaded.size,
    provider: uploaded.meta?.provider ?? inferProvider(uploaded.publicUrl),
  };

  return { url: uploaded.publicUrl, meta, msgId: uploaded.msgId ?? null };
}
