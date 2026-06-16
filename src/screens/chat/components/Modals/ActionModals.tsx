// src/screens/chat/components/Modals/ActionModals.tsx

import React, { memo, useMemo } from 'react';
import MessageActionSheet, { MessageActionKey } from '../MessageActions/MessageActionSheet';
import MomentQuickMenu from '../MessageActions/MomentQuickMenu';
import DeleteTypeModal, { MomentDeleteConfig } from '../MessageActions/DeleteTypeModal'; 
import { ChatTheme } from '../../theme/chatTheme';

type Props = {
  // 1. Action Sheet 관련
  actionSheetVisible: boolean;
  closeMessageActions: () => void;
  actionSheetMsg: any;
  meId: string | null;
  onAction: (key: MessageActionKey, msg: any) => Promise<void>;
  onReact: (emoji: string, msg: any) => void;
  canShowNoticeAction?: boolean;

  // 2. Moment Menu 관련
  momentMenuVisible: boolean;
  closeMomentMenu: () => void;
  momentMenuAnchor: { x: number; y: number; w: number; h: number } | null;
  momentMenuMsg: any;
  onCancelMoment: () => void;

  // 3. Delete Modal 관련
  deleteTypeVisible: boolean;
  closeDeleteType: () => void;
  canDeleteAll: boolean;
  canMomentDelete: boolean;
  allowReadBased?: boolean;
  onDeleteMine: () => void;
  onDeleteAll: () => void;
  onConfirmMoment: (cfg: MomentDeleteConfig) => void;

  // 공통
  theme: ChatTheme;
};

// ✅ 최적화 핵심 1: memo를 씌워서, 모달이 열리거나 닫히지 않는 평소(채팅중)에는 렌더링을 100% 차단합니다.
const ActionModals = memo(function ActionModals({
  actionSheetVisible,
  closeMessageActions,
  actionSheetMsg,
  meId,
  onAction,
  onReact,
  canShowNoticeAction = true,

  momentMenuVisible,
  closeMomentMenu,
  momentMenuAnchor,
  momentMenuMsg,
  onCancelMoment,

  deleteTypeVisible,
  closeDeleteType,
  canDeleteAll,
  canMomentDelete,
  allowReadBased = true,
  onDeleteMine,
  onDeleteAll,
  onConfirmMoment,

  theme,
}: Props) {
  
  // ✅ 최적화 핵심 2: 매 렌더링마다 무의미하게 계산되던 값을 useMemo로 캐싱합니다.
  const isMeActionMsg = useMemo(() => {
    return String(momentMenuMsg?.senderId ?? momentMenuMsg?.sender_id ?? '') === String(meId);
  }, [momentMenuMsg, meId]);

  return (
    <>
      <MessageActionSheet
        visible={actionSheetVisible}
        onClose={closeMessageActions}
        theme={theme}
        meId={meId}
        message={actionSheetMsg}
        onReact={onReact}
        onAction={onAction}
        canShowNoticeAction={canShowNoticeAction}
      />

      <MomentQuickMenu
        visible={momentMenuVisible}
        theme={theme}
        anchor={momentMenuAnchor}
        canCancel={!!momentMenuMsg && isMeActionMsg}
        onClose={closeMomentMenu}
        onCancelMoment={onCancelMoment}
      />

      <DeleteTypeModal
        visible={deleteTypeVisible}
        onClose={closeDeleteType}
        theme={theme}
        canDeleteAll={canDeleteAll}
        canMomentDelete={canMomentDelete}
        allowReadBased={allowReadBased}
        onDeleteMine={onDeleteMine}
        onDeleteAll={onDeleteAll}
        onConfirmMoment={onConfirmMoment}
      />
    </>
  );
});

export default ActionModals;