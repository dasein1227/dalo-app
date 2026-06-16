import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

export type ChatMediaCacheKind = "thumb" | "original";
export type ChatMediaAssetType = "image" | "video" | "audio" | "file" | "link" | "other";


type CacheEntry = {
  key: string;
  kind: ChatMediaCacheKind;
  remoteUrl: string;
  localUri: string;
  bytes: number;
  createdAt: number;
  lastAccessedAt: number;
  /** Optional room id captured from the upload path or ensure options. */
  roomId?: number | null;
  /** Best-effort attachment type inferred from MIME/URL at the time it was cached. */
  assetType?: ChatMediaAssetType;
};

type CacheIndex = {
  version: 1;
  entries: Record<string, CacheEntry>;
};

export type EnsureOptions = {
  cacheKey?: string | null;
  mime?: string | null;
  roomId?: number | string | null;
  assetType?: ChatMediaAssetType | "media" | null;
};

export type RegisterOriginalLocalFileInput = {
  sourceUri: string;
  remoteUrl?: string | null;
  cacheKey?: string | null;
  mime?: string | null;
  roomId?: number | string | null;
  assetType?: ChatMediaAssetType | "media" | null;
  bytes?: number | string | null;
};

export type ChatMediaCacheScope = {
  roomId?: number | string | null;
  assetType?: ChatMediaAssetType | "media" | null;
};

export type ChatMediaCacheStats = {
  thumbBytes: number;
  originalBytes: number;
  totalBytes: number;
  thumbCount: number;
  originalCount: number;
  imageBytes: number;
  videoBytes: number;
  audioBytes: number;
  fileBytes: number;
  linkBytes: number;
  otherBytes: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  fileCount: number;
  linkCount: number;
  otherCount: number;
};

export const CHAT_THUMBNAIL_RETENTION_LABEL = "최대 90일 또는 용량 초과 시 자동 정리";
export const CHAT_OPENED_ATTACHMENT_RETENTION_LABEL = "직접 삭제 전까지 현재 기기에 보관";

const CACHE_ROOT_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}coonn/chat-media/`;
const DURABLE_ROOT_DIR = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}coonn/chat-media/`;

/**
 * 썸네일은 OS가 정리해도 되는 성능 캐시(cacheDirectory)에 둔다.
 * 사용자가 실제로 열어본 원본/파일/음성은 서버 원본 만료에 대비해
 * 앱 관리 보존 저장소(documentDirectory)에 둔다.
 */
const THUMB_DIR = `${CACHE_ROOT_DIR}thumb/`;
const ORIGINAL_DIR = `${DURABLE_ROOT_DIR}original/`;
const TEMP_DIR = `${CACHE_ROOT_DIR}tmp/`;
const INDEX_PATH = `${DURABLE_ROOT_DIR}index.json`;

const THUMB_MAX_BYTES = 320 * 1024 * 1024;
const ORIGINAL_MAX_BYTES = Number.POSITIVE_INFINITY;
const THUMB_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const ORIGINAL_MAX_AGE_MS = Number.POSITIVE_INFINITY;
const THUMB_WIDTH = 512;

let indexPromise: Promise<CacheIndex> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function isRemoteHttpUrl(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

export function isLocalMediaUri(value?: string | null): boolean {
  return /^(file|content):\/\//i.test(String(value ?? "").trim());
}

function nowMs() {
  return Date.now();
}

function normalizeRoomId(value?: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function roomIdFromRemoteUrl(remoteUrl?: string | null): number | null {
  const raw = safeUrl(remoteUrl);
  if (!raw || !isRemoteHttpUrl(raw)) return null;

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);

    // Supported R2 paths:
    //   /{roomId}/{uploadId}/...
    //   /rooms/{roomId}/{uploadId}/...
    const firstNumeric = parts.map((part) => Number(part)).find((n) => Number.isFinite(n) && n > 0);
    if (firstNumeric) return Math.trunc(firstNumeric);
  } catch {}

  const matches = raw.match(/\/(?:rooms\/)?([0-9]+)\//i);
  const n = Number(matches?.[1] ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function entryRoomId(entry: CacheEntry): number | null {
  return normalizeRoomId(entry.roomId) ?? roomIdFromRemoteUrl(entry.remoteUrl);
}

function normalizeAssetType(value?: ChatMediaAssetType | "media" | null): ChatMediaAssetType | "media" | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "image" || raw === "video" || raw === "audio" || raw === "file" || raw === "link" || raw === "other" || raw === "media") {
    return raw as ChatMediaAssetType | "media";
  }
  return null;
}

function assetTypeFromMimeAndUrl(mime?: string | null, url?: string | null): ChatMediaAssetType {
  const m = String(mime ?? "").trim().toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("text/html")) return "link";
  if (m && !m.startsWith("application/octet-stream")) return "file";

  const ext = extFromUrl(String(url ?? ""), "");
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "video";
  if (["m4a", "aac", "mp3", "wav", "ogg", "opus", "flac"].includes(ext)) return "audio";
  if (ext) return "file";
  return "other";
}

