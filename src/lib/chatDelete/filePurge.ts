import * as FileSystem from 'expo-file-system/legacy';

/**
 * Extract local file paths (file://, documentDirectory, cacheDirectory) from message payload.
 * The project uses diverse payload shapes (arrays, meta objects, nested structures).
 * This module is intentionally defensive and idempotent.
 */

function isLocalPath(p: string): boolean {
  const s = (p || '').trim();
  if (!s) return false;

  if (s.startsWith('file://')) return true;

  const doc = FileSystem.documentDirectory || '';
  const cache = FileSystem.cacheDirectory || '';
  if (doc && s.startsWith(doc)) return true;
  if (cache && s.startsWith(cache)) return true;

  return false;
}

function tryAdd(acc: Set<string>, v: any) {
  if (typeof v !== 'string') return;
  const s = v.trim();
  if (!s) return;
  if (isLocalPath(s)) acc.add(s);
}

function collectFromObject(acc: Set<string>, obj: any) {
  if (!obj || typeof obj !== 'object') return;

  const candidateKeys = [
    // common
    'uri', 'url', 'path',
    // your current MessageItem extractor supports these:
    'file_key', 'fileKey',
    'thumbUri', 'thumbnail', 'thumbnailUri',
    // common local fields
    'localUri', 'local_uri',
    'fileUri', 'file_uri',
    'filePath', 'file_path',
    'cachePath', 'cache_path',
    'thumbPath', 'thumb_path',
    'thumbnailPath', 'thumbnail_path',
    'imagePath', 'image_path',
    'videoPath', 'video_path',
  ];

  for (const k of candidateKeys) {
    tryAdd(acc, (obj as any)[k]);
  }

  // arrays frequently used in meta payloads
  const candidateArrays = [
    'images', 'uris', 'media', 'items', 'files', 'attachments',
  ];
  for (const k of candidateArrays) {
    const arr = (obj as any)[k];
    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (typeof it === 'string') tryAdd(acc, it);
        else if (it && typeof it === 'object') {
          tryAdd(acc, it.uri ?? it.url ?? it.path ?? it.file_key ?? it.fileKey);
          tryAdd(acc, it.thumbUri ?? it.thumbnail ?? it.thumbnailUri);
        }
      }
    }
  }

  for (const key of Object.keys(obj)) {
    collectFromObject(acc, (obj as any)[key]);
  }
}

function collectFromString(acc: Set<string>, s: string) {
  const raw = String(s ?? '');

  // JSON object/array case
  const t = raw.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      const obj = JSON.parse(t);
      collectFromObject(acc, obj);
    } catch {
      // ignore
    }
  }

  // raw file:// occurrences
  const matches = raw.match(/file:\/\/[^\s'")\]]+/g);
  if (matches) matches.forEach((m) => tryAdd(acc, m));
}

export type MessagePayloadForPurge = {
  content?: string | null;
  original?: string | null;
  translated_text?: string | null;
  link_preview?: string | null;
};

export function extractLocalFilePathsFromMessagePayload(payload: MessagePayloadForPurge): string[] {
  const acc = new Set<string>();

  if (payload.content) collectFromString(acc, payload.content);
  if (payload.original) collectFromString(acc, payload.original);
  if (payload.translated_text) collectFromString(acc, payload.translated_text);
  if (payload.link_preview) collectFromString(acc, payload.link_preview);

  return Array.from(acc);
}

export async function purgeLocalFiles(paths: string[]): Promise<void> {
  // Idempotent: missing files should not throw
  for (const p of paths) {
    try {
      if (!p) continue;
      await FileSystem.deleteAsync(p, { idempotent: true });
    } catch {
      // non-fatal, Lazy Cleanup may retry
    }
  }
}
