import i18next from 'i18next';
import type { TFunction } from 'i18next';

export type RoomSystemNoticeType =
  | 'member_joined'
  | 'member_left'
  | 'member_kicked'
  | 'manager_promoted'
  | 'manager_demoted'
  | 'owner_transferred'
  | 'room_deleted';

export type RoomSystemNoticeRenderModel = {
  key: string;
  systemType: RoomSystemNoticeType | string;
  templateKey: string;
  templateArgs: Record<string, any>;
  fallbackKey: string;
  fallbackText: string;
};

const ROOM_SYSTEM_NOTICE_FALLBACK_KEY = 'chat:system.notice';
const ROOM_SYSTEM_NOTICE_FALLBACK_TEXT = 'Room update';

const ROOM_SYSTEM_NOTICE_NAME_FALLBACK_KEY = 'chat:userFallback';
const ROOM_SYSTEM_NOTICE_NAME_FALLBACK_TEXT = 'User';

const ROOM_SYSTEM_NOTICE_I18N_KEYS: Record<string, string> = {
  member_joined: 'chat:system.memberJoined',
  member_left: 'chat:system.memberLeft',
  member_kicked: 'chat:system.memberKicked',
  manager_promoted: 'chat:system.managerPromoted',
  manager_demoted: 'chat:system.managerDemoted',
  owner_transferred: 'chat:system.ownerTransferred',
  room_deleted: 'chat:system.roomDeleted',
};

const ROOM_SYSTEM_NOTICE_TYPES = new Set<string>(Object.keys(ROOM_SYSTEM_NOTICE_I18N_KEYS));

function parseJsonObject(value: any): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch {
    return null;
  }
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function boolLike(value: any): boolean {
  if (value === true) return true;
  if (value === 1) return true;

  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'y';
}

function unwrapMessage(input: any): any | null {
  if (!input) return null;
  if (input?.type === 'message') return input?.data ?? null;
  return input;
}

function getI18nText(key: string, defaultValue: string): string {
  try {
    const value = i18next.t(key, { defaultValue });
    const text = String(value ?? '').trim();

    if (!text || text === key) return defaultValue;
    return text;
  } catch {
    return defaultValue;
  }
}

function getFallbackName(): string {
  return getI18nText(ROOM_SYSTEM_NOTICE_NAME_FALLBACK_KEY, ROOM_SYSTEM_NOTICE_NAME_FALLBACK_TEXT);
}

function getFallbackText(): string {
  return getI18nText(ROOM_SYSTEM_NOTICE_FALLBACK_KEY, ROOM_SYSTEM_NOTICE_FALLBACK_TEXT);
}

export function getRoomSystemNoticeMeta(input: any): Record<string, any> {
  const msg = unwrapMessage(input);
  const raw = msg?._raw ?? {};
  const original = parseJsonObject(raw?.original) ?? parseJsonObject(msg?.original) ?? {};

  return {
    ...(parseJsonObject(raw?.metadata) ?? {}),
    ...(parseJsonObject(raw?.meta) ?? {}),
    ...(parseJsonObject((msg as any)?.metadata) ?? {}),
    ...(parseJsonObject((msg as any)?.meta) ?? {}),
    ...(original ?? {}),
  };
}

function getNoticeKind(input: any): string {
  const msg = unwrapMessage(input);
  const raw = msg?._raw ?? {};

  return String(
    msg?.kind ??
      raw?.kind ??
      msg?.message_kind ??
      raw?.message_kind ??
      '',
  )
    .trim()
    .toLowerCase();
}

function isNoticeLike(input: any): boolean {
  const msg = unwrapMessage(input);
  const raw = msg?._raw ?? {};
  const kind = getNoticeKind(msg);

  if (kind === 'notice') return true;

  const isNotice = msg?.is_notice ?? msg?.isNotice ?? raw?.is_notice ?? raw?.isNotice;
  if (boolLike(isNotice)) return true;

  const pinnedAt =
    msg?.notice_pinned_at ??
    msg?.noticePinnedAt ??
    raw?.notice_pinned_at ??
    raw?.noticePinnedAt;

  return pinnedAt != null && String(pinnedAt).trim().length > 0;
}

export function getRoomSystemNoticeSystemType(input: any): string {
  const meta = getRoomSystemNoticeMeta(input);

  return String(
    firstString(
      meta.system_type,
      meta.systemType,
      meta.room_system_type,
      meta.roomSystemType,
      meta.notice_type,
      meta.noticeType,
      meta.type,
    ) ?? '',
  )
    .trim()
    .toLowerCase();
}

function getExplicitRoomSystemNoticeTemplateKey(input: any): string {
  const meta = getRoomSystemNoticeMeta(input);

  return String(
    firstString(
      meta.template_key,
      meta.templateKey,
      meta.i18n_key,
      meta.i18nKey,
    ) ?? '',
  ).trim();
}

export function getRoomSystemNoticeTemplateKey(input: any): string {
  const msg = unwrapMessage(input);
  const raw = msg?._raw ?? {};
  const meta = getRoomSystemNoticeMeta(input);

  return String(
    firstString(
      meta.template_key,
      meta.templateKey,
      meta.i18n_key,
      meta.i18nKey,
      msg?.content,
      raw?.content,
    ) ?? '',
  ).trim();
}