function entryAssetType(entry: CacheEntry): ChatMediaAssetType {
  return entry.assetType ?? assetTypeFromMimeAndUrl(null, entry.remoteUrl);
}

function entryMatchesScope(
  entry: CacheEntry,
  scope?: ChatMediaCacheScope,
): boolean {
  const targetRoomId = normalizeRoomId(scope?.roomId);
  if (targetRoomId && entryRoomId(entry) !== targetRoomId) return false;

  const targetAssetType = normalizeAssetType(scope?.assetType);
  if (!targetAssetType) return true;
  const actual = entryAssetType(entry);
  if (targetAssetType === "media") return actual === "image" || actual === "video";
  return actual === targetAssetType;
}

function safeUrl(value?: string | null): string {
  return String(value ?? "").trim();
}

function fallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

async function hashString(input: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input,
    );
  } catch {
    return fallbackHash(input);
  }
}

async function ensureDir(path: string) {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists)
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    try {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    } catch {}
  }
}

async function ensureBaseDirs() {
  await ensureDir(CACHE_ROOT_DIR);
  await ensureDir(DURABLE_ROOT_DIR);
  await ensureDir(THUMB_DIR);
  await ensureDir(ORIGINAL_DIR);
  await ensureDir(TEMP_DIR);
}

function emptyIndex(): CacheIndex {
  return { version: 1, entries: {} };
}

async function loadIndex(): Promise<CacheIndex> {
  await ensureBaseDirs();
  try {
    const info = await FileSystem.getInfoAsync(INDEX_PATH);
    if (!info.exists) return emptyIndex();
    const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      !parsed.entries
    )
      return emptyIndex();
    return parsed as CacheIndex;
  } catch {
    return emptyIndex();
  }
}

async function getIndex(): Promise<CacheIndex> {
  if (!indexPromise) indexPromise = loadIndex();
  return indexPromise;
}

async function saveIndex(index: CacheIndex) {
  await ensureBaseDirs();
  writeQueue = writeQueue.then(async () => {
    try {
      await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(index));
    } catch {}
  });
  await writeQueue;
}

function normalizeExt(ext: string, fallback: string): string {
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!e) return fallback;
  if (e === "jpeg") return "jpg";
  if (
    [
      "jpg",
      "png",
      "webp",
      "gif",
      "heic",
      "heif",
      "mp4",
      "mov",
      "m4a",
      "aac",
      "mp3",
      "wav",
      "ogg",
      "opus",
      "flac",
      "pdf",
      "txt",
      "csv",
      "json",
      "zip",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "hwp",
      "hwpx",
      "bin",
    ].includes(e)
  )
    return e;
  return fallback;
}

function extFromUrl(url: string, fallback: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const name = clean.split("/").pop() ?? "";
  const match = name.match(/\.([A-Za-z0-9]{2,6})$/);
  return normalizeExt(match?.[1] ?? "", fallback);
}

function extFromMime(mime?: string | null, fallback = "jpg"): string {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("heic")) return "heic";
  if (m.includes("heif")) return "heif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("m4a")) return "m4a";
  if (m.includes("aac")) return "aac";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("opus")) return "opus";
  if (m.includes("flac")) return "flac";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("zip")) return "zip";
  if (m.includes("wordprocessingml") || m.includes("msword")) return "docx";
  if (m.includes("spreadsheetml") || m.includes("excel")) return "xlsx";
  if (m.includes("presentationml") || m.includes("powerpoint")) return "pptx";
  if (m.includes("plain")) return "txt";
  if (m.includes("json")) return "json";
  if (m.includes("csv")) return "csv";
  return fallback;
}

async function statBytes(localUri: string): Promise<number> {
  try {
    const info: any = await FileSystem.getInfoAsync(localUri, {
      size: true,
    } as any);
    return info?.exists && Number.isFinite(Number(info.size))
      ? Number(info.size)
      : 0;
  } catch {
    return 0;
  }
}

async function fileExists(localUri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    return !!info.exists;
  } catch {
    return false;
  }
}

