import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';

export type MessageInjectedDataMap = {
  meUid: string | null;
  senderProfileByMessageId: Record<string, any>;
  replyTargetByMessageId: Record<string, any>;
};

function msgKey(msg: any) {
  return String(msg?.id ?? msg?._raw?.id ?? '').trim();
}

export function getMessageItemInjectedProps(args: {
  msg: UIRenderMessage;
  injected: MessageInjectedDataMap;
}) {
  const { msg, injected } = args;
  const key = msgKey(msg);

  return {
    injectedMeUid: injected.meUid,
    injectedSenderProfile: injected.senderProfileByMessageId[key] ?? undefined,
    injectedReplyTarget: injected.replyTargetByMessageId[key] ?? undefined,
  };
}