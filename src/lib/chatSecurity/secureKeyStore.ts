import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import i18next from 'i18next';
import {
  CHACHA20POLY1305_KEY_BYTES,
  decryptMessage,
  encryptMessage,
  fromB64u,
  generateRoomEpochKey,
  fingerprintRoomEpochKey,
  generateEd25519KeyPairB64u,
  generateX25519KeyPairB64u,
  getX25519PublicKeyFromPrivate,
  hkdfSha256,
  buildSignedPreKeySignaturePayload,
  randomBytes,
  signEd25519B64u,
  toB64u,
  unwrapRoomEpochKeyFromSender,
  verifyEd25519B64u,
  type WrappedEpochKeyV1,
  type SecureKeyBackupPayloadV1,
} from './secureCrypto';

const NS = 'coonn.secure.keystore.v3';
const MASTER_KEY_ALIAS = `${NS}.master_key`;
const DEFAULT_PROMPT = 'Authenticate to use secure message keys.';
const MASTER_LENGTH = CHACHA20POLY1305_KEY_BYTES;
const VAULT_AAD = `${NS}.vault`;
const VAULT_KDF_SALT = `${NS}.vault_key`;
const VAULT_KDF_INFO = `${NS}.vault_key_info`;
const VAULT_FILE_NAME = 'keystore-v1.enc';
const VAULT_DIR_NAME = 'secure-keystore';

function securePrompt(key: string, fallback: string): string {
  return String(i18next.t(`chat:secure.prompt.${key}`, { defaultValue: fallback }));
}

function defaultSecurePrompt(): string {
  return securePrompt('keyUse', DEFAULT_PROMPT);
}

const SECURE_STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const MASTER_KEY_STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

export type SecureUnlockOptions = {
  promptMessage?: string;
  cancelLabel?: string;
  disableDeviceFallback?: boolean;
};

export type IdentityKeyPairRecord = {
  version: 1;
  deviceId: string;
  keyVersion: number;
  privateKeyB64u: string;
  publicKeyB64u: string;
  createdAt: string;
  updatedAt: string;
};

export type SigningIdentityKeyPairRecord = {
  version: 1;
  deviceId: string;
  algorithm: 'ed25519';
  privateKeyB64u: string;
  publicKeyB64u: string;
  createdAt: string;
  updatedAt: string;
};

export type SignedPreKeyRecord = {
  version: 1;
  deviceId: string;
  keyId: number;
  privateKeyB64u: string;
  publicKeyB64u: string;
  signatureB64u: string;
  createdAt: string;
  expiresAt?: string | null;
  retiredAt?: string | null;
};

export type OneTimePreKeyRecord = {
  version: 1;
  deviceId: string;
  keyId: number;
  privateKeyB64u: string;
  publicKeyB64u: string;
  createdAt: string;
  consumedAt?: string | null;
};

export type SessionRootKeyRecord = {
  version: 1;
  sessionId: string;
  roomId: string | number;
  peerUserId: string;
  peerDeviceId?: string | null;
  rootKeyB64u: string;
  createdAt: string;
  updatedAt: string;
};