async function removeFile(localUri?: string | null) {
  const uri = safeUrl(localUri);
  if (!uri) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
}

function entryKey(kind: ChatMediaCacheKind, hash: string) {
  return `${kind}:${hash}`;
}

function dirForKind(kind: ChatMediaCacheKind) {
  return kind === "thumb" ? THUMB_DIR : ORIGINAL_DIR;
}

async function touchEntry(
  index: CacheIndex,
  key: string,
): Promise<string | null> {
  const entry = index.entries[key];
  if (!entry) return null;
  const exists = await fileExists(entry.localUri);
  if (!exists) {
    delete index.entries[key];
    void saveIndex(index);
    return null;
  }
  entry.lastAccessedAt = nowMs();
  void saveIndex(index);
  return entry.localUri;
}

async function writeEntry(index: CacheIndex, entry: CacheEntry) {
  index.entries[entry.key] = entry;
  await saveIndex(index);
}

async function downloadToTemp(
  remoteUrl: string,
  hash: string,
  ext: string,
): Promise<string> {
  await ensureBaseDirs();
  const temp = `${TEMP_DIR}${hash}-${Date.now()}.${ext}`;
  const result = await FileSystem.downloadAsync(remoteUrl, temp);
  return result.uri;
}

async function copyOver(src: string, dest: string) {
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {}
  await FileSystem.copyAsync({ from: src, to: dest });
}

function positiveBytes(value?: number | string | null): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function defaultExtForAssetType(assetType?: ChatMediaAssetType | "media" | null): string {
  const normalized = normalizeAssetType(assetType);
  if (normalized === "video") return "mp4";
  if (normalized === "audio") return "m4a";
  if (normalized === "image" || normalized === "media") return "jpg";
  return "bin";
}

async function localEntryUriForKind(
  kind: ChatMediaCacheKind,
  sourceKey: string,
): Promise<string | null> {
  const stableKey = safeUrl(sourceKey);
  if (!stableKey) return null;

  await ensureBaseDirs();

  const hash = await hashString(`${kind}:${stableKey}`);
  const key = entryKey(kind, hash);
  const index = await getIndex();
  return touchEntry(index, key);
}

export async function getCachedOriginalUri(
  remoteUrlInput: string,
  options: EnsureOptions = {},
): Promise<string> {
  const remoteUrl = safeUrl(remoteUrlInput);
  if (!remoteUrl) return "";

  if (isLocalMediaUri(remoteUrl)) {
    return (await fileExists(remoteUrl)) ? remoteUrl : "";
  }

  const stableKey = safeUrl(options.cacheKey) || remoteUrl;
  const local = await localEntryUriForKind("original", stableKey);
  return local ?? "";
}

export async function registerOriginalLocalFile(
  input: RegisterOriginalLocalFileInput,
): Promise<string> {
  const sourceUri = safeUrl(input.sourceUri);
  if (!sourceUri) return "";

  if (!isLocalMediaUri(sourceUri)) {
    if (isRemoteHttpUrl(sourceUri)) {
      return ensureOriginalCached(sourceUri, {
        cacheKey: input.cacheKey,
        mime: input.mime,
        roomId: input.roomId,
        assetType: input.assetType,
      });
    }
    return sourceUri;
  }

  await ensureBaseDirs();

  const remoteUrl = safeUrl(input.remoteUrl) || sourceUri;
  const stableKey = safeUrl(input.cacheKey) || safeUrl(input.remoteUrl) || sourceUri;
  const explicitAssetType = normalizeAssetType(input.assetType);
  const fallbackExt = defaultExtForAssetType(explicitAssetType);
  const ext = extFromMime(input.mime, extFromUrl(remoteUrl || sourceUri, fallbackExt));
  const hash = await hashString(`original:${stableKey}`);
  const localUri = `${ORIGINAL_DIR}${hash}.${ext}`;
  const key = entryKey("original", hash);

  const index = await getIndex();
  const existing = await touchEntry(index, key);
  if (existing) return existing;

  try {
    if (sourceUri !== localUri) {
      await copyOver(sourceUri, localUri);
    }

    const bytes = positiveBytes(input.bytes) ?? (await statBytes(localUri));
    const timestamp = nowMs();
    await writeEntry(index, {
      key,
      kind: "original",
      remoteUrl,
      localUri,
      bytes,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      roomId: normalizeRoomId(input.roomId) ?? roomIdFromRemoteUrl(remoteUrl),
      assetType: (() => {
        if (explicitAssetType && explicitAssetType !== "media") return explicitAssetType;
        return assetTypeFromMimeAndUrl(input.mime, remoteUrl || sourceUri);
      })(),
    });

    void cleanupChatMediaCache("original");
    return localUri;
  } catch {
    return sourceUri;
  }
}

