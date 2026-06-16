import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { MAX_BUBBLE_PX } from './MessageItemBody.shared';

type Props = {
  label: string;
  maskOnly: boolean;
  isMe: boolean;
  theme: ChatTheme;
  interactionLocked: boolean;
  renderBubbleShell: any;
  openMessageActions: () => void;
};

function MessageTombstoneBody({ label, maskOnly, isMe, theme, interactionLocked, renderBubbleShell, openMessageActions }: Props) {
  const bubbleBg = maskOnly ? 'transparent' : isMe ? theme.myBubble : theme.opponentBubble;
  const tColor = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
  const shell = renderBubbleShell(
    <View style={styles.tombstoneContent}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.tombstoneText, { color: tColor, opacity: 0.62 }]}
      >
        {label}
      </Text>
    </View>,
    16,
    MAX_BUBBLE_PX,
    14,
    10,
    false,
    bubbleBg,
  );

  return maskOnly ? shell : <Pressable onLongPress={interactionLocked ? undefined : openMessageActions}>{shell}</Pressable>;
}

const styles = StyleSheet.create({
  tombstoneContent: {
    minWidth: 118,
    minHeight: 16,
    height: 16,
    maxHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tombstoneText: {
    fontSize: 12,
    lineHeight: 16,
    height: 16,
    maxHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});

export default React.memo(MessageTombstoneBody);