export type RoomEpochKeyRecord = {
  version: 1;
  roomId: string | number;
  epoch: number;
  roomKeyB64u: string;
  keyFingerprint?: string | null;
  source: 'local' | 'claimed' | 'transferred' | 'backup';
  wrappedFromUserId?: string | null;
  wrappedFromDeviceId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type VaultEnvelopeV1 = {
  version: 1;
  nonceB64u: string;
  ciphertextB64u: string;
};

type VaultV1 = {
  version: 1;
  updatedAt: string;
  identityKeys: Record<string, IdentityKeyPairRecord>;
  signingIdentityKeys: Record<string, SigningIdentityKeyPairRecord>;
  signedPreKeys: Record<string, SignedPreKeyRecord>;
  oneTimePreKeys: Record<string, OneTimePreKeyRecord>;
  sessionRoots: Record<string, SessionRootKeyRecord>;
  roomEpochKeys: Record<string, RoomEpochKeyRecord>;
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function wipe(bytes?: Uint8Array | null) {
  if (!bytes) return;
  try { bytes.fill(0); } catch {}
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRoomId(roomId: string | number): string {
  return String(roomId);
}

function ensureNonEmptyString(value: string | null | undefined, label: string): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length > 0, `${label} is required`);
}

function ensurePositiveInt(value: number, label: string) {
  ensure(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyVault(): VaultV1 {
  return {
    version: 1,
    updatedAt: nowIso(),
    identityKeys: {},
    signingIdentityKeys: {},
    signedPreKeys: {},
    oneTimePreKeys: {},
    sessionRoots: {},
    roomEpochKeys: {},
  };
}

function vaultFileUri(): string {
  ensure(typeof FileSystem.documentDirectory === 'string' && FileSystem.documentDirectory.length > 0, 'documentDirectory is unavailable');
  return `${FileSystem.documentDirectory}${VAULT_DIR_NAME}/${VAULT_FILE_NAME}`;
}

async function ensureVaultDir(): Promise<void> {
  ensure(typeof FileSystem.documentDirectory === 'string' && FileSystem.documentDirectory.length > 0, 'documentDirectory is unavailable');
  const dirUri = `${FileSystem.documentDirectory}${VAULT_DIR_NAME}`;
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
}

async function fileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return !!info.exists;
}

async function deleteIfExists(uri: string): Promise<void> {
  if (await fileExists(uri)) await FileSystem.deleteAsync(uri, { idempotent: true });
}

async function writeFileAtomic(finalUri: string, contents: string): Promise<void> {
  await ensureVaultDir();

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempUri = `${finalUri}.tmp.${stamp}`;
  const backupUri = `${finalUri}.bak`;
  const finalExists = await fileExists(finalUri);

  await FileSystem.writeAsStringAsync(tempUri, contents, { encoding: FileSystem.EncodingType.UTF8 });

  if (finalExists) {
    await deleteIfExists(backupUri);
    await FileSystem.moveAsync({ from: finalUri, to: backupUri });
  }

  try {
    await FileSystem.moveAsync({ from: tempUri, to: finalUri });
    await deleteIfExists(backupUri);
  } catch (error) {
    try {
      const backupExists = await fileExists(backupUri);
      const finalMissing = !(await fileExists(finalUri));
      if (backupExists && finalMissing) {
        await FileSystem.moveAsync({ from: backupUri, to: finalUri });
      }
    } catch {}
    throw error;
  } finally {
    await deleteIfExists(tempUri);
  }
}

function serializeVaultEnvelope(env: VaultEnvelopeV1): string {
  return JSON.stringify(env);
}

function deserializeVaultEnvelope(raw: string): VaultEnvelopeV1 {
  const parsed = JSON.parse(raw) as Partial<VaultEnvelopeV1>;
  ensure(parsed.version === 1, 'unsupported keystore envelope version');
  ensure(typeof parsed.nonceB64u === 'string' && parsed.nonceB64u.length > 0, 'invalid keystore envelope nonce');
  ensure(typeof parsed.ciphertextB64u === 'string' && parsed.ciphertextB64u.length > 0, 'invalid keystore envelope ciphertext');
  return parsed as VaultEnvelopeV1;
}

function normalizeVault(raw: unknown): VaultV1 {
  const v = (raw ?? {}) as Partial<VaultV1>;
  return {
    version: 1,
    updatedAt: typeof v.updatedAt === 'string' && v.updatedAt ? v.updatedAt : nowIso(),
    identityKeys: typeof v.identityKeys === 'object' && v.identityKeys ? (v.identityKeys as Record<string, IdentityKeyPairRecord>) : {},
    signingIdentityKeys: typeof (v as any).signingIdentityKeys === 'object' && (v as any).signingIdentityKeys ? ((v as any).signingIdentityKeys as Record<string, SigningIdentityKeyPairRecord>) : {},
    signedPreKeys: typeof v.signedPreKeys === 'object' && v.signedPreKeys ? (v.signedPreKeys as Record<string, SignedPreKeyRecord>) : {},
    oneTimePreKeys: typeof v.oneTimePreKeys === 'object' && v.oneTimePreKeys ? (v.oneTimePreKeys as Record<string, OneTimePreKeyRecord>) : {},
    sessionRoots: typeof v.sessionRoots === 'object' && v.sessionRoots ? (v.sessionRoots as Record<string, SessionRootKeyRecord>) : {},
    roomEpochKeys: typeof v.roomEpochKeys === 'object' && v.roomEpochKeys ? (v.roomEpochKeys as Record<string, RoomEpochKeyRecord>) : {},
  };
}

function deriveVaultKey(masterKey: Uint8Array): Uint8Array {
  // IMPORTANT:
  // hkdfSha256 treats string salt/info as base64url-encoded key material.
  // These vault KDF labels are plain domain-separation strings, so they must be UTF-8 bytes.
  // Passing them as raw strings causes RN/atob to throw:
  // "Found invalid character when decoding base64 string".
  const encoder = new TextEncoder();
  return hkdfSha256({
    ikm: masterKey,
    salt: encoder.encode(VAULT_KDF_SALT),
    info: encoder.encode(VAULT_KDF_INFO),
    length: CHACHA20POLY1305_KEY_BYTES,
  });
}

function identityRecordKey(deviceId: string): string {
  return deviceId;
}

function signingIdentityRecordKey(deviceId: string): string {
  return deviceId;
}

function signedPreKeyRecordKey(deviceId: string, keyId: number): string {
  return `${deviceId}:${keyId}`;
}

function oneTimePreKeyRecordKey(deviceId: string, keyId: number): string {
  return `${deviceId}:${keyId}`;
}

function sessionRootRecordKey(sessionId: string): string {
  return sessionId;
}

function roomEpochRecordKey(roomId: string | number, epoch: number): string {
  return `${normalizeRoomId(roomId)}:${epoch}`;
}

export class SecureKeyStore {
  private masterKey: Uint8Array | null = null;
  private unlocked = false;
  private vault: VaultV1 = createEmptyVault();
  private opQueue: Promise<void> = Promise.resolve();

  isUnlocked(): boolean {
    return this.unlocked && this.masterKey !== null;
  }

  async assertBiometricReady(): Promise<void> {
    const [secureStoreAvailable, hasHardware, isEnrolled] = await Promise.all([
      SecureStore.isAvailableAsync(),
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);

    ensure(secureStoreAvailable, 'SecureStore is unavailable on this device');
    ensure(hasHardware, 'biometric hardware is not available');
    ensure(isEnrolled, 'no biometric credential is enrolled on this device');
  }

  async unlock(options: SecureUnlockOptions = {}): Promise<void> {
    if (this.isUnlocked()) return;

    await this.assertBiometricReady();

    const fileUri = vaultFileUri();
    const hasVault = await fileExists(fileUri);
    const masterKeyB64u = await SecureStore.getItemAsync(MASTER_KEY_ALIAS, {
      ...MASTER_KEY_STORE_OPTS,
      authenticationPrompt: options.promptMessage ?? defaultSecurePrompt(),
    });

    if (!masterKeyB64u) {
      if (hasVault) {
        throw new Error('secure keystore master key is unavailable; biometric settings may have changed');
      }

      const mk = randomBytes(MASTER_LENGTH);
      try {
        await SecureStore.setItemAsync(MASTER_KEY_ALIAS, toB64u(mk), {
          ...MASTER_KEY_STORE_OPTS,
          authenticationPrompt: options.promptMessage ?? defaultSecurePrompt(),
        });
        this.masterKey = mk.slice();
        this.unlocked = true;
        this.vault = createEmptyVault();
        await this.persistVault();
      } finally {
        wipe(mk);
      }
      return;
    }

    const mk = fromB64u(masterKeyB64u);
    this.masterKey = mk;
    this.unlocked = true;

    try {
      this.vault = await this.readVaultFromDisk();
    } catch (error) {
      this.lock();
      throw error;
    }
  }

  lock(): void {
    wipe(this.masterKey);
    this.masterKey = null;
    this.unlocked = false;
    this.vault = createEmptyVault();
  }

  async removeAllPersisted(options: { deleteMasterKey?: boolean } = {}): Promise<void> {
    await this.runExclusive(async () => {
      const fileUri = vaultFileUri();
      await deleteIfExists(fileUri);
      await deleteIfExists(`${fileUri}.bak`);
      if (options.deleteMasterKey) {
        await SecureStore.deleteItemAsync(MASTER_KEY_ALIAS, MASTER_KEY_STORE_OPTS);
      }
      this.lock();
    });
  }

  async rotateMasterKey(options: SecureUnlockOptions = {}): Promise<void> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    const currentVault = clone(this.vault);

    const fresh = randomBytes(MASTER_LENGTH);
    try {
      await SecureStore.setItemAsync(MASTER_KEY_ALIAS, toB64u(fresh), {
        ...MASTER_KEY_STORE_OPTS,
        authenticationPrompt: options.promptMessage ?? defaultSecurePrompt(),
      });
      wipe(this.masterKey);
      this.masterKey = fresh.slice();
      this.vault = currentVault;
      await this.persistVault();
    } finally {
      wipe(fresh);
    }
  }

  private requireMasterKey(): Uint8Array {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return this.masterKey as Uint8Array;
  }

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.opQueue;
    let release!: () => void;
    this.opQueue = new Promise<void>((resolve) => { release = resolve; });

    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async persistVault(): Promise<void> {
    const masterKey = this.requireMasterKey();
    const vaultKey = deriveVaultKey(masterKey);
    const plaintext = new TextEncoder().encode(JSON.stringify({
      ...this.vault,
      updatedAt: nowIso(),
    }));

    try {
      const { nonce, ciphertext } = encryptMessage({ key: vaultKey, plaintext, aad: VAULT_AAD });
      const env: VaultEnvelopeV1 = { version: 1, nonceB64u: toB64u(nonce), ciphertextB64u: toB64u(ciphertext) };
      await writeFileAtomic(vaultFileUri(), serializeVaultEnvelope(env));
    } finally {
      wipe(vaultKey);
      wipe(plaintext);
    }
  }

  private async readVaultFromDisk(): Promise<VaultV1> {
    const fileUri = vaultFileUri();
    if (!(await fileExists(fileUri))) return createEmptyVault();

    const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
    const env = deserializeVaultEnvelope(raw);
    const vaultKey = deriveVaultKey(this.requireMasterKey());

    try {
      const plaintext = decryptMessage({
        key: vaultKey,
        nonce: env.nonceB64u,
        ciphertext: env.ciphertextB64u,
        aad: VAULT_AAD,
      });
      try {
        return normalizeVault(JSON.parse(new TextDecoder().decode(plaintext)));
      } finally {
        wipe(plaintext);
      }
    } finally {
      wipe(vaultKey);
    }
  }

  async createAndStoreIdentityKeyPair(deviceId: string, keyVersion = 1): Promise<IdentityKeyPairRecord> {
    ensureNonEmptyString(deviceId, 'deviceId');
    const kp = generateX25519KeyPairB64u();
    const now = nowIso();
    const record: IdentityKeyPairRecord = {
      version: 1,
      deviceId,
      keyVersion: Math.max(1, Math.trunc(keyVersion || 1)),
      privateKeyB64u: kp.privateKeyB64u,
      publicKeyB64u: kp.publicKeyB64u,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveIdentityKeyPair(record);
    return record;
  }

  async saveIdentityKeyPair(record: IdentityKeyPairRecord): Promise<void> {
    ensure(record.version === 1, 'unsupported identity key record version');
    ensureNonEmptyString(record.deviceId, 'deviceId');
    await this.runExclusive(async () => {
      this.vault.identityKeys[identityRecordKey(record.deviceId)] = clone(record);
      await this.persistVault();
    });
  }

  async getIdentityKeyPair(deviceId: string): Promise<IdentityKeyPairRecord | null> {
    ensureNonEmptyString(deviceId, 'deviceId');
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return clone(this.vault.identityKeys[identityRecordKey(deviceId)] ?? null);
  }

  async listIdentityDeviceIds(): Promise<string[]> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return Object.keys(this.vault.identityKeys).sort();
  }

  async getPreferredLocalDeviceId(): Promise<string | null> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    const records = Object.values(this.vault.identityKeys);
    if (records.length === 0) return null;
    records.sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
      if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return a.deviceId.localeCompare(b.deviceId);
    });
    return records[0]?.deviceId ?? null;
  }

  async deleteIdentityKeyPair(deviceId: string): Promise<void> {
    ensureNonEmptyString(deviceId, 'deviceId');
    await this.runExclusive(async () => {
      delete this.vault.identityKeys[identityRecordKey(deviceId)];
      await this.persistVault();
    });
  }

  async getIdentityPublicKey(deviceId: string): Promise<string | null> {
    const record = await this.getIdentityKeyPair(deviceId);
    return record?.publicKeyB64u ?? null;
  }

  async createAndStoreSigningIdentityKeyPair(deviceId: string): Promise<SigningIdentityKeyPairRecord> {
    ensureNonEmptyString(deviceId, 'deviceId');
    const kp = generateEd25519KeyPairB64u();
    const now = nowIso();
    const record: SigningIdentityKeyPairRecord = {
      version: 1,
      deviceId,
      algorithm: 'ed25519',
      privateKeyB64u: kp.privateKeyB64u,
      publicKeyB64u: kp.publicKeyB64u,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveSigningIdentityKeyPair(record);
    return record;
  }

  async saveSigningIdentityKeyPair(record: SigningIdentityKeyPairRecord): Promise<void> {
    ensure(record.version === 1, 'unsupported signing identity key record version');
    ensure(record.algorithm === 'ed25519', 'unsupported signing identity algorithm');
    ensureNonEmptyString(record.deviceId, 'deviceId');
    await this.runExclusive(async () => {
      this.vault.signingIdentityKeys[signingIdentityRecordKey(record.deviceId)] = clone(record);
      await this.persistVault();
    });
  }

  async getSigningIdentityKeyPair(deviceId: string): Promise<SigningIdentityKeyPairRecord | null> {
    ensureNonEmptyString(deviceId, 'deviceId');
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return clone(this.vault.signingIdentityKeys[signingIdentityRecordKey(deviceId)] ?? null);
  }

  async ensureSigningIdentityKeyPair(deviceId: string): Promise<SigningIdentityKeyPairRecord> {
    const existing = await this.getSigningIdentityKeyPair(deviceId);
    if (existing) return existing;
    return this.createAndStoreSigningIdentityKeyPair(deviceId);
  }

  private async signSignedPreKeyPublicKey(deviceId: string, keyId: number, publicKeyB64u: string): Promise<string> {
    const signing = await this.ensureSigningIdentityKeyPair(deviceId);
    const message = buildSignedPreKeySignaturePayload({
      deviceId,
      signingIdentityPublicKeyB64u: signing.publicKeyB64u,
      signedPreKeyId: keyId,
      signedPreKeyPublicKeyB64u: publicKeyB64u,
    });
    return signEd25519B64u({ privateKeyB64u: signing.privateKeyB64u, message });
  }

  async verifySignedPreKeySignature(record: SignedPreKeyRecord): Promise<boolean> {
    const signing = await this.getSigningIdentityKeyPair(record.deviceId);
    if (!signing) return false;
    const message = buildSignedPreKeySignaturePayload({
      deviceId: record.deviceId,
      signingIdentityPublicKeyB64u: signing.publicKeyB64u,
      signedPreKeyId: record.keyId,
      signedPreKeyPublicKeyB64u: record.publicKeyB64u,
    });
    try {
      return verifyEd25519B64u({ publicKeyB64u: signing.publicKeyB64u, message, signatureB64u: record.signatureB64u });
    } catch {
      return false;
    }
  }

  async createAndStoreSignedPreKey(params: { deviceId: string; keyId: number; signatureB64u?: string | null; expiresAt?: string | null; }): Promise<SignedPreKeyRecord> {
    ensureNonEmptyString(params.deviceId, 'deviceId');
    ensurePositiveInt(params.keyId, 'signed prekey keyId');

    await this.ensureSigningIdentityKeyPair(params.deviceId);
    const kp = generateX25519KeyPairB64u();
    const signatureB64u = params.signatureB64u?.trim() || await this.signSignedPreKeyPublicKey(params.deviceId, params.keyId, kp.publicKeyB64u);
    ensureNonEmptyString(signatureB64u, 'signed prekey signature');

    const record: SignedPreKeyRecord = {
      version: 1,
      deviceId: params.deviceId,
      keyId: params.keyId,
      privateKeyB64u: kp.privateKeyB64u,
      publicKeyB64u: kp.publicKeyB64u,
      signatureB64u,
      createdAt: nowIso(),
      expiresAt: params.expiresAt ?? null,
      retiredAt: null,
    };
    await this.saveSignedPreKey(record);
    return record;
  }

  async saveSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
    ensure(record.version === 1, 'unsupported signed prekey record version');
    ensureNonEmptyString(record.deviceId, 'deviceId');
    ensurePositiveInt(record.keyId, 'signed prekey keyId');
    const key = signedPreKeyRecordKey(record.deviceId, record.keyId);
    await this.runExclusive(async () => {
      this.vault.signedPreKeys[key] = clone(record);
      await this.persistVault();
    });
  }

  async getSignedPreKey(deviceId: string, keyId: number): Promise<SignedPreKeyRecord | null> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return clone(this.vault.signedPreKeys[signedPreKeyRecordKey(deviceId, keyId)] ?? null);
  }

  async retireSignedPreKey(deviceId: string, keyId: number, retiredAt = nowIso()): Promise<void> {
    const record = await this.getSignedPreKey(deviceId, keyId);
    if (!record) return;
    record.retiredAt = retiredAt;
    await this.saveSignedPreKey(record);
  }

  async deleteSignedPreKey(deviceId: string, keyId: number): Promise<void> {
    const key = signedPreKeyRecordKey(deviceId, keyId);
    await this.runExclusive(async () => {
      delete this.vault.signedPreKeys[key];
      await this.persistVault();
    });
  }

  async createAndStoreOneTimePreKey(deviceId: string, keyId: number): Promise<OneTimePreKeyRecord> {
    ensureNonEmptyString(deviceId, 'deviceId');
    ensurePositiveInt(keyId, 'one-time prekey keyId');
    const kp = generateX25519KeyPairB64u();
    const record: OneTimePreKeyRecord = {
      version: 1,
      deviceId,
      keyId,
      privateKeyB64u: kp.privateKeyB64u,
      publicKeyB64u: kp.publicKeyB64u,
      createdAt: nowIso(),
      consumedAt: null,
    };
    await this.saveOneTimePreKey(record);
    return record;
  }

  async saveOneTimePreKey(record: OneTimePreKeyRecord): Promise<void> {
    ensure(record.version === 1, 'unsupported one-time prekey record version');
    ensureNonEmptyString(record.deviceId, 'deviceId');
    ensurePositiveInt(record.keyId, 'one-time prekey keyId');
    const key = oneTimePreKeyRecordKey(record.deviceId, record.keyId);
    await this.runExclusive(async () => {
      this.vault.oneTimePreKeys[key] = clone(record);
      await this.persistVault();
    });
  }

  async getOneTimePreKey(deviceId: string, keyId: number): Promise<OneTimePreKeyRecord | null> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return clone(this.vault.oneTimePreKeys[oneTimePreKeyRecordKey(deviceId, keyId)] ?? null);
  }

  async markOneTimePreKeyConsumed(deviceId: string, keyId: number, consumedAt = nowIso()): Promise<void> {
    const record = await this.getOneTimePreKey(deviceId, keyId);
    if (!record) return;
    record.consumedAt = consumedAt;
    await this.saveOneTimePreKey(record);
  }

  async deleteOneTimePreKey(deviceId: string, keyId: number): Promise<void> {
    const key = oneTimePreKeyRecordKey(deviceId, keyId);
    await this.runExclusive(async () => {
      delete this.vault.oneTimePreKeys[key];
      await this.persistVault();
    });
  }

  async listOneTimePreKeys(deviceId?: string): Promise<OneTimePreKeyRecord[]> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    const values = Object.values(this.vault.oneTimePreKeys)
      .filter((item) => !deviceId || item.deviceId === deviceId)
      .sort((a, b) => a.keyId - b.keyId);
    return clone(values);
  }

  async saveSessionRootKey(record: SessionRootKeyRecord): Promise<void> {
    ensure(record.version === 1, 'unsupported session root record version');
    ensureNonEmptyString(record.sessionId, 'sessionId');
    const key = sessionRootRecordKey(record.sessionId);
    await this.runExclusive(async () => {
      this.vault.sessionRoots[key] = clone(record);
      await this.persistVault();
    });
  }

  async getSessionRootKey(sessionId: string): Promise<SessionRootKeyRecord | null> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return clone(this.vault.sessionRoots[sessionRootRecordKey(sessionId)] ?? null);
  }

  async deleteSessionRootKey(sessionId: string): Promise<void> {
    const key = sessionRootRecordKey(sessionId);
    await this.runExclusive(async () => {
      delete this.vault.sessionRoots[key];
      await this.persistVault();
    });
  }

  async saveRoomEpochKey(record: RoomEpochKeyRecord): Promise<void> {
    ensure(record.version === 1, 'unsupported room epoch key record version');
    ensurePositiveInt(record.epoch, 'epoch');
    const key = roomEpochRecordKey(record.roomId, record.epoch);
    await this.runExclusive(async () => {
      this.vault.roomEpochKeys[key] = clone(record);
      await this.persistVault();
    });
  }

  async createAndStoreRoomEpochKey(roomId: string | number, epoch: number): Promise<RoomEpochKeyRecord> {
    ensurePositiveInt(epoch, 'epoch');
    const roomKeyBytes = generateRoomEpochKey();
    try {
      const record: RoomEpochKeyRecord = {
        version: 1,
        roomId,
        epoch,
        roomKeyB64u: toB64u(roomKeyBytes),
        keyFingerprint: fingerprintRoomEpochKey(roomKeyBytes),
        source: 'local',
        wrappedFromUserId: null,
        wrappedFromDeviceId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await this.saveRoomEpochKey(record);
      return record;
    } finally {
      wipe(roomKeyBytes);
    }
  }

  async getRoomEpochKey(roomId: string | number, epoch: number): Promise<RoomEpochKeyRecord | null> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    return clone(this.vault.roomEpochKeys[roomEpochRecordKey(roomId, epoch)] ?? null);
  }

  async getRoomEpochKeyB64u(roomId: string | number, epoch: number): Promise<string | null> {
    const record = await this.getRoomEpochKey(roomId, epoch);
    return record?.roomKeyB64u ?? null;
  }

  async unwrapAndStoreRoomEpochKey(params: {
    roomId: string | number;
    epoch: number;
    wrapped: WrappedEpochKeyV1;
    recipientDeviceId?: string;
    recipientIdentityPrivateKeyB64u?: string;
    wrappedFromUserId?: string | null;
    wrappedFromDeviceId?: string | null;
    source?: 'claimed' | 'transferred' | 'backup';
  }): Promise<RoomEpochKeyRecord> {
    let recipientIdentityPrivateKeyB64u = params.recipientIdentityPrivateKeyB64u?.trim() || '';
    if (!recipientIdentityPrivateKeyB64u) {
      ensureNonEmptyString(params.recipientDeviceId, 'recipientDeviceId');
      const identity = await this.getIdentityKeyPair(params.recipientDeviceId);
      ensure(identity, 'identity key not found for device');
      recipientIdentityPrivateKeyB64u = identity.privateKeyB64u;
    }

    const roomKeyBytes = unwrapRoomEpochKeyFromSender({
      wrapped: params.wrapped,
      recipientIdentityPrivateKey: recipientIdentityPrivateKeyB64u,
      roomId: params.roomId,
      epoch: params.epoch,
    });

    try {
      const record: RoomEpochKeyRecord = {
        version: 1,
        roomId: params.roomId,
        epoch: params.epoch,
        roomKeyB64u: toB64u(roomKeyBytes),
        keyFingerprint: fingerprintRoomEpochKey(roomKeyBytes),
        source: params.source ?? 'claimed',
        wrappedFromUserId: params.wrappedFromUserId ?? null,
        wrappedFromDeviceId: params.wrappedFromDeviceId ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await this.saveRoomEpochKey(record);
      return record;
    } finally {
      wipe(roomKeyBytes);
    }
  }

  async listRoomEpochKeys(roomId?: string | number): Promise<RoomEpochKeyRecord[]> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    const prefixRoomId = roomId == null ? null : normalizeRoomId(roomId);
    const values = Object.values(this.vault.roomEpochKeys)
      .filter((item) => prefixRoomId == null || normalizeRoomId(item.roomId) === prefixRoomId)
      .sort((a, b) => {
        if (normalizeRoomId(a.roomId) !== normalizeRoomId(b.roomId)) {
          return normalizeRoomId(a.roomId).localeCompare(normalizeRoomId(b.roomId));
        }
        return a.epoch - b.epoch;
      });
    return clone(values);
  }


  async exportRoomEpochKeyBackupPayload(params: {
    userId?: string | null;
  } = {}): Promise<SecureKeyBackupPayloadV1 & { keyCount: number; roomCount: number }> {
    ensure(this.isUnlocked(), 'secure keystore is locked');

    const roomMap = new Map<string, { roomId: string | number; epochs: any[] }>();
    const records = Object.values(this.vault.roomEpochKeys)
      .slice()
      .sort((a, b) => {
        const ar = normalizeRoomId(a.roomId);
        const br = normalizeRoomId(b.roomId);
        if (ar !== br) return ar.localeCompare(br);
        return a.epoch - b.epoch;
      });

    for (const record of records) {
      if (!record?.roomKeyB64u || !Number.isInteger(record.epoch) || record.epoch <= 0) continue;
      const roomIdKey = normalizeRoomId(record.roomId);
      let group = roomMap.get(roomIdKey);
      if (!group) {
        group = { roomId: record.roomId, epochs: [] };
        roomMap.set(roomIdKey, group);
      }
      const fingerprint = record.keyFingerprint || fingerprintRoomEpochKey(record.roomKeyB64u);
      group.epochs.push({
        version: 1,
        roomId: record.roomId,
        epoch: record.epoch,
        roomKeyB64u: record.roomKeyB64u,
        keyFingerprint: fingerprint,
        createdAt: record.createdAt ?? null,
        updatedAt: record.updatedAt ?? null,
      });
    }

    const rooms = Array.from(roomMap.values());
    const keyCount = rooms.reduce((sum, room) => sum + room.epochs.length, 0);
    return {
      version: 1,
      exportedAt: nowIso(),
      userId: params.userId ?? null,
      rooms,
      meta: {
        source: 'coonn.secure.keystore.room_epoch_backup',
        excludes: 'device_private_identity_keys,signed_prekeys,one_time_prekeys,session_roots',
      },
      keyCount,
      roomCount: rooms.length,
    };
  }

  async importRoomEpochKeyBackupPayload(
    payload: SecureKeyBackupPayloadV1,
    options: { overwrite?: boolean } = {},
  ): Promise<{ imported: number; skipped: number; conflicts: number; rooms: number }> {
    ensure(this.isUnlocked(), 'secure keystore is locked');
    ensure(payload?.version === 1, 'unsupported secure key backup payload version');
    ensure(Array.isArray(payload.rooms), 'invalid secure key backup payload rooms');

    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    const seenRooms = new Set<string>();

    await this.runExclusive(async () => {
      for (const room of payload.rooms) {
        const roomId = room?.roomId;
        ensure(roomId !== null && roomId !== undefined && `${roomId}`.length > 0, 'invalid backup room id');
        seenRooms.add(normalizeRoomId(roomId));
        const epochs = Array.isArray(room?.epochs) ? room.epochs : [];
        for (const epochRecord of epochs) {
          ensure(epochRecord?.version === 1, 'unsupported backup epoch record version');
          ensurePositiveInt(Number(epochRecord.epoch), 'backup epoch');
          ensureNonEmptyString(epochRecord.roomKeyB64u, 'backup room epoch key');
          const expectedFp = fingerprintRoomEpochKey(epochRecord.roomKeyB64u);
          if (epochRecord.keyFingerprint && epochRecord.keyFingerprint !== expectedFp) {
            throw new Error('secure backup epoch key fingerprint mismatch');
          }

          const key = roomEpochRecordKey(roomId, Number(epochRecord.epoch));
          const existing = this.vault.roomEpochKeys[key];
          if (existing) {
            const existingFp = existing.keyFingerprint || fingerprintRoomEpochKey(existing.roomKeyB64u);
            if (existingFp === expectedFp) {
              skipped += 1;
              continue;
            }
            if (!options.overwrite) {
              conflicts += 1;
              continue;
            }
          }

          const now = nowIso();
          this.vault.roomEpochKeys[key] = {
            version: 1,
            roomId,
            epoch: Number(epochRecord.epoch),
            roomKeyB64u: epochRecord.roomKeyB64u,
            keyFingerprint: expectedFp,
            source: 'backup',
            wrappedFromUserId: null,
            wrappedFromDeviceId: null,
            createdAt: typeof epochRecord.createdAt === 'string' && epochRecord.createdAt ? epochRecord.createdAt : now,
            updatedAt: now,
          };
          imported += 1;
        }
      }
      if (imported > 0) await this.persistVault();
    });

    return { imported, skipped, conflicts, rooms: seenRooms.size };
  }

  async deleteRoomEpochKey(roomId: string | number, epoch: number): Promise<void> {
    const key = roomEpochRecordKey(roomId, epoch);
    await this.runExclusive(async () => {
      delete this.vault.roomEpochKeys[key];
      await this.persistVault();
    });
  }

  async deleteRoomKeys(roomId: string | number): Promise<void> {
    const roomIdStr = normalizeRoomId(roomId);
    await this.runExclusive(async () => {
      for (const key of Object.keys(this.vault.roomEpochKeys)) {
        if (key.startsWith(`${roomIdStr}:`)) delete this.vault.roomEpochKeys[key];
      }
      await this.persistVault();
    });
  }

  async exportPublicBundle(deviceId: string): Promise<{
    identityPublicKeyB64u: string;
    signingIdentityPublicKeyB64u: string;
    signedPreKey?: { keyId: number; publicKeyB64u: string; signatureB64u: string; signatureVerified: boolean } | null;
    oneTimePreKeys: Array<{ keyId: number; publicKeyB64u: string }>;
  }> {
    const identity = await this.getIdentityKeyPair(deviceId);
    ensure(identity, 'identity key not found for device');

    const signingIdentity = await this.ensureSigningIdentityKeyPair(deviceId);

    const signedPreKeys = Object.values(this.vault.signedPreKeys)
      .filter((item) => item.deviceId === deviceId && !item.retiredAt)
      .sort((a, b) => b.keyId - a.keyId);

    const latestSignedPreKey = signedPreKeys[0] ?? null;
    const latestSignatureVerified = latestSignedPreKey ? await this.verifySignedPreKeySignature(latestSignedPreKey) : false;

    const oneTimePreKeys = Object.values(this.vault.oneTimePreKeys)
      .filter((item) => item.deviceId === deviceId && !item.consumedAt)
      .sort((a, b) => a.keyId - b.keyId);

    return {
      identityPublicKeyB64u: identity.publicKeyB64u,
      signingIdentityPublicKeyB64u: signingIdentity.publicKeyB64u,
      signedPreKey: latestSignedPreKey
        ? { keyId: latestSignedPreKey.keyId, publicKeyB64u: latestSignedPreKey.publicKeyB64u, signatureB64u: latestSignedPreKey.signatureB64u, signatureVerified: latestSignatureVerified }
        : null,
      oneTimePreKeys: oneTimePreKeys.map((item) => ({ keyId: item.keyId, publicKeyB64u: item.publicKeyB64u })),
    };
  }

  async getIdentityPrivateKeyB64u(deviceId: string): Promise<string | null> {
    const record = await this.getIdentityKeyPair(deviceId);
    return record?.privateKeyB64u ?? null;
  }

  async derivePublicKeyFromStoredPrivate(deviceId: string): Promise<string | null> {
    const privateKeyB64u = await this.getIdentityPrivateKeyB64u(deviceId);
    if (!privateKeyB64u) return null;
    const pub = getX25519PublicKeyFromPrivate(privateKeyB64u);
    try {
      return toB64u(pub);
    } finally {
      wipe(pub);
    }
  }
}

export const secureKeyStore = new SecureKeyStore();
export default secureKeyStore;