async function maybeMakeThumbnail(src: string, dest: string, ext: string) {
  if (ext === "gif") {
    await copyOver(src, dest);
    return;
  }

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      src,
      [{ resize: { width: THUMB_WIDTH } }],
      { compress: 0.68, format: ImageManipulator.SaveFormat.JPEG },
    );
    await copyOver(manipulated.uri, dest);
    try {
      await FileSystem.deleteAsync(manipulated.uri, { idempotent: true });
    } catch {}
  } catch {
    await copyOver(src, dest);
  }
}

async function ensureCached(
  kind: ChatMediaCacheKind,
  remoteUrlInput: string,
  options: EnsureOptions = {},
): Promise<string> {
  const remoteUrl = safeUrl(remoteUrlInput);
  if (!remoteUrl) return "";
  if (isLocalMediaUri(remoteUrl)) return remoteUrl;
  if (!isRemoteHttpUrl(remoteUrl)) return remoteUrl;

  await ensureBaseDirs();

  const stableKey = safeUrl(options.cacheKey) || remoteUrl;
  const hash = await hashString(`${kind}:${stableKey}`);
  const sourceExt = extFromMime(
    options.mime,
    extFromUrl(remoteUrl, kind === "thumb" ? "jpg" : "jpg"),
  );
  const ext = kind === "thumb" && sourceExt !== "gif" ? "jpg" : sourceExt;
  const localUri = `${dirForKind(kind)}${hash}.${ext}`;
  const key = entryKey(kind, hash);

  const index = await getIndex();
  const existing = await touchEntry(index, key);
  if (existing) return existing;

  let tempUri = "";
  try {
    tempUri = await downloadToTemp(remoteUrl, hash, sourceExt || ext);
    if (kind === "thumb") {
      await maybeMakeThumbnail(tempUri, localUri, sourceExt);
    } else {
      await copyOver(tempUri, localUri);
    }

    const bytes = await statBytes(localUri);
    const timestamp = nowMs();
    await writeEntry(index, {
      key,
      kind,
      remoteUrl,
      localUri,
      bytes,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      roomId: normalizeRoomId(options.roomId) ?? roomIdFromRemoteUrl(remoteUrl),
      assetType: (() => { const explicit = normalizeAssetType(options.assetType); if (explicit && explicit !== "media") return explicit; return kind === "thumb" ? "image" : assetTypeFromMimeAndUrl(options.mime, remoteUrl); })(),
    });

    void cleanupChatMediaCache(kind);
    return localUri;
  } catch {
    return remoteUrl;
  } finally {
    if (tempUri) void removeFile(tempUri);
  }
}

export async function ensureThumbnailCached(
  remoteUrl: string,
  options: EnsureOptions = {},
): Promise<string> {
  return ensureCached("thumb", remoteUrl, options);
}

export async function ensureOriginalCached(
  remoteUrl: string,
  options: EnsureOptions = {},
): Promise<string> {
  return ensureCached("original", remoteUrl, options);
}

export async function prefetchThumbnail(
  remoteUrl: string,
  options: EnsureOptions = {},
): Promise<void> {
  try {
    await ensureThumbnailCached(remoteUrl, options);
  } catch {}
}

export async function ensureLinkPreviewThumbnailCached(
  remoteUrl: string,
  options: EnsureOptions = {},
): Promise<string> {
  return ensureThumbnailCached(remoteUrl, { ...options, assetType: "link" });
}

export async function prefetchLinkPreviewThumbnail(
  remoteUrl: string,
  options: EnsureOptions = {},
): Promise<void> {
  try {
    await ensureLinkPreviewThumbnailCached(remoteUrl, options);
  } catch {}
}

