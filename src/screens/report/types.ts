export type ReportTargetType = 'chat_user' | 'post';

export type ReportUiTextKey =
  | 'report.common.title'
  | 'report.reason_list.title'
  | 'report.reason_list.notice'
  | 'report.reason_list.guide_link_label'
  | 'report.chat_picker.title'
  | 'report.chat_picker.selection_hint'
  | 'report.chat_picker.clear_selection'
  | 'report.chat_picker.submit_cta'
  | 'report.done.title'
  | 'report.done.body';

export type ReportUiTexts = Partial<Record<ReportUiTextKey, string>>;

export type ReportReasonItem = {
  reason_key: string;
  title: string;
  sort_order: number;
};

export type ReportReasonDetail = {
  reason_key: string;
  title: string;
  intro_text: string | null;
  bullet_items: string[];
  notice_boxes: string[];
  warning_title: string | null;
  warning_body: string | null;
  guide_link_label: string | null;
  guide_key: string | null;
  guide_link_url?: string | null;
  submit_button_label: string | null;
};

export type ReportGuide = {
  guide_key: string;
  title: string;
  intro_text: string | null;
  bullet_items: string[];
  footer_text: string | null;
};

export type ReportTargetRule = {
  target_type: ReportTargetType;
  allow_message_evidence: boolean;
  max_message_select: number;
  require_reported_user: boolean;
  require_room_id: boolean;
  require_post_id: boolean;
};

export type ReportFlowBaseParams = {
  targetType: ReportTargetType;
  targetId: string;
  reportedUserId?: string | null;
  roomId?: number | null;
  postId?: string | null;
  messageUids?: string[];
  lang?: string | null;
};

export type ReportReasonListParams = ReportFlowBaseParams;

export type ReportReasonDetailParams = ReportFlowBaseParams & {
  reasonKey: string;
};

export type ReportGuideParams = {
  guideKey: string;
  lang?: string | null;
  fallbackTitle?: string | null;
};

export type ReportDoneParams = {
  lang?: string | null;
};

export type SubmitReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reasonKey: string;
  lang?: string | null;
  reportedUserId?: string | null;
  roomId?: number | null;
  postId?: string | null;
  detailText?: string | null;
  messageUids?: string[];
};
