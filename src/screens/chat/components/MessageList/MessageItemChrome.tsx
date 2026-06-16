import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';

import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { MessageMetaRow } from './ui/MessageMetaRow';
import { chatPerfHit } from './ChatPerfDebug';

const AVATAR_SIZE = 34;
const AVATAR_GAP = 8;
const AVATAR_SLOT_W = AVATAR_SIZE + AVATAR_GAP;

type MessageItemChromeProps = {
  pan: any;
  gestureEnabled?: boolean;
  onRootLayout?: (event: any) => void;
  txStyle: any;
  dissolveStyle: any;

  isMe: boolean;
  selectionMode: boolean;
  selected: boolean;
  checkBg: string;

  metaGap: number;
  bodyNode: React.ReactNode;

  maskOnly: boolean;
  shouldShowSenderHeader: boolean;
  senderDisplayName: string;
  avatarNode: React.ReactNode;
  interactionLocked: boolean;
  onOpenSenderProfile: () => void;

  shouldRenderTime: boolean;
  timeLabel: string;
  shouldShowUnread: boolean;
  effectiveUnreadCount: number | null;
  localSendState?: string | null;
  localSendAttemptCount?: number | null;
  onRetryLocalSend?: (() => void) | null;
  onDeleteLocalSend?: (() => void) | null;
  momentCancelable: boolean;
  isEveryoneDeleted: boolean;
  isMomentExpired: boolean;
  deleteAtMs: number | null;
  readBasedActive: boolean;
  momentMeta: any;
  unreadContrastColor: string;
  timeMetaColor: string;
  msg: UIRenderMessage;
  msgIdStr: string;
  theme: ChatTheme;
};