export async function getChatMediaCacheStats(
  scope: ChatMediaCacheScope = {},
): Promise<ChatMediaCacheStats> {
  const index = await getIndex();

  let thumbBytes = 0;
  let originalBytes = 0;
  let thumbCount = 0;
  let originalCount = 0;
  let imageBytes = 0;
  let videoBytes = 0;
  let audioBytes = 0;
  let fileBytes = 0;
  let linkBytes = 0;
  let otherBytes = 0;
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  let fileCount = 0;
  let linkCount = 0;
  let otherCount = 0;

  for (const entry of Object.values(index.entries)) {
    if (!entryMatchesScope(entry, scope)) continue;

    const exists = await fileExists(entry.localUri);
    if (!exists) continue;

    const bytes = entry.bytes || (await statBytes(entry.localUri));
    const assetType = entryAssetType(entry);

    if (entry.kind === "thumb") {
      // Link preview thumbnails are managed as thumbnail files, but they need their
      // own data-management row/graph segment so users can understand what they delete.
      if (assetType === "link") {
        linkBytes += bytes;
        linkCount += 1;
      } else {
        thumbBytes += bytes;
        thumbCount += 1;
      }
      continue;
    }

    originalBytes += bytes;
    originalCount += 1;

    if (assetType === "image") { imageBytes += bytes; imageCount += 1; }
    else if (assetType === "video") { videoBytes += bytes; videoCount += 1; }
    else if (assetType === "audio") { audioBytes += bytes; audioCount += 1; }
    else if (assetType === "file") { fileBytes += bytes; fileCount += 1; }
    else if (assetType === "link") { linkBytes += bytes; linkCount += 1; }
    else { otherBytes += bytes; otherCount += 1; }
  }

  return {
    thumbBytes,
    originalBytes,
    totalBytes: thumbBytes + linkBytes + originalBytes,
    thumbCount,
    originalCount,
    imageBytes,
    videoBytes,
    audioBytes,
    fileBytes,
    linkBytes,
    otherBytes,
    imageCount,
    videoCount,
    audioCount,
    fileCount,
    linkCount,
    otherCount,
  };
}

export async function cleanupChatMediaCache(
  kind?: ChatMediaCacheKind,
  scope: ChatMediaCacheScope = {},
): Promise<void> {
  const index = await getIndex();
  const targetKinds: ChatMediaCacheKind[] = kind
    ? [kind]
    : ["thumb", "original"];
  const now = nowMs();
  let changed = false;

  for (const targetKind of targetKinds) {
    const maxBytes =
      targetKind === "thumb" ? THUMB_MAX_BYTES : ORIGINAL_MAX_BYTES;
    const maxAge =
      targetKind === "thumb" ? THUMB_MAX_AGE_MS : ORIGINAL_MAX_AGE_MS;
    const entries = Object.values(index.entries)
      .filter(
        (entry) => entry.kind === targetKind && entryMatchesScope(entry, scope),
      )
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    let total = 0;
    const live: CacheEntry[] = [];

    for (const entry of entries) {
      const exists = await fileExists(entry.localUri);
      if (!exists || now - entry.lastAccessedAt > maxAge) {
        await removeFile(entry.localUri);
        delete index.entries[entry.key];
        changed = true;
        continue;
      }
      const bytes = entry.bytes || (await statBytes(entry.localUri));
      entry.bytes = bytes;
      total += bytes;
      live.push(entry);
    }

    while (total > maxBytes && live.length) {
      const victim = live.shift()!;
      total -= victim.bytes || 0;
      await removeFile(victim.localUri);
      delete index.entries[victim.key];
      changed = true;
    }
  }

  if (changed) await saveIndex(index);
}

async function clearByKind(
  kind?: ChatMediaCacheKind,
  scope: ChatMediaCacheScope = {},
): Promise<void> {
  await ensureBaseDirs();
  const index = await getIndex();
  const scoped = !!normalizeRoomId(scope.roomId);

  for (const entry of Object.values(index.entries)) {
    if ((!kind || entry.kind === kind) && entryMatchesScope(entry, scope))
      await removeFile(entry.localUri);
  }
  for (const key of Object.keys(index.entries)) {
    const entry = index.entries[key];
    if (
      entry &&
      (!kind || entry.kind === kind) &&
      entryMatchesScope(entry, scope)
    )
      delete index.entries[key];
  }
  await saveIndex(index);

  if (!scoped) {
    if (!kind || kind === "thumb") {
      try {
        await FileSystem.deleteAsync(THUMB_DIR, { idempotent: true });
      } catch {}
      await ensureDir(THUMB_DIR);
    }
    if (!kind || kind === "original") {
      try {
        await FileSystem.deleteAsync(ORIGINAL_DIR, { idempotent: true });
      } catch {}
      await ensureDir(ORIGINAL_DIR);
    }
  }
}

export async function clearChatThumbnailCache(
  scope: ChatMediaCacheScope = {},
): Promise<void> {
  await clearByKind("thumb", scope);
}

export async function clearChatOriginalCache(
  scope: ChatMediaCacheScope = {},
): Promise<void> {
  await clearByKind("original", scope);
}

export async function clearAllChatMediaCache(
  scope: ChatMediaCacheScope = {},
): Promise<void> {
  await clearByKind(undefined, scope);
}
