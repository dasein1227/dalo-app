import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import {
  MAX_BUBBLE_PX,
  formatAttachmentSize,
  isUrlLike,
  openAttachmentFile,
  pickFileNameFromUrl,
} from './MessageItemBody.shared';

type Props = {
  msg: any;
  meta: any;
  originalObj: any;
  mediaItems: any[];
  displayText: any;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  renderBubbleShell: any;
  roomIdNum: number;
  openMessageActions: () => void;
};

function MessageFileBody({
  msg,
  meta,
  originalObj,
  mediaItems,
  displayText,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  renderBubbleShell,
  roomIdNum,
  openMessageActions,
}: Props) {
  const { t } = useTranslation();
  const fileFallback = t('chat:messageBody.file');
  const tapToOpen = t('chat:messageBody.tapToOpen');
  const disp = String(displayText ?? '').trim();
  const fileItem: any = mediaItems.find((m: any) => m?.type === 'file') ?? mediaItems[0] ?? null;
  const fileUrl = String(
    fileItem?.originalUri ??
    fileItem?.uri ??
    fileItem?.url ??
    fileItem?.fileUrl ??
    fileItem?.file_url ??
    meta?.url ?? meta?.uri ?? meta?.fileUrl ?? meta?.file_url ?? meta?.localUri ?? meta?.local_uri ?? meta?.cachedUri ?? meta?.cached_uri ??
    originalObj?.url ?? originalObj?.uri ?? originalObj?.fileUrl ?? originalObj?.file_url ?? originalObj?.localUri ?? originalObj?.local_uri ?? originalObj?.cachedUri ?? originalObj?.cached_uri ??
    (msg as any)?.media_url ?? (msg as any)?.mediaUrl ?? (msg as any)?.file_url ?? (msg as any)?.fileUrl ?? (msg as any)?.local_uri ?? (msg as any)?.localUri ?? (msg as any)?.cached_uri ?? (msg as any)?.cachedUri ??
    (msg as any)?._raw?.media_url ?? (msg as any)?._raw?.file_url ?? (msg as any)?._raw?.local_uri ?? (msg as any)?._raw?.cached_uri ??
    (isUrlLike(disp) ? disp : '')
  ).trim();

  const rawFileName = String(
    fileItem?.fileName ??
    fileItem?.file_name ??
    fileItem?.filename ??
    fileItem?.name ??
    originalObj?.fileName ?? originalObj?.file_name ?? originalObj?.filename ?? originalObj?.name ??
    meta?.fileName ?? meta?.file_name ?? meta?.filename ?? meta?.name ??
    (msg as any)?.fileName ?? (msg as any)?.file_name ?? (msg as any)?.filename ?? (msg as any)?.name ??
    (msg as any)?._raw?.file_name ?? (msg as any)?._raw?.filename ?? (msg as any)?._raw?.name ??
    ''
  ).trim();

  const fileName = rawFileName && rawFileName !== '[File]' ? rawFileName : pickFileNameFromUrl(fileUrl, fileFallback);
  const mime = String(
    fileItem?.mime ??
    fileItem?.mimeType ??
    fileItem?.mime_type ??
    originalObj?.mime ?? originalObj?.mimeType ?? originalObj?.mime_type ?? originalObj?.contentType ??
    meta?.mime ?? meta?.mimeType ?? meta?.mime_type ?? meta?.contentType ??
    (msg as any)?.mime ?? (msg as any)?.mimeType ?? (msg as any)?.mime_type ??
    ''
  ).trim();

  const fileSize =
    fileItem?.fileSize ?? fileItem?.file_size ?? fileItem?.size ?? fileItem?.sizeBytes ?? fileItem?.size_bytes ??
    originalObj?.fileSize ?? originalObj?.file_size ?? originalObj?.size ?? originalObj?.sizeBytes ?? originalObj?.size_bytes ??
    meta?.fileSize ?? meta?.file_size ?? meta?.size ?? meta?.sizeBytes ?? meta?.size_bytes ??
    (msg as any)?.fileSize ?? (msg as any)?.file_size ?? (msg as any)?.size ?? (msg as any)?.sizeBytes ?? (msg as any)?.size_bytes ??
    null;

  const sizeLabel = formatAttachmentSize(fileSize);
  const subtitle = [mime, sizeLabel].filter(Boolean).join(' · ') || (fileUrl ? tapToOpen : fileFallback);
  const fg = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
  const sub = maskOnly ? 'transparent' : isMe ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.52)';

  return renderBubbleShell(
    <Pressable
      disabled={interactionLocked || selectionMode || maskOnly || !fileUrl}
      onPress={() => openAttachmentFile(fileUrl, { mime, roomId: roomIdNum })}
      onLongPress={interactionLocked ? undefined : openMessageActions}
      delayLongPress={220}
      style={({ pressed }) => [styles.fileBubbleRow, pressed && !interactionLocked ? { opacity: 0.78 } : null]}
    >
      <View style={[styles.fileIconBox, { borderColor: sub }]}> 
        <FileText size={18} color={fg} strokeWidth={2} />
      </View>
      <View style={styles.fileTextBlock}>
        <Text style={[styles.fileTitle, { color: fg }]} numberOfLines={1}>{fileName || fileFallback}</Text>
        {!!subtitle && <Text style={[styles.fileSubtitle, { color: sub }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
    </Pressable>,
    18,
    MAX_BUBBLE_PX,
    10,
    8,
  );
}

const styles = StyleSheet.create({
  fileBubbleRow: {
    minWidth: 206,
    maxWidth: MAX_BUBBLE_PX - 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
  },
  fileTextBlock: { flex: 1, minWidth: 0 },
  fileTitle: { fontSize: 13.5, lineHeight: 18, fontWeight: '600', letterSpacing: -0.15 },
  fileSubtitle: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: -0.05 },
});

export default React.memo(MessageFileBody);
