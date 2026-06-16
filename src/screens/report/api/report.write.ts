import { supabase } from '@/lib/supabase';
import type { SubmitReportInput } from '../types';
import { resolveReportLang } from './report.read';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

export async function submitReport(input: SubmitReportInput): Promise<string> {
  const lang = await resolveReportLang(input.lang);

  return rpc<string>('submit_report', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason_key: input.reasonKey,
    p_lang: lang,
    p_reported_user_id: input.reportedUserId ?? null,
    p_room_id: input.roomId ?? null,
    p_post_id: input.postId ?? null,
    p_detail_text: input.detailText?.trim() || null,
    p_message_uids: input.messageUids ?? [],
  });
}
