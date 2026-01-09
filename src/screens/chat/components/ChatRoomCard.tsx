// src/screens/chat/components/ChatRoomCard.tsx
import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
} from 'react-native';
import { BellOff, Pin, ChevronRight } from 'lucide-react-native';

export type ChatRoomRow = {
  id: number | string;
  title: string;
  last_msg: string | null;
  updated_at: string | null;
  avatar_url: string | null;
  is_owner: boolean;
  pending: boolean;
  unread: number | null;

  // --- 즐겨찾기 / 고정 / 알림 / 비콘 섹션 ---
  favorite: boolean;             // 즐겨찾기 여부
  pinned: boolean;               // 상단 고정 여부
  muted: boolean;                // 알림 끄기 여부
  section?: 'mine' | 'joined';   // 비콘 탭에서 "내 비콘" / "참여 중인 비콘"
};

type Props = {
  item: ChatRoomRow;
  onPress: (row: ChatRoomRow) => void;
  onLongPress?: (row: ChatRoomRow) => void;
};

const ChatRoomCard: React.FC<Props> = ({ item, onPress, onLongPress }) => {
  const handlePress = () => onPress(item);
  const handleLongPress = () => {
    if (onLongPress) onLongPress(item);
  };

  const timeLabel = formatTime(item.updated_at);
  const hasUnread = item.unread != null && item.unread > 0;

  const previewText = useMemo(() => {
    if (item.pending) return '수락 대기중';
    return normalizeLastMessagePreview(item.last_msg) || '메시지가 없습니다.';
  }, [item.pending, item.last_msg]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.container,
        pressed && { opacity: 0.7 },
      ]}
    >
      {/* 아바타 */}
      <View style={styles.avatarWrap}>
        {item.avatar_url ? (
          <Image
            source={{ uri: item.avatar_url }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {item.title?.[0] ?? '?'}
            </Text>
          </View>
        )}
      </View>

      {/* 중앙 텍스트 영역 */}
      <View style={styles.centerArea}>
        <View style={styles.titleRow}>
          <Text
            style={styles.title}
            numberOfLines={1}
          >
            {item.title}
          </Text>

          {/* 타이틀 옆 아이콘들 */}
          {item.pinned && (
            <Pin
              size={14}
              color="#111827"
              style={{ marginLeft: 4 }}
            />
          )}
          {item.favorite && !item.pinned && (
            <Pin
              size={14}
              color="#F59E0B"
              style={{ marginLeft: 4 }}
            />
          )}
          {item.muted && (
            <BellOff
              size={14}
              color="#9CA3AF"
              style={{ marginLeft: 4 }}
            />
          )}
        </View>

        <View style={styles.subtitleRow}>
          <Text
            style={styles.lastMsg}
            numberOfLines={1}
          >
            {previewText}
          </Text>
        </View>
      </View>

      {/* 우측 시간 / 뱃지 */}
      <View style={styles.rightArea}>
        {!!timeLabel && (
          <Text style={styles.timeText}>{timeLabel}</Text>
        )}

        <View style={styles.rightBottomRow}>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unread && item.unread > 99 ? '99+' : item.unread}
              </Text>
            </View>
          )}
          <ChevronRight size={16} color="#D1D5DB" />
        </View>
      </View>
    </Pressable>
  );
};

export default ChatRoomCard;

/* =========================
 * Preview normalizer
 * ========================= */

function safeJsonParse(v?: string | null) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function stripReplyPrefix(s: string): string {
  const raw = String(s ?? '');
  return raw.replace(/^\s*\[reply:[^\]]+\]\s*/i, '').trim();
}

function isUrlLike(v?: string | null) {
  if (!v) return false;
  const s = String(v).trim();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('file://') ||
    s.startsWith('content://')
  );
}

function hasAudioHint(s: string) {
  const t = s.toLowerCase();
  return (
    t.includes('audio') ||
    t.includes('voice') ||
    t.includes('record') ||
    t.includes('.m4a') ||
    t.includes('.aac') ||
    t.includes('.mp3') ||
    t.includes('.wav') ||
    t.includes('.ogg') ||
    t.includes('.webm')
  );
}

