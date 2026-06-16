export type AccountWithdrawalReasonCode =
  | 'difficult'
  | 'inactive'
  | 'missing_features'
  | 'notifications'
  | 'bugs'
  | 'privacy'
  | 'other';

export type AccountWithdrawalReasonOption = {
  reasonCode: AccountWithdrawalReasonCode | string;
  label: string;
  sortOrder: number;
};

export type AccountWithdrawalPayload = {
  reasonCode: AccountWithdrawalReasonCode | string;
  reasonText: string | null;
};
