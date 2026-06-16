import React from 'react';
import { View } from 'react-native';
import LocationMessageBubble from '../../LocationMessageBubble';

type Props = {
  lat: number;
  lng: number;
  address: string;
  isMe: boolean;
  maskOnly?: boolean;
  interactionLocked?: boolean;
  bubbleShadowStyle?: any;
  replyBlockNode?: React.ReactNode;
  dividerColor: string;
  renderBubbleShell: (
    children: React.ReactNode,
    radius?: number,
    maxWidth?: number,
    paddingH?: number,
    paddingV?: number,
    pill?: boolean,
    bgOverride?: string,
  ) => React.ReactNode;
};

export function MessageMapBubble({
  lat,
  lng,
  address,
  isMe,
  maskOnly = false,
  interactionLocked = false,
  bubbleShadowStyle,
  replyBlockNode,
  dividerColor,
  renderBubbleShell,
}: Props) {
  return (
    <View style={{ backgroundColor: 'transparent', maxWidth: 420 }}>
      {!!replyBlockNode &&
        renderBubbleShell(
          <>
            {replyBlockNode}
            <View style={{ height: 0.5, marginBottom: 6, opacity: 0.9, backgroundColor: dividerColor }} />
          </>,
          18,
          420,
          12,
          8,
        )}
      <View
        pointerEvents={interactionLocked ? 'none' : 'auto'}
        style={[bubbleShadowStyle, { borderRadius: 16, overflow: 'hidden', backgroundColor: maskOnly ? 'transparent' : '#fff' }]}
      >
        <LocationMessageBubble location={{ lat, lng, address }} isMyMessage={isMe} />
      </View>
    </View>
  );
}