function hasImageHint(s: string) {
  const t = s.toLowerCase();
  return (
    t.includes('image') ||
    t.includes('photo') ||
    t.includes('picture') ||
    t.includes('.jpg') ||
    t.includes('.jpeg') ||
    t.includes('.png') ||
    t.includes('.gif') ||
    t.includes('.webp') ||
    t.includes('.heic')
  );
}

function hasVideoHint(s: string) {
  const t = s.toLowerCase();
  return (
    t.includes('video') ||
    t.includes('.mp4') ||
    t.includes('.mov') ||
    t.includes('.mkv') ||
    t.includes('.m4v') ||
    t.includes('.avi')
  );
}

/**
 * ✅ 채팅방 리스트 프리뷰 규칙
 * - URL이 그대로 노출되면 안됨
 * - file/content/http(s) 형태면: 오디오/이미지/비디오 힌트로 라벨링
 * - JSON(배열/메타) 형태면 그것도 라벨링
 */
function normalizeLastMessagePreview(lastMsg: string | null): string {
  if (!lastMsg) return '';

  const raw = stripReplyPrefix(String(lastMsg));

  // 1) JSON 형태(배열/메타)로 들어오는 경우
  const js = safeJsonParse(raw);
  if (Array.isArray(js)) {
    // 이미지/파일 uri 배열로 저장되는 케이스
    const first = js[0] != null ? String(js[0]) : '';
    if (isUrlLike(first)) {
      if (hasImageHint(first)) return '사진';
      if (hasVideoHint(first)) return '동영상';
      if (hasAudioHint(first)) return '음성 메시지';
      return '파일';
    }
    // 문자열 배열이지만 URL이 아니면 그냥 축약
    const text = js.map((x) => String(x)).join(' ');
    return text.trim().length ? text : '';
  }

  if (js && typeof js === 'object') {
    const kind = String((js as any).kind ?? (js as any).type ?? '').toLowerCase();
    if (kind === 'audio' || kind === 'voice') return '음성 메시지';
    if (kind === 'image' || kind === 'photo') return '사진';
    if (kind === 'video') return '동영상';

    const uri = String(
      (js as any).uri ??
      (js as any).url ??
      (js as any).path ??
      (js as any).file_key ??
      (js as any).fileKey ??
      ''
    ).trim();

    if (isUrlLike(uri)) {
      if (hasImageHint(uri)) return '사진';
      if (hasVideoHint(uri)) return '동영상';
      if (hasAudioHint(uri)) return '음성 메시지';
      return '파일';
    }

    const text = String((js as any).text ?? (js as any).content ?? '').trim();
    if (text) return text;
  }

  // 2) plain string인데 URL 노출되는 경우 → 라벨로 치환
  if (isUrlLike(raw)) {
    if (hasImageHint(raw)) return '사진';
    if (hasVideoHint(raw)) return '동영상';
    if (hasAudioHint(raw)) return '음성 메시지';
    return '파일';
  }

  // 3) 문자열 내부에 URL이 섞여있는 경우도 방지(보수적으로 처리)
  //    예: "file:///...something.m4a"
  if (raw.includes('file://') || raw.includes('content://') || raw.includes('http://') || raw.includes('https://')) {
    if (hasImageHint(raw)) return '사진';
    if (hasVideoHint(raw)) return '동영상';
    if (hasAudioHint(raw)) return '음성 메시지';
    return '파일';
  }

  // 4) 일반 텍스트
  return raw;
}

/* =========================
 * Time formatter
 * ========================= */

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const hh = d.getHours();
  const mm = d.getMinutes();
  const hh12 = hh % 12 || 12;
  const ampm = hh < 12 ? '오전' : '오후';
  const mmStr = mm < 10 ? `0${mm}` : `${mm}`;

  if (isSameDay) {
    return `${ampm} ${hh12}:${mmStr}`;
  }

  const month = d.getMonth() + 1;
  const date = d.getDate();
  return `${month}/${date}`;
}

/* ---- 스타일 ---- */

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#E5E7EB',
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B7280',
  },

  centerArea: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    maxWidth: '80%',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMsg: {
    fontSize: 13,
    color: '#6B7280',
  },

  rightArea: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingLeft: 6,
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  rightBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unreadBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  unreadText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '700',
  },
});
