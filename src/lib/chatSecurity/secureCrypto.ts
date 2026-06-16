import * as ExpoCrypto from 'expo-crypto';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha.js';

export const SECURE_AAD_VERSION = 1 as const;
export const X25519_PRIVATE_KEY_BYTES = 32 as const;
export const X25519_PUBLIC_KEY_BYTES = 32 as const;
export const ED25519_PRIVATE_KEY_BYTES = 32 as const;
export const ED25519_PUBLIC_KEY_BYTES = 32 as const;
export const ED25519_SIGNATURE_BYTES = 64 as const;
export const CHACHA20POLY1305_KEY_BYTES = 32 as const;
export const CHACHA20POLY1305_NONCE_BYTES = 12 as const;
export const XCHACHA20POLY1305_NONCE_BYTES = 24 as const;

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SecureMessageKind = 'text' | 'image' | 'video' | 'audio' | 'file' | 'map';

export type SecureEnvelopeV1 = {
  aadVersion: number;
  cipherSuite: 'x25519+hkdf-sha256+chacha20poly1305';
  nonceB64u: string;
  ciphertextB64u: string;
};

export type WrappedEpochKeyV1 = {
  version: 1;
  curve: 'x25519';
  kdf: 'hkdf-sha256';
  cipher: 'xchacha20poly1305';
  ephemeralPublicKeyB64u: string;
  nonceB64u: string;
  ciphertextB64u: string;
};

export type SecurePayloadV1 = {
  version: 1;
  kind: SecureMessageKind;
  text?: string;
  links?: Array<{
    url: string;
    title?: string;
  }>;
  attachments?: Array<{
    url: string;
    thumbUrl?: string;
    mime?: string;
    width?: number;
    height?: number;
    aspect?: number;
    fileName?: string;
    fileSize?: number;
    provider?: string;
  }>;
  map?: {
    lat: number;
    lng: number;
    label?: string;
  };
};

export type SessionContextV1 = {
  roomId: string | number;
  messageUid: string;
  senderId: string;
  secureEpoch: number;
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function utf8ToBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function bytesToUtf8(input: Uint8Array): string {
  return new TextDecoder().decode(input);
}

function normalizeToUint8(input: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'string') return utf8ToBytes(input);
  throw new Error('Unsupported input type');
}

function requireLength(bytes: Uint8Array, expected: number, label: string) {
  ensure(bytes.length === expected, `${label} must be ${expected} bytes`);
}

function wipe(bytes?: Uint8Array | null) {
  if (!bytes) return;
  try {
    bytes.fill(0);
  } catch {}
}

function hasBuffer(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).Buffer !== 'undefined';
}

function bytesToBase64(bytes: Uint8Array): string {
  if (hasBuffer()) {
    return (globalThis as any).Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('No base64 encoder available');
}

function base64ToBytes(base64: string): Uint8Array {
  if (hasBuffer()) {
    return new Uint8Array((globalThis as any).Buffer.from(base64, 'base64'));
  }
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  throw new Error('No base64 decoder available');
}

export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return base64ToBytes(normalized + pad);
}

