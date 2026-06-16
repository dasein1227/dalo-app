import { supabase } from '@/lib/supabase';
import type {
  ReportGuide,
  ReportReasonDetail,
  ReportReasonItem,
  ReportTargetRule,
  ReportUiTexts,
  ReportUiTextKey,
  ReportTargetType,
} from '../types';

type RpcArgs = Record<string, unknown> | undefined;

async function rpc<T>(fn: string, args?: RpcArgs): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

function normalizeLang(input: unknown): 'ko' | 'en' {
  const lang = String(input ?? '').trim().toLowerCase();
  return lang === 'en' ? 'en' : 'ko';
}

export async function resolveReportLang(explicitLang?: string | null): Promise<'ko' | 'en'> {
  if (explicitLang) return normalizeLang(explicitLang);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return 'ko';

    const { data } = await supabase
      .from('profiles')
      .select('setting_lang, preferred_lang')
      .eq('user_id', user.id)
      .maybeSingle();

    if ((data as any)?.setting_lang) return normalizeLang((data as any).setting_lang);
    if ((data as any)?.preferred_lang) return normalizeLang((data as any).preferred_lang);
  } catch {}

  return 'ko';
}

export async function fetchReportUiTexts(lang?: string | null): Promise<ReportUiTexts> {
  const resolved = await resolveReportLang(lang);
  const rows = await rpc<Array<{ text_key: ReportUiTextKey; text_value: string }>>(
    'get_report_ui_texts',
    { p_lang: resolved },
  );

  const out: ReportUiTexts = {};
  for (const row of rows ?? []) out[row.text_key] = row.text_value;
  return out;
}

export async function fetchReportReasons(
  targetType: ReportTargetType,
  lang?: string | null,
): Promise<ReportReasonItem[]> {
  const resolved = await resolveReportLang(lang);
  return rpc<ReportReasonItem[]>('list_report_reasons', {
    p_target_type: targetType,
    p_lang: resolved,
  });
}

export async function fetchReportReasonDetail(
  targetType: ReportTargetType,
  reasonKey: string,
  lang?: string | null,
): Promise<ReportReasonDetail | null> {
  const resolved = await resolveReportLang(lang);
  return rpc<ReportReasonDetail | null>('get_report_reason_detail', {
    p_target_type: targetType,
    p_reason_key: reasonKey,
    p_lang: resolved,
  });
}

export async function fetchReportGuide(
  guideKey: string,
  lang?: string | null,
): Promise<ReportGuide | null> {
  const resolved = await resolveReportLang(lang);
  return rpc<ReportGuide | null>('get_report_guide', {
    p_guide_key: guideKey,
    p_lang: resolved,
  });
}

export async function fetchReportTargetRule(
  targetType: ReportTargetType,
): Promise<ReportTargetRule | null> {
  return rpc<ReportTargetRule | null>('get_report_target_rule', {
    p_target_type: targetType,
  });
}
