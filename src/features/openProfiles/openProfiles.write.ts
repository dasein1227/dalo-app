// src/features/openProfiles/openProfiles.write.ts

import { supabase } from '@/lib/supabase';
import type { OpenProfileDraft } from './openProfiles.types';

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function sanitizeImageExt(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  const cleaned = raw.replace(/[^a-z0-9]/g, '');
  if (cleaned === 'jpeg') return 'jpg';
  if (cleaned === 'heif') return 'heic';
  if (['jpg', 'png', 'webp', 'heic'].includes(cleaned)) return cleaned;
  return 'jpg';
}

function contentTypeFromExt(ext: string): string {
  switch (sanitizeImageExt(ext)) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

export async function createOpenProfile(draft: OpenProfileDraft): Promise<string> {
  const nickname = cleanText(draft.nickname);
  if (!nickname) throw new Error('nickname_required');

  const { data, error } = await supabase.rpc('create_open_profile_v1', {
    p_nickname: nickname,
    p_avatar_url: cleanText(draft.avatar_url),
    p_status_message: cleanText(draft.status_message),
    p_is_default: draft.is_default === true,
  });

  if (error) throw error;
  return String(data);
}

export async function updateOpenProfile(profileId: string, draft: OpenProfileDraft): Promise<void> {
  const nickname = cleanText(draft.nickname);
  if (!nickname) throw new Error('nickname_required');

  const { error } = await supabase.rpc('update_open_profile_v1', {
    p_profile_id: profileId,
    p_nickname: nickname,
    p_avatar_url: cleanText(draft.avatar_url),
    p_status_message: cleanText(draft.status_message),
    p_is_default: typeof draft.is_default === 'boolean' ? draft.is_default : null,
  });

  if (error) throw error;
}

export async function setDefaultOpenProfile(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_open_profile_v1', {
    p_profile_id: profileId,
  });

  if (error) throw error;
}

export async function deleteOpenProfile(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_open_profile_v1', {
    p_profile_id: profileId,
  });

  if (error) throw error;
}

export async function uploadOpenProfileAvatar(input: {
  profileId: string;
  uri: string;
  ext?: string | null;
  contentType?: string | null;
}): Promise<string> {
  const ext = sanitizeImageExt(input.ext ?? 'jpg');
  const contentType = cleanText(input.contentType) ?? contentTypeFromExt(ext);

  const { data, error } = await supabase.functions.invoke('open-upload', {
    body: {
      scope: 'open_profile_avatar',
      profileId: input.profileId,
      contentType,
      ext,
    },
  });

  if (error) throw error;

  const uploadUrl = String((data as any)?.uploadUrl ?? '');
  const publicUrl = String((data as any)?.publicUrl ?? '');
  const uploadContentType = String((data as any)?.contentType ?? contentType);

  if (!uploadUrl || !publicUrl) {
    throw new Error('invalid_upload_presign_response');
  }

  const blob = await (await fetch(input.uri)).blob();

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': uploadContentType },
    body: blob as any,
  });

  if (!putRes.ok) {
    throw new Error(`r2_upload_failed:${putRes.status}`);
  }

  return publicUrl;
}
