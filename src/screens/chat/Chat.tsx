// src/screens/chat/Chat.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Share,
  Linking,
  ScrollView,
  StatusBar,
  Dimensions,
  Keyboard,
  Animated as RNAnimated,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  useAnimatedScrollHandler,
  interpolateColor,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  MoreHorizontal,
  Send as SendIcon,
  Plus,
  Image as ImageIcon,
  UserPlus2,
  MapPin,
  Link as LinkIcon,
  Languages,
  Mic,
  X,
  Search,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
// ⛔️ MapView 제거됨
// import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { supabase } from '../../lib/supabase';
import VoiceRecorderModal from './VoiceRecorderModal';
import MediaPickerModal from './MediaPickerModal';

type Msg = {
  id: string;
  room_id: number;
  sender: string;
  content: string;
  original?: string | null;
  created_at: string;
  kind?: string | null;
};

type Member = { user_id: string };
type ProfLite = {
  nickname?: string | null;
  avatar_url?: string | null;
  follow_id?: string | null;
};

type Lang = { code: string; native: string };

const SUPPORTED_LANGS: Lang[] = [
  { code: 'ar', native: 'العربية' },
  { code: 'de', native: 'Deutsch' },
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'fr', native: 'Français' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'id', native: 'Bahasa Indonesia' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'pt', native: 'Português' },
  { code: 'ru', native: 'Русский' },
  { code: 'zh', native: '中文' },
];

const OUR_RED = '#e74c3c';
const OUR_BG = '#ffffff';
const OUR_TEXT_DARK = '#0f172a';
const OUR_BLUE_BUBBLE = '#2563eb';

const SWIPE_REPLY_THRESHOLD = 40;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_HEIGHT = 50;