function MessageItemChrome({
  pan,
  gestureEnabled = true,
  onRootLayout,
  txStyle,
  dissolveStyle,
  isMe,
  selectionMode,
  selected,
  checkBg,
  metaGap,
  bodyNode,
  maskOnly,
  shouldShowSenderHeader,
  senderDisplayName,
  avatarNode,
  interactionLocked,
  onOpenSenderProfile,
  shouldRenderTime,
  timeLabel,
  shouldShowUnread,
  effectiveUnreadCount,
  localSendState,
  localSendAttemptCount,
  onRetryLocalSend,
  onDeleteLocalSend,
  momentCancelable,
  isEveryoneDeleted,
  isMomentExpired,
  deleteAtMs,
  readBasedActive,
  momentMeta,
  unreadContrastColor,
  timeMetaColor,
  msg,
  msgIdStr,
  theme,
}: MessageItemChromeProps) {
  chatPerfHit("chrome.render");
  const shouldRenderMomentMeta = !isEveryoneDeleted && !isMomentExpired;
  const normalizedLocalSendState = String(localSendState ?? '').trim().toLowerCase();
  const localSendAttempt = Number(localSendAttemptCount ?? 0) || 0;
  const shouldShowLocalSendSpinner = normalizedLocalSendState === 'retrying' && localSendAttempt >= 2 && localSendAttempt < 5;
  const shouldShowLocalSendActions = normalizedLocalSendState === 'failed' && localSendAttempt >= 5;
  const shouldShowUnreadForMeta = shouldShowLocalSendActions ? false : shouldShowUnread;
  const shouldRenderTimeForMeta = shouldShowLocalSendActions ? false : shouldRenderTime;
  const shouldRenderLocalSendMeta = !maskOnly && isMe && !selectionMode && (shouldShowLocalSendSpinner || shouldShowLocalSendActions);
  const failedActionBg = theme.inputFieldBg || theme.opponentBubble || '#FFFFFF';
  const failedActionBorder = theme.bubbleHairline?.opponentColor || theme.dateTimeLine || 'rgba(0,0,0,0.08)';
  const retryIconColor = theme.tintColor || theme.sendButtonActive || timeMetaColor;
  const deleteIconColor = '#B75A5A';
  const shouldRenderMeMeta =
    shouldRenderTimeForMeta ||
    shouldShowUnreadForMeta ||
    shouldRenderLocalSendMeta ||
    (shouldRenderMomentMeta && (momentCancelable || deleteAtMs != null || readBasedActive));
  const shouldRenderYouMeta =
    shouldRenderTime ||
    (shouldRenderMomentMeta && (deleteAtMs != null || readBasedActive));

  const checkboxNode = selectionMode ? (
    <View style={styles.selSlot}>
      <View
        style={[
          styles.selCircle,
          selected ? { backgroundColor: checkBg, borderColor: checkBg, borderWidth: 0 } : styles.selCircleOff,
        ]}
      >
        {selected && <Text style={styles.selCheck}>✓</Text>}
      </View>
    </View>
  ) : null;

  const rowLayoutProps = onRootLayout ? { onLayout: onRootLayout } : null;

  if (shouldRenderMeMeta || shouldRenderYouMeta) chatPerfHit("chrome.metaVisible");
  else chatPerfHit("chrome.metaHidden");

  const rowNode = (
    <Animated.View {...rowLayoutProps} style={[styles.row, txStyle, dissolveStyle]}>
      {checkboxNode}
      <View style={[styles.rowInner, isMe ? styles.rowInnerMe : styles.rowInnerYou]}>
          {!isMe && (
            <View style={[styles.avatarSlot, styles.avatarSlotTop]}>
              {shouldShowSenderHeader ? (
                <Pressable
                  style={styles.avatarWrap}
                  hitSlop={10}
                  onPress={interactionLocked ? undefined : onOpenSenderProfile}
                >
                  {avatarNode}
                </Pressable>
              ) : (
                <View style={styles.avatarSpacer} />
              )}
            </View>
          )}

          {isMe && shouldRenderMeMeta && (
            <View style={metaGap ? { marginRight: metaGap } : null}>
              {shouldShowLocalSendActions ? (
                <View
                  style={[
                    styles.localSendActions,
                    metaGap ? null : styles.localSendActionsNoGap,
                    { backgroundColor: failedActionBg, borderColor: failedActionBorder },
                  ]}
                >
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="재전송"
                    disabled={interactionLocked || selectionMode}
                    onPress={onRetryLocalSend ?? undefined}
                    style={({ pressed }) => [
                      styles.localSendButton,
                      pressed && !interactionLocked && !selectionMode ? { backgroundColor: theme.actionPressedBg } : null,
                    ]}
                  >
                    <Text style={[styles.localSendRetryIcon, { color: retryIconColor }]}>↻</Text>
                  </Pressable>
                  <View style={[styles.localSendDivider, { backgroundColor: failedActionBorder }]} />
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="삭제"
                    disabled={interactionLocked || selectionMode}
                    onPress={onDeleteLocalSend ?? undefined}
                    style={({ pressed }) => [
                      styles.localSendButton,
                      pressed && !interactionLocked && !selectionMode ? { backgroundColor: theme.actionPressedBg } : null,
                    ]}
                  >
                    <Text style={[styles.localSendDeleteIcon, { color: deleteIconColor }]}>×</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.localSendMetaLine}>
                  {shouldShowLocalSendSpinner && (
                    <ActivityIndicator size="small" color={retryIconColor} style={styles.localSendSpinner} />
                  )}
                  <MessageMetaRow
                    side="me"
                    showTime={shouldRenderTimeForMeta}
                    timeLabel={timeLabel}
                    shouldShowUnread={shouldShowUnreadForMeta}
                    effectiveUnreadCount={shouldShowUnreadForMeta ? effectiveUnreadCount : null}
                    momentCancelable={shouldRenderMomentMeta ? momentCancelable : false}
                    interactionLocked={interactionLocked || selectionMode}
                    deleteAtMs={shouldRenderMomentMeta ? deleteAtMs : null}
                    readBasedActive={shouldRenderMomentMeta ? readBasedActive : false}
                    readBasedDelaySeconds={shouldRenderMomentMeta ? momentMeta?.delaySeconds ?? null : null}
                    unreadContrastColor={unreadContrastColor}
                    timeMetaColor={timeMetaColor}
                    msg={msg}
                    msgIdStr={msgIdStr}
                    theme={theme}
                  />
                </View>
              )}
            </View>
          )}

          {!isMe ? (
            <View style={styles.contentCol}>
              {!maskOnly && shouldShowSenderHeader && (
                <Text style={[styles.senderName, { color: theme.opponentText }]} numberOfLines={1}>
                  {senderDisplayName}
                </Text>
              )}
              {bodyNode}
            </View>
          ) : (
            bodyNode
          )}

          {!isMe && shouldRenderYouMeta && (
            <View style={metaGap ? { marginLeft: metaGap } : null}>
              <MessageMetaRow
                side="you"
                showTime={shouldRenderTime}
                timeLabel={timeLabel}
                deleteAtMs={shouldRenderMomentMeta ? deleteAtMs : null}
                readBasedActive={shouldRenderMomentMeta ? readBasedActive : false}
                readBasedDelaySeconds={shouldRenderMomentMeta ? momentMeta?.delaySeconds ?? null : null}
                timeMetaColor={timeMetaColor}
              />
            </View>
          )}
      </View>
    </Animated.View>
  );

  if (!gestureEnabled || !pan) return rowNode;

  // GestureDetector is intentionally mounted only for swipe-capable rows.
  return <GestureDetector gesture={pan}>{rowNode}</GestureDetector>;
}

const MemoizedMessageItemChrome = React.memo(MessageItemChrome);
MemoizedMessageItemChrome.displayName = 'MessageItemChrome';

const styles = StyleSheet.create({
  row: {
    width: '100%',
    paddingHorizontal: 10,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '100%',
  },
  rowInnerMe: { justifyContent: 'flex-end' },
  rowInnerYou: { justifyContent: 'flex-start' },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
    paddingLeft: 2,
  },
  avatarSlot: {
    width: AVATAR_SLOT_W,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  avatarSlotTop: {
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarSpacer: {
    width: AVATAR_SLOT_W,
    height: AVATAR_SIZE,
  },
  contentCol: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  selSlot: {
    width: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  selCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCircleOff: {
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    backgroundColor: '#FFFFFF',
  },
  selCheck: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  localSendMetaLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  localSendSpinner: {
    marginRight: 4,
    marginBottom: 0,
    transform: [{ scale: 0.62 }],
    opacity: 0.72,
  },
  localSendActions: {
    height: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  localSendActionsNoGap: {
    marginRight: 0,
  },
  localSendButton: {
    width: 32,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 0,
  },
  localSendDivider: {
    width: StyleSheet.hairlineWidth,
    height: 15,
    opacity: 0.65,
  },
  localSendRetryIcon: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
    transform: [{ translateY: -0.5 }],
  },
  localSendDeleteIcon: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
    transform: [{ translateY: -1 }],
  },
});

export default MemoizedMessageItemChrome;
