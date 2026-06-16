import React, {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import {
  AppState,
  DeviceEventEmitter,
  Platform,
  type AppStateStatus,
} from "react-native";
import { Q } from "@nozbe/watermelondb";
import { supabase } from "@/lib/supabase";
import { database } from "@/lib/chatDB/database";
import Message from "@/lib/chatDB/models/Message";
import secureKeyStore from "@/lib/chatSecurity/secureKeyStore";
import {
  decryptSecurePayloadV1,
  wrapRoomEpochKeyForRecipient,
  fingerprintRoomEpochKey,
  generateSecureBackupRecoveryCode,
  encryptSecureKeyBackupV1,
  decryptSecureKeyBackupV1,
  hashSecureKeyBackupEnvelope,
  type SecureKeyBackupEnvelopeV1,
  type SecurePayloadV1,
  type SessionContextV1,
  type WrappedEpochKeyV1,
} from "@/lib/chatSecurity/secureCrypto";

export type SecureRoomPolicy = "optional" | "required" | "mixed";
export type SecureRoomVisualState =
  | "locked"
  | "unlocking"
  | "unlocked"
  | "error";

export type SecureRoomState = {
  available: boolean;
  policy: SecureRoomPolicy;
  currentEpoch: number;
  state: SecureRoomVisualState;
  error: string | null;
  updatedAt: number;
};

export type SecureMessageViewState =
  | "plain"
  | "locked"
  | "unlocking"
  | "unlocked"
  | "error";

export type SecureMessageView = {
  isSecure: boolean;
  state: SecureMessageViewState;
  payload: SecurePayloadV1 | null;
  error: string | null;
  lockedLabel: string;
};

export type SecureReadyResult = {
  roomId: number;
  epoch: number;
  deviceId: string;
  keyFingerprint: string;
};

export type SecureKeyBackupStatus = {
  exists: boolean;
  updatedAt: string | null;
  createdAt: string | null;
  keyCount: number;
  roomCount: number;
  backupVersion: number | null;
  deviceId: string | null;
  lastRestoredAt: string | null;
};

export type SecureKeyBackupCreateResult = {
  recoveryCode: string;
  keyCount: number;
  roomCount: number;
  updatedAt: string | null;
};

export type SecureKeyBackupRestoreResult = {
  imported: number;
  skipped: number;
  conflicts: number;
  rooms: number;
};

export type SecurePeerRecoveryStatus =
  | "pending"
  | "approving"
  | "approved"
  | "rejected"
  | "expired"
  | "completed"
  | "cancelled";

export type SecurePeerRecoveryRequest = {
  id: number;
  roomId: number;
  direction: "incoming" | "outgoing";
  requesterUserId: string;
  targetUserId: string;
  requesterDeviceId: string | null;
  targetDeviceId: string | null;
  requestedEpoch: number;
  status: SecurePeerRecoveryStatus;
  createdAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  meta: Record<string, any>;
};

export type SecurePeerRecoveryRequestList = {
  incoming: SecurePeerRecoveryRequest[];
  outgoing: SecurePeerRecoveryRequest[];
};

export type SecurePeerRecoveryApproveResult = {
  sharedEpochCount: number;
  parcelCount: number;
};

export type SecurePeerRecoveryClaimResult = {
  imported: number;
  skipped: number;
  conflicts: number;
};

function normalizePeerRecoveryRequestRow(row: any): SecurePeerRecoveryRequest | null {
  if (!row) return null;
  const id = Number(row.id ?? row.request_id ?? row.requestId ?? 0);
  const roomId = Number(row.room_id ?? row.roomId ?? 0);
  const requesterUserId = normalizeUuid(row.requester_user_id ?? row.requesterUserId);
  const targetUserId = normalizeUuid(row.target_user_id ?? row.targetUserId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(roomId) || roomId <= 0 || !requesterUserId || !targetUserId) {
    return null;
  }
  const direction = String(row.direction ?? '').trim() === 'incoming' ? 'incoming' : 'outgoing';
  const status = String(row.status ?? 'pending').trim() as SecurePeerRecoveryStatus;
  const meta = safeJsonParseRecord(row.meta) ?? (row.meta && typeof row.meta === 'object' ? row.meta : {}) ?? {};
  return {
    id,
    roomId,
    direction,
    requesterUserId,
    targetUserId,
    requesterDeviceId: normalizeUuid(row.requester_device_id ?? row.requesterDeviceId),
    targetDeviceId: normalizeUuid(row.target_device_id ?? row.targetDeviceId),
    requestedEpoch: Math.max(0, Math.trunc(Number(row.requested_epoch ?? row.requestedEpoch ?? 0) || 0)),
    status,
    createdAt: trimStr(row.created_at ?? row.createdAt) || null,
    expiresAt: trimStr(row.expires_at ?? row.expiresAt) || null,
    completedAt: trimStr(row.completed_at ?? row.completedAt) || null,
    meta: meta as Record<string, any>,
  };
}

function normalizePeerRecoveryRequestList(rows: any): SecurePeerRecoveryRequestList {
  const incoming: SecurePeerRecoveryRequest[] = [];
  const outgoing: SecurePeerRecoveryRequest[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizePeerRecoveryRequestRow(row);
    if (!item) continue;
    if (item.direction === 'incoming') incoming.push(item);
    else outgoing.push(item);
  }
  const byCreatedDesc = (a: SecurePeerRecoveryRequest, b: SecurePeerRecoveryRequest) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  incoming.sort(byCreatedDesc);
  outgoing.sort(byCreatedDesc);
  return { incoming, outgoing };
}

type DecryptedEntry = {
  key: string;
  roomId: number;
  envelopeKey: string;
  cachedAt: number;
  payload: SecurePayloadV1;
};

type DeviceBundleRow = {
  user_id?: string | null;
  userId?: string | null;
  device_id?: string | null;
  deviceId?: string | null;
  identity_public_key?: string | null;
  identityPublicKey?: string | null;
};

const CACHE_TTL_MS = 60 * 1000;
const IDLE_AUTO_LOCK_MS = 5 * 60 * 1000;
const DEFAULT_LOCKED_LABEL = "🔐 Secure message";
const LOCAL_SECURE_SCRUB_BATCH_SIZE = 5000;

function chatText(key: string, fallback: string, options?: Record<string, any>): string {
  return String(i18next.t(`chat:${key}`, { defaultValue: fallback, ...(options ?? {}) }));
}

function securePromptText(key: string, fallback: string): string {
  return chatText(`secure.prompt.${key}`, fallback);
}

function secureErrorText(key: string, fallback: string): string {
  return chatText(`secure.error.${key}`, fallback);
}

function getSecureLockedLabel(): string {
  return chatText('secure.lockedLabel', DEFAULT_LOCKED_LABEL);
}

function safeJsonParseRecord(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, any>;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function toJsonStringOrNull(value: Record<string, any> | null): string | null {
  if (!value || !Object.keys(value).length) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function pickSafeSecureMeta(value: unknown): string | null {
  const meta = safeJsonParseRecord(value);
  if (!meta) return null;
  const safe: Record<string, any> = {};
  const allow = [
    "secure",
    "secure_payload_kind",
    "secure_sender_device_id",
    "pending_secure_send",
    "encrypted_local_envelope_ready",
    "__clientMsgId",
    "__serverId",
    "__serverRoomSeq",
    "__serverCreatedAt",
    "__sendState",
    "__provisionalRoomSeq",
    "reply_to_message_uid",
    "replyToMessageUid",
  ];
  for (const key of allow) {
    if (meta[key] !== undefined && typeof meta[key] !== "object")
      safe[key] = meta[key];
  }
  safe.secure = true;
  safe.secure_plaintext_scrubbed = true;
  return toJsonStringOrNull(safe);
}

function nowMs() {
  return Date.now();
}
function trimStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function toNum(v: any): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Number(n) : null;
}
function boolish(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string")
    return ["1", "true", "yes", "y"].includes(v.trim().toLowerCase());
  return false;
}
function msgField(msg: any, ...keys: string[]) {
  for (const k of keys) {
    const v = msg?.[k] ?? msg?._raw?.[k];
    if (v != null) return v;
  }
  return null;
}
function normalizeUuid(v: any): string | null {
  const s = trimStr(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  )
    ? s
    : null;
}
function makeUuidV4(): string {
  const g: any = globalThis as any;
  const rnd = new Uint8Array(16);
  if (g?.crypto?.getRandomValues) g.crypto.getRandomValues(rnd);
  else
    for (let i = 0; i < rnd.length; i += 1)
      rnd[i] = Math.floor(Math.random() * 256);
  rnd[6] = (rnd[6]! & 0x0f) | 0x40;
  rnd[8] = (rnd[8]! & 0x3f) | 0x80;
  const h = Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function platformForRpc(): "ios" | "android" | "web" {
  return Platform.OS === "ios"
    ? "ios"
    : Platform.OS === "android"
      ? "android"
      : "web";
}

function normalizeBackupRow(row: any): SecureKeyBackupStatus {
  if (!row) {
    return {
      exists: false,
      updatedAt: null,
      createdAt: null,
      keyCount: 0,
      roomCount: 0,
      backupVersion: null,
      deviceId: null,
      lastRestoredAt: null,
    };
  }
  return {
    exists: true,
    updatedAt: trimStr(row.updated_at ?? row.updatedAt) || null,
    createdAt: trimStr(row.created_at ?? row.createdAt) || null,
    keyCount: Number(row.key_count ?? row.keyCount ?? 0) || 0,
    roomCount: Number(row.room_count ?? row.roomCount ?? 0) || 0,
    backupVersion: Number(row.backup_version ?? row.backupVersion ?? 0) || null,
    deviceId: normalizeUuid(row.device_id ?? row.deviceId),
    lastRestoredAt: trimStr(row.last_restored_at ?? row.lastRestoredAt) || null,
  };
}

function firstRpcRow(data: any): any | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export function getSecureMessageKey(msg: any): string {
  const uid = trimStr(msgField(msg, "message_uid", "messageUid"));
  if (uid) return `uid:${uid}`;
  const id = trimStr(msgField(msg, "id"));
  if (id) return `id:${id}`;
  return "";
}
function getRoomId(msg: any): number | null {
  return toNum(msgField(msg, "room_id", "roomId"));
}
function getSecureEpoch(msg: any): number | null {
  return toNum(msgField(msg, "secure_epoch", "secureEpoch"));
}
function getSenderId(msg: any): string | null {
  const s = trimStr(msgField(msg, "sender_id", "senderId"));
  return s || null;
}
function isSecureMessage(msg: any): boolean {
  return boolish(msgField(msg, "is_secure", "isSecure"));
}

function buildContextFromMessage(msg: any): SessionContextV1 | null {
  const roomId = getRoomId(msg);
  const secureEpoch = getSecureEpoch(msg);
  const senderId = getSenderId(msg);
  const messageUid = trimStr(msgField(msg, "message_uid", "messageUid"));
  if (!roomId || !secureEpoch || !senderId || !messageUid) return null;
  return { roomId, secureEpoch, senderId, messageUid };
}

function buildEnvelopeFromMessage(msg: any) {
  const aadVersion = toNum(msgField(msg, "aad_version", "aadVersion")) ?? 1;
  const cipherSuite =
    trimStr(msgField(msg, "cipher_suite", "cipherSuite")) ||
    "x25519+hkdf-sha256+chacha20poly1305";
  const nonceB64u = trimStr(msgField(msg, "nonce"));
  const ciphertextB64u = trimStr(msgField(msg, "ciphertext"));
  if (!nonceB64u || !ciphertextB64u) return null;
  return {
    aadVersion,
    cipherSuite: cipherSuite as any,
    nonceB64u,
    ciphertextB64u,
  };
}

function getSecureEnvelopeKey(msg: any): string {
  if (!isSecureMessage(msg)) return "plain";
  const roomId = getRoomId(msg) ?? 0;
  const epoch = getSecureEpoch(msg) ?? 0;
  const uid = trimStr(msgField(msg, "message_uid", "messageUid"));
  const senderId = getSenderId(msg) ?? "";
  const aadVersion = toNum(msgField(msg, "aad_version", "aadVersion")) ?? 1;
  const nonce = trimStr(msgField(msg, "nonce"));
  const ciphertext = trimStr(msgField(msg, "ciphertext"));
  const cipherSuite =
    trimStr(msgField(msg, "cipher_suite", "cipherSuite")) ||
    "x25519+hkdf-sha256+chacha20poly1305";
  if (!roomId || !epoch || !uid || !senderId || !nonce || !ciphertext) {
    return `pending:${roomId}:${epoch}:${uid}:${senderId}:${aadVersion}`;
  }
  return `v1:${roomId}:${epoch}:${uid}:${senderId}:${aadVersion}:${cipherSuite}:${nonce}:${ciphertext.length}:${ciphertext.slice(0, 16)}:${ciphertext.slice(-16)}`;
}

function getSecureEnvelopeKeyFromParts(args: {
  roomId: number;
  secureEpoch: number;
  messageUid: string;
  senderId: string;
  aadVersion?: number | null;
  cipherSuite?: string | null;
  nonceB64u: string;
  ciphertextB64u: string;
}): string {
  const roomId = Number(args.roomId) || 0;
  const epoch = Number(args.secureEpoch) || 0;
  const uid = trimStr(args.messageUid);
  const senderId = trimStr(args.senderId);
  const aadVersion = Number(args.aadVersion ?? 1) || 1;
  const cipherSuite =
    trimStr(args.cipherSuite) || "x25519+hkdf-sha256+chacha20poly1305";
  const nonce = trimStr(args.nonceB64u);
  const ciphertext = trimStr(args.ciphertextB64u);

  if (!roomId || !epoch || !uid || !senderId || !nonce || !ciphertext) {
    return `pending:${roomId}:${epoch}:${uid}:${senderId}:${aadVersion}`;
  }

  return `v1:${roomId}:${epoch}:${uid}:${senderId}:${aadVersion}:${cipherSuite}:${nonce}:${ciphertext.length}:${ciphertext.slice(0, 16)}:${ciphertext.slice(-16)}`;
}

const EMPTY_ROOM_STATE: SecureRoomState = Object.freeze({
  available: false,
  policy: "mixed" as SecureRoomPolicy,
  currentEpoch: 0,
  state: "locked" as SecureRoomVisualState,
  error: null,
  updatedAt: 0,
});

function emptyRoomState(): SecureRoomState {
  return EMPTY_ROOM_STATE;
}

function sameRoomState(a: SecureRoomState, b: SecureRoomState): boolean {
  return (
    a.available === b.available &&
    a.policy === b.policy &&
    a.currentEpoch === b.currentEpoch &&
    a.state === b.state &&
    a.error === b.error
  );
}

class SecureRuntimeStore {
  private listeners = new Set<() => void>();
  private roomStates = new Map<number, SecureRoomState>();
  private decrypted = new Map<string, DecryptedEntry>();
  private lastActiveAt = nowMs();
  private localSanitizePromise: Promise<void> | null = null;
  private ensureDevicePromise: Promise<string> | null = null;
  private ensureRoomPromises = new Map<string, Promise<SecureReadyResult>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) {
      try {
        l();
      } catch {}
    }
  }

  private emitSecureLayoutChanged(roomId: number, reason: string) {
    if (!Number.isFinite(roomId) || roomId <= 0) return;
    try {
      DeviceEventEmitter.emit("chat:secure:layoutChanged", { roomId, reason });
    } catch {}
  }

  touch() {
    this.lastActiveAt = nowMs();
  }

  shouldAutoLock(): boolean {
    return nowMs() - this.lastActiveAt > IDLE_AUTO_LOCK_MS;
  }

  getRoomState(roomId?: number | null): SecureRoomState {
    if (!roomId || !Number.isFinite(roomId)) return emptyRoomState();
    return this.roomStates.get(roomId) ?? emptyRoomState();
  }

  setRoomCapability(
    roomId: number,
    available: boolean,
    policy: SecureRoomPolicy,
    currentEpoch: number,
  ) {
    const prev = this.roomStates.get(roomId) ?? emptyRoomState();
    const next: SecureRoomState = {
      ...prev,
      available,
      policy,
      currentEpoch: currentEpoch > 0 ? currentEpoch : 0,
      state: available ? prev.state : "locked",
      error: available ? prev.error : null,
      updatedAt: nowMs(),
    };

    if (sameRoomState(prev, next)) return;

    this.roomStates.set(roomId, next);
    this.emit();
  }

  setRoomError(roomId: number, message: string) {
    const prev = this.roomStates.get(roomId) ?? emptyRoomState();
    const next: SecureRoomState = {
      ...prev,
      state: "error",
      error: message,
      updatedAt: nowMs(),
    };

    if (sameRoomState(prev, next)) return;

    this.roomStates.set(roomId, next);
    this.emit();
  }

  sanitizeLocalSecurePlaintext(reason = "manual"): Promise<void> {
    if (this.localSanitizePromise) return this.localSanitizePromise;

    this.localSanitizePromise = (async () => {
      try {
        const collection = database.get<Message>("messages");
        const rows = await collection
          .query(
            Q.where("is_secure", true),
            Q.take(LOCAL_SECURE_SCRUB_BATCH_SIZE),
          )
          .fetch();
        if (!rows.length) return;

        await database.write(async () => {
          for (const rec of rows as any[]) {
            try {
              await rec.update((m: any) => {
                const raw = m?._raw ?? {};
                m.content = getSecureLockedLabel();
                m.original = null;
                m.translated_text = null;
                m.translated_by_tier = null;
                m.link_preview = null;
                m.link_preview_url = null;
                m.link_preview_status = "none";
                m.media_url = null;
                m.media_width = null;
                m.media_height = null;
                m.media_aspect = null;
                m.media_mime = null;
                m.media_provider = null;
                m.meta = pickSafeSecureMeta(m.meta ?? raw.meta ?? raw.metadata);
                if ("metadata" in m) m.metadata = m.meta;
                if (m.is_secure !== true) m.is_secure = true;
              });
            } catch {}
          }
        });
      } catch {
        // Local scrub is a best-effort safety sweep. Storage write failures must not
        // crash chat boot; runtime cache locking remains authoritative.
      }
    })().finally(() => {
      this.localSanitizePromise = null;
    });

    return this.localSanitizePromise;
  }

  async ensureLocalDeviceRegistered(promptMessage?: string): Promise<string> {
    if (this.ensureDevicePromise) return this.ensureDevicePromise;
    this.ensureDevicePromise = (async () => {
      await secureKeyStore.unlock({
        promptMessage: promptMessage ?? securePromptText("deviceRegister", "Authenticate to register this secure device."),
      });

      let deviceId = await secureKeyStore.getPreferredLocalDeviceId();
      if (!deviceId) {
        deviceId = makeUuidV4();
        await secureKeyStore.createAndStoreIdentityKeyPair(deviceId, 1);
      }

      await secureKeyStore.ensureSigningIdentityKeyPair(deviceId);

      const existingBundle = await secureKeyStore.exportPublicBundle(deviceId);
      if (
        !existingBundle.signedPreKey ||
        existingBundle.signedPreKey.signatureVerified !== true
      ) {
        const nextSignedPreKeyId = Math.max(
          1,
          Math.trunc(Date.now() / 1000) % 2147480000,
        );
        await secureKeyStore.createAndStoreSignedPreKey({
          deviceId,
          keyId: Math.max(
            nextSignedPreKeyId,
            Number(existingBundle.signedPreKey?.keyId ?? 0) + 1,
          ),
        });
      }

      const oneTimes = await secureKeyStore.listOneTimePreKeys(deviceId);
      const activeOneTimes = oneTimes.filter((k) => !k.consumedAt);
      let maxKeyId = oneTimes.reduce(
        (m, k) => Math.max(m, Number(k.keyId) || 0),
        0,
      );
      while (activeOneTimes.length < 10) {
        maxKeyId += 1;
        await secureKeyStore.createAndStoreOneTimePreKey(deviceId, maxKeyId);
        activeOneTimes.push({} as any);
      }

      const bundle = await secureKeyStore.exportPublicBundle(deviceId);
      if (!bundle.signedPreKey)
        throw new Error("signed prekey unavailable after generation");

      const { error } = await supabase.rpc("secure_register_device_bundle", {
        p_device_id: deviceId,
        p_device_label: `${platformForRpc()} secure device`,
        p_platform: platformForRpc(),
        p_identity_public_key: bundle.identityPublicKeyB64u,
        p_identity_key_version: 1,
        p_signed_prekey_id: bundle.signedPreKey.keyId,
        p_signed_prekey_public_key: bundle.signedPreKey.publicKeyB64u,
        p_signed_prekey_signature: bundle.signedPreKey.signatureB64u,
        p_one_time_prekeys: bundle.oneTimePreKeys.map((k) => ({
          key_id: k.keyId,
          public_key: k.publicKeyB64u,
        })),
        p_meta: {
          source: "app_bootstrap_v2",
          signing_identity_algorithm: "ed25519",
          signing_identity_public_key: bundle.signingIdentityPublicKeyB64u,
          signed_prekey_signature_scheme:
            "ed25519:coonn.secure.signed_prekey.v1",
        },
      });
      if (error)
        throw new Error(`secure device registration failed: ${error.message}`);
      return deviceId;
    })().finally(() => {
      this.ensureDevicePromise = null;
    });
    return this.ensureDevicePromise;
  }

  private async getAuthenticatedUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(`auth failed: ${error.message}`);
    const userId = normalizeUuid(data?.user?.id);
    if (!userId) throw new Error(secureErrorText("loginRequired", "Login required."));
    return userId;
  }

  private async fetchSecureKeyBackupRow(): Promise<any | null> {
    const { data, error } = await supabase.rpc("secure_get_key_backup");
    if (error) throw new Error(`secure backup load failed: ${error.message}`);
    return firstRpcRow(data);
  }

  async getSecureKeyBackupStatus(): Promise<SecureKeyBackupStatus> {
    try {
      const row = await this.fetchSecureKeyBackupRow();
      return normalizeBackupRow(row);
    } catch {
      return normalizeBackupRow(null);
    }
  }

  async createOrUpdateSecureKeyBackup(promptMessage?: string): Promise<SecureKeyBackupCreateResult> {
    const userId = await this.getAuthenticatedUserId();
    const deviceId = await this.ensureLocalDeviceRegistered(
      promptMessage ?? securePromptText("backupCreate", "Authenticate to create a secure key backup."),
    );

    const payload = await secureKeyStore.exportRoomEpochKeyBackupPayload({ userId });
    if (payload.keyCount <= 0) {
      throw new Error(secureErrorText("backupEmpty", "No secure keys to back up. Try again after using secure messages."));
    }

    const recoveryCode = generateSecureBackupRecoveryCode();
    const envelope = encryptSecureKeyBackupV1({
      recoveryCode,
      payload,
      userId,
      meta: {
        source: "coonn.secure.key_backup.app_v1",
        platform: platformForRpc(),
        room_count: payload.roomCount,
        key_count: payload.keyCount,
      },
    });
    const blobHash = hashSecureKeyBackupEnvelope(envelope);

    const { data, error } = await supabase.rpc("secure_upsert_key_backup", {
      p_device_id: deviceId,
      p_encrypted_blob: envelope,
      p_blob_hash: blobHash,
      p_kdf: envelope.kdf,
      p_kdf_params: {
        version: 1,
        kdf: envelope.kdf,
        code_format: "COONN-base32-32",
        info: "coonn.secure.key_backup.v1",
      },
      p_salt: envelope.saltB64u,
      p_key_count: payload.keyCount,
      p_room_count: payload.roomCount,
      p_meta: {
        source: "app_create_or_update_secure_key_backup",
        platform: platformForRpc(),
      },
    });
    if (error) throw new Error(`secure backup save failed: ${error.message}`);

    const row = firstRpcRow(data);
    return {
      recoveryCode,
      keyCount: payload.keyCount,
      roomCount: payload.roomCount,
      updatedAt: trimStr(row?.updated_at ?? row?.updatedAt) || null,
    };
  }

  async restoreSecureKeyBackup(params: {
    recoveryCode: string;
    overwrite?: boolean;
    promptMessage?: string;
  }): Promise<SecureKeyBackupRestoreResult> {
    const userId = await this.getAuthenticatedUserId();
    await this.ensureLocalDeviceRegistered(
      params.promptMessage ?? securePromptText("backupRestore", "Authenticate to restore your secure key backup."),
    );

    const row = await this.fetchSecureKeyBackupRow();
    if (!row?.encrypted_blob) throw new Error(secureErrorText("backupMissing", "No secure key backup found."));

    const envelope = row.encrypted_blob as SecureKeyBackupEnvelopeV1;
    const payload = decryptSecureKeyBackupV1({
      recoveryCode: params.recoveryCode,
      envelope,
      userId,
    });

    if (payload.userId && String(payload.userId) !== String(userId)) {
      throw new Error(secureErrorText("backupWrongAccount", "This backup does not belong to this account."));
    }

    const result = await secureKeyStore.importRoomEpochKeyBackupPayload(payload, {
      overwrite: params.overwrite === true,
    });

    const { error } = await supabase.rpc("secure_mark_key_backup_restored");
    if (error) {
    }

    this.emit();
    return result;
  }

  async deleteSecureKeyBackup(): Promise<void> {
    const { error } = await supabase.rpc("secure_delete_key_backup");
    if (error) throw new Error(`secure backup delete failed: ${error.message}`);
  }

  async createNewRoomSecureEpoch(params: {
    roomId: number;
    policy?: SecureRoomPolicy;
    promptMessage?: string;
  }): Promise<SecureReadyResult> {
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("invalid room id");
    const deviceId = await this.ensureLocalDeviceRegistered(
      params.promptMessage ?? securePromptText("newRoomKey", "Authenticate to create a new secure key."),
    );
    const result = await this.createAndPublishNewRoomEpochInternal({
      roomId,
      deviceId,
      policy: params.policy ?? "mixed",
      reason: "manual_rotate_from_room_settings",
    });
    return result;
  }

  async requestRoomHistoryKeys(params: {
    roomId: number;
    requestedEpoch?: number;
    targetUserId?: string | null;
    promptMessage?: string;
  }): Promise<{ requestedCount: number }> {
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("invalid room id");
    const deviceId = await this.ensureLocalDeviceRegistered(
      params.promptMessage ?? securePromptText("historyRequest", "Authenticate to request past secure keys."),
    );
    const { data, error } = await supabase.rpc("secure_request_peer_recovery", {
      p_room_id: roomId,
      p_requester_device_id: deviceId,
      p_requested_epoch: Math.max(0, Math.trunc(Number(params.requestedEpoch ?? 0) || 0)),
      p_target_user_id: params.targetUserId ?? null,
      p_meta: { source: "app_room_history_key_request" },
    });
    if (error) throw new Error(`secure history key request failed: ${error.message}`);
    return { requestedCount: Array.isArray(data) ? data.length : 0 };
  }

  async listRoomHistoryKeyRequests(roomId: number): Promise<SecurePeerRecoveryRequestList> {
    const normalizedRoomId = Number(roomId);
    if (!Number.isFinite(normalizedRoomId) || normalizedRoomId <= 0) return { incoming: [], outgoing: [] };
    const { data, error } = await supabase.rpc("secure_list_peer_recovery_requests", {
      p_room_id: normalizedRoomId,
    });
    if (error) throw new Error(`secure history key request list failed: ${error.message}`);
    return normalizePeerRecoveryRequestList(data);
  }

  private async rejectPeerRecoveryRequestWithDevice(params: {
    requestId: number;
    deviceId: string;
  }): Promise<void> {
    const requestId = Number(params.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) throw new Error("invalid request id");

    const deviceId = normalizeUuid(params.deviceId);
    if (!deviceId) throw new Error("invalid secure device id");

    const { error } = await supabase.rpc("secure_reject_peer_recovery_request", {
      p_request_id: requestId,
      p_resolver_device_id: deviceId,
    });
    if (error) throw new Error(`secure history key reject failed: ${error.message}`);
  }

  async approveRoomHistoryKeyRequest(params: {
    roomId: number;
    requestId: number;
    promptMessage?: string;
  }): Promise<SecurePeerRecoveryApproveResult> {
    const roomId = Number(params.roomId);
    const requestId = Number(params.requestId);
    if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("invalid room id");
    if (!Number.isFinite(requestId) || requestId <= 0) throw new Error("invalid request id");

    const deviceId = await this.ensureLocalDeviceRegistered(
      params.promptMessage ?? securePromptText("historyShare", "Authenticate to share past secure keys."),
    );

    const { data: beginData, error: beginError } = await supabase.rpc(
      "secure_begin_peer_recovery_approval",
      {
        p_request_id: requestId,
        p_resolver_device_id: deviceId,
      },
    );
    if (beginError) throw new Error(`secure history key approval failed: ${beginError.message}`);

    const beginRow = firstRpcRow(beginData);
    const requestedEpoch = Math.max(0, Math.trunc(Number(beginRow?.requested_epoch ?? 0) || 0));
    const requesterDevices = Array.isArray(beginRow?.requester_devices) ? beginRow.requester_devices : [];
    if (!requesterDevices.length) throw new Error(secureErrorText("requesterDeviceMissing", "No active secure device found for the requester."));

    const allKeys = await secureKeyStore.listRoomEpochKeys(roomId);
    const keys = allKeys.filter((key) => {
      const epoch = Number(key.epoch);
      if (!Number.isFinite(epoch) || epoch <= 0) return false;
      return requestedEpoch > 0 ? epoch === requestedEpoch : true;
    });
    if (!keys.length) {
      const message = secureErrorText(
        "noHistoryKeyToShare",
        "No previous security keys on this device to share.",
      );

      try {
        await this.rejectPeerRecoveryRequestWithDevice({ requestId, deviceId });
        this.emitSecureLayoutChanged(roomId, "peer_recovery_auto_rejected_no_history_key");
      } catch {}

      throw new Error(message);
    }

    const parcels: any[] = [];
    for (const key of keys) {
      const roomKey = trimStr(key.roomKeyB64u);
      if (!roomKey) continue;
      const epoch = Number(key.epoch);
      const keyFingerprint = key.keyFingerprint || fingerprintRoomEpochKey(roomKey);
      for (const device of requesterDevices) {
        const recipientUserId = normalizeUuid(device.user_id ?? device.userId);
        const recipientDeviceId = normalizeUuid(device.device_id ?? device.deviceId);
        const recipientIdentityPublicKey = trimStr(device.identity_public_key ?? device.identityPublicKey);
        if (!recipientUserId || !recipientDeviceId || !recipientIdentityPublicKey) continue;
        const wrapped = wrapRoomEpochKeyForRecipient({
          roomEpochKey: roomKey,
          recipientIdentityPublicKey,
          roomId,
          epoch,
        });
        parcels.push({
          recipient_user_id: recipientUserId,
          recipient_device_id: recipientDeviceId,
          room_id: roomId,
          epoch,
          key_fingerprint: keyFingerprint,
          wrapped_key: wrapped,
          wrap_cipher_suite: "x25519+hkdf-sha256",
        });
      }
    }

    if (!parcels.length) throw new Error(secureErrorText("parcelCreateFailed", "Could not prepare secure key sharing data."));

    const { error: publishError } = await supabase.rpc("secure_publish_peer_recovery_parcels", {
      p_request_id: requestId,
      p_resolver_device_id: deviceId,
      p_parcels: parcels,
      p_meta: {
        source: "app_approve_room_history_key_request",
        room_id: roomId,
        sender_device_id: deviceId,
      },
    });
    if (publishError) throw new Error(`secure history key publish failed: ${publishError.message}`);

    return { sharedEpochCount: keys.length, parcelCount: parcels.length };
  }

  async rejectRoomHistoryKeyRequest(params: {
    requestId: number;
    promptMessage?: string;
  }): Promise<void> {
    const requestId = Number(params.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) throw new Error("invalid request id");
    const deviceId = await this.ensureLocalDeviceRegistered(
      params.promptMessage ?? securePromptText("historyReject", "Authenticate to decline the past secure key request."),
    );
    await this.rejectPeerRecoveryRequestWithDevice({ requestId, deviceId });
  }

  async claimApprovedRoomHistoryKeys(roomId: number): Promise<SecurePeerRecoveryClaimResult> {
    const normalizedRoomId = Number(roomId);
    if (!Number.isFinite(normalizedRoomId) || normalizedRoomId <= 0) throw new Error("invalid room id");
    const deviceId = await this.ensureLocalDeviceRegistered(
      securePromptText("historyClaim", "Authenticate to import approved past secure keys."),
    );
    const { data, error } = await supabase.rpc("secure_list_peer_recovery_parcels_to_claim", {
      p_room_id: normalizedRoomId,
      p_device_id: deviceId,
    });
    if (error) throw new Error(`secure history key claim list failed: ${error.message}`);

    const rows = Array.isArray(data) ? data : [];
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;

    for (const row of rows) {
      const parcelId = Number((row as any)?.parcel_id ?? (row as any)?.id ?? 0);
      const blob = (row as any)?.encrypted_blob ?? {};
      const epoch = Number(blob?.epoch ?? (row as any)?.epoch ?? 0);
      const wrapped = blob?.wrapped_key as WrappedEpochKeyV1 | null;
      if (!Number.isFinite(parcelId) || parcelId <= 0 || !Number.isFinite(epoch) || epoch <= 0 || !wrapped) {
        continue;
      }

      const expectedFp = trimStr(blob?.key_fingerprint ?? blob?.keyFingerprint);
      const existing = await secureKeyStore.getRoomEpochKey(normalizedRoomId, epoch);
      if (existing?.roomKeyB64u) {
        const existingFp = existing.keyFingerprint || fingerprintRoomEpochKey(existing.roomKeyB64u);
        if (!expectedFp || expectedFp === existingFp) {
          skipped += 1;
          const { error: markSkippedError } = await supabase.rpc("secure_mark_peer_recovery_parcel_claimed", {
            p_parcel_id: parcelId,
            p_device_id: deviceId,
          });
          if (markSkippedError) throw new Error(`secure history key claim mark failed: ${markSkippedError.message}`);
          continue;
        }
        conflicts += 1;
        continue;
      }

      const record = await secureKeyStore.unwrapAndStoreRoomEpochKey({
        roomId: normalizedRoomId,
        epoch,
        wrapped,
        recipientDeviceId: deviceId,
        wrappedFromUserId: normalizeUuid((row as any)?.sender_user_id) ?? null,
        wrappedFromDeviceId: normalizeUuid((row as any)?.sender_device_id) ?? null,
        source: "claimed",
      });
      const actualFp = record.keyFingerprint || fingerprintRoomEpochKey(record.roomKeyB64u);
      if (expectedFp && actualFp !== expectedFp) {
        await secureKeyStore.deleteRoomEpochKey(normalizedRoomId, epoch);
        conflicts += 1;
        continue;
      }

      const { error: markError } = await supabase.rpc("secure_mark_peer_recovery_parcel_claimed", {
        p_parcel_id: parcelId,
        p_device_id: deviceId,
      });
      if (markError) throw new Error(`secure history key claim mark failed: ${markError.message}`);
      imported += 1;
    }

    if (imported > 0) {
      this.emit();
      this.emitSecureLayoutChanged(normalizedRoomId, "peer_recovery_claimed");
    }
    return { imported, skipped, conflicts };
  }

  private async claimRoomEpochKey(
    roomId: number,
    epoch: number,
    deviceId: string,
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc(
      "secure_claim_room_epoch_parcels",
      {
        p_room_id: roomId,
        p_device_id: deviceId,
        p_after_epoch: 0,
      },
    );
    if (error) return false;
    const rows = Array.isArray(data) ? data : [];
    let claimed = false;
    for (const row of rows) {
      const rowEpoch = Number((row as any)?.epoch ?? 0);
      if (rowEpoch !== epoch) continue;
      const wrapped = (row as any)?.wrapped_key as WrappedEpochKeyV1 | null;
      if (!wrapped || typeof wrapped !== "object") continue;
      await secureKeyStore.unwrapAndStoreRoomEpochKey({
        roomId,
        epoch,
        wrapped,
        recipientDeviceId: deviceId,
        source: "claimed",
      });
      claimed = true;
    }
    return claimed;
  }

  private async fetchServerEpochFingerprint(
    roomId: number,
    epoch: number,
  ): Promise<string | null> {
    const { data, error } = await supabase
      .from("secure_room_epochs")
      .select("key_fingerprint")
      .eq("room_id", roomId)
      .eq("epoch", epoch)
      .maybeSingle();
    if (error) return null;
    return trimStr((data as any)?.key_fingerprint) || null;
  }

  private async canManageRoom(roomId: number): Promise<boolean> {
    const { data, error } = await supabase.rpc("secure_can_manage_room", {
      p_room_id: roomId,
    });
    if (error) return false;
    return data === true;
  }

  private async createAndPublishNewRoomEpochInternal(params: {
    roomId: number;
    deviceId: string;
    policy: SecureRoomPolicy;
    reason: string;
  }): Promise<SecureReadyResult> {
    const roomId = Number(params.roomId);
    const deviceId = normalizeUuid(params.deviceId);
    const policy = (trimStr(params.policy) || "mixed") as SecureRoomPolicy;
    const reason = trimStr(params.reason) || "manual_rotate";

    if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("invalid room id");
    if (!deviceId) throw new Error("invalid secure device");

    const { data: epochData, error: epochError } = await supabase.rpc(
      "secure_create_room_epoch",
      {
        p_room_id: roomId,
        p_created_device_id: deviceId,
        p_reason: reason,
      },
    );
    if (epochError) {
      throw new Error(`secure room epoch create failed: ${epochError.message}`);
    }

    const epoch = Number(epochData ?? 0);
    if (!Number.isFinite(epoch) || epoch <= 0) {
      throw new Error("secure room epoch create returned invalid epoch");
    }

    let createdLocalKey = false;
    let key = await secureKeyStore.getRoomEpochKey(roomId, epoch);

    try {
      if (!key?.roomKeyB64u) {
        key = await secureKeyStore.createAndStoreRoomEpochKey(roomId, epoch);
        createdLocalKey = true;
      }

      const keyFingerprint =
        key.keyFingerprint || fingerprintRoomEpochKey(key.roomKeyB64u);

      // publishRoomEpochKeyToMembers performs the server-side finalize step.
      // Do not update local room capability/state until publish + finalize both
      // succeed; otherwise the app can temporarily point at an epoch that the
      // server has not made current and peers cannot decrypt yet.
      await this.publishRoomEpochKeyToMembers(roomId, epoch, deviceId, keyFingerprint);

      this.setRoomCapability(roomId, true, policy, epoch);
      const prev = this.getRoomState(roomId);
      this.roomStates.set(roomId, {
        ...prev,
        available: true,
        policy,
        currentEpoch: epoch,
        state: "unlocked",
        error: null,
        updatedAt: nowMs(),
      });
      this.emit();
      this.emitSecureLayoutChanged(roomId, "room_epoch_rotated");

      return { roomId, epoch, deviceId, keyFingerprint };
    } catch (error) {
      if (createdLocalKey) {
        try {
          await secureKeyStore.deleteRoomEpochKey(roomId, epoch);
        } catch {}
      }
      throw error;
    }
  }

  private async publishRoomEpochKeyToMembers(
    roomId: number,
    epoch: number,
    deviceId: string,
    keyFingerprint: string,
  ): Promise<void> {
    const key = await secureKeyStore.getRoomEpochKey(roomId, epoch);
    if (!key?.roomKeyB64u)
      throw new Error("room epoch key unavailable for publish");
    const fp =
      keyFingerprint ||
      key.keyFingerprint ||
      fingerprintRoomEpochKey(key.roomKeyB64u);

    const { data, error } = await supabase.rpc(
      "secure_list_room_member_device_bundles",
      { p_room_id: roomId },
    );
    if (error)
      throw new Error(`secure member device list failed: ${error.message}`);

    const bundles = Array.isArray(data) ? (data as DeviceBundleRow[]) : [];
    const parcels: any[] = [];
    for (const b of bundles) {
      const recipientUserId = normalizeUuid(b.user_id ?? b.userId);
      const recipientDeviceId = normalizeUuid(b.device_id ?? b.deviceId);
      const recipientIdentityPublicKey = trimStr(
        b.identity_public_key ?? b.identityPublicKey,
      );
      if (!recipientUserId || !recipientDeviceId || !recipientIdentityPublicKey)
        continue;

      const wrapped = wrapRoomEpochKeyForRecipient({
        roomEpochKey: key.roomKeyB64u,
        recipientIdentityPublicKey,
        roomId,
        epoch,
      });

      parcels.push({
        recipient_user_id: recipientUserId,
        recipient_device_id: recipientDeviceId,
        wrapped_key: wrapped,
      });
    }

    if (!parcels.length)
      throw new Error("no active secure recipient devices for room");

    const { error: publishError } = await supabase.rpc(
      "secure_publish_room_epoch_parcels_bulk",
      {
        p_room_id: roomId,
        p_epoch: epoch,
        p_key_fingerprint: fp,
        p_sender_device_id: deviceId,
        p_parcels: parcels,
        p_expires_at: null,
        p_meta: {
          source: "app_room_key_publish_v2_bulk",
          sender_device_id: deviceId,
        },
      },
    );
    if (publishError)
      throw new Error(
        `secure room key publish failed: ${publishError.message}`,
      );

    const { error: finalizeError } = await supabase.rpc(
      "secure_finalize_room_epoch_publish",
      {
        p_room_id: roomId,
        p_epoch: epoch,
        p_created_device_id: deviceId,
        p_key_fingerprint: fp,
        p_policy: "mixed",
        p_meta: {
          source: "app_room_key_publish_finalize_v2_4",
          sender_device_id: deviceId,
          parcel_count: parcels.length,
        },
      },
    );
    if (finalizeError)
      throw new Error(
        `secure room key finalize failed: ${finalizeError.message}`,
      );
  }

  async ensureSecureRoomReady(params: {
    roomId: number;
    policy?: SecureRoomPolicy;
    promptMessage?: string;
  }): Promise<SecureReadyResult> {
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId) || roomId <= 0)
      throw new Error("invalid room id");
    const promiseKey = `${roomId}:${params.policy ?? "mixed"}`;
    const existing = this.ensureRoomPromises.get(promiseKey);
    if (existing) return existing;

    const promise = (async () => {
      const deviceId = await this.ensureLocalDeviceRegistered(
        params.promptMessage,
      );
      const desiredPolicy = params.policy ?? "mixed";

      const { data: roomRow, error: roomError } = await supabase
        .from("chat_rooms")
        .select("id, secure_mode_enabled, current_secure_epoch, secure_policy")
        .eq("id", roomId)
        .maybeSingle();
      if (roomError)
        throw new Error(`secure room state failed: ${roomError.message}`);

      const enabled = roomRow ?? null;
      let epoch = Number(enabled?.current_secure_epoch ?? 0);
      let policy = (trimStr(enabled?.secure_policy) || desiredPolicy) as SecureRoomPolicy;

      if (!boolish(enabled?.secure_mode_enabled) || epoch <= 0) {
        return this.createAndPublishNewRoomEpochInternal({
          roomId,
          deviceId,
          policy,
          reason: "initial_secure_epoch",
        });
      }

      this.setRoomCapability(roomId, true, policy, epoch);

      let key = await secureKeyStore.getRoomEpochKey(roomId, epoch);
      const serverKeyFingerprint = await this.fetchServerEpochFingerprint(
        roomId,
        epoch,
      );

      if (key) {
        const localFp =
          key.keyFingerprint || fingerprintRoomEpochKey(key.roomKeyB64u);
        if (serverKeyFingerprint && localFp !== serverKeyFingerprint) {
          await secureKeyStore.deleteRoomEpochKey(roomId, epoch);
          key = null;
        }
      }

      if (!key) {
        const claimed = await this.claimRoomEpochKey(roomId, epoch, deviceId);
        if (claimed) key = await secureKeyStore.getRoomEpochKey(roomId, epoch);
      }

      if (!key) {
        return this.createAndPublishNewRoomEpochInternal({
          roomId,
          deviceId,
          policy,
          reason: "local_key_missing_rotate",
        });
      }

      const keyFingerprint =
        key.keyFingerprint || fingerprintRoomEpochKey(key.roomKeyB64u);
      if (serverKeyFingerprint && serverKeyFingerprint !== keyFingerprint) {
        throw new Error(
          "secure epoch key fingerprint mismatch; reload secure room state",
        );
      }

      const prev = this.getRoomState(roomId);
      this.roomStates.set(roomId, {
        ...prev,
        available: true,
        policy,
        currentEpoch: epoch,
        state: "unlocked",
        error: null,
        updatedAt: nowMs(),
      });
      this.emit();
      return { roomId, epoch, deviceId, keyFingerprint };
    })().finally(() => {
      this.ensureRoomPromises.delete(promiseKey);
    });

    this.ensureRoomPromises.set(promiseKey, promise);
    return promise;
  }

  async unlockRoom(roomId: number, promptMessage?: string) {
    const prev = this.getRoomState(roomId);
    if (!prev.available) return false;
    if (prev.state === "unlocked" && secureKeyStore.isUnlocked()) return true;
    this.roomStates.set(roomId, {
      ...prev,
      state: "unlocking",
      error: null,
      updatedAt: nowMs(),
    });
    this.emit();
    try {
      await secureKeyStore.unlock({
        promptMessage:
          promptMessage ?? securePromptText("decrypt", "Authenticate to decrypt secure messages."),
      });
      const deviceId = await secureKeyStore.getPreferredLocalDeviceId();
      if (
        deviceId &&
        prev.currentEpoch > 0 &&
        !(await secureKeyStore.getRoomEpochKey(roomId, prev.currentEpoch))
      ) {
        await this.claimRoomEpochKey(roomId, prev.currentEpoch, deviceId);
      }
      const next = this.getRoomState(roomId);
      this.roomStates.set(roomId, {
        ...next,
        state: "unlocked",
        error: null,
        updatedAt: nowMs(),
      });
      this.emit();
      return true;
    } catch (e: any) {
      this.purgeRoom(roomId);
      secureKeyStore.lock();
      const next = this.getRoomState(roomId);
      this.roomStates.set(roomId, {
        ...next,
        state: "locked",
        error: String(e?.message ?? e ?? "unlock_failed"),
        updatedAt: nowMs(),
      });
      this.emit();
      return false;
    }
  }

  lockRoom(roomId: number) {
    const normalizedRoomId = Number(roomId);
    if (!Number.isFinite(normalizedRoomId) || normalizedRoomId <= 0) return;

    const prev = this.getRoomState(normalizedRoomId);
    const purged = this.purgeRoom(normalizedRoomId);
    secureKeyStore.lock();

    const next: SecureRoomState = {
      ...prev,
      state: "locked",
      error: null,
      updatedAt: nowMs(),
    };

    const stateChanged = !sameRoomState(prev, next);
    if (stateChanged) this.roomStates.set(normalizedRoomId, next);

    if (stateChanged || purged) this.emit();
    this.emitSecureLayoutChanged(normalizedRoomId, "lock_room");
    void this.sanitizeLocalSecurePlaintext("lock_room");
  }

  lockAll() {
    let changed = false;
    const layoutRoomIds = new Set<number>();

    if (this.decrypted.size > 0) {
      for (const entry of this.decrypted.values()) {
        if (Number.isFinite(entry.roomId) && entry.roomId > 0) {
          layoutRoomIds.add(entry.roomId);
        }
      }
      this.decrypted.clear();
      changed = true;
    }

    for (const [roomId, prev] of this.roomStates.entries()) {
      const next: SecureRoomState = {
        ...prev,
        state: "locked",
        error: null,
        updatedAt: nowMs(),
      };
      if (sameRoomState(prev, next)) continue;
      this.roomStates.set(roomId, next);
      layoutRoomIds.add(roomId);
      changed = true;
    }

    secureKeyStore.lock();
    if (changed) this.emit();
    for (const roomId of layoutRoomIds) {
      this.emitSecureLayoutChanged(roomId, "lock_all");
    }
    void this.sanitizeLocalSecurePlaintext("lock_all");
  }

  purgeRoom(roomId: number): boolean {
    let purged = false;
    for (const [key, entry] of this.decrypted.entries()) {
      if (entry.roomId === roomId) {
        this.decrypted.delete(key);
        purged = true;
      }
    }
    return purged;
  }

  private reapCache() {
    const t = nowMs();
    for (const [key, entry] of this.decrypted.entries()) {
      if (t - entry.cachedAt > CACHE_TTL_MS) this.decrypted.delete(key);
    }
  }

  getCachedPayloadByKey(
    key: string,
    envelopeKey?: string | null,
  ): SecurePayloadV1 | null {
    if (!key) return null;
    this.reapCache();
    const entry = this.decrypted.get(key);
    if (!entry) return null;
    const room = this.getRoomState(entry.roomId);
    if (room.state !== "unlocked" || !secureKeyStore.isUnlocked()) {
      this.decrypted.delete(key);
      this.emitSecureLayoutChanged(entry.roomId, "cache_read_locked");
      return null;
    }
    if (envelopeKey && entry.envelopeKey !== envelopeKey) {
      // 내가 방금 보낸 secure optimistic row는 WatermelonDB 모델 갱신보다
      // 메모리 복호화 캐시가 먼저 도착할 수 있다. 이 경우 row는 아직
      // pending envelope로 보이지만, 평문은 저장하지 않고 현재 unlock 세션
      // 메모리에만 있으므로 즉시 표시를 허용한다. 잠금/백그라운드 시
      // decrypted cache는 purge되므로 OFF 상태에서는 절대 보이지 않는다.
      if (String(envelopeKey).startsWith("pending:")) {
        entry.cachedAt = nowMs();
        return entry.payload;
      }
      return null;
    }
    entry.cachedAt = nowMs();
    return entry.payload;
  }

  getCachedPayload(msg: any): SecurePayloadV1 | null {
    return this.getCachedPayloadByKey(
      getSecureMessageKey(msg),
      getSecureEnvelopeKey(msg),
    );
  }

  primeLocalDecryptedPayload(args: {
    roomId: number;
    messageUid: string;
    senderId: string;
    secureEpoch: number;
    cipherSuite?: string | null;
    nonceB64u: string;
    ciphertextB64u: string;
    aadVersion?: number | null;
    payload: SecurePayloadV1;
  }): boolean {
    const roomId = Number(args.roomId);
    const messageUid = trimStr(args.messageUid);
    const senderId = trimStr(args.senderId);
    const secureEpoch = Number(args.secureEpoch);

    if (!Number.isFinite(roomId) || roomId <= 0) return false;
    if (
      !messageUid ||
      !senderId ||
      !Number.isFinite(secureEpoch) ||
      secureEpoch <= 0
    ) {
      return false;
    }

    const room = this.getRoomState(roomId);
    if (room.state !== "unlocked" || !secureKeyStore.isUnlocked()) return false;

    const key = `uid:${messageUid}`;
    const envelopeKey = getSecureEnvelopeKeyFromParts({
      roomId,
      messageUid,
      senderId,
      secureEpoch,
      cipherSuite: args.cipherSuite,
      nonceB64u: args.nonceB64u,
      ciphertextB64u: args.ciphertextB64u,
      aadVersion: args.aadVersion ?? 1,
    });

    this.decrypted.set(key, {
      key,
      roomId,
      envelopeKey,
      cachedAt: nowMs(),
      payload: args.payload,
    });
    this.emit();
    this.emitSecureLayoutChanged(roomId, "prime_local_payload");
    return true;
  }

  async decryptMessage(msg: any): Promise<SecurePayloadV1 | null> {
    if (!isSecureMessage(msg)) return null;
    const key = getSecureMessageKey(msg);
    const roomId = getRoomId(msg);
    if (!key || !roomId) return null;
    const room = this.getRoomState(roomId);
    if (room.state !== "unlocked" || !secureKeyStore.isUnlocked()) return null;

    this.reapCache();
    const envelopeKey = getSecureEnvelopeKey(msg);
    const cached = this.decrypted.get(key);
    if (cached && cached.envelopeKey === envelopeKey) {
      cached.cachedAt = nowMs();
      return cached.payload;
    }

    const ctx = buildContextFromMessage(msg);
    const envelope = buildEnvelopeFromMessage(msg);
    if (!ctx || !envelope) return null;

    let roomKeyB64u = await secureKeyStore.getRoomEpochKeyB64u(
      ctx.roomId,
      ctx.secureEpoch,
    );
    if (!roomKeyB64u) {
      const deviceId = await secureKeyStore.getPreferredLocalDeviceId();
      if (deviceId) {
        const claimed = await this.claimRoomEpochKey(
          roomId,
          ctx.secureEpoch,
          deviceId,
        );
        if (claimed)
          roomKeyB64u = await secureKeyStore.getRoomEpochKeyB64u(
            ctx.roomId,
            ctx.secureEpoch,
          );
      }
    }
    if (!roomKeyB64u) throw new Error("room epoch key not found on device");

    const payload = decryptSecurePayloadV1({
      roomKey: roomKeyB64u,
      envelope,
      context: ctx,
    });

    const roomAfterDecrypt = this.getRoomState(roomId);
    if (roomAfterDecrypt.state !== "unlocked" || !secureKeyStore.isUnlocked()) {
      return null;
    }

    this.decrypted.set(key, {
      key,
      roomId,
      envelopeKey,
      cachedAt: nowMs(),
      payload,
    });
    this.emit();
    this.emitSecureLayoutChanged(roomId, "decrypt_message");
    return payload;
  }
}

