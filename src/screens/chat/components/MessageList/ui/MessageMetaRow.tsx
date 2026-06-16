import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Clock3 } from 'lucide-react-native';

type Props = {
  side: 'me' | 'you';
  showTime?: boolean;
  timeLabel?: string;
  shouldShowUnread?: boolean;
  effectiveUnreadCount?: number | null;
  momentCancelable?: boolean;
  interactionLocked?: boolean;
  deleteAtMs?: number | null;
  readBasedActive?: boolean;
  readBasedDelaySeconds?: number | null;
  unreadContrastColor?: string;
  timeMetaColor?: string;
  msg?: any;
  msgIdStr?: string;
  theme?: any;
  nowMs?: number | null;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDeleteTime(deleteAtMs: number) {
  const d = new Date(deleteAtMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function buildMomentLabel(opts: { deleteAtMs?: number | null }) {
  const { deleteAtMs } = opts;

  if (typeof deleteAtMs === 'number' && Number.isFinite(deleteAtMs)) {
    return formatDeleteTime(deleteAtMs);
  }

  return null;
}

function resolveMomentMetaColor(theme: any, fallback: string) {
  return (
    theme?.dateTimeLine ||
    theme?.accessoryIcon ||
    theme?.tintColor ||
    fallback ||
    '#A6A8AC'
  );
}

export function MessageMetaRow({
  side,
  showTime = false,
  timeLabel = '',
  shouldShowUnread = false,
  effectiveUnreadCount,
  deleteAtMs = null,
  unreadContrastColor = '#A6A8AC',
  timeMetaColor = '#A6A8AC',
  theme,
}: Props) {
  const momentLabel = useMemo(
    () => buildMomentLabel({ deleteAtMs }),
    [deleteAtMs],
  );

  const momentColor = resolveMomentMetaColor(theme, timeMetaColor);

  const momentNode = momentLabel ? (
    <View
      style={[
        styles.momentInline,
        side === 'me' ? styles.momentInlineMe : styles.momentInlineYou,
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {side === 'me' ? (
        <>
          <Text style={[styles.momentText, { color: momentColor }]} numberOfLines={1}>
            {momentLabel}
          </Text>
          <Clock3 size={10.5} strokeWidth={1.9} color={momentColor} />
        </>
      ) : (
        <>
          <Clock3 size={10.5} strokeWidth={1.9} color={momentColor} />
          <Text style={[styles.momentText, { color: momentColor }]} numberOfLines={1}>
            {momentLabel}
          </Text>
        </>
      )}
    </View>
  ) : null;

  const unreadNode = shouldShowUnread ? (
    <Text style={[styles.unreadText, { color: unreadContrastColor }]} numberOfLines={1}>
      {effectiveUnreadCount}
    </Text>
  ) : null;

  if (side === 'you') {
    return (
      <View style={[styles.metaColumn, styles.metaColumnYou]}>
        {unreadNode || momentNode ? (
          <View style={[styles.metaTopRow, styles.metaTopRowYou]}>
            {unreadNode}
            {momentNode}
          </View>
        ) : null}

        {showTime ? <Text style={[styles.timeText, { color: timeMetaColor }]}>{timeLabel}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.metaColumn, styles.metaColumnMe, { marginRight: 6 }]}>
      {momentNode || unreadNode ? (
        <View style={[styles.metaTopRow, styles.metaTopRowMe]}>
          {momentNode}
          {unreadNode}
        </View>
      ) : null}

      {showTime ? <Text style={[styles.timeText, { color: timeMetaColor }]}>{timeLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metaColumn: {
    justifyContent: 'flex-end',
  },
  metaColumnMe: {
    alignItems: 'flex-end',
  },
  metaColumnYou: {
    alignItems: 'flex-start',
  },

  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  metaTopRowMe: {
    justifyContent: 'flex-end',
  },
  metaTopRowYou: {
    justifyContent: 'flex-start',
  },

  momentInline: {
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.82,
  },
  momentInlineMe: {
    marginRight: 5,
    columnGap: 2.5,
  },
  momentInlineYou: {
    marginLeft: 5,
    columnGap: 2.5,
  },
  momentText: {
    fontSize: 10.5,
    lineHeight: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  unreadText: {
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '600',
  },

  timeText: {
    fontSize: 11,
    lineHeight: 11,
    color: '#A6A8AC',
  },
});