/* ===================== Reply util ===================== */
function parseReplyPrefix(
  raw: string
): { replyToId: string | null; rest: string } {
  const m = raw.match(/^\[reply:([^\]]+)\](.*)$/s);
  if (!m) return { replyToId: null, rest: raw };
  return { replyToId: m[1], rest: m[2] ?? '' };
}
function getMsgSnippet(m: Msg): string {
  const parsed = parseReplyPrefix(m.content);
  const content = parsed.rest || m.content;

  if (content.startsWith('[image]')) return '사진';
  if (content.startsWith('[video]')) return '동영상';
  if (content.startsWith('[file]')) {
    const name = content.replace(/^\[file\]/, '').split('|')[1];
    return `파일 ${name || ''}`.trim();
  }
  if (content.startsWith('[loc]')) return '위치 공유';
  if (content.startsWith('[audio]')) return '음성메시지';

  const base = (m.original ?? content)
    .replace(/\[reply:[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) return '메시지';
  const MAX = 80;
  return base.length > MAX ? base.slice(0, MAX) + '…' : base;
}

/* ===================== 파일 업로드 유틸 ===================== */
const extra: any =
  (Constants as any)?.expoConfig?.extra ||
  (Constants as any)?.manifest?.extra ||
  {};

const rawFnBase =
  extra.EXPO_PUBLIC_FN_BASE ||
  (extra.EXPO_PUBLIC_SUPABASE_URL
    ? `${extra.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
    : '');

export const FN_BASE = (rawFnBase || '').replace(/\/+$/, '');

async function fileToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`file fetch failed: ${res.status} ${res.statusText}`);
  return await res.blob();
}
function guessExt(name?: string, fallbackMime?: string): string {
  const m = name?.match(/\.([a-zA-Z0-9]+)$/);
  if (m) return m[1].toLowerCase();
  if (fallbackMime?.includes('jpeg')) return 'jpg';
  if (fallbackMime?.includes('png')) return 'png';
  if (fallbackMime?.includes('mp4')) return 'mp4';
  if (fallbackMime?.includes('m4a')) return 'm4a';
  return 'bin';
}
async function presignUpload({
  roomId,
  mime,
  size,
  ext,
  variant = 'medium',
}: {
  roomId: number;
  mime: string;
  size: number;
  ext: string;
  variant?: 'medium' | 'thumb' | 'file' | 'audio' | 'video';
}) {
  if (!FN_BASE) throw new Error('FN_BASE is not configured');

  const { data: s } = await supabase.auth.getSession();
  const jwt = s.session?.access_token ?? '';

  const url = `${FN_BASE}/upload-media`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ roomId, mime, size, ext, variant }),
  });
  if (!r.ok) throw new Error(`presign failed: ${r.status} ${await r.text().catch(()=> '')}`);

  return (await r.json()) as {
    msgId: string;
    objectKey: string;
    uploadUrl: string;
    publicUrl: string;
    meta: any;
  };
}
async function putToR2(uploadUrl: string, blob: Blob, mime: string) {
  const r = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: blob,
  });
  if (!r.ok) throw new Error(`R2 upload failed: ${r.status} ${await r.text().catch(()=> '')}`);
}

/* ===================== Animated FlatList ===================== */
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList);

/* ===================== Component ===================== */
export default function Chat() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const roomIdParamRaw = (route?.params?.roomId ?? null) as unknown;
  const roomIdParamNum =
    typeof roomIdParamRaw === 'number'
      ? roomIdParamRaw
      : typeof roomIdParamRaw === 'string'
      ? Number(roomIdParamRaw)
      : NaN;

  const [chatRoomId, setChatRoomId] = useState<number | null>(
    Number.isFinite(roomIdParamNum) ? roomIdParamNum : null
  );

  useEffect(() => {
    const p: any = route?.params ?? {};
    const asNum = (v: any) =>
      typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;

    const rid = asNum(p?.roomId);
    if (Number.isFinite(rid)) {
      if (chatRoomId !== rid) setChatRoomId(rid);
      return;
    }

    const bid = asNum(p?.beaconId);
    if (!Number.isFinite(bid)) return;

    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('type', 'beacon')
        .eq('beacon_id', bid)
        .maybeSingle();

      if (!alive) return;

      if (!error && data?.id) {
        navigation.setParams?.({ roomId: data.id, beaconId: undefined });
        setChatRoomId(data.id);
      } else {
        Alert.alert('채팅방을 찾을 수 없습니다.', `beaconId=${bid}`);
      }
    })();

    return () => {
      alive = false;
    };
  }, [route?.params, navigation, chatRoomId]);

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfLite>>({});
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [participantCount, setParticipantCount] = useState(1);

  const [text, setText] = useState('');

  const [myLang, setMyLang] = useState('ko');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [showOriginalGlobal, setShowOriginalGlobal] = useState(false);
  const [tCache, setTCache] = useState<Record<string, string>>({});
  const [tPending, setTPending] = useState<Record<string, boolean>>({});

  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const replyToRef = useRef<Msg | null>(null);
  useEffect(() => {
    replyToRef.current = replyTo;
  }, [replyTo]);

  const [longPressTarget, setLongPressTarget] = useState<Msg | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [translatePopoverOpen, setTranslatePopoverOpen] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [roomOwnerId, setRoomOwnerId] = useState<string | null>(null);

  // 🔽 새 메시지 배지 / 바닥 여부
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [showNewMsgPill, setShowNewMsgPill] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);


    // 🔽 멀티 선택 / 삭제 다이얼로그 상태
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  type DeleteOption = 'all' | 'me' | 'hide';
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteOption, setDeleteOption] = useState<DeleteOption>('all');
  const [deleteDialogCanAll, setDeleteDialogCanAll] = useState(false);
  const [deleteDialogCanHide, setDeleteDialogCanHide] = useState(false);


  // 🔎 검색 모달 상태
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<string[]>([]);

  const listRef = useRef<FlatList<any>>(null);
  const scrollToEndNow = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);
  const sendingRef = useRef(false);

  const [photoQuality, setPhotoQuality] =
    useState<'low' | 'standard' | 'original'>('standard');
  const [videoQuality, setVideoQuality] =
    useState<'standard' | 'high'>('standard');

 const scrollY = useSharedValue(0);

  // 🔹 스크롤 중인지 여부 (날짜 캡슐 + 새메시지 배지용)
  const [scrolling, setScrolling] = useState(false);
  const scrollEndTimer = useRef<any>(null);

  // atBottom 여부를 JS로 넘겨주기
  const onListScroll = useCallback((atBottom: boolean) => {
    setScrolling(true);
    setIsAtBottom(atBottom);

    if (scrollEndTimer.current) {
      clearTimeout(scrollEndTimer.current);
    }
    scrollEndTimer.current = setTimeout(() => {
      setScrolling(false);
    }, 600);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollEndTimer.current) {
        clearTimeout(scrollEndTimer.current);
      }
    };
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;

      // 🔽 바닥 근처인지 계산
      const contentH = e.contentSize.height || 0;
      const offsetY = e.contentOffset.y || 0;
      const viewH = e.layoutMeasurement.height || 0;

      const bottomGap = contentH - (offsetY + viewH);
      const atBottom = bottomGap < 40; // 40px 이내면 바닥으로 간주

      runOnJS(onListScroll)(atBottom);
    },
  });

  // 입력창/채팅 같이 이동: 키보드 높이 애니메이션
  const keyboardBottom = useRef(new RNAnimated.Value(0)).current;
  const [kbVisible, setKbVisible] = useState(false);

  // 선택 모드에서 개별 메시지 토글
  const toggleSelectMessage = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // 선택된 게 0개가 되면 자동으로 선택 모드 종료
  useEffect(() => {
    if (selectionMode && selectedIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedIds]);


  // ✅ 입력 영역 '전체' 높이 (답글 컴포저/패딩/세이프에리어 포함) 측정
  const [inputAreaH, setInputAreaH] = useState(60);
  const [floatH, setFloatH] = useState(32);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKbVisible(true);
      const toValue = e.endCoordinates?.height ?? 0;
      RNAnimated.timing(keyboardBottom, {
        toValue,
        duration: Platform.OS === 'ios' ? e.duration || 220 : 0,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e: any) => {
      setKbVisible(false);
      RNAnimated.timing(keyboardBottom, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e?.duration || 220 : 0,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardBottom]);

  const formatTime = (msOrIso: string | number) => {
    if (typeof msOrIso === 'number') {
      const secRaw = Math.round(msOrIso / 1000);
      const sec = secRaw < 0 ? 0 : secRaw;
      const m = Math.floor(sec / 60)
        .toString()
        .padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    }
    try {
      return new Date(msOrIso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return '';
    }
  };

  const dayKey = (iso: string) => new Date(iso).toDateString();
  const isSameMinute = (a: string, b: string) => {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  );
};

  const ensureSession = useCallback(async () => {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }
    return session;
  }, []);

  const ensureMembership = useCallback(async (roomId: number) => {
    const rid = Number(roomId);
    try {
      const { data: roomRow } = await supabase
        .from('chat_rooms')
        .select('type, beacon_id')
        .eq('id', rid)
        .maybeSingle();

      if (roomRow?.type === 'beacon' && roomRow?.beacon_id) {
        const { data: id } = await supabase.rpc('join_room_beacon', {
          p_beacon_id: roomRow.beacon_id,
        });
        if (id) await supabase.rpc('join_room', { p_room_id: id });
        return;
      }

      await supabase.rpc('join_room', { p_room_id: rid });
    } catch (err) {
      console.warn('ensureMembership failed', err);
    }
  }, []);

  /* initial */
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!Number.isFinite(Number(chatRoomId))) return;

      try {
        const session = await ensureSession();
        if (!session) throw new Error('로그인이 필요합니다.');

        await ensureMembership(Number(chatRoomId));

        const { data: prof } = await supabase
          .from('profiles')
          .select(
            'preferred_lang, auto_translate_default, show_original_default'
          )
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (mounted) {
          setMe(session.user.id);
          if (prof?.preferred_lang) setMyLang(prof.preferred_lang);
          if (typeof prof?.auto_translate_default === 'boolean')
            setAutoTranslate(!!prof.auto_translate_default);
          if (typeof prof?.show_original_default === 'boolean')
            setShowOriginalGlobal(!!prof.show_original_default);
        }
      } catch {
        if (mounted) setMe(null as any);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [ensureSession, ensureMembership, chatRoomId]);

  /* load room data */
  useEffect(() => {
    if (!chatRoomId) return;
    let mounted = true;
    const roomPk = Number(chatRoomId);

    (async () => {
      const { data: m } = await supabase
        .from('chat_messages')
        .select('id, room_id, sender_id, content, original, created_at, kind')
        .eq('room_id', roomPk)
        .order('created_at', { ascending: true });

    if (mounted && m) {
      const mapped = (m as any[]).map((row) => ({
        ...row,
        sender: row.sender_id,
      }));
      const visible = mapped.filter((row: any) => row.kind !== 'hidden');
      setMsgs(visible as Msg[]);
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: false })
      );
    }

      const { data: mems } = await supabase
        .from('chat_members')
        .select('user_id,last_read_at')
        .eq('room_id', roomPk);


      const ids = Array.from(
        new Set(((mems as any[]) ?? []).map((x) => x.user_id as string))
      );

      if (me) {
        const myRow = (mems as any[])?.find((x) => x.user_id === me);
        if (myRow?.last_read_at && mounted) {
          setLastReadAt(myRow.last_read_at as string);
        }
        if (!ids.includes(me)) ids.push(me);
      }

      if (mounted) {
        setMembers(ids.map((user_id) => ({ user_id })));
        setParticipantCount(ids.length || 1);
      }

      if (ids.length) {
        const { data: profRows } = await supabase
          .from('profiles')
          .select('user_id,nickname,avatar_url,follow_id')
          .in('user_id', ids);

        const map: Record<string, ProfLite> = {};
        (profRows ?? []).forEach((p: any) => {
          map[p.user_id] = {
            nickname: p.nickname ?? null,
            avatar_url: p.avatar_url ?? null,
            follow_id: p.follow_id ?? null,
          };
        });
        if (mounted) setProfiles(map);
      } else if (mounted) {
        setProfiles({});
      }
    })();

    return () => {
      mounted = false;
    };
  }, [chatRoomId, me]);

  /* title watch */
  useEffect(() => {
    if (!chatRoomId) return;
    const roomPk = Number(chatRoomId);
    let mounted = true;
    let unsub: any;

    (async () => {
      const { data: roomRow } = await supabase
        .from('chat_rooms')
        .select('id, type, custom_title, beacon_id, created_by')
        .eq('id', roomPk)
        .maybeSingle();

      if (!mounted) return;

      const roomType = roomRow?.type ?? null;
      const customTitle = roomRow?.custom_title?.trim() || '';

      // 현재 방 멤버 / 나를 제외한 상대들
      const memberIds = members.map((m) => m.user_id);
      const otherIds = me
        ? memberIds.filter((uid) => uid !== me)
        : memberIds;

      const getNickname = (uid: string | null | undefined) => {
        if (!uid) return '';
        const nick = profiles[uid]?.nickname;
        return (nick ?? '').trim();
      };

      let resolvedTitle = '';

      // 1순위: 내가 직접 또는 방장이 설정한 custom_title
      if (customTitle) {
        resolvedTitle = customTitle;
      } else if (roomType === 'self') {
        // 나와의 채팅 방
        const myNick = getNickname(me);
        resolvedTitle = myNick || '나와의 채팅';
      } else if (
        roomType === 'dm' ||
        roomType === 'personal' || // 기존 personal 타입도 1:1 취급
        (!roomType && otherIds.length === 1) // type이 안들어왔지만 멤버가 2명뿐인 경우
      ) {
        // 🔹 1:1 채팅 방 제목: 상대 닉네임 (없으면 '대화상대')
        if (otherIds.length === 1) {
          const nick = getNickname(otherIds[0]);
          resolvedTitle = nick || '대화상대';
        } else {
          resolvedTitle = '1:1 채팅';
        }
      } else if (roomType === 'group') {
        // 🔹 그룹 채팅: 닉네임들 + "외 N"
        const nicks = memberIds
          .map((id) => getNickname(id))
          .filter((s) => !!s);

        if (nicks.length) {
          resolvedTitle =
            nicks.slice(0, 3).join(', ') +
            (nicks.length > 3 ? ` 외 ${nicks.length - 3}` : '');
        }

        if (!resolvedTitle.trim()) {
          resolvedTitle = `그룹채팅 #${roomPk}`;
        }
      } else if (roomType === 'open') {
        // 🔹 오픈 채팅: custom_title 없으면 기본 형식
        resolvedTitle = `오픈채팅 #${roomPk}`;
      } else if (roomType === 'beacon') {
        // 🔹 비콘 채팅: 비콘 제목 우선
        let beaconTitle = '';

        if (roomRow?.beacon_id != null) {
          const beaconPk = Number(roomRow.beacon_id);

          try {
            // beacons_visible 우선
            const { data: vrow } = await supabase
              .from('beacons_visible')
              .select('title')
              .eq('id', beaconPk)
              .maybeSingle();

            if (vrow?.title?.trim()) {
              beaconTitle = vrow.title.trim();
            }
          } catch {}

          if (!beaconTitle) {
            try {
              // 원본 beacons 테이블 fallback
              const { data: brow } = await supabase
                .from('beacons')
                .select('title')
                .eq('id', beaconPk)
                .maybeSingle();

              if (brow?.title?.trim()) {
                beaconTitle = brow.title.trim();
              }
            } catch {}
          }

          if (!beaconTitle) {
            beaconTitle = `비콘채팅 #${roomPk}`;
          }

          if (mounted) {
            setTitle(beaconTitle);
            setRoomOwnerId(roomRow?.created_by ?? null);
          }

          // 비콘 제목 변경 실시간 반영
          const ch = supabase
            .channel(`beacon_title_${beaconPk}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'beacons',
                filter: `id=eq.${beaconPk}`,
              },
              (payload) => {
                const nt = (payload.new as any)?.title;
                if (typeof nt === 'string' && nt.trim()) {
                  setTitle(nt.trim());
                }
              },
            )
            .subscribe();

          unsub = ch;
          return;
        }
      }

      if (!resolvedTitle) {
        resolvedTitle = `채팅방 #${roomPk}`;
      }

      if (mounted) {
        setTitle(resolvedTitle);
        setRoomOwnerId(roomRow?.created_by ?? null);
      }
    })();

    return () => {
      mounted = false;
      try {
        if (unsub) supabase.removeChannel(unsub);
      } catch {}
    };
  }, [chatRoomId, members, profiles, me]);


  /* realtime messages */
  useEffect(() => {
    if (!chatRoomId) return;
    const roomPk = Number(chatRoomId);

    const ch = supabase
      .channel(`chat_${roomPk}`)
      // INSERT: 새 메시지
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomPk}`,
        },
        (payload) => {
          const incoming = {
            ...(payload.new as any),
            sender: (payload.new as any).sender_id,
          } as Msg;

          // hidden 으로 들어오는 건 안 보이게
          if (incoming.kind === 'hidden') return;

          // 🔹 그냥 리스트에만 추가 (자동 스크롤 X)
          setMsgs((prev) => [...prev, incoming]);

          // 🔹 상대방(또는 시스템) 메시지면 새 메시지 배지 증가
          if (!me || incoming.sender !== me) {
            setNewMsgCount((prev) => prev + 1);
            setShowNewMsgPill(true);
          }
        }
      )
  // UPDATE: 방장이 가린 메시지 등
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'chat_messages',
      filter: `room_id=eq.${roomPk}`,
    },
    (payload) => {
      const updated = payload.new as any;

      // hidden 으로 바뀐 경우 → 리스트에서 제거
      if (updated.kind === 'hidden') {
        setMsgs((prev) =>
          prev.filter((x) => String(x.id) !== String(updated.id))
        );
      } else {
        // 그 외 업데이트는 내용만 교체
        setMsgs((prev) =>
          prev.map((x) =>
            String(x.id) === String(updated.id)
              ? ({
                  ...x,
                  ...updated,
                  sender: updated.sender_id,
                } as Msg)
              : x
          )
        );
      }
    }
  )
  // DELETE: 본인이 1일 내 모두삭제한 경우
  .on(
    'postgres_changes',
    {
      event: 'DELETE',
      schema: 'public',
      table: 'chat_messages',
      filter: `room_id=eq.${roomPk}`,
    },
    (payload) => {
      const deleted = payload.old as any;
      setMsgs((prev) =>
        prev.filter((x) => String(x.id) !== String(deleted.id))
      );
    }
  )
  .subscribe();


    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [chatRoomId, me]);

  /* realtime members */
  useEffect(() => {
    if (!chatRoomId) return;
    const roomPk = Number(chatRoomId);

    const ch = supabase
      .channel(`chat_members_${roomPk}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${roomPk}`,
        },
        async () => {
          try {
            const { data: mems } = await supabase
              .from('chat_members')
              .select('user_id')
              .eq('room_id', roomPk);
            const ids = Array.from(
              new Set((mems ?? []).map((x: any) => x.user_id))
            );
            if (me && !ids.includes(me)) ids.push(me);
            setMembers(ids.map((user_id: string) => ({ user_id })));
            setParticipantCount(ids.length || 1);

            if (ids.length) {
              const { data: profRows } = await supabase
                .from('profiles')
                .select('user_id,nickname,avatar_url,follow_id')
                .in('user_id', ids);

              const map: Record<string, ProfLite> = {};
              (profRows ?? []).forEach((p: any) => {
                map[p.user_id] = {
                  nickname: p.nickname ?? null,
                  avatar_url: p.avatar_url ?? null,
                  follow_id: p.follow_id ?? null, 
                };
              });
              setProfiles(map);
            } else {
              setProfiles({});
            }
          } catch {}
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [chatRoomId, me]);

  /* helpers */
  const canDeleteMessage = useCallback(
    (m: Msg) =>
      !!me &&
      (m.sender === me || (roomOwnerId != null && roomOwnerId === me)),
    [me, roomOwnerId]
  );

  const triggerReplyFromSwipe = useCallback((m: Msg) => {
    setReplyTo(m);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, []);

  const openPublicProfile = useCallback(
    (userId: string) => {
      navigation.navigate('ProfileView', { userId, publicView: true });
    },
    [navigation]
  );

  const firstDateLabel = useMemo(() => {
    if (!msgs.length) return null;

    const d = new Date(msgs[0].created_at);
    if (Number.isNaN(d.getTime())) return null;

    return `${d.getFullYear()}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}.${d
      .getDate()
      .toString()
      .padStart(2, '0')}`;
  }, [msgs]);

  const withSeparators = useMemo(() => {
    const out: Array<Msg | { __sep: string; key: string }> = [];
    if (!msgs.length) return out;

    let prev: string | null = null;

    for (const m of msgs) {
      const k = dayKey(m.created_at);

      if (k !== prev) {
        out.push({ __sep: k, key: `sep-${k}-${out.length}` } as any);
        prev = k;
      }

      out.push(m);
    }

    return out;
  }, [msgs]);

  const withSeparatorsRef = useRef<any[]>([]);
  useEffect(() => {
    withSeparatorsRef.current = withSeparators as any[];
  }, [withSeparators]);

  const scrollToMessage = useCallback((msgId: string) => {
    if (!listRef.current) return;
    const data = withSeparatorsRef.current;
    const idx = data.findIndex((x: any) => x && !x.__sep && x.id === msgId);
    if (idx < 0) return;
    try {
      listRef.current.scrollToIndex({
        index: idx,
        animated: true,
      });
    } catch {
      listRef.current.scrollToEnd({ animated: true });
    }
  }, []);

  /* 번역 */
  const callTranslate = useCallback(async (text0: string, target: string) => {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { text: text0, to: target },
    });
    if (error) throw error;
    return (data?.result as string) ?? '';
  }, []);

  const translateMessageIfNeeded = useCallback(
    async (m: Msg) => {
      if (m.sender === me) return;

      const { rest } = parseReplyPrefix(m.content);

      if (
        rest.startsWith('[image]') ||
        rest.startsWith('[video]') ||
        rest.startsWith('[file]') ||
        rest.startsWith('[loc]') ||
        rest.startsWith('[audio]')
      )
        return;

      if (tCache[m.id] || tPending[m.id]) return;

      try {
        setTPending((p) => ({ ...p, [m.id]: true }));
        const result = await callTranslate(m.original ?? rest, myLang);
        if (result && result.trim().length > 0) {
          setTCache((p) => ({ ...p, [m.id]: result }));
        }
      } catch {
      } finally {
        setTPending((p) => {
          const { [m.id]: _, ...restP } = p;
          return restP;
        });
      }
    },
    [me, myLang, tCache, tPending, callTranslate]
  );

  useEffect(() => {
    if (!autoTranslate) return;
    msgs.slice(-100).forEach((m) => translateMessageIfNeeded(m));
  }, [msgs, myLang, autoTranslate, translateMessageIfNeeded]);

  // ✅ 이 방의 마지막 메시지까지 읽음 처리
  const markAllRead = useCallback(async () => {
    if (!chatRoomId || !me) return;
    const roomPk = Number(chatRoomId);
    const nowIso = new Date().toISOString();

    // UI 에서도 바로 반영
    setLastReadAt(nowIso);

    try {
      await supabase
        .from('chat_members')
        .update({ last_read_at: nowIso })
        .eq('room_id', roomPk)
        .eq('user_id', me);
    } catch (e) {
      console.log('markAllRead error', e);
    }
  }, [chatRoomId, me]);

    useEffect(() => {
    if (!isAtBottom) return;

    // 바닥이면 새 메시지 배지 지우고
    setShowNewMsgPill(false);
    setNewMsgCount(0);

    // 메시지가 하나라도 있으면 읽음 처리
    if (msgs.length > 0) {
      markAllRead();
    }
  }, [isAtBottom, msgs.length, markAllRead]);

  

  /* send text / structured */
  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || !chatRoomId || !me) return;

      const roomPk = Number(chatRoomId);
      if (sendingRef.current) return;

      const currentReply = replyToRef.current;
      const replyPrefix = currentReply ? `[reply:${String(currentReply.id)}]` : '';

      const tagged = content.match(/^\[(image|video|file|loc|audio)\]/)?.[1];
      const kind =
        tagged === 'image'
          ? 'image'
          : tagged === 'video'
          ? 'video'
          : tagged === 'file'
          ? 'file'
          : tagged === 'loc'
          ? 'loc'
          : tagged === 'audio'
          ? 'audio'
          : 'text';

      try {
        sendingRef.current = true;
        setText('');

        await ensureMembership(roomPk);

        let finalContent = content;
        let originalForSave: string | null = null;
        const isPlainText = kind === 'text';

        if (isPlainText && autoTranslate) {
          try {
            const translated = await callTranslate(content, myLang);
            if (translated) {
              finalContent = translated;
              originalForSave = content;
            }
          } catch {}
        }

        if (originalForSave) {
          originalForSave = replyPrefix + originalForSave;
        }
        finalContent = replyPrefix + finalContent;

        const optimistic: Msg = {
          id: `temp-${Date.now()}`,
          room_id: roomPk,
          sender: me,
          content: finalContent,
          original: originalForSave,
          created_at: new Date().toISOString(),
        };
        setMsgs((prev) => [...prev, optimistic]);
        scrollToEndNow();
        setShowNewMsgPill(false);
        setNewMsgCount(0);

        const { error } = await supabase.from('chat_messages').insert({
          room_id: roomPk,
          sender_id: me,
          content: finalContent,
          original: originalForSave ?? null,
          kind,
        } as any);

        if (error) {
          if ((error as any)?.message?.includes('row-level security')) {
            throw new Error(
              '메시지를 보낼 권한이 없습니다. (RLS)\n' +
                '→ chat_members에 내가 포함되어 있는지, chat_messages 정책을 확인하세요.'
            );
          }
          throw error;
        }

        if (currentReply) setReplyTo(null);
      } catch (e: any) {
        Alert.alert('전송 실패', e?.message ?? '메시지 전송 실패');
      } finally {
        sendingRef.current = false;
      }
    },
    [chatRoomId, me, ensureMembership, autoTranslate, myLang, callTranslate, scrollToEndNow]
  );

  /* 파일 전송 */
  const pickAndSendFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;

      const f = res.assets[0];
      const fileName = f.name ?? 'file.bin';
      const mime = f.mimeType ?? 'application/octet-stream';

      if (!chatRoomId) throw new Error('방 정보가 없습니다.');
      const blob = await fileToBlob(f.uri);
      const ext = guessExt(fileName, mime);

      const { uploadUrl, publicUrl } = await presignUpload({
        roomId: Number(chatRoomId),
        mime,
        size: blob.size,
        ext,
        variant: 'file',
      });
      await putToR2(uploadUrl, blob, mime);

      await send(`[file]${publicUrl}|${fileName}`);
    } catch (e: any) {
      Alert.alert('업로드 실패', e?.message ?? String(e));
    }
  }, [chatRoomId, send]);

  /* 위치/초대/링크 */
  const openMapPicker = useCallback(() => {
    if (!chatRoomId) return;
    const roomPk = Number(chatRoomId);
    setSheetOpen(false);
    navigation.navigate('MapPicker', {
      roomId: roomPk,
      onPick: async ({ lat, lng, address }: { lat: number; lng: number; address?: string }) => {
        // [loc]lat,lng|주소  형식으로 저장
        const addr = address && address.trim().length > 0 ? address.trim() : '';
        await send(`[loc]${lat},${lng}${addr ? `|${addr}` : ''}`);
      },
    });
  }, [chatRoomId, navigation, send]);

  const openInviteFriends = useCallback(() => {
    if (!chatRoomId) return;
    const roomPk = Number(chatRoomId);
    setSheetOpen(false);
    navigation.navigate('ChatInvite', { roomId: roomPk });
  }, [chatRoomId, navigation]);

  const shareInviteLink = useCallback(async () => {
    try {
      if (!chatRoomId) return;
      const url = `https://co-onn.app/join-room/${encodeURIComponent(
        String(chatRoomId)
      )}`;
      await Share.share({ message: url });
      setSheetOpen(false);
    } catch (e: any) {
      Alert.alert('공유 실패', e.message ?? String(e));
    }
  }, [chatRoomId]);

    // 🔽 멀티 선택 후, 어떤 삭제 옵션이 가능한지 계산하고 다이얼로그 오픈
  const openDeleteDialog = useCallback(() => {
    const selectedMsgs = msgs.filter((m) => selectedIds.includes(m.id));
    if (!selectedMsgs.length) return;

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const isOwner = !!me && !!roomOwnerId && roomOwnerId === me;
    const allMine = !!me && selectedMsgs.every((m) => m.sender === me);
    const allOthers = !!me && selectedMsgs.every((m) => m.sender !== me);

    const canAllDelete =
      allMine &&
      selectedMsgs.every((m) => {
        const t = new Date(m.created_at).getTime();
        return Number.isFinite(t) && now - t < ONE_DAY_MS;
      });

    const canHideAsOwner = isOwner && allOthers;

    setDeleteDialogCanAll(canAllDelete);
    setDeleteDialogCanHide(canHideAsOwner);

    if (canAllDelete) setDeleteOption('all');
    else if (canHideAsOwner) setDeleteOption('hide');
    else setDeleteOption('me');

    setDeleteDialogVisible(true);
  }, [msgs, selectedIds, me, roomOwnerId]);

  // 🔽 실제 삭제 실행
  const performDelete = useCallback(async () => {
    const selectedMsgs = msgs.filter((m) => selectedIds.includes(m.id));
    if (!selectedMsgs.length) return;

    const mode = deleteOption; // 'all' | 'me' | 'hide'
    setDeleteDialogVisible(false);

    // 1) 나에게서만 삭제: 클라이언트에서만 제거
    if (mode === 'me') {
      setMsgs((prev) => prev.filter((m) => !selectedIds.includes(m.id)));
      setSelectedIds([]);
      setSelectionMode(false);
      return;
    }

    try {
      const numericIds = selectedMsgs
        .map((m) => Number(m.id))
        .filter((id) => Number.isFinite(id)) as number[];

      if (mode === 'all') {
        if (numericIds.length && me) {
          const { error } = await supabase
            .from('chat_messages')
            .delete()
            .in('id', numericIds)
            .eq('sender_id', me); // 안전장치

          if (error) throw error;
        }

        setMsgs((prev) => prev.filter((m) => !selectedIds.includes(m.id)));

        if (chatRoomId && me) {
          await supabase.from('chat_messages').insert({
            room_id: Number(chatRoomId),
            sender_id: me,
            content: `[deleted]|${me}`,
            original: null,
            kind: 'system_deleted',
            is_notice: true,
          } as any);
        }
      } else if (mode === 'hide') {
        if (numericIds.length && me) {
          await supabase
            .from('chat_messages')
            .update({ kind: 'hidden', content: '' })
            .in('id', numericIds);
        }

        setMsgs((prev) => prev.filter((m) => !selectedIds.includes(m.id)));

        if (chatRoomId && me) {
          await supabase.from('chat_messages').insert({
            room_id: Number(chatRoomId),
            sender_id: me,
            content: `[deleted]|${me}`,
            original: null,
            kind: 'system_deleted',
            is_notice: true,
          } as any);
        }
      }
    } catch (e: any) {
      Alert.alert('삭제 실패', e?.message ?? '메시지 삭제에 실패했습니다.');
    } finally {
      setSelectedIds([]);
      setSelectionMode(false);
    }
  }, [msgs, selectedIds, deleteOption, chatRoomId, me]);


  /* 이미지 프리뷰 핀치줌 */
  const scale = useSharedValue(1);
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = e.scale;
    })
    .onEnd(() => {
      scale.value = withTiming(Math.min(3, Math.max(1, scale.value)), {
        duration: 150,
      });
    })
    .onFinalize(() => {
      if (!previewImage) scale.value = 1;
    });

  const previewStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onMessageLongPress = useCallback((m: Msg) => {
    setLongPressTarget(m);
    setActionSheetOpen(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }, []);

  /* ===================== MessageRow ===================== */
  const MessageRow = React.useCallback(
    ({ item, index }: { item: any; index: number }) => {
      // 날짜 구분자
      if ((item as any).__sep) {
        const d = new Date((item as any).__sep);
        const label = `${d.getFullYear()}.${(d.getMonth() + 1)
          .toString()
          .padStart(2, '0')}.${d
          .getDate()
          .toString()
          .padStart(2, '0')}`;
        return (
          <View style={styles.sepWrap}>
            <Text style={styles.sepTxt}>{label}</Text>
          </View>
        );
      }

      const m = item as Msg;
            // 🔹 이전/다음 실제 메시지 찾기 (날짜 구분자 제외)
      const data = withSeparatorsRef.current as any[];
      let prevMsg: Msg | null = null;
      let nextMsg: Msg | null = null;

      for (let i = index - 1; i >= 0; i--) {
        const row = data[i];
        if (row && !(row as any).__sep) {
          prevMsg = row as Msg;
          break;
        }
      }
      for (let i = index + 1; i < data.length; i++) {
        const row = data[i];
        if (row && !(row as any).__sep) {
          nextMsg = row as Msg;
          break;
        }
      }

      const mine = m.sender === me;

      const hasPrevSameBlock =
        !!prevMsg &&
        prevMsg.sender === m.sender &&
        isSameMinute(prevMsg.created_at, m.created_at);

      const hasNextSameBlock =
        !!nextMsg &&
        nextMsg.sender === m.sender &&
        isSameMinute(nextMsg.created_at, m.created_at);
              // 🔹 블럭/블럭내 간격 통일
      const rowSpacingStyle = {
        // 바로 위 메시지가 같은 블럭이면 3, 다른 블럭이면 12
        marginTop: hasPrevSameBlock ? 4 : 12,
        // 바로 아래 메시지가 같은 블럭이면 3, 블럭 끝이면 8
        marginBottom: hasNextSameBlock ? 4 : 8,
      };

      const showNick = !mine && !hasPrevSameBlock;   // 닉네임은 블럭 첫 메시지에만
      const showTime = !hasNextSameBlock;            // 시간은 블럭 마지막 메시지만
      const isSelected = selectionMode && selectedIds.includes(m.id);

      const prof = profiles[m.sender];
      const nickname = prof?.nickname?.trim() || '익명';
      const initial =
        (prof?.nickname?.trim?.()?.[0] ?? 'U').toUpperCase?.() ?? 'U';

      const { replyToId, rest } = parseReplyPrefix(m.content);
      const replyMsg = replyToId
        ? msgs.find((x) => String(x.id) === String(replyToId))
        : undefined;
      const contentForKind = rest;

      const isImage = contentForKind.startsWith('[image]');
      const isVideo = contentForKind.startsWith('[video]');
      const isFile = contentForKind.startsWith('[file]');
      const isLoc = contentForKind.startsWith('[loc]');
      const isAudio = contentForKind.startsWith('[audio]');
      const isImageGroup = contentForKind.startsWith('[images]');
      const isMedia = isImage || isVideo || isImageGroup;

      let locLat: number | null = null;
      let locLng: number | null = null;
      let locAddress: string | null = null;

      if (isLoc) {
        try {
          const raw = contentForKind.replace('[loc]', '').trim();
          const [coordPart, addrPart] = raw.split('|'); // [loc]lat,lng|주소
          const [latStr, lngStr] = (coordPart || '').split(',');
          const latN = Number(latStr);
          const lngN = Number(lngStr);
          if (Number.isFinite(latN) && Number.isFinite(lngN)) {
            locLat = latN;
            locLng = lngN;
          }
          if (addrPart && addrPart.trim()) {
            locAddress = addrPart.trim();
          }
        } catch {}
      }

      const rawAfterTag = contentForKind.replace(
        /^\[(image|images|video|file|loc|audio)\]/,
        '',
      );
      const parts = rawAfterTag.split('|');
      const payloadUrl = parts[0];
      const payloadName = parts[1];
      const payloadDurMs = isAudio ? Number(parts[2] ?? 0) : 0;
      const locLabel = isLoc ? payloadName : undefined;

      // 🔁 묶음 이미지 파싱
      let multiImages: { url: string; name?: string }[] = [];
      if (isImageGroup) {
        multiImages = rawAfterTag
          .split(';;;')
          .map((chunk) => {
            const [u, n] = chunk.split('|');
            return { url: u, name: n };
          })
          .filter((it) => it.url);
      }

      const doOpenLoc = () => {
        try {
          if (locLat == null || locLng == null) return;
          const lat = locLat,
            lng = locLng;
          const deep = Platform.select({
            ios: `comgooglemaps://?q=${lat},${lng}`,
            android: `geo:${lat},${lng}?q=${lat},${lng}`,
          })!;
          const web = `https://maps.google.com/?q=${lat},${lng}`;
          Linking.openURL(deep).catch(() => Linking.openURL(web));
        } catch {
          Alert.alert('열기 실패', '지도를 열 수 없습니다.');
        }
      };

      const isRead = lastReadAt
        ? new Date(m.created_at) <= new Date(lastReadAt)
        : false;

      const isStructured =
        isImage || isVideo || isFile || isLoc || isAudio || isImageGroup;

      const translatedText = tCache[m.id];
      let primaryText = contentForKind;
      let secondaryText: string | null = null;

      if (!isStructured) {
        if (!mine) {
          if (translatedText) {
            if (showOriginalGlobal) {
              primaryText = m.original ?? contentForKind;
              secondaryText = translatedText;
            } else {
              primaryText = translatedText;
              secondaryText = m.original ?? contentForKind;
            }
          }
        } else if (m.original && m.original !== contentForKind) {
          if (showOriginalGlobal) {
            primaryText = m.original;
            secondaryText = contentForKind;
          } else {
            primaryText = contentForKind;
            secondaryText = m.original;
          }
        }
      }

      const canShowTranslateActions = !mine && !isStructured;

      const handleRowPress = () => {
        // ✅ 선택 모드일 때: 줄 전체 눌러도 토글
        if (selectionMode) {
          toggleSelectMessage(m.id);
        }
      };

      const handleBubbleLongPress = () => {
        if (selectionMode) {
          toggleSelectMessage(m.id);
        } else {
          onMessageLongPress(m);
        }
      };

      // ===== 음성 버블 내부 컴포넌트 =====
      const AudioBubble = () => {
        const [localSound, setLocalSound] = useState<Audio.Sound | null>(null);
        const [localPlaying, setLocalPlaying] = useState(false);
        const [localPos, setLocalPos] = useState(0);
        const [localDur, setLocalDur] = useState(payloadDurMs || 0);

        useEffect(() => {
          return () => {
            (async () => {
              try {
                await localSound?.unloadAsync();
              } catch {}
            })();
          };
        }, [localSound]);

        const onStatusUpdate = (st: any) => {
          if (!st.isLoaded) return;
          if (typeof st.durationMillis === 'number')
            setLocalDur(st.durationMillis);
          setLocalPlaying(!!st.isPlaying);
          setLocalPos(st.positionMillis ?? 0);
          if (st.didJustFinish) {
            setLocalPlaying(false);
            setLocalPos(st.durationMillis ?? localDur ?? 0);
          }
        };

        const toggleLocalPlay = async () => {
          if (!payloadUrl) return;
          if (!localSound) {
            const s = new Audio.Sound();
            await s.loadAsync({ uri: payloadUrl }, {}, false);
            s.setOnPlaybackStatusUpdate(onStatusUpdate);
            setLocalSound(s);
            await s.playAsync();
          } else {
            const st: any = await localSound.getStatusAsync();
            if (!st.isLoaded) return;
            if (st.isPlaying) {
              await localSound.pauseAsync();
              setLocalPlaying(false);
            } else {
              if (
                st.didJustFinish ||
                (typeof st.positionMillis === 'number' &&
                  typeof st.durationMillis === 'number' &&
                  st.positionMillis >= st.durationMillis - 250)
              ) {
                await localSound.setPositionAsync(0);
              }
              await localSound.playAsync();
              setLocalPlaying(true);
            }
          }
        };

        const total = localDur || payloadDurMs || 1;
        const ratio = Math.max(
          0,
          Math.min(1, (localPos || 0) / total),
        );

        return (
          <View style={styles.audioBubbleWrap}>
            <Pressable onPress={toggleLocalPlay} style={styles.audioPlayBtn}>
              <View
                style={[
                  styles.audioPlayIconCircle,
                  mine
                    ? { backgroundColor: 'rgba(255,255,255,0.2)' }
                    : { backgroundColor: 'rgba(0,0,0,0.08)' },
                ]}
              >
                <Text
                  style={[
                    styles.audioPlayIcon,
                    mine ? { color: '#fff' } : { color: OUR_TEXT_DARK },
                  ]}
                >
                  {localPlaying ? '❚❚' : '▶'}
                </Text>
              </View>
            </Pressable>

            <View style={styles.audioBarOuter}>
              <View
                style={[
                  styles.audioBar,
                  mine
                    ? {
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        minWidth: 130,
                      }
                    : { backgroundColor: '#e2e8f0', minWidth: 130 },
                ]}
              >
                <View
                  style={[
                    styles.audioBarFill,
                    { width: `${ratio * 100}%` },
                    mine
                      ? { backgroundColor: '#fff' }
                      : { backgroundColor: '#0f172a' },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.audioDur,
                  mine
                    ? { color: 'rgba(255,255,255,0.9)' }
                    : { color: '#0f172a' },
                ]}
              >
                {formatTime(localPlaying ? localPos : total)}
              </Text>
            </View>
          </View>
        );
      };

      // ===== 버블 공통 스타일 + 그라데이션 색 =====
      let bubbleBaseStyle: any;
      if (isAudio) {
        bubbleBaseStyle = mine ? styles.voiceMine : styles.voiceTheirs;
      } else if (!isMedia) {
        bubbleBaseStyle = [styles.msgBubble, mine ? styles.mine : styles.theirs];
      }

      const rowY = useSharedValue(0);
      const ref = useRef<View>(null);

      useEffect(() => {
        const updatePosition = () => {
          if (ref.current) {
            ref.current.measureInWindow((_x, y) => {
              rowY.value = withTiming(y, { duration: 100 });
            });
          }
        };
        updatePosition();
        const id = setInterval(updatePosition, 80);
        return () => clearInterval(id);
      }, []);

      const animatedColor = useDerivedValue(() => {
        const relativeY =
          (rowY.value % (SCREEN_HEIGHT * 1.2)) / (SCREEN_HEIGHT * 1.2);
        const t = Math.max(0, Math.min(1, relativeY));

        const mineColor = interpolateColor(
          t,
          [0, 0.5, 1],
          ['#833ab4', '#fd1d1d', '#fcb045'],
        );
        const theirsColor = interpolateColor(
          t,
          [0, 0.5, 1],
          [
            'rgba(131,58,180,0.08)',
            'rgba(253,29,29,0.08)',
            'rgba(252,176,69,0.08)',
          ],
        );

        return mine ? mineColor : theirsColor;
      });

      const bubblePositionStyle = useAnimatedStyle(() => ({
        backgroundColor: withSpring(animatedColor.value, {
          stiffness: 200,
          damping: 15,
          mass: 0.5,
        }),
      }));

      const translateX = useSharedValue(0);
      const rowGesture = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          if (selectionMode) return; // 선택 모드에서는 스와이프 비활성
          const dx = e.translationX;
          if (dx < 0)
            translateX.value = Math.max(dx, -SWIPE_REPLY_THRESHOLD);
          else translateX.value = 0;
        })
        .onEnd(() => {
          if (selectionMode) {
            translateX.value = withTiming(0, { duration: 150 });
            return;
          }
          if (translateX.value <= -SWIPE_REPLY_THRESHOLD)
            runOnJS(triggerReplyFromSwipe)(m);
          translateX.value = withTiming(0, { duration: 150 });
        });

      const rowStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
      }));

      const replyLabel =
        replyMsg &&
        (replyMsg.sender === me
          ? '나에게 답장'
          : `${profiles[replyMsg.sender]?.nickname || '익명'}에게 답장`);

      const replySnippet = replyMsg && getMsgSnippet(replyMsg as Msg);

      // ===== system_deleted 시스템 메시지 =====
      if (m.kind === 'system_deleted') {
        const raw = m.content || '';
        let actorId: string | null = null;

        if (raw.startsWith('[deleted]|')) {
          const parts2 = raw.split('|');
          actorId = parts2[1] || null;
        }

        const actorNick =
          actorId && profiles[actorId]?.nickname?.trim()
            ? profiles[actorId]!.nickname!.trim()
            : null;

        const text = actorNick
          ? `${actorNick}님이 메시지를 삭제했습니다.`
          : '메시지가 삭제되었습니다.';

        return (
          <View style={[styles.msgRow, { justifyContent: 'center' }]}>
            <View style={styles.systemDeletedBubble}>
              <Text style={styles.systemDeletedText}>{text}</Text>
            </View>
          </View>
        );
      }

        return (
          <GestureDetector gesture={rowGesture}>
            <Pressable
              style={{ width: '100%' }}
              onPress={selectionMode ? () => toggleSelectMessage(m.id) : undefined}
            >
            <Animated.View
              ref={ref}
              style={[
                styles.msgRow,
                rowSpacingStyle,
                rowStyle,
              ]}
            >
              {/* 선택 모드일 때 왼쪽 원형 선택 마커 */}
              {selectionMode && (
                <View style={styles.selectMarkerWrap}>
                  <View
                    style={[
                      styles.selectMarkerOuter,
                      isSelected && styles.selectMarkerOuterOn,
                    ]}
                  >
                    {isSelected && <View style={styles.selectMarkerInner} />}
                  </View>
                </View>
              )}

              {/* 선택 모드가 아닐 때만 아바타 노출 */}
              {!selectionMode && !mine && (
                <View style={{ alignItems: 'center' }}>
                  {prof?.avatar_url ? (
                    <Pressable onPress={() => openPublicProfile(m.sender)}>
                      <Image
                        source={{ uri: prof.avatar_url }}
                        style={styles.avatarImg}
                      />
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => openPublicProfile(m.sender)}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarTxt}>{initial}</Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              )}

              {/* 메시지 전체 영역 */}
              <View
                style={[
                  { flex: 1, maxWidth: '88%' },
                  mine && { marginLeft: 'auto' },
                ]}
              >
              {/* 닉네임 (상대방, 블럭 첫 메시지만) */}
              {showNick && (
                <Text style={styles.nickText} numberOfLines={1}>
                  {nickname}
                </Text>
              )}

                {/* 말풍선 + 시간 한 줄 정렬 (카카오 스타일) */}
                <View
                  style={{
                    flexDirection: mine ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* 말풍선 / 미디어 영역 */}
                  <View
                    style={[
                      // 🔹 이미지/음성/지도는 살짝 더 좁게
                      { maxWidth: isStructured ? '85%' : '78%' },
                    ]}
                  >
                    {/* ===== 실제 메시지 컨텐츠 ===== */}
                    {/* ===== 실제 메시지 컨텐츠 ===== */}
                    {isAudio ? (
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelectMessage(m.id);
                            return;
                          }
                        }}
                        onLongPress={handleBubbleLongPress}
                        delayLongPress={250}
                      >
                        <Animated.View
                          style={[bubbleBaseStyle, bubblePositionStyle]}
                        >
                          <AudioBubble />
                        </Animated.View>
                      </Pressable>
                    ) : isImage ? (
                      // 🔹 단일 이미지
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelectMessage(m.id);
                            return;
                          }

                          // ✅ 단일 이미지 → MediaViewer로 이동
                          navigation.navigate('MediaViewer', {
                            roomId: Number(chatRoomId),
                            row: {
                              id: Number(m.id) || Date.now(),
                              type: 'image',
                              file_bucket: '',       // 지금은 사용 안 함
                              file_key: payloadUrl,  // 실제 이미지 URL
                              mime: 'image/jpeg',
                              sender: m.sender,
                              nickname: profiles[m.sender]?.nickname ?? '익명',
                              created_at: m.created_at,
                            
                            },
                          });
                        }}
                        onLongPress={handleBubbleLongPress}
                        delayLongPress={250}
                        style={[
                          styles.mediaShadowWrap,
                          { alignSelf: mine ? 'flex-end' : 'flex-start' },
                        ]}
                      >
                        <Image
                          source={{ uri: payloadUrl }}
                          style={styles.msgImage}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : isVideo ? (
                      // 🔹 동영상 (기존 그대로, 링크로 열기)
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelectMessage(m.id);
                            return;
                          }
                          if (payloadUrl) Linking.openURL(payloadUrl);
                        }}
                        onLongPress={handleBubbleLongPress}
                        delayLongPress={250}
                        style={[
                          styles.mediaShadowWrap,
                          { alignSelf: mine ? 'flex-end' : 'flex-start' },
                        ]}
                      >
                        <View style={[styles.msgImage, styles.videoThumb]}>
                          <View style={styles.videoBadge}>
                            <Text style={styles.videoTxt}>▶ 동영상 재생</Text>
                          </View>
                        </View>
                      </Pressable>
                    ) : isImageGroup ? (
                      // 🔹 묶음 이미지 (여러 장)
                      <View
                        style={[
                          styles.mediaShadowWrap,
                          { alignSelf: mine ? 'flex-end' : 'flex-start' },
                        ]}
                      >
                        <View style={styles.multiImgGrid}>
                          {multiImages.map((img, idx) => (
                            <Pressable
                              key={img.url + idx}
                              style={styles.multiImgCell}
                              onPress={() => {
                                if (selectionMode) {
                                  toggleSelectMessage(m.id);
                                  return;
                                }

                                // ✅ 이 메시지의 묶음 이미지 전체를 MediaViewer에 rows로 넘김
                              const rowsForViewer = multiImages.map((it, index) => ({
                                id: Number(m.id) * 1000 + index,
                                type: 'image' as const,
                                file_bucket: '',
                                file_key: it.url, // 각 이미지 URL
                                mime: 'image/jpeg',
                                sender: m.sender,
                                nickname: profiles[m.sender]?.nickname ?? '익명',
                                created_at: m.created_at,
                              }));

                              navigation.navigate('MediaViewer', {
                                roomId: Number(chatRoomId),
                                rows: rowsForViewer,
                                index: idx, // 사용자가 누른 사진 인덱스
                              });
                              }}
                              onLongPress={handleBubbleLongPress}
                              delayLongPress={250}
                            >
                              <Image
                                source={{ uri: img.url }}
                                style={styles.multiImg}
                                resizeMode="cover"
                              />
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : isFile ? (
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelectMessage(m.id);
                            return;
                          }
                          if (payloadUrl) Linking.openURL(payloadUrl);
                        }}
                        onLongPress={handleBubbleLongPress}
                        delayLongPress={250}
                      >
                        <Animated.View
                          style={[
                            styles.msgBubble,
                            mine ? styles.mine : styles.theirs,
                            bubblePositionStyle,
                          ]}
                        >
                          {replyMsg && (
                            <Pressable
                              style={[
                                styles.replyInline,
                                mine
                                  ? styles.replyInlineMine
                                  : styles.replyInlineTheirs,
                                {
                                  alignSelf: 'flex-start',
                                  maxWidth: '90%',
                                },
                              ]}
                              onPress={() => scrollToMessage(replyMsg.id)}
                            >
                              <View style={styles.replyInlineBar} />
                              <View>
                                <Text
                                  style={[
                                    styles.replyInlineLabel,
                                    mine && {
                                      color: 'rgba(255,255,255,0.7)',
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {replyLabel}
                                </Text>
                                <Text
                                  style={[
                                    styles.replyInlineText,
                                    mine && {
                                      color: 'rgba(255,255,255,0.98)',
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {replySnippet}
                                </Text>
                              </View>
                            </Pressable>
                          )}

                          <Text
                            style={[
                              styles.msgTxt,
                              mine
                                ? { color: 'rgba(255,255,255,0.98)' }
                                : { color: '#0f172a' },
                            ]}
                          >
                            📎 {payloadName || '파일 열기'}
                          </Text>
                        </Animated.View>
                      </Pressable>
                    ) : isLoc ? (
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelectMessage(m.id);
                            return;
                          }
                          doOpenLoc();
                        }}
                        onLongPress={handleBubbleLongPress}
                        delayLongPress={250}
                      >
                        {replyMsg && (
                          <Pressable
                            style={[
                              styles.replyInline,
                              mine ? styles.replyInlineMine : styles.replyInlineTheirs,
                              { alignSelf: 'flex-start', maxWidth: '90%' },
                            ]}
                            onPress={() => scrollToMessage(replyMsg.id)}
                          >
                            <View style={styles.replyInlineBar} />
                            <View>
                              <Text
                                style={[
                                  styles.replyInlineLabel,
                                  mine && { color: 'rgba(255,255,255,0.7)' },
                                ]}
                                numberOfLines={1}
                              >
                                {replyLabel}
                              </Text>
                              <Text
                                style={[
                                  styles.replyInlineText,
                                  mine && { color: 'rgba(255,255,255,0.98)' },
                                ]}
                                numberOfLines={1}
                              >
                                {replySnippet}
                              </Text>
                            </View>
                          </Pressable>
                        )}

                        <View
                          style={[
                            styles.mediaShadowWrap,
                            { alignSelf: mine ? 'flex-end' : 'flex-start' },
                          ]}
                        >
                          <View style={styles.mapCard}>
                            <View style={styles.mapCardTop}>
                              <View style={styles.mapShape1} />
                              <View style={styles.mapShape2} />
                              <View style={styles.mapShape3} />

                              <View style={styles.mapCenterBadge}>
                                <View style={styles.mapCenterPinCircle}>
                                  <MapPin size={18} color={OUR_RED} strokeWidth={2.4} />
                                </View>
                                <Text style={styles.mapTitle}>위치가 공유되었습니다</Text>
                                <Text style={styles.mapSubTitle}>탭하여 지도 열기</Text>
                              </View>
                            </View>

                            <View style={styles.mapCardBottom}>
                              <Text
                                style={styles.mapAddr}
                                numberOfLines={2}
                                ellipsizeMode="tail"
                              >
                                {locLabel
                                  ? locLabel
                                  : locAddress
                                  ? locAddress
                                  : locLat != null && locLng != null
                                  ? `${locLat.toFixed(4)}, ${locLng.toFixed(4)}`
                                  : '좌표 정보 없음'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelectMessage(m.id);
                            return;
                          }
                        }}
                        onLongPress={handleBubbleLongPress}
                        delayLongPress={250}
                      >
                        <Animated.View style={[bubbleBaseStyle, bubblePositionStyle]}>
                          {replyMsg && (
                            <Pressable
                              style={[
                                styles.replyInline,
                                mine ? styles.replyInlineMine : styles.replyInlineTheirs,
                                { alignSelf: 'flex-start', maxWidth: '90%' },
                              ]}
                              onPress={() => scrollToMessage(replyMsg.id)}
                            >
                              <View style={styles.replyInlineBar} />
                              <View>
                                <Text
                                  style={[
                                    styles.replyInlineLabel,
                                    mine && { color: 'rgba(255,255,255,0.7)' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {replyLabel}
                                </Text>
                                <Text
                                  style={[
                                    styles.replyInlineText,
                                    mine && { color: 'rgba(255,255,255,0.98)' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {replySnippet}
                                </Text>
                              </View>
                            </Pressable>
                          )}

                          <Text
                            style={[
                              styles.msgTxt,
                              mine
                                ? { color: 'rgba(255,255,255,0.98)' }
                                : { color: '#0f172a' },
                            ]}
                          >
                            {primaryText}
                          </Text>

                          {!!secondaryText && (
                            <Text
                              style={[
                                styles.metaSmall,
                                { marginTop: 4 },
                                mine
                                  ? { color: 'rgba(255,255,255,0.8)' }
                                  : { color: '#475569' },
                              ]}
                              numberOfLines={3}
                            >
                              {secondaryText}
                            </Text>
                          )}
                        </Animated.View>
                      </Pressable>
                    )}
                  </View>

                  {/* 시간 + 번역 텍스트 (버블 옆) */}
                  <View
                    style={{
                      marginHorizontal: 4,
                      alignItems: mine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {showTime && (
                      <Text
                        style={[
                          styles.time,
                          mine
                            ? { color: '#94a3b8', textAlign: 'left' }
                            : { color: '#64748b', textAlign: 'right' },
                        ]}
                      >
                        {formatTime(m.created_at)} {mine && isRead ? '✓' : ''}
                      </Text>
                    )}

                    {canShowTranslateActions && showTime && (
                      <View
                        style={{
                          marginTop: 2,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        {tPending[m.id] ? (
                          <Text style={[styles.metaSmall, { color: '#64748b' }]}>
                            번역 중…
                          </Text>
                        ) : tCache[m.id] ? (
                          <Pressable onPress={() => setShowOriginalGlobal(v => !v)}>
                            <Text
                              style={[
                                styles.metaSmall,
                                { color: '#2563eb', fontWeight: '800' },
                              ]}
                            >
                              {showOriginalGlobal ? '번역 보기' : '원문 보기'}
                            </Text>
                          </Pressable>
                        ) : autoTranslate ? null : (
                          <Pressable onPress={() => translateMessageIfNeeded(m)}>
                            <Text
                              style={[
                                styles.metaSmall,
                                { color: '#2563eb', fontWeight: '800' },
                              ]}
                            >
                              번역하기({myLang.toUpperCase()})
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </Animated.View>
          </Pressable>
        </GestureDetector>
      );
    },
    [
      me,
      msgs,
      profiles,
      lastReadAt,
      tCache,
      tPending,
      autoTranslate,
      myLang,
      showOriginalGlobal,
      openPublicProfile,
      onMessageLongPress,
      translateMessageIfNeeded,
      triggerReplyFromSwipe,
      scrollToMessage,
      selectionMode,
      selectedIds,
      toggleSelectMessage,
    ],
  );



  const renderItem = useCallback(
  ({ item, index }: { item: any; index: number }) => (
    <MessageRow item={item} index={index} />
  ),
  [MessageRow],
);


  const showSend = text.trim().length > 0;

  // 🔎 검색: 쿼리 변경 시 결과 갱신
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchHits([]);
      return;
    }
    const ids: string[] = [];
    for (const m of msgs) {
      const { rest } = parseReplyPrefix(m.content);
      if (
        rest.startsWith('[image]') ||
        rest.startsWith('[video]') ||
        rest.startsWith('[file]') ||
        rest.startsWith('[loc]') ||
        rest.startsWith('[audio]')
      ) continue;

      const hay = ((m.original ?? rest) || '').toLowerCase();
      if (hay.includes(q)) ids.push(m.id);
    }
    setSearchHits(ids);
  }, [searchQuery, msgs]);

  // 🔁 헤더 번역 토글 핸들러(탭: ON/OFF, 길게: 설정 팝업)
  const toggleTranslate = useCallback(async () => {
    const next = !autoTranslate;
    setAutoTranslate(next);
    try {
      if (me) {
        await supabase.from('profiles').update({ auto_translate_default: next }).eq('user_id', me);
      }
    } catch {}
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  }, [autoTranslate, me]);

  if (loading || !chatRoomId) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar translucent={false} backgroundColor="#fff" barStyle="dark-content" />

      {/* 상단 헤더 (absolute) */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(0, insets.top - 8),
            height: HEADER_HEIGHT + Math.max(0, insets.top - 8) },
        ]}
      >
      <Pressable
        style={styles.headerBtn}
        onPress={() => {
          // 🔁 삭제 선택 모드일 때는 채팅방 나가는 게 아니라 선택모드 종료
          if (selectionMode) {
            setSelectionMode(false);
            setSelectedIds([]);
          } else {
            navigation.goBack();
          }
        }}
      >
        <ChevronLeft size={22} color={OUR_TEXT_DARK} strokeWidth={2.4} />
      </Pressable>

        <View style={styles.headerTitleWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.title} numberOfLines={1}>
              {title || `채팅방 #${chatRoomId}`}
            </Text>
            <Text style={styles.memberCount}>
              {'  '}
              {participantCount || 1}
            </Text>
          </View>
        </View>

        {/* 👉 오른쪽 아이콘들: 번역 토글(아이콘색으로 on/off), 검색, 설정(…) */}
<View style={styles.headerRightRow}>
  <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
    {autoTranslate && (
      <View style={styles.langBadgeGlass}>
        <Text style={styles.langBadgeGlassTxt}>{myLang.toUpperCase()}</Text>
      </View>
    )}

    <Pressable
      style={styles.headerBtn}
      onPress={toggleTranslate}
      onLongPress={() => setTranslatePopoverOpen(true)}
    >
      <Languages
        size={18}
        strokeWidth={2.6}
        color={autoTranslate ? OUR_RED : '#64748b'}
      />
    </Pressable>
  </View>

  <Pressable
    style={styles.headerBtn}
    onPress={() => {
      setSearchQuery('');
      setSearchOpen(true);
    }}
  >
    <Search size={18} color={OUR_TEXT_DARK} strokeWidth={2.6} />
  </Pressable>

  <Pressable
    style={styles.headerBtn}
    onPress={() =>
      navigation.navigate('ChatManage', { roomId: Number(chatRoomId) })
    }
  >
    <MoreHorizontal size={22} color={OUR_TEXT_DARK} strokeWidth={2.4} />
  </Pressable>
</View>

      </View>

      {/* 헤더 아래 영역 */}
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#fff',
          paddingTop: HEADER_HEIGHT + insets.top - 8,
        }}
        edges={['left', 'right', 'bottom']}
      >
        <View
          style={[styles.floatingBarFixed, { top: HEADER_HEIGHT + insets.top }]}
          pointerEvents="box-none"
          onLayout={(e) => setFloatH(Math.max(32, Math.round(e.nativeEvent.layout.height)))}
        >
          {firstDateLabel && scrolling && (
            <View style={styles.floatingDate} pointerEvents="none">
              <View style={styles.datePill}>
                <Text style={styles.datePillTxt}>{firstDateLabel}</Text>
              </View>
            </View>
          )}
        </View>


        {/* 리스트+입력줄 묶음: 키보드 높이만큼 같이 이동 */}
         <RNAnimated.View
          style={{ flex: 1, transform: [{ translateY: RNAnimated.multiply(keyboardBottom, -1) }] }}
        >
          <View style={styles.chatBody}>
            {selectionMode && (
              <View style={styles.selectionBanner}>
                <Text style={styles.selectionBannerTxt}>
                  삭제할 메시지를 눌러 선택하세요.
                </Text>
              </View>
            )}
            <AnimatedFlatList
              ref={listRef}
              data={withSeparators as any}
              keyExtractor={(m: any, idx) => (m?.id ? String(m.id) : m?.key ?? String(idx))}
              renderItem={renderItem}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 12,
                paddingTop: floatH + 20,
                paddingBottom: kbVisible ? 8 : (inputAreaH + 6),
                flexGrow: 1,
                justifyContent: 'flex-end',
              }}
              onScroll={scrollHandler as any}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
            />
          </View>

          {/* 🔹 새 메시지 플로팅 배지 (선택 모드 아닐 때만) */}
          {showNewMsgPill && !selectionMode && (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: (inputAreaH || 60) + (insets.bottom ?? 0) + 8,
                alignItems: 'center',
              }}
            >
              <Pressable
                style={styles.newMsgPill}
                onPress={() => {
                  scrollToEndNow();
                  setShowNewMsgPill(false);
                  setNewMsgCount(0);
                }}
              >
                <Text style={styles.newMsgPillTxt}>
                  {newMsgCount > 1
                    ? `새 메시지 ${newMsgCount}개`
                    : '새 메시지 1개'}
                </Text>
              </Pressable>
            </View>
          )}
                    {/* 입력 / 선택 영역(전체) */}
          {selectionMode ? (
            // ✅ 선택 모드: 삭제하기 바
            <View
              style={[
                styles.selectionFooter,
                { paddingBottom: insets.bottom ?? 0 },
              ]}
              onLayout={(e) =>
                setInputAreaH(Math.max(44, Math.round(e.nativeEvent.layout.height)))
              }
            >
              <View style={styles.selectionFooterTop}>
                <Text style={styles.selectionFooterTxt}>
                  선택된 메시지 {selectedIds.length}개
                </Text>
                <Pressable
                  onPress={() => {
                    setSelectedIds([]);
                    setSelectionMode(false);
                  }}
                >
                  <Text style={styles.selectionFooterClear}>선택 해제</Text>
                </Pressable>
              </View>

              <View style={styles.selectionFooterBar}>
                <Pressable
                  style={[
                    styles.selectionDeleteBtn,
                    selectedIds.length === 0 && { opacity: 0.4 },
                  ]}
                  disabled={selectedIds.length === 0}
                  onPress={openDeleteDialog}
                >
                  <Text style={styles.selectionDeleteTxt}>
                    삭제하기 {selectedIds.length}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            // ✅ 평소: 기존 입력창
            <RNAnimated.View
              style={[
                styles.inputWrap,
                { paddingBottom: insets.bottom ?? 0 },
              ]}
              onLayout={(e) =>
                setInputAreaH(Math.max(44, Math.round(e.nativeEvent.layout.height)))
              }
            >
              {/* 답글 컴포저 바 */}
            {replyTo ? (
              <View style={styles.replyComposer}>
                <View style={styles.replyComposerBar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyComposerLabel}>
                    {replyTo.sender === me
                      ? '내 메시지에 답장'
                      : `${profiles[replyTo.sender]?.nickname || '익명'}에게 답장`}
                  </Text>
                  <Text
                    style={styles.replyComposerText}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {getMsgSnippet(replyTo)}
                  </Text>
                </View>
                <Pressable
                  style={styles.replyComposerClose}
                  onPress={() => setReplyTo(null)}
                >
                  <X size={16} color="#475569" />
                </Pressable>
              </View>
            ) : null}


            <View style={styles.inputRow}>
              {/* + 버튼 (사진/파일/위치/친구초대) */}
              <Pressable
                style={styles.roundBtn}
                onPress={() => setSheetOpen(true)}
              >
                <Plus size={18} color={OUR_TEXT_DARK} strokeWidth={2.4} />
              </Pressable>

              {/* 텍스트 입력 */}
              <View style={styles.inputPill}>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="메시지 보내기"
                  placeholderTextColor="#9ca3af"
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (showSend) send(text);
                  }}
                />
              </View>

              {/* 오른쪽: 전송 or 음성 버튼 */}
              {showSend ? (
                <Pressable
                  style={[styles.roundBtn, styles.sendBtnRound]}
                  onPress={() => send(text)}
                >
                  <SendIcon size={18} color="#ffffff" strokeWidth={2.2} />
                </Pressable>
              ) : (
                <Pressable
                  style={styles.roundBtn}
                  onPress={() => setVoiceVisible(true)}
                >
                  <Mic size={18} color={OUR_RED} strokeWidth={2.4} />
                </Pressable>
              )}
            </View>

            </RNAnimated.View>
          )}

        </RNAnimated.View>
      </SafeAreaView>

      {/* (+) 액션시트 */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
          <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheet} accessible accessibilityRole="menu">
            <Text style={styles.sheetTitle}>추가 동작</Text>

            <View style={styles.sheetRow}>
              <Pressable
                style={styles.tile}
                onPress={() => {
                  setSheetOpen(false);
                  setMediaModalOpen(true);
                }}
              >
                <ImageIcon size={22} color={OUR_TEXT_DARK} />
                <Text style={styles.tileTxt}>사진/영상</Text>
              </Pressable>

              <Pressable style={styles.tile} onPress={pickAndSendFile}>
                <LinkIcon size={22} color={OUR_TEXT_DARK} />
                <Text style={styles.tileTxt}>파일</Text>
              </Pressable>

              <Pressable style={styles.tile} onPress={openMapPicker}>
                <MapPin size={22} color={OUR_TEXT_DARK} />
                <Text style={styles.tileTxt}>위치공유</Text>
              </Pressable>

              <Pressable style={styles.tile} onPress={openInviteFriends}>
                <UserPlus2 size={22} color={OUR_TEXT_DARK} />
                <Text style={styles.tileTxt}>친구초대</Text>
              </Pressable>

              <Pressable style={styles.tile} onPress={shareInviteLink}>
                <LinkIcon size={22} color={OUR_TEXT_DARK} />
                <Text style={styles.tileTxt}>초대링크</Text>
              </Pressable>

              <Pressable
                style={styles.tile}
                onPress={() => {
                  setSheetOpen(false);
                  setTranslatePopoverOpen(true);
                }}
              >
                <Languages size={22} color={OUR_TEXT_DARK} />
                <Text style={styles.tileTxt}>번역</Text>
              </Pressable>
            </View>

            <Pressable style={styles.sheetClose} onPress={() => setSheetOpen(false)}>
              <Text style={styles.sheetCloseTxt}>닫기</Text>
            </Pressable>
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* 메시지 액션 시트 */}
      <Modal
        visible={actionSheetOpen && !!longPressTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetOpen(false)}
      >
        <Pressable style={styles.popMask} onPress={() => setActionSheetOpen(false)} />
        <View style={styles.replyActionSheet}>
          <Pressable
            style={styles.replyActionRow}
            onPress={() => {
              if (longPressTarget) {
                setReplyTo(longPressTarget);
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              }
              setActionSheetOpen(false);
            }}
          >
            <Text style={styles.replyActionTxt}>답장</Text>
          </Pressable>

          <Pressable
            style={styles.replyActionRow}
            onPress={async () => {
              if (!longPressTarget) return;
              const snippet = getMsgSnippet(longPressTarget);
              try { await Share.share({ message: snippet }); } catch {}
              setActionSheetOpen(false);
            }}
          >
            <Text style={styles.replyActionTxt}>공유</Text>
          </Pressable>

          <Pressable
            style={styles.replyActionRow}
            onPress={() => {
              setActionSheetOpen(false);
              Alert.alert('공지', '공지 기능은 추후 구현 예정입니다.');
            }}
          >
            <Text style={styles.replyActionTxt}>공지</Text>
          </Pressable>

        {longPressTarget && (
          <Pressable
            style={styles.replyActionRow}
            onPress={() => {
              const m = longPressTarget;
              if (!m) return;

              // 👉 카톡처럼 "선택 모드"로 진입 + 해당 메시지 선택
              setSelectionMode(true);
              setSelectedIds((prev) =>
                prev.includes(m.id) ? prev : [...prev, m.id]
              );
              setActionSheetOpen(false);
            }}
          >
            <Text style={[styles.replyActionTxt, { color: '#ef4444' }]}>삭제</Text>
          </Pressable>
        )}
        </View>
      </Modal>

      {/* 🔴 삭제 옵션 팝업 (라디오) */}
      <Modal
        visible={deleteDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteDialogVisible(false)}
      >
        <Pressable
          style={styles.popMask}
          onPress={() => setDeleteDialogVisible(false)}
        />
        <View style={styles.deleteDialogCard}>
          <Text style={styles.deleteDialogTitle}>메시지 삭제</Text>
          <Text style={styles.deleteDialogDesc}>삭제 방법을 선택하세요.</Text>

          {deleteDialogCanAll && (
            <Pressable
              style={styles.deleteRadioRow}
              onPress={() => setDeleteOption('all')}
            >
              <View
                style={[
                  styles.deleteRadioOuter,
                  deleteOption === 'all' && styles.deleteRadioOuterOn,
                ]}
              >
                {deleteOption === 'all' && <View style={styles.deleteRadioInner} />}
              </View>
              <Text style={styles.deleteRadioLabel}>모두에게서 삭제</Text>
            </Pressable>
          )}

          {deleteDialogCanHide && (
            <Pressable
              style={styles.deleteRadioRow}
              onPress={() => setDeleteOption('hide')}
            >
              <View
                style={[
                  styles.deleteRadioOuter,
                  deleteOption === 'hide' && styles.deleteRadioOuterOn,
                ]}
              >
                {deleteOption === 'hide' && <View style={styles.deleteRadioInner} />}
              </View>
              <Text style={styles.deleteRadioLabel}>메시지 가리기 (모두에게서 숨기기)</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.deleteRadioRow}
            onPress={() => setDeleteOption('me')}
          >
            <View
              style={[
                styles.deleteRadioOuter,
                deleteOption === 'me' && styles.deleteRadioOuterOn,
              ]}
            >
              {deleteOption === 'me' && <View style={styles.deleteRadioInner} />}
            </View>
            <Text style={styles.deleteRadioLabel}>나에게서만 삭제</Text>
          </Pressable>

          {!deleteDialogCanAll && !deleteDialogCanHide && (
            <Text style={styles.deleteDialogHint}>
              선택한 메시지는 나에게서만 삭제할 수 있습니다.
            </Text>
          )}

          <View style={styles.deleteDialogButtonsRow}>
            <Pressable
              style={styles.deleteDialogBtn}
              onPress={() => setDeleteDialogVisible(false)}
            >
              <Text
                style={[styles.deleteDialogBtnText, { color: '#64748b' }]}
              >
                취소
              </Text>
            </Pressable>
            <Pressable
              style={[styles.deleteDialogBtn, { backgroundColor: OUR_RED }]}
              onPress={performDelete}
            >
              <Text
                style={[styles.deleteDialogBtnText, { color: '#ffffff' }]}
              >
                확인
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>


      {/* 번역 팝업 */}
      <Modal
        visible={translatePopoverOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTranslatePopoverOpen(false)}
      >
        <Pressable style={styles.popMask} onPress={() => setTranslatePopoverOpen(false)} />
        <View style={styles.popCard}>
          <View style={styles.popHeaderRow}>
            <Text style={styles.popHeaderTxt}>번역</Text>
            <View style={styles.currLangPill}>
              <View style={styles.redDot} />
              <Text style={styles.currLangTxt}>현재: {myLang.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.popToggles}>
            <Pressable
              style={[styles.popToggleBtn, autoTranslate && styles.popToggleOn]}
              onPress={async () => {
                const next = !autoTranslate;
                setAutoTranslate(next);
                try {
                  if (me) await supabase.from('profiles').update({ auto_translate_default: next }).eq('user_id', me);
                } catch {}
              }}
            >
              <Text style={[styles.popToggleTxt, autoTranslate && styles.popToggleTxtOn]}>
                실시간 번역 {autoTranslate ? 'ON' : 'OFF'}
              </Text>
            </Pressable>

            <Pressable style={styles.popGhostBtn} onPress={() => setShowOriginalGlobal((v) => !v)}>
              <Text style={styles.popGhostTxt}>{showOriginalGlobal ? '번역 보기' : '원문 보기'}</Text>
            </Pressable>
          </View>

          <View style={styles.popLangList}>
            <ScrollView>
              {SUPPORTED_LANGS.map((l) => {
                const active = l.code === myLang;
                return (
                  <Pressable
                    key={l.code}
                    style={[styles.langRow, active && styles.langRowActive]}
                    onPress={async () => {
                      setMyLang(l.code);
                      setTranslatePopoverOpen(false);
                      try {
                        if (me) await supabase.from('profiles').update({ preferred_lang: l.code }).eq('user_id', me);
                      } catch {}
                    }}
                  >
                    <Text style={[styles.langRowTxt, active && styles.langRowTxtActive]}>
                      ({l.code}) {l.native}
                    </Text>
                    {active ? <View style={styles.redDotSmall} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 🔎 검색 모달 */}
      <Modal
        visible={searchOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchOpen(false)}
      >
        <Pressable style={styles.popMask} onPress={() => setSearchOpen(false)} />
        <View style={styles.searchCard}>
          <View style={styles.searchHeaderRow}>
            <View style={styles.searchInputWrap}>
              <Search size={16} color="#64748b" />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="메시지 검색"
                autoFocus
              />
            </View>
            <Pressable style={styles.searchClose} onPress={() => setSearchOpen(false)}>
              <X size={18} color="#334155" />
            </Pressable>
          </View>

          <Text style={styles.searchMeta}>
            {searchQuery.trim() ? `결과 ${searchHits.length}개` : '검색어를 입력하세요'}
          </Text>

          <ScrollView style={{ maxHeight: 320 }}>
            {searchHits.map((id) => {
              const m = msgs.find((x) => x.id === id);
              if (!m) return null;
              return (
                <Pressable
                  key={id}
                  style={styles.searchItem}
                  onPress={() => {
                    setSearchOpen(false);
                    setTimeout(() => scrollToMessage(id), 50);
                  }}
                >
                  <Text style={styles.searchItemTxt} numberOfLines={2}>
                    {getMsgSnippet(m)}
                  </Text>
                  <Text style={styles.searchItemTime}>{formatTime(m.created_at)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* 음성 녹음 모달 */}
      <VoiceRecorderModal
        visible={voiceVisible}
        onClose={() => setVoiceVisible(false)}
        onSend={async (uri: string, durationMs: number) => {
          try {
            if (!chatRoomId || !me) return;
            const fileName = 'voice_' + Date.now() + '.m4a';

            const blob = await fileToBlob(uri);
            const mime = 'audio/m4a';
            const ext = 'm4a';

            const { uploadUrl, publicUrl } = await presignUpload({
              roomId: Number(chatRoomId),
              mime,
              size: blob.size,
              ext,
              variant: 'audio',
            });
            await putToR2(uploadUrl, blob, mime);

            const payload = `[audio]${publicUrl}|${fileName}|${durationMs}`;
            await send(payload);
          } catch (e: any) {
            Alert.alert('오디오 전송 실패', e.message ?? String(e));
          }
        }}
        themeColor={OUR_RED}
      />

      {/* 이미지 프리뷰 */}
      <Modal
        visible={!!previewImage}
        transparent
        onRequestClose={() => {
          setPreviewImage(null);
          scale.value = 1;
        }}
      >
        <GestureHandlerRootView style={styles.previewWrap}>
          <Pressable
            style={StyleSheet.absoluteFillObject as any}
            onPress={() => {
              setPreviewImage(null);
              scale.value = 1;
            }}
          />
          {previewImage ? (
            <GestureDetector gesture={pinch}>
              <Animated.Image source={{ uri: previewImage }} style={[styles.previewImg, previewStyle]} />
            </GestureDetector>
          ) : null}
        </GestureHandlerRootView>
      </Modal>

      {/* MediaPickerModal */}
      <MediaPickerModal
        visible={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        photoQuality={photoQuality}
        videoQuality={videoQuality}
        onChangePhotoQuality={setPhotoQuality}
        onChangeVideoQuality={setVideoQuality}
onSendSelected={async (assets, bundleSend) => {
  try {
    const uploadedList: string[] = [];

    for (const a of assets) {
      const blob = await fileToBlob(a.uri);
      const mime = a.isVideo ? 'video/mp4' : 'image/jpeg';
      const ext = guessExt(a.filename, mime);

      const { uploadUrl, publicUrl } = await presignUpload({
        roomId: Number(chatRoomId),
        mime,
        size: blob.size,
        ext,
        variant: a.isVideo ? 'video' : 'medium',
      });

      await putToR2(uploadUrl, blob, mime);

      // 💡 여러 개를 하나로 묶기 위해 리스트에 추가
      uploadedList.push(`${publicUrl}|${a.filename}`);
    }


    if (uploadedList.length === 1) {
      // 이미지 1장일 때 기존처럼 단일 전송
      await send(`[image]${uploadedList[0]}`);
    } else {
      // 여러 장일 때 묶어서 하나의 메시지
      const payload = `[images]` + uploadedList.join(';;;');
      await send(payload);
    }

  } catch (e: any) {
    Alert.alert('업로드 실패', e.message ?? String(e));
  }
}}
        themeColor={OUR_RED}
      />
    </GestureHandlerRootView>
  );
}

/* ===================== Styles ===================== */
const COLS = 4;
const TILE_MIN_WIDTH =
  (Dimensions.get('window').width - 14 * 2 - 12 * (COLS - 1)) / COLS;
  const MEDIA_BASE_W = Math.min(Dimensions.get('window').width * 0.7, 260);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },

  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 100,
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, justifyContent: 'center', marginHorizontal: 4 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { fontSize: 18, fontWeight: '800', color: OUR_TEXT_DARK, textAlign: 'left' },
  memberCount: { fontSize: 15, fontWeight: '700', color: '#c4c4c4', marginLeft: 2, marginTop: 2 },

  floatingBarFixed: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 32,
    zIndex: 30,
    pointerEvents: 'box-none',
  },
  floatingDate: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
  },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.65)',
  },
  datePillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },

  sepWrap: {
    alignSelf: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.7)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, marginVertical: 10,
  },
  sepTxt: { fontSize: 11, color: '#64748b', fontWeight: '700' },

  msgRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  nickText: { marginLeft: 4, marginBottom: 4, fontSize: 11, fontWeight: '800', color: '#475569' },

  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: OUR_TEXT_DARK, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb' },
  avatarTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  msgBubble: {
    maxWidth: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  mine: { borderTopRightRadius: 8, alignSelf: 'flex-end', backgroundColor: OUR_BLUE_BUBBLE },
  theirs: { borderTopLeftRadius: 8, alignSelf: 'flex-start', backgroundColor: '#ffffff' },

  msgTxt: { fontSize: 16, lineHeight: 22 },
  msgImage: {
    width: MEDIA_BASE_W,
    height: MEDIA_BASE_W,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },

  videoThumb: {
    width: MEDIA_BASE_W,
    height: MEDIA_BASE_W,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },

  videoBadge: {
    backgroundColor: '#111827cc', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  videoTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },

  time: { fontSize: 11, alignSelf: 'flex-end' },
  metaSmall: { fontSize: 12, fontWeight: '700' },

  chatBody: { flex: 1, backgroundColor: '#f8f9fa' },

  // ===== 입력 영역 =====
  inputWrap: {
    borderTopWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.3)',
    backgroundColor: '#ffffff',
    zIndex: 200,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 0,
    marginBottom: -8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  roundBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(229, 231, 235, 0.5)',
    backgroundColor: '#ffffff',
  },
  sendBtnRound: {
    backgroundColor: OUR_BLUE_BUBBLE,
    borderColor: OUR_BLUE_BUBBLE,
  },
  inputPill: {
    flex: 1,
    borderWidth: 1, borderColor: 'rgba(229, 231, 235, 0.5)',
    borderRadius: 20, paddingLeft: 12, paddingRight: 12,
    minHeight: 44, backgroundColor: '#ffffff',
  },
  input: {
    paddingTop: 10, paddingBottom: 10,
    maxHeight: 120,
  },

  // 답글 컴포저
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  replyComposerBar: { width: 3, alignSelf: 'stretch', borderRadius: 3, backgroundColor: '#94a3b8' },
  replyComposerLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', marginBottom: 2 },
  replyComposerText: { fontSize: 13, color: '#111827' },
  replyComposerClose: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 14, borderTopWidth: 1, borderColor: '#eef0f2',
  },
  sheetTitle: { fontWeight: '800', color: OUR_TEXT_DARK, marginBottom: 10, fontSize: 16 },
  sheetRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 16, justifyContent: 'flex-start' },
  tile: { width: TILE_MIN_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 10 },
  tileTxt: { fontSize: 12, fontWeight: '700', color: OUR_TEXT_DARK, textAlign: 'center' },
  sheetClose: { marginTop: 12, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: OUR_TEXT_DARK },
  sheetCloseTxt: { color: '#fff', fontWeight: '800' },

  popMask: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  popCard: {
    position: 'absolute', left: 16, right: 16, bottom: 80,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#eef0f2',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  popHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  popHeaderTxt: { fontSize: 16, fontWeight: '800', color: OUR_TEXT_DARK },
  currLangPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#ffe4e6',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: OUR_RED },
  currLangTxt: { color: OUR_RED, fontWeight: '800', fontSize: 12 },
  popToggles: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  popToggleBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  popToggleOn: { backgroundColor: OUR_TEXT_DARK, borderColor: OUR_TEXT_DARK },
  popToggleTxt: { fontWeight: '800', color: OUR_TEXT_DARK },
  popToggleTxtOn: { color: '#fff' },
  popGhostBtn: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9' },
  popGhostTxt: { fontWeight: '800', color: OUR_TEXT_DARK },
  popLangList: { maxHeight: 260 },
  langRow: {
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#eef0f2', marginBottom: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  langRowActive: { backgroundColor: '#fff1f2', borderColor: '#ffe4e6' },
  langRowTxt: { fontSize: 14, fontWeight: '700', color: OUR_TEXT_DARK },
  langRowTxtActive: { color: OUR_RED },
  redDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: OUR_RED },

  // 검색 모달
  searchCard: {
    position: 'absolute', left: 16, right: 16, top: 90,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#eef0f2',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  searchClose: {
    marginLeft: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  searchMeta: { fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: '700' },
  searchItem: {
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#eef0f2', marginBottom: 6,
    backgroundColor: '#fff',
  },
  searchItemTxt: { fontSize: 14, color: OUR_TEXT_DARK, fontWeight: '700' },
  searchItemTime: { fontSize: 11, color: '#64748b', marginTop: 4 },

  previewWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '92%', height: '72%', resizeMode: 'contain' },

  audioBubbleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  audioPlayBtn: { height: 40, justifyContent: 'center' },
  voiceMine: {
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999,
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-end',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  voiceTheirs: {
    backgroundColor: 'rgba(241, 245, 249, 0.96)',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999,
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(148, 163, 253, 0.15)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  audioPlayIconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  audioPlayIcon: { fontSize: 13, fontWeight: '800', color: '#fff' },
  audioBarOuter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  audioBar: { height: 6, borderRadius: 999, overflow: 'hidden' },
  audioBarFill: { height: '100%', borderRadius: 999 },
  audioDur: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  replyInline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, marginBottom: 4, gap: 6,
  },
  replyInlineMine: { backgroundColor: 'rgba(0,0,0,0.12)' },
  replyInlineTheirs: { backgroundColor: '#e5e7eb' },
  replyInlineBar: { width: 3, height: '100%', borderRadius: 999, backgroundColor: '#94a3b8' },
  replyInlineLabel: { fontSize: 10, fontWeight: '700', color: '#6b7280', marginBottom: 1 },
  replyInlineText: { fontSize: 12, color: '#111827' },

  replyActionSheet: {
    position: 'absolute', left: 16, right: 16, bottom: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(229, 231, 235, 0.5)',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  replyActionRow: { paddingHorizontal: 16, paddingVertical: 12 },
  replyActionTxt: { fontSize: 15, fontWeight: '700', color: OUR_TEXT_DARK },

  mediaShadowWrap: {
    borderRadius: 20, overflow: 'hidden', backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
    alignSelf: 'flex-start',
  },

  // 지도 스냅샷 스타일
mapSnapWrap: {
  width: MEDIA_BASE_W,
  height: MEDIA_BASE_W,
  borderRadius: 20,
  overflow: 'hidden',
  backgroundColor: '#e5e7eb',
},
mapSnap: { width: '100%', height: '100%' },

mapPill: {
  position: 'absolute',
  bottom: 8,
  left: 8,
  backgroundColor: 'rgba(17,24,39,0.82)',
  borderRadius: 999,
  paddingHorizontal: 10,
  paddingVertical: 6,
},
mapPillTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

mapSnapInner: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  padding: 12,
},
mapSnapIconCircle: {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(248, 250, 252, 0.9)',
  marginBottom: 8,
},
mapSnapTitle: {
  fontSize: 14,
  fontWeight: '800',
  color: '#111827',
  marginBottom: 4,
},
mapSnapSub: {
  fontSize: 11,
  fontWeight: '700',
  color: '#6b7280',
},
mapTop: {
  flex: 2,
  backgroundColor: '#dbeafe',      // 연한 파란색 (지도 느낌)
  position: 'relative',
},
mapBottom: {
  flex: 1,
  backgroundColor: '#f9fafb',
  paddingHorizontal: 14,
  paddingVertical: 10,
  justifyContent: 'center',
},

mapPattern: {
  ...StyleSheet.absoluteFillObject,
},
mapRoad: {
  position: 'absolute',
  height: 14,
  borderRadius: 999,
  backgroundColor: '#f9fafb',
  borderWidth: 1,
  borderColor: 'rgba(148,163,184,0.35)',
},
mapCircle: {
  position: 'absolute',
  width: 80,
  height: 80,
  borderRadius: 40,
  borderWidth: 1,
  borderColor: 'rgba(37,99,235,0.25)',
  backgroundColor: 'rgba(191,219,254,0.6)',
  top: '32%',
  left: '32%',
},

mapHint: {
  marginTop: 4,
  fontSize: 11,
  fontWeight: '700',
  color: '#9ca3af',
},
 
langBadgeGlass: {
  position: 'absolute',
  left: -20,
  top: 8,
  paddingHorizontal: 6,
  paddingVertical: 1.5,
  borderRadius: 8,
  backgroundColor: 'rgba(231, 76, 60, 0.25)', // OUR_RED 기반 유리 느낌
  borderWidth: 1,
  borderColor: 'rgba(231, 77, 60, 0)',
  shadowColor: '#e74c3c',
  shadowOpacity: 0.25,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 3,
},
langBadgeGlassTxt: {
  fontSize: 9,
  fontWeight: '800',
  color: OUR_RED,
  letterSpacing: 0.6,
},
  // ===== 위치 공유 카드 (가짜 지도 + 주소 바) =====
// ===== 위치 공유 카드 (가짜 지도 + 주소 바) =====
  mapCard: {
    width: MEDIA_BASE_W,
    height: MEDIA_BASE_W * 0.8,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#ffffff',  // 👉 전체 카드는 흰색
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)', // 연한 테두리
  },
  mapCardTop: {
    flex: 3,
    backgroundColor: '#f5f7fb',  // 아주 옅은 파란기 섞인 회색
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mapCardBottom: {
    flex: 2,
    backgroundColor: '#f3f4f6',  // 주소 영역은 살짝만 진한 회색
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
  mapCenterBadge: {
    alignItems: 'center',
  },
  mapCenterPinCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,          // 🔹 그림자 살짝만
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  mapTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',            // 🔹 900 → 700
    color: '#1f2933',             // 완전검정보다 살짝 부드러운 색
  },
  mapSubTitle: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '500',            // 🔹 힘 빼기
    color: '#9ca3af',
  },
  mapAddr: {
    fontSize: 13,                 // 🔹 살짝 줄임
    fontWeight: '600',            // 주소가 주인공이지만 너무 무겁지 않게
    color: '#111827',
  },

  // 흐릿한 지도 라인 (카톡 초록 물결 느낌, 색은 더 옅게)
  mapShape1: {
    position: 'absolute',
    width: '150%',
    height: 70,
    borderRadius: 40,
    backgroundColor: 'rgba(148,163,184,0.10)',   // 0.22 → 0.10
    top: 4,
    left: -30,
    transform: [{ rotate: '6deg' }],
  },
  mapShape2: {
    position: 'absolute',
    width: '145%',
    height: 60,
    borderRadius: 40,
    backgroundColor: 'rgba(52,211,153,0.10)',    // 0.18 → 0.10
    top: 40,
    right: -40,
    transform: [{ rotate: '-8deg' }],
  },
  mapShape3: {
    position: 'absolute',
    width: '140%',
    height: 52,
    borderRadius: 40,
    backgroundColor: 'rgba(148,163,184,0.08)',   // 0.15 → 0.08
    bottom: 6,
    left: -20,
    transform: [{ rotate: '4deg' }],
  },
  multiImgGrid: {
    width: MEDIA_BASE_W,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  multiImgCell: {
    width: '50%',   // 2열 그리드
    aspectRatio: 1, // 정사각형
  },
  multiImg: {
    width: '100%',
    height: '100%',
  },
  systemDeletedBubble: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '80%',
  },
  systemDeletedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
  },
  selectMarkerWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'flex-end', 
    alignSelf: 'center',        // ⬅️ 세로 중앙
    marginRight: 6,
  },
  selectMarkerOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  selectMarkerOuterOn: {
    borderColor: OUR_RED,
    backgroundColor: '#fee2e2',
  },
  selectMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: OUR_RED,
  },

  selectionBanner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  selectionBannerTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },

  selectionFooter: {
    borderTopWidth: 1,
    borderColor: 'rgba(229,231,235,0.7)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  selectionFooterTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  selectionFooterTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4b5563',
  },
  selectionFooterClear: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
  },
  selectionFooterBar: {
    paddingVertical: 6,
  },
  selectionDeleteBtn: {
    height: 42,
    borderRadius: 999,
    backgroundColor: OUR_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionDeleteTxt: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteDialogCard: {
    position: 'absolute',
    left: 32,
    right: 32,
    top: '32%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  deleteDialogTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  deleteDialogDesc: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 10,
  },
  deleteRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  deleteRadioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRadioOuterOn: {
    borderColor: OUR_RED,
  },
  deleteRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: OUR_RED,
  },
  deleteRadioLabel: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  deleteDialogHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#9ca3af',
  },
  deleteDialogButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  deleteDialogBtn: {
    minWidth: 70,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 10,
  },
  deleteDialogBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  newMsgPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0f172acc', // 진한 남색 + 약간 투명
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  newMsgPillTxt: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

});