export const secureRuntimeStore = new SecureRuntimeStore();
export default secureRuntimeStore;

export function useSecureRoomState(roomId?: number | null): SecureRoomState {
  return useSyncExternalStore(
    secureRuntimeStore.subscribe,
    () => secureRuntimeStore.getRoomState(roomId),
    () => secureRuntimeStore.getRoomState(roomId),
  );
}

export function useSecureRoomController(
  roomId?: number | null,
  isFocused = true,
) {
  const { t } = useTranslation('chat');
  const state = useSecureRoomState(roomId);
  const lockedLabel = useMemo(
    () => String(t('secure.lockedLabel', { defaultValue: DEFAULT_LOCKED_LABEL })),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    if (!roomId || !Number.isFinite(roomId) || roomId <= 0) return;
    (async () => {
      const { data, error } = await supabase
        .from("chat_rooms")
        .select("id, secure_mode_enabled, current_secure_epoch, secure_policy")
        .eq("id", roomId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        secureRuntimeStore.setRoomError(roomId, error.message);
        return;
      }
      const available = boolish((data as any)?.secure_mode_enabled);
      const policy = (trimStr((data as any)?.secure_policy) ||
        "mixed") as SecureRoomPolicy;
      const currentEpoch = toNum((data as any)?.current_secure_epoch) ?? 0;
      secureRuntimeStore.setRoomCapability(
        roomId,
        available,
        policy,
        currentEpoch,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !Number.isFinite(roomId) || roomId <= 0) return;
    if (!isFocused) secureRuntimeStore.lockRoom(roomId);
  }, [roomId, isFocused]);

  const toggle = useCallback(async () => {
    if (!roomId || !Number.isFinite(roomId) || roomId <= 0) return false;
    if (state.state === "unlocked") {
      secureRuntimeStore.lockRoom(roomId);
      return true;
    }
    try {
      await secureRuntimeStore.ensureSecureRoomReady({
        roomId,
        policy: state.policy === "required" ? "required" : "mixed",
      });
      return true;
    } catch (e: any) {
      secureRuntimeStore.setRoomError(
        roomId,
        String(e?.message ?? e ?? "secure_ready_failed"),
      );
      return false;
    }
  }, [roomId, state.policy, state.state]);

  return useMemo(
    () => ({
      ...state,
      lockedLabel,
      toggle,
      isUnlocked: state.state === "unlocked",
    }),
    [state, toggle, lockedLabel],
  );
}

export function useSecureMessageView(msg: any): SecureMessageView {
  const { t } = useTranslation('chat');
  const lockedLabel = useMemo(
    () => String(t('secure.lockedLabel', { defaultValue: DEFAULT_LOCKED_LABEL })),
    [t],
  );
  const msgRef = React.useRef(msg);
  msgRef.current = msg;

  const roomId = useMemo(
    () => getRoomId(msg),
    [msg?.room_id, msg?.roomId, msg?._raw?.room_id, msg?._raw?.roomId],
  );
  const roomState = useSecureRoomState(roomId);
  const isSecure = useMemo(
    () => isSecureMessage(msg),
    [msg?.is_secure, msg?.isSecure, msg?._raw?.is_secure, msg?._raw?.isSecure],
  );
  const messageKey = useMemo(
    () => getSecureMessageKey(msg),
    [
      msg?.message_uid,
      msg?.messageUid,
      msg?.id,
      msg?._raw?.message_uid,
      msg?._raw?.messageUid,
      msg?._raw?.id,
    ],
  );
  const envelopeKey = useMemo(
    () => getSecureEnvelopeKey(msg),
    [
      msg?.room_id,
      msg?.roomId,
      msg?.message_uid,
      msg?.messageUid,
      msg?.sender_id,
      msg?.senderId,
      msg?.secure_epoch,
      msg?.secureEpoch,
      msg?.cipher_suite,
      msg?.cipherSuite,
      msg?.ciphertext,
      msg?.nonce,
      msg?.aad_version,
      msg?.aadVersion,
      msg?.is_secure,
      msg?.isSecure,
      msg?._raw?.room_id,
      msg?._raw?.roomId,
      msg?._raw?.message_uid,
      msg?._raw?.messageUid,
      msg?._raw?.sender_id,
      msg?._raw?.senderId,
      msg?._raw?.secure_epoch,
      msg?._raw?.secureEpoch,
      msg?._raw?.cipher_suite,
      msg?._raw?.cipherSuite,
      msg?._raw?.ciphertext,
      msg?._raw?.nonce,
      msg?._raw?.aad_version,
      msg?._raw?.aadVersion,
      msg?._raw?.is_secure,
      msg?._raw?.isSecure,
    ],
  );

  const storePayload = useSyncExternalStore(
    secureRuntimeStore.subscribe,
    () => secureRuntimeStore.getCachedPayloadByKey(messageKey, envelopeKey),
    () => secureRuntimeStore.getCachedPayloadByKey(messageKey, envelopeKey),
  );

  const [payload, setPayload] = React.useState<SecurePayloadV1 | null>(
    () => storePayload ?? null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const lastMessageKeyRef = React.useRef(messageKey);

  useEffect(() => {
    if (lastMessageKeyRef.current === messageKey) return;
    lastMessageKeyRef.current = messageKey;
    setPayload(storePayload ?? null);
    setError(null);
  }, [messageKey, storePayload]);

  useEffect(() => {
    if (!storePayload) return;
    setPayload((prev) => (prev === storePayload ? prev : storePayload));
  }, [storePayload]);

  useEffect(() => {
    let cancelled = false;

    if (!isSecure) {
      setPayload(null);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    if (roomState.state !== "unlocked") {
      setPayload(null);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    if (String(envelopeKey).startsWith("pending:")) {
      setPayload(null);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    secureRuntimeStore
      .decryptMessage(msgRef.current)
      .then((p) => {
        if (cancelled) return;
        setPayload((prev) => (prev === p ? prev : p));
        setError(null);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(String(e?.message ?? e ?? "decrypt_failed"));
      });

    return () => {
      cancelled = true;
    };
  }, [isSecure, roomState.state, messageKey, envelopeKey]);

  if (!isSecure)
    return {
      isSecure: false,
      state: "plain",
      payload: null,
      error: null,
      lockedLabel,
    };
  if (error)
    return {
      isSecure: true,
      state: "error",
      payload: null,
      error,
      lockedLabel,
    };
  if (roomState.state === "unlocking")
    return {
      isSecure: true,
      state: "unlocking",
      payload: null,
      error: null,
      lockedLabel,
    };
  if (roomState.state === "unlocked" && payload)
    return {
      isSecure: true,
      state: "unlocked",
      payload,
      error: null,
      lockedLabel,
    };
  return {
    isSecure: true,
    state: roomState.state === "unlocked" ? "unlocking" : "locked",
    payload: null,
    error: null,
    lockedLabel,
  };
}

export function SecureRuntimeBootstrap() {
  useEffect(() => {
    void secureRuntimeStore.sanitizeLocalSecurePlaintext("bootstrap");

    let prev: AppStateStatus = AppState.currentState;
    let backgroundLockTimer: ReturnType<typeof setTimeout> | null = null;

    const clearBackgroundLockTimer = () => {
      if (!backgroundLockTimer) return;
      clearTimeout(backgroundLockTimer);
      backgroundLockTimer = null;
    };

    const scheduleBackgroundLock = () => {
      clearBackgroundLockTimer();
      backgroundLockTimer = setTimeout(() => {
        backgroundLockTimer = null;

        if (AppState.currentState === "background") {
          secureRuntimeStore.lockAll();
        }
      }, 2000);
    };

    const sub = AppState.addEventListener("change", (next) => {
      const previous = prev;
      prev = next;

      if (next === "active") {
        clearBackgroundLockTimer();
        secureRuntimeStore.touch();
        return;
      }

      // Android can briefly report `background` while opening microphone
      // permission / audio recording sessions. Do not lock immediately;
      // only lock if the app remains backgrounded after the debounce.
      if (next === "background" && previous !== "background") {
        scheduleBackgroundLock();
      }
    });

    const idle = setInterval(() => {
      if (
        AppState.currentState === "active" &&
        secureRuntimeStore.shouldAutoLock()
      ) {
        secureRuntimeStore.lockAll();
      }
    }, 30000);

    return () => {
      try {
        sub.remove();
      } catch {}
      clearInterval(idle);
      clearBackgroundLockTimer();
    };
  }, []);
  return null;
}