export function isRoomSystemNoticeMessage(input: any): boolean {
  if (!isNoticeLike(input)) return false;

  const meta = getRoomSystemNoticeMeta(input);
  const scope = String(meta.notice_scope ?? meta.noticeScope ?? '').trim().toLowerCase();

  if (scope === 'user_notice' || scope === 'pinned_notice') return false;
  if (scope === 'room_system' || scope === 'system_log') return true;

  const systemType = getRoomSystemNoticeSystemType(input);
  if (ROOM_SYSTEM_NOTICE_TYPES.has(systemType)) return true;

  const explicitTemplateKey = getExplicitRoomSystemNoticeTemplateKey(input);
  if (explicitTemplateKey.startsWith('chat.system.') || explicitTemplateKey.startsWith('chat:system.')) {
    return true;
  }

  return false;
}

export function isUserPinnedNoticeMessage(input: any): boolean {
  return isNoticeLike(input) && !isRoomSystemNoticeMessage(input);
}

function normalizeTemplateKey(templateKey: string, systemType: string): string {
  const key = String(templateKey ?? '').trim();

  if (key.startsWith('chat:system.')) return key;

  if (key.startsWith('chat.system.')) {
    return `chat:system.${key.slice('chat.system.'.length)}`;
  }

  const mappedBySystemType = ROOM_SYSTEM_NOTICE_I18N_KEYS[systemType];
  if (mappedBySystemType) return mappedBySystemType;

  if (key.startsWith('chat:')) return key;

  return ROOM_SYSTEM_NOTICE_FALLBACK_KEY;
}

function getTemplateArgs(input: any): Record<string, any> {
  const meta = getRoomSystemNoticeMeta(input);

  const rawArgs =
    parseJsonObject(meta.template_args) ??
    parseJsonObject(meta.templateArgs) ??
    {};

  const fallbackName = getFallbackName();

  const name =
    firstString(
      rawArgs.name,
      rawArgs.targetDisplayName,
      rawArgs.target_display_name,
      meta.target_display_name,
      meta.targetDisplayName,
      meta.display_name,
      meta.displayName,
      meta.name,
    ) ?? fallbackName;

  return {
    ...rawArgs,
    name,
    targetDisplayName: firstString(rawArgs.targetDisplayName, rawArgs.target_display_name, name) ?? name,
    target_display_name: firstString(rawArgs.target_display_name, rawArgs.targetDisplayName, name) ?? name,
  };
}

export function getRoomSystemNoticeRenderModel(input: any): RoomSystemNoticeRenderModel | null {
  if (!isRoomSystemNoticeMessage(input)) return null;

  const msg = unwrapMessage(input);
  const systemType = getRoomSystemNoticeSystemType(msg);
  const rawTemplateKey = getRoomSystemNoticeTemplateKey(msg);
  const templateKey = normalizeTemplateKey(rawTemplateKey, systemType);
  const templateArgs = getTemplateArgs(msg);

  const messageUid = String(msg?.message_uid ?? msg?.messageUid ?? msg?._raw?.message_uid ?? '').trim();
  const roomSeq = String(msg?.room_seq ?? msg?.roomSeq ?? msg?._raw?.room_seq ?? '').trim();
  const id = String(msg?.id ?? msg?._raw?.id ?? '').trim();

  return {
    key: messageUid || roomSeq || id || `${systemType}:${templateKey}`,
    systemType,
    templateKey,
    templateArgs,
    fallbackKey: ROOM_SYSTEM_NOTICE_FALLBACK_KEY,
    fallbackText: getFallbackText(),
  };
}

export function renderRoomSystemNoticeText(
  t: TFunction,
  model: RoomSystemNoticeRenderModel,
): string {
  const fallbackName = String(
    t(ROOM_SYSTEM_NOTICE_NAME_FALLBACK_KEY, {
      defaultValue: ROOM_SYSTEM_NOTICE_NAME_FALLBACK_TEXT,
    }) ?? ROOM_SYSTEM_NOTICE_NAME_FALLBACK_TEXT,
  ).trim();

  const name =
    firstString(
      model.templateArgs.name,
      model.templateArgs.targetDisplayName,
      model.templateArgs.target_display_name,
      fallbackName,
    ) ?? ROOM_SYSTEM_NOTICE_NAME_FALLBACK_TEXT;

  const fallbackText = String(
    t(model.fallbackKey || ROOM_SYSTEM_NOTICE_FALLBACK_KEY, {
      defaultValue: model.fallbackText || ROOM_SYSTEM_NOTICE_FALLBACK_TEXT,
    }) ?? model.fallbackText ?? ROOM_SYSTEM_NOTICE_FALLBACK_TEXT,
  ).trim();

  const text = String(
    t(model.templateKey, {
      ...model.templateArgs,
      name,
      targetDisplayName:
        firstString(model.templateArgs.targetDisplayName, model.templateArgs.target_display_name, name) ?? name,
      target_display_name:
        firstString(model.templateArgs.target_display_name, model.templateArgs.targetDisplayName, name) ?? name,
      defaultValue: fallbackText,
    }) ?? fallbackText,
  ).trim();

  if (!text || text === model.templateKey || text.includes('{{name}}')) {
    return fallbackText || ROOM_SYSTEM_NOTICE_FALLBACK_TEXT;
  }

  return text;
}