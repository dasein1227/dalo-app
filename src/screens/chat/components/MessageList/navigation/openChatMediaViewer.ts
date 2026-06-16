function isSecureMessage(msg: any): boolean {
  if (!msg) return false;
  if (msg.is_secure === true || msg.isSecure === true || msg._raw?.is_secure === true) return true;
  if (msg.secure_meta || msg.secureMeta || msg._raw?.secure_meta) return true;
  if (msg.ciphertext || msg.nonce || msg._raw?.ciphertext || msg._raw?.nonce) return true;
  return false;
}

export function buildChatImageRows(msg: any, msgIdStr: string, uris: string[]) {
  const secure = isSecureMessage(msg);
  return uris.map((u, i) => ({
    id: `${msgIdStr}-img-${i}`,
    type: 'image' as const,
    file_bucket: '',
    file_key: u,
    url: u,
    mime: 'image/jpeg',
    sender: msg?.senderId ?? msg?.sender_id ?? null,
    nickname: msg?.senderName ?? msg?.sender_name ?? null,
    created_at: msg?.createdAt ?? msg?.created_at ?? null,
    message_uid: msg?.messageUid ?? msg?.message_uid ?? null,
    room_seq: msg?.roomSeq ?? msg?.room_seq ?? null,
    is_secure: secure,
  }));
}

export function openChatMediaViewer(args: {
  navigation: any;
  msg: any;
  msgIdStr: string;
  maskOnly?: boolean;
  type: 'image' | 'video';
  uri: string;
  bundleUris?: string[];
}) {
  const { navigation, msg, msgIdStr, maskOnly = false, type, uri, bundleUris } = args;
  if (maskOnly) return;

  const secure = isSecureMessage(msg);
  const cleanUri = String(uri ?? '').trim();
  const cleanBundleUris = Array.isArray(bundleUris)
    ? bundleUris.map((x) => String(x ?? '').trim()).filter(Boolean)
    : undefined;

  if (type === 'image' && Array.isArray(cleanBundleUris) && cleanBundleUris.length > 1) {
    const rows = buildChatImageRows(msg, msgIdStr, cleanBundleUris);
    const index = Math.max(0, cleanBundleUris.findIndex((x) => x === cleanUri));

    navigation.navigate('MediaViewer', {
      roomId: msg?.roomId ?? msg?.room_id ?? undefined,
      rows,
      index,
      title: msg?.senderName ?? msg?.sender_name ?? null,
      subtitle: msg?.createdAt != null ? String(msg.createdAt) : msg?.created_at != null ? String(msg.created_at) : '',
    });
    return;
  }

  navigation.navigate('MediaViewer', {
    roomId: msg?.roomId ?? msg?.room_id ?? undefined,
    row: {
      id: msgIdStr,
      type,
      file_bucket: '',
      file_key: cleanUri,
      url: cleanUri,
      mime: msg?.mime ?? null,
      sender: msg?.senderId ?? msg?.sender_id ?? null,
      nickname: msg?.senderName ?? msg?.sender_name ?? null,
      created_at: msg?.createdAt ?? msg?.created_at ?? null,
      message_uid: msg?.messageUid ?? msg?.message_uid ?? null,
      room_seq: msg?.roomSeq ?? msg?.room_seq ?? null,
      is_secure: secure,
    },
    title: msg?.senderName ?? msg?.sender_name ?? null,
    subtitle: msg?.createdAt != null ? String(msg.createdAt) : msg?.created_at != null ? String(msg.created_at) : '',
  });
}
