import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { pickMetaTextColor } from '@/screens/chat/theme/utils/contrast';
import { MAX_BUBBLE_PX } from './MessageItemBody.shared';

type Props = {
  noticeModel: any;
  maskOnly: boolean;
  isMe: boolean;
  theme: ChatTheme;
  selectionMode: boolean;
  interactionLocked: boolean;
  renderBubbleShell: any;
  openSecureRecoverySettings: () => void;
  openMessageActions: () => void;
};

function MessageNoticeBody({
  noticeModel,
  maskOnly,
  isMe,
  theme,
  selectionMode,
  interactionLocked,
  renderBubbleShell,
  openSecureRecoverySettings,
  openMessageActions,
}: Props) {
  const cardBg = maskOnly ? 'transparent' : (isMe ? theme.myBubble : theme.opponentBubble);
  const cardText = maskOnly ? 'transparent' : (isMe ? theme.myText : theme.opponentText);
  const cardSubText = maskOnly ? 'transparent' : pickMetaTextColor(String(cardBg || '#FFFFFF'));
  const borderColor = maskOnly ? 'transparent' : (isMe ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)');
  const node = renderBubbleShell(
    <View style={styles.noticeCardInner}>
      <Text style={[styles.noticeTitle, { color: cardText }]}>{noticeModel.title}</Text>
      <Text style={[styles.noticeBody, { color: cardSubText }]}>{noticeModel.body}</Text>
      {!!noticeModel.actionLabel && !maskOnly && (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={interactionLocked ? undefined : openSecureRecoverySettings}
          style={({ pressed }) => [
            styles.noticeAction,
            { borderColor, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[styles.noticeActionText, { color: cardText }]}>{noticeModel.actionLabel}</Text>
        </Pressable>
      )}
    </View>,
    18,
    MAX_BUBBLE_PX,
    12,
    10,
    false,
    cardBg,
  );

  return selectionMode || maskOnly ? node : (
    <Pressable onLongPress={interactionLocked ? undefined : openMessageActions}>{node}</Pressable>
  );
}

const styles = StyleSheet.create({
  noticeCardInner: { minWidth: 180, gap: 6 },
  noticeTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  noticeBody: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  noticeAction: { marginTop: 4, alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  noticeActionText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
});

export default React.memo(MessageNoticeBody);