export function stableStringify(value: JsonValue): string {
  const visit = (v: JsonValue): JsonValue => {
    if (v === null) return null;
    if (Array.isArray(v)) return v.map((item) => visit(item));
    if (typeof v === 'object') {
      const out: Record<string, JsonValue> = {};
      for (const key of Object.keys(v).sort()) out[key] = visit((v as any)[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(visit(value));
}

export function randomBytes(length: number): Uint8Array {
  ensure(Number.isInteger(length) && length > 0, 'random length must be positive integer');
  const out = new Uint8Array(length);
  ExpoCrypto.getRandomValues(out);
  return out;
}

export function randomBase64Url(length: number): string {
  return toBase64Url(randomBytes(length));
}

export function generateX25519KeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = randomBytes(X25519_PRIVATE_KEY_BYTES);
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function generateX25519KeyPairB64u(): { privateKeyB64u: string; publicKeyB64u: string } {
  const kp = generateX25519KeyPair();
  try {
    return {
      privateKeyB64u: toBase64Url(kp.privateKey),
      publicKeyB64u: toBase64Url(kp.publicKey),
    };
  } finally {
    wipe(kp.privateKey);
    wipe(kp.publicKey);
  }
}

export function generateEd25519KeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = randomBytes(ED25519_PRIVATE_KEY_BYTES);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function generateEd25519KeyPairB64u(): { privateKeyB64u: string; publicKeyB64u: string } {
  const kp = generateEd25519KeyPair();
  try {
    return {
      privateKeyB64u: toBase64Url(kp.privateKey),
      publicKeyB64u: toBase64Url(kp.publicKey),
    };
  } finally {
    wipe(kp.privateKey);
    wipe(kp.publicKey);
  }
}

export function buildSignedPreKeySignaturePayload(params: {
  deviceId: string;
  signingIdentityPublicKeyB64u: string;
  signedPreKeyId: number;
  signedPreKeyPublicKeyB64u: string;
}): string {
  return stableStringify({
    v: 1,
    type: 'coonn.secure.signed_prekey',
    deviceId: params.deviceId,
    signingIdentityPublicKey: params.signingIdentityPublicKeyB64u,
    signedPreKeyId: params.signedPreKeyId,
    signedPreKeyAlgorithm: 'x25519',
    signedPreKeyPublicKey: params.signedPreKeyPublicKeyB64u,
  });
}

export function signEd25519B64u(params: { privateKeyB64u: string; message: string }): string {
  const priv = fromBase64Url(params.privateKeyB64u);
  requireLength(priv, ED25519_PRIVATE_KEY_BYTES, 'ed25519 private key');
  const signature = ed25519.sign(utf8ToBytes(params.message), priv);
  try {
    return toBase64Url(signature);
  } finally {
    wipe(priv);
    wipe(signature);
  }
}

export function verifyEd25519B64u(params: { publicKeyB64u: string; message: string; signatureB64u: string }): boolean {
  const pub = fromBase64Url(params.publicKeyB64u);
  const sig = fromBase64Url(params.signatureB64u);
  requireLength(pub, ED25519_PUBLIC_KEY_BYTES, 'ed25519 public key');
  requireLength(sig, ED25519_SIGNATURE_BYTES, 'ed25519 signature');
  return ed25519.verify(sig, utf8ToBytes(params.message), pub);
}

export function getX25519PublicKeyFromPrivate(privateKey: Uint8Array | string): Uint8Array {
  const priv = typeof privateKey === 'string' ? fromBase64Url(privateKey) : privateKey;
  requireLength(priv, X25519_PRIVATE_KEY_BYTES, 'x25519 private key');
  return x25519.getPublicKey(priv);
}

export function deriveX25519SharedSecret(privateKey: Uint8Array | string, remotePublicKey: Uint8Array | string): Uint8Array {
  const priv = typeof privateKey === 'string' ? fromBase64Url(privateKey) : privateKey;
  const pub = typeof remotePublicKey === 'string' ? fromBase64Url(remotePublicKey) : remotePublicKey;
  requireLength(priv, X25519_PRIVATE_KEY_BYTES, 'x25519 private key');
  requireLength(pub, X25519_PUBLIC_KEY_BYTES, 'x25519 public key');
  return x25519.getSharedSecret(priv, pub);
}

export function hkdfSha256(params: {
  ikm: Uint8Array | string;
  salt?: Uint8Array | string | null;
  info?: Uint8Array | string | null;
  length: number;
}): Uint8Array {
  const ikm = typeof params.ikm === 'string' ? fromBase64Url(params.ikm) : params.ikm;
  const salt = typeof params.salt === 'string'
    ? fromBase64Url(params.salt)
    : params.salt ?? new Uint8Array();
  const info = typeof params.info === 'string'
    ? fromBase64Url(params.info)
    : normalizeToUint8(params.info ?? new Uint8Array());
  ensure(Number.isInteger(params.length) && params.length > 0, 'hkdf length must be positive integer');
  return hkdf(sha256, ikm, salt, info, params.length);
}

export function buildSessionRootKey(params: {
  sharedSecret: Uint8Array | string;
  roomId: string | number;
  senderId: string;
  recipientId: string;
}): Uint8Array {
  const info = stableStringify({
    v: 1,
    type: 'coonn.session.root',
    roomId: String(params.roomId),
    senderId: params.senderId,
    recipientId: params.recipientId,
  });
  return hkdfSha256({
    ikm: params.sharedSecret,
    salt: utf8ToBytes('coonn-secure-session-root/v1'),
    info: utf8ToBytes(info),
    length: CHACHA20POLY1305_KEY_BYTES,
  });
}

export function deriveMessageKey(params: {
  roomKey: Uint8Array | string;
  messageUid: string;
  secureEpoch: number;
}): Uint8Array {
  const info = stableStringify({
    v: 1,
    type: 'coonn.room.message-key',
    messageUid: params.messageUid,
    secureEpoch: params.secureEpoch,
  });
  return hkdfSha256({
    ikm: params.roomKey,
    salt: utf8ToBytes('coonn-secure-message-key/v1'),
    info: utf8ToBytes(info),
    length: CHACHA20POLY1305_KEY_BYTES,
  });
}

export function generateRoomEpochKey(): Uint8Array {
  return randomBytes(CHACHA20POLY1305_KEY_BYTES);
}

export function fingerprintRoomEpochKey(roomKey: Uint8Array | string): string {
  const key = typeof roomKey === 'string' ? fromBase64Url(roomKey) : roomKey;
  requireLength(key, CHACHA20POLY1305_KEY_BYTES, 'room epoch key');
  return `sha256:${toBase64Url(sha256(key))}`;
}

export function buildMessageAad(ctx: SessionContextV1): Uint8Array {
  return utf8ToBytes(stableStringify({
    v: SECURE_AAD_VERSION,
    room_id: String(ctx.roomId),
    message_uid: ctx.messageUid,
    sender_id: ctx.senderId,
    secure_epoch: ctx.secureEpoch,
  }));
}

export function encryptMessage(params: {
  key: Uint8Array | string;
  plaintext: Uint8Array | string;
  aad: Uint8Array | string;
  nonce?: Uint8Array | string;
}): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const key = typeof params.key === 'string' ? fromBase64Url(params.key) : params.key;
  const plaintext = normalizeToUint8(params.plaintext);
  const aad = normalizeToUint8(params.aad);
  const nonce = params.nonce
    ? typeof params.nonce === 'string'
      ? fromBase64Url(params.nonce)
      : params.nonce
    : randomBytes(CHACHA20POLY1305_NONCE_BYTES);

  requireLength(key, CHACHA20POLY1305_KEY_BYTES, 'message key');
  requireLength(nonce, CHACHA20POLY1305_NONCE_BYTES, 'chacha20poly1305 nonce');

  const cipher = chacha20poly1305(key, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return { nonce, ciphertext };
}

export function decryptMessage(params: {
  key: Uint8Array | string;
  ciphertext: Uint8Array | string;
  aad: Uint8Array | string;
  nonce: Uint8Array | string;
}): Uint8Array {
  const key = typeof params.key === 'string' ? fromBase64Url(params.key) : params.key;
  const ciphertext = typeof params.ciphertext === 'string' ? fromBase64Url(params.ciphertext) : params.ciphertext;
  const aad = normalizeToUint8(params.aad);
  const nonce = typeof params.nonce === 'string' ? fromBase64Url(params.nonce) : params.nonce;

  requireLength(key, CHACHA20POLY1305_KEY_BYTES, 'message key');
  requireLength(nonce, CHACHA20POLY1305_NONCE_BYTES, 'chacha20poly1305 nonce');

  const cipher = chacha20poly1305(key, nonce, aad);
  return cipher.decrypt(ciphertext);
}

export function encryptSecurePayloadV1(params: {
  roomKey: Uint8Array | string;
  payload: SecurePayloadV1;
  context: SessionContextV1;
}): SecureEnvelopeV1 {
  ensure(params.payload.version === 1, 'secure payload version must be 1');
  const key = deriveMessageKey({
    roomKey: params.roomKey,
    messageUid: params.context.messageUid,
    secureEpoch: params.context.secureEpoch,
  });
  const aad = buildMessageAad(params.context);
  const plaintext = utf8ToBytes(stableStringify(params.payload as unknown as JsonValue));
  try {
    const { nonce, ciphertext } = encryptMessage({ key, plaintext, aad });
    return {
      aadVersion: SECURE_AAD_VERSION,
      cipherSuite: 'x25519+hkdf-sha256+chacha20poly1305',
      nonceB64u: toBase64Url(nonce),
      ciphertextB64u: toBase64Url(ciphertext),
    };
  } finally {
    wipe(key);
    wipe(plaintext);
    wipe(aad);
  }
}

export function decryptSecurePayloadV1(params: {
  roomKey: Uint8Array | string;
  envelope: SecureEnvelopeV1;
  context: SessionContextV1;
}): SecurePayloadV1 {
  ensure(params.envelope.aadVersion === SECURE_AAD_VERSION, 'unsupported aadVersion');
  ensure(params.envelope.cipherSuite === 'x25519+hkdf-sha256+chacha20poly1305', 'unsupported cipherSuite');

  const key = deriveMessageKey({
    roomKey: params.roomKey,
    messageUid: params.context.messageUid,
    secureEpoch: params.context.secureEpoch,
  });
  const aad = buildMessageAad(params.context);
  try {
    const plaintext = decryptMessage({
      key,
      ciphertext: params.envelope.ciphertextB64u,
      aad,
      nonce: params.envelope.nonceB64u,
    });
    const parsed = JSON.parse(bytesToUtf8(plaintext)) as SecurePayloadV1;
    ensure(parsed.version === 1, 'unsupported secure payload version');
    return parsed;
  } finally {
    wipe(key);
    wipe(aad);
  }
}

export function wrapRoomEpochKeyForRecipient(params: {
  roomEpochKey: Uint8Array | string;
  recipientIdentityPublicKey: Uint8Array | string;
  roomId: string | number;
  epoch: number;
}): WrappedEpochKeyV1 {
  const epochKey = typeof params.roomEpochKey === 'string' ? fromBase64Url(params.roomEpochKey) : params.roomEpochKey;
  const recipientPub = typeof params.recipientIdentityPublicKey === 'string'
    ? fromBase64Url(params.recipientIdentityPublicKey)
    : params.recipientIdentityPublicKey;

  requireLength(epochKey, CHACHA20POLY1305_KEY_BYTES, 'room epoch key');
  requireLength(recipientPub, X25519_PUBLIC_KEY_BYTES, 'recipient identity public key');

  const eph = generateX25519KeyPair();
  const shared = deriveX25519SharedSecret(eph.privateKey, recipientPub);
  const wrapKey = hkdfSha256({
    ikm: shared,
    salt: utf8ToBytes('coonn-room-epoch-wrap/v1'),
    info: utf8ToBytes(stableStringify({ roomId: String(params.roomId), epoch: params.epoch })),
    length: CHACHA20POLY1305_KEY_BYTES,
  });
  const nonce = randomBytes(XCHACHA20POLY1305_NONCE_BYTES);
  const cipher = xchacha20poly1305(wrapKey, nonce);
  const ciphertext = cipher.encrypt(epochKey);

  try {
    return {
      version: 1,
      curve: 'x25519',
      kdf: 'hkdf-sha256',
      cipher: 'xchacha20poly1305',
      ephemeralPublicKeyB64u: toBase64Url(eph.publicKey),
      nonceB64u: toBase64Url(nonce),
      ciphertextB64u: toBase64Url(ciphertext),
    };
  } finally {
    wipe(eph.privateKey);
    wipe(eph.publicKey);
    wipe(shared);
    wipe(wrapKey);
  }
}

export function unwrapRoomEpochKeyFromSender(params: {
  wrapped: WrappedEpochKeyV1;
  recipientIdentityPrivateKey: Uint8Array | string;
  roomId: string | number;
  epoch: number;
}): Uint8Array {
  ensure(params.wrapped.version === 1, 'unsupported wrapped room key version');
  ensure(params.wrapped.curve === 'x25519', 'unsupported wrap curve');
  ensure(params.wrapped.kdf === 'hkdf-sha256', 'unsupported wrap kdf');
  ensure(params.wrapped.cipher === 'xchacha20poly1305', 'unsupported wrap cipher');

  const recipientPriv = typeof params.recipientIdentityPrivateKey === 'string'
    ? fromBase64Url(params.recipientIdentityPrivateKey)
    : params.recipientIdentityPrivateKey;
  const ephPub = fromBase64Url(params.wrapped.ephemeralPublicKeyB64u);
  const nonce = fromBase64Url(params.wrapped.nonceB64u);
  const ciphertext = fromBase64Url(params.wrapped.ciphertextB64u);

  requireLength(recipientPriv, X25519_PRIVATE_KEY_BYTES, 'recipient identity private key');
  requireLength(ephPub, X25519_PUBLIC_KEY_BYTES, 'ephemeral public key');
  requireLength(nonce, XCHACHA20POLY1305_NONCE_BYTES, 'xchacha20poly1305 nonce');

  const shared = deriveX25519SharedSecret(recipientPriv, ephPub);
  const wrapKey = hkdfSha256({
    ikm: shared,
    salt: utf8ToBytes('coonn-room-epoch-wrap/v1'),
    info: utf8ToBytes(stableStringify({ roomId: String(params.roomId), epoch: params.epoch })),
    length: CHACHA20POLY1305_KEY_BYTES,
  });

  try {
    return xchacha20poly1305(wrapKey, nonce).decrypt(ciphertext);
  } finally {
    wipe(shared);
    wipe(wrapKey);
  }
}


export type SecureKeyBackupRoomEpochV1 = {
  version: 1;
  roomId: string | number;
  epoch: number;
  roomKeyB64u: string;
  keyFingerprint?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SecureKeyBackupPayloadV1 = {
  version: 1;
  exportedAt: string;
  userId?: string | null;
  rooms: Array<{
    roomId: string | number;
    epochs: SecureKeyBackupRoomEpochV1[];
  }>;
  meta?: Record<string, JsonValue>;
};

export type SecureKeyBackupEnvelopeV1 = {
  version: 1;
  cipher: 'xchacha20poly1305';
  kdf: 'recovery-code-hkdf-sha256';
  saltB64u: string;
  nonceB64u: string;
  ciphertextB64u: string;
  createdAt: string;
  meta?: Record<string, JsonValue>;
};

const SECURE_BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SECURE_BACKUP_CODE_PREFIX = 'COONN';
const SECURE_BACKUP_CODE_LENGTH = 32;
const SECURE_BACKUP_SALT_BYTES = 32;
const SECURE_BACKUP_AAD_TYPE = 'coonn.secure.key_backup.v1';

function nowIsoForSecureBackup(): string {
  return new Date().toISOString();
}

function normalizeSecureBackupRecoveryCodeInternal(input: string): string {
  const compact = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '');
  const withoutPrefix = compact.startsWith(SECURE_BACKUP_CODE_PREFIX)
    ? compact.slice(SECURE_BACKUP_CODE_PREFIX.length)
    : compact;
  ensure(
    withoutPrefix.length === SECURE_BACKUP_CODE_LENGTH,
    'invalid secure backup recovery code length',
  );
  for (const ch of withoutPrefix) {
    ensure(SECURE_BACKUP_CODE_ALPHABET.includes(ch), 'invalid secure backup recovery code');
  }
  return withoutPrefix;
}

export function normalizeSecureBackupRecoveryCode(input: string): string {
  return normalizeSecureBackupRecoveryCodeInternal(input);
}

export function formatSecureBackupRecoveryCode(input: string): string {
  const code = normalizeSecureBackupRecoveryCodeInternal(input);
  const groups = code.match(/.{1,8}/g) ?? [code];
  return `${SECURE_BACKUP_CODE_PREFIX}-${groups.join('-')}`;
}

export function generateSecureBackupRecoveryCode(): string {
  const bytes = randomBytes(SECURE_BACKUP_CODE_LENGTH);
  try {
    let code = '';
    for (const b of bytes) code += SECURE_BACKUP_CODE_ALPHABET[b & 31]!;
    return formatSecureBackupRecoveryCode(code);
  } finally {
    wipe(bytes);
  }
}

function buildSecureBackupAad(params: { userId?: string | null }): Uint8Array {
  return utf8ToBytes(stableStringify({
    v: 1,
    type: SECURE_BACKUP_AAD_TYPE,
    userId: params.userId ? String(params.userId) : null,
  }));
}

function deriveSecureBackupKey(params: {
  recoveryCode: string;
  saltB64u: string;
}): Uint8Array {
  const code = normalizeSecureBackupRecoveryCodeInternal(params.recoveryCode);
  const salt = fromBase64Url(params.saltB64u);
  requireLength(salt, SECURE_BACKUP_SALT_BYTES, 'secure backup salt');
  return hkdfSha256({
    ikm: utf8ToBytes(code),
    salt,
    info: utf8ToBytes(SECURE_BACKUP_AAD_TYPE),
    length: CHACHA20POLY1305_KEY_BYTES,
  });
}

export function encryptSecureKeyBackupV1(params: {
  recoveryCode: string;
  payload: SecureKeyBackupPayloadV1;
  userId?: string | null;
  meta?: Record<string, JsonValue>;
}): SecureKeyBackupEnvelopeV1 {
  ensure(params.payload.version === 1, 'secure key backup payload version must be 1');
  const salt = randomBytes(SECURE_BACKUP_SALT_BYTES);
  const nonce = randomBytes(XCHACHA20POLY1305_NONCE_BYTES);
  const saltB64u = toBase64Url(salt);
  const key = deriveSecureBackupKey({ recoveryCode: params.recoveryCode, saltB64u });
  const aad = buildSecureBackupAad({ userId: params.userId });
  const plaintext = utf8ToBytes(stableStringify(params.payload as unknown as JsonValue));
  try {
    const cipher = xchacha20poly1305(key, nonce, aad);
    const ciphertext = cipher.encrypt(plaintext);
    return {
      version: 1,
      cipher: 'xchacha20poly1305',
      kdf: 'recovery-code-hkdf-sha256',
      saltB64u,
      nonceB64u: toBase64Url(nonce),
      ciphertextB64u: toBase64Url(ciphertext),
      createdAt: nowIsoForSecureBackup(),
      meta: params.meta ?? {},
    };
  } finally {
    wipe(salt);
    wipe(nonce);
    wipe(key);
    wipe(aad);
    wipe(plaintext);
  }
}

export function decryptSecureKeyBackupV1(params: {
  recoveryCode: string;
  envelope: SecureKeyBackupEnvelopeV1;
  userId?: string | null;
}): SecureKeyBackupPayloadV1 {
  ensure(params.envelope.version === 1, 'unsupported secure key backup version');
  ensure(params.envelope.cipher === 'xchacha20poly1305', 'unsupported secure key backup cipher');
  ensure(params.envelope.kdf === 'recovery-code-hkdf-sha256', 'unsupported secure key backup kdf');

  const key = deriveSecureBackupKey({
    recoveryCode: params.recoveryCode,
    saltB64u: params.envelope.saltB64u,
  });
  const aad = buildSecureBackupAad({ userId: params.userId });
  const nonce = fromBase64Url(params.envelope.nonceB64u);
  const ciphertext = fromBase64Url(params.envelope.ciphertextB64u);
  requireLength(nonce, XCHACHA20POLY1305_NONCE_BYTES, 'secure backup nonce');

  try {
    const plaintext = xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
    try {
      const parsed = JSON.parse(bytesToUtf8(plaintext)) as SecureKeyBackupPayloadV1;
      ensure(parsed.version === 1, 'unsupported secure key backup payload version');
      return parsed;
    } finally {
      wipe(plaintext);
    }
  } finally {
    wipe(key);
    wipe(aad);
    wipe(nonce);
    wipe(ciphertext);
  }
}

export function hashSecureKeyBackupEnvelope(envelope: SecureKeyBackupEnvelopeV1): string {
  const bytes = utf8ToBytes(stableStringify(envelope as unknown as JsonValue));
  try {
    return `sha256:${toBase64Url(sha256(bytes))}`;
  } finally {
    wipe(bytes);
  }
}

export function serializePayload(payload: SecurePayloadV1): string {
  return stableStringify(payload as unknown as JsonValue);
}

export function deserializePayload(json: string): SecurePayloadV1 {
  const parsed = JSON.parse(json) as SecurePayloadV1;
  ensure(parsed.version === 1, 'unsupported secure payload version');
  return parsed;
}

export function toB64u(bytes: Uint8Array): string {
  return toBase64Url(bytes);
}

export function fromB64u(b64u: string): Uint8Array {
  return fromBase64Url(b64u);
}
