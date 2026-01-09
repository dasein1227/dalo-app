// src/screens/chat/Manage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ChevronLeft,
  BellOff,
  Star,
  Share2,
  Settings as SettingsIcon,
  ImageIcon,
  FileText,
  Link2,
  Megaphone,
  Calendar,
  ListTodo,
  HelpCircle,
  Bot,
  UserPlus,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

type RoomType = 'dm' | 'group' | 'open' | 'beacon' | 'self' | 'personal';

type Participant = {
  id: string;
  nickname: string;
  avatar_url?: string | null;
  isOwner?: boolean;
  isMe?: boolean;
};

type RouteParams = {
  roomId: number; // bigint
  roomName?: string;
  coverImageUrl?: string | null;
  roomType?: RoomType;
};

export default function ChatManageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params: RouteParams = route.params ?? {};

  const roomId = params.roomId;
  const [roomTypeState, setRoomTypeState] = useState<RoomType>(
    params.roomType ?? 'group',
  );

  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [roomTitle, setRoomTitle] = useState<string>(
    params.roomName ?? '채팅방',
  );
  const [coverImage, setCoverImage] = useState<string | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [mutedUserIds, setMutedUserIds] = useState<string[]>([]);
  const [isRoomMuted, setIsRoomMuted] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  // ───────────────── 현재 로그인 유저 ─────────────────
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.warn('auth.getUser error', error);
        }
        if (user) {
          setMyUserId(user.id);
        }
      } catch (e) {
        console.warn('auth.getUser catch', e);
      }
    })();
  }, []);

  const roomMuteKey =
    myUserId && roomId
      ? `chat:roomMute:${myUserId}:${roomId}`
      : undefined;
  const roomFavKey =
    myUserId && roomId
      ? `chat:roomFav:${myUserId}:${roomId}`
      : undefined;
  const perUserMuteKey =
    myUserId && roomId
      ? `chat:mutes:${myUserId}:${roomId}`
      : undefined;

  // ───────────────── 로컬 설정값 로드 (방 전체 알림/즐겨찾기/per-user mute) ─────────────────
  useEffect(() => {
    if (!myUserId || !roomId) return;

    (async () => {
      try {
        if (roomMuteKey) {
          const v = await AsyncStorage.getItem(roomMuteKey);
          if (v != null) setIsRoomMuted(v === '1');
        }
        if (roomFavKey) {
          const v = await AsyncStorage.getItem(roomFavKey);
          if (v != null) setIsFavorite(v === '1');
        }
        if (perUserMuteKey) {
          const v = await AsyncStorage.getItem(perUserMuteKey);
          if (v) setMutedUserIds(JSON.parse(v));
        }
      } catch (e) {
        console.warn('load chat settings error', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, roomId]);

  // ───────────────── 참가자 / 차단 목록 로드 ─────────────────
  useEffect(() => {
    if (!roomId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const roomPk = Number(roomId);

        // 1) 내가 차단한 사람
        if (myUserId) {
          const { data: blocks, error: blocksError } = await supabase
            .from('chat_room_blocks')
            .select('user_id')
            .eq('room_id', roomPk)
            .eq('blocked_by', myUserId);

          if (blocksError) {
            console.warn('chat_room_blocks error', blocksError);
          } else if (blocks) {
            setBlockedUserIds(
              blocks.map((b: any) => b.user_id as string),
            );
          }
        }

        // 2) 멤버 + 프로필
        const { data: members, error: membersError } = await supabase
          .from('chat_members')
          .select(
            `
            user_id,
            role,
            profiles (
              nickname,
              avatar_url
            )
          `,
          )
          .eq('room_id', roomPk)
          .eq('active', true)
          .order('joined_at', { ascending: true });

        if (membersError) {
          console.error('chat_members error', membersError);
          Alert.alert(
            '오류',
            '참가자 목록을 불러오지 못했습니다.',
          );
        } else if (members) {
          const mapped: Participant[] = members.map((m: any) => {
            const uid = m.user_id as string;
            const nickname =
              m.profiles?.nickname ??
              (uid === myUserId ? '나' : '알 수 없음');

            return {
              id: uid,
              nickname,
              avatar_url: m.profiles?.avatar_url ?? null,
              isOwner: m.role === 'owner' || m.role === 'host',
              isMe: uid === myUserId,
            };
          });

          setParticipants(mapped);
        } else {
          setParticipants([]);
        }
      } catch (e) {
        console.error(e);
        Alert.alert('오류', '채팅방 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [roomId, myUserId]);

  const participantCount = participants.length;

  const isSelfChat = useMemo(() => {
    if (roomTypeState === 'self') return true;
    if (!myUserId) return false;
    return (
      participants.length === 1 && participants[0]?.id === myUserId
    );
  }, [participants, myUserId, roomTypeState]);

  const isOwnerMe = useMemo(
    () =>
      participants.some((p) => p.isMe && (p.isOwner ?? false)),
    [participants],
  );

  // ───────────────── Chat.tsx와 동일한 규칙으로 방 제목 계산 ─────────────────
  useEffect(() => {
    if (!roomId) return;
    const roomPk = Number(roomId);
    let mounted = true;

    (async () => {
      try {
        const { data: roomRow, error } = await supabase
          .from('chat_rooms')
          .select('id, type, custom_title, beacon_id, created_by')
          .eq('id', roomPk)
          .maybeSingle();

        if (error) {
          console.warn('chat_rooms error', error);
        }
        if (!mounted) return;

        const roomTypeDb = (roomRow?.type as RoomType | null) ?? null;
        const effectiveType: RoomType | null =
          roomTypeDb ?? roomTypeState ?? null;

        if (roomTypeDb && roomTypeDb !== roomTypeState) {
          setRoomTypeState(roomTypeDb);
        }

        const customTitle = roomRow?.custom_title?.trim() || '';

        const memberIds = participants.map((p) => p.id);
        const otherIds = myUserId
          ? memberIds.filter((uid) => uid !== myUserId)
          : memberIds;

        const getNickname = (uid: string | null | undefined) => {
          if (!uid) return '';
          const p = participants.find((m) => m.id === uid);
          const nick = p?.nickname;
          return (nick ?? '').trim();
        };

        // 🔹 비콘 채팅: Chat.tsx와 동일하게 beacons_visible / beacons에서 제목 우선
        if (effectiveType === 'beacon') {
          let beaconTitle = '';

          if (roomRow?.beacon_id != null) {
            const beaconPk = Number(roomRow.beacon_id);

            try {
              const { data: vrow } = await supabase
                .from('beacons_visible')
                .select('title')
                .eq('id', beaconPk)
                .maybeSingle();

              if (vrow?.title?.trim()) {
                beaconTitle = vrow.title.trim();
              }
            } catch (e) {
              console.warn('beacons_visible error', e);
            }

            if (!beaconTitle) {
              try {
                const { data: brow } = await supabase
                  .from('beacons')
                  .select('title')
                  .eq('id', beaconPk)
                  .maybeSingle();

                if (brow?.title?.trim()) {
                  beaconTitle = brow.title.trim();
                }
              } catch (e) {
                console.warn('beacons error', e);
              }
            }
          }

          if (!beaconTitle) {
            // Chat.tsx에서 쓰는 기본 포맷
            beaconTitle = `비콘채팅 #${roomPk}`;
          }

          if (mounted) {
            setRoomTitle(beaconTitle);
          }
          return;
        }

        let resolvedTitle = '';

        // 1순위: custom_title
        if (customTitle) {
          resolvedTitle = customTitle;
        } else if (effectiveType === 'self') {
          const myNick = getNickname(myUserId);
          resolvedTitle = myNick || '나와의 채팅';
        } else if (
          effectiveType === 'dm' ||
          effectiveType === 'personal' ||
          (!effectiveType && otherIds.length === 1)
        ) {
          // 1:1
          if (otherIds.length === 1) {
            const nick = getNickname(otherIds[0]);
            resolvedTitle = nick || '대화상대';
          } else {
            resolvedTitle = '1:1 채팅';
          }
        } else if (effectiveType === 'group') {
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
        } else if (effectiveType === 'open') {
          resolvedTitle = `오픈채팅 #${roomPk}`;
        }

        if (!resolvedTitle) {
          resolvedTitle = `채팅방 #${roomPk}`;
        }

        if (mounted) {
          setRoomTitle(resolvedTitle);
        }
      } catch (e) {
        console.error('load room meta error', e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [roomId, myUserId, participants, roomTypeState]);

  // ───────────────── 방 아이콘(커버) 결정: Chat.tsx 규칙 맞추기 ─────────────────
  useEffect(() => {
    const meP = participants.find((p) => p.isMe);
    const others = participants.filter((p) => !p.isMe);

    let nextCover: string | null = null;

    if (roomTypeState === 'self' || roomTypeState === 'beacon') {
      if (meP?.avatar_url) nextCover = meP.avatar_url;
    } else if (
      (roomTypeState === 'dm' || roomTypeState === 'personal') &&
      others.length === 1 &&
      others[0].avatar_url
    ) {
      nextCover = others[0].avatar_url;
    }
    // group / open은 아직 커버 미구현 → 기본 placeholder

    setCoverImage(nextCover);
  }, [roomTypeState, participants]);

  const canOpenProfile =
    roomTypeState === 'dm' ||
    roomTypeState === 'group' ||
    roomTypeState === 'self';

  // ───────────────── Header 액션 ─────────────────
  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleToggleRoomMute = async () => {
    if (!roomMuteKey) return;
    const next = !isRoomMuted;
    setIsRoomMuted(next);
    try {
      await AsyncStorage.setItem(roomMuteKey, next ? '1' : '0');
    } catch (e) {
      console.warn('room mute save error', e);
    }
  };

  const handleToggleFavorite = async () => {
    if (!roomFavKey) return;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      await AsyncStorage.setItem(roomFavKey, next ? '1' : '0');
    } catch (e) {
      console.warn('fav save error', e);
    }
  };

  const handleShareRoom = async () => {
    try {
      await Share.share({
        // TODO: 실제 딥링크 있으면 url로 교체
        message: `CO·ONN에서 채팅방에 초대합니다.\n방 ID: ${roomId}`,
      });
    } catch (e) {
      console.warn('share error', e);
    }
  };

  // ✅ Setting.tsx(= ChatBeaconSettingScreen)으로 이동
  const handleOpenSettings = () => {
    if (!roomId) return;

    navigation.navigate('ChatSetting', {
      roomId: String(roomId),   // Setting.tsx에서 roomId 타입이 string 이라서 맞춰줌
      roomName: roomTitle,
      // memo, 인원수, 성별/연령 필터는 나중에 Supabase 값 붙이면서 추가
    });
  };

  // ───────────────── 방 공통 액션 ─────────────────
  const handleInviteFriends = () => {
    navigation.navigate('FriendSelect', {
      roomId,
    });
  };

  const handleLeaveRoom = () => {
    // TODO: 실제 나가기 로직 연결
    navigation.goBack();
  };

  const handleOpenMedia = () => {
    // TODO: 사진/동영상 탭으로 이동
  };

  const handleOpenFiles = () => {
    // TODO: 파일 탭으로 이동
  };

  const handleOpenLinks = () => {
    // TODO: 링크 탭으로 이동
  };

  const handleOpenNotice = () => {
    // TODO: 공지 탭으로 이동
  };

  const handleOpenSchedule = () => {
    // TODO: 일정 탭으로 이동
  };

  const handleOpenPoll = () => {
    // TODO: 투표 탭으로 이동
  };

  const handleOpenQuiz = () => {
    // TODO: 퀴즈 탭으로 이동
  };

  const handleOpenBot = () => {
    // TODO: 오픈채팅봇 활성화
  };

  // ───────────────── 참가자 탭/롱프레스 ─────────────────
  const handlePressParticipant = (p: Participant) => {
    if (!canOpenProfile) return;
    navigation.navigate('ProfileView', {
      userId: p.id,
      publicView: true,
    });
  };

  const savePerUserMute = async (nextIds: string[]) => {
    if (!perUserMuteKey) return;
    try {
      await AsyncStorage.setItem(
        perUserMuteKey,
        JSON.stringify(nextIds),
      );
    } catch (e) {
      console.warn('per-user mute save error', e);
    }
  };

  const toggleMuteUser = (p: Participant) => {
    setMutedUserIds((prev) => {
      let next: string[];
      if (prev.includes(p.id)) {
        next = prev.filter((id) => id !== p.id);
      } else {
        next = [...prev, p.id];
      }
      savePerUserMute(next);
      return next;
    });
  };

  const toggleBlockUser = async (p: Participant) => {
    if (!myUserId) return;

    const isBlocked = blockedUserIds.includes(p.id);

    if (isBlocked) {
      const { error } = await supabase
        .from('chat_room_blocks')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', p.id)
        .eq('blocked_by', myUserId);

      if (error) {
        console.error('unblock error', error);
        Alert.alert('오류', '차단 해제에 실패했습니다.');
        return;
      }

      setBlockedUserIds((prev) =>
        prev.filter((id) => id !== p.id),
      );
    } else {
      const { error } = await supabase
        .from('chat_room_blocks')
        .insert({
          room_id: roomId,
          user_id: p.id,
          blocked_by: myUserId,
          blocked_at: new Date().toISOString(),
        });

      if (error) {
        console.error('block error', error);
        Alert.alert('오류', '차단에 실패했습니다.');
        return;
      }

      setBlockedUserIds((prev) =>
        prev.includes(p.id) ? prev : [...prev, p.id],
      );
    }
  };

  const kickMember = async (p: Participant) => {
    if (!isOwnerMe) return;

    const { error } = await supabase
      .from('chat_members')
      .update({
        kicked: true,
        active: false,
        left_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('user_id', p.id);

    if (error) {
      console.error('kick error', error);
      Alert.alert('오류', '강퇴에 실패했습니다.');
      return;
    }

    setParticipants((prev) => prev.filter((m) => m.id !== p.id));
  };

  const handleLongPressParticipant = (p: Participant) => {
    if (!myUserId) return;
    if (p.id === myUserId) return;

    const isBlocked = blockedUserIds.includes(p.id);
    const isMuted = mutedUserIds.includes(p.id);

    const buttons: {
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }[] = [];

    if (isOwnerMe) {
      buttons.push({
        text: '강퇴하기',
        style: 'destructive',
        onPress: () => kickMember(p),
      });
    }

    buttons.push({
      text: isBlocked ? '차단 해제' : '차단하기',
      onPress: () => toggleBlockUser(p),
    });

    buttons.push({
      text: isMuted
        ? '이 사람 알림 켜기'
        : '이 사람 알림 끄기',
      onPress: () => toggleMuteUser(p),
    });

    buttons.push({
      text: '취소',
      style: 'cancel',
    });

    Alert.alert(p.nickname, '이 참가자에 대해 무엇을 할까요?', buttons);
  };

  // ───────────────── UI ─────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        backgroundColor="#ffffff"
        barStyle="dark-content"
        translucent={false}
      />

      {/* 헤더 */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top > 0 ? 8 : 4,
            paddingBottom: 8,
          },
        ]}
      >
        <View style={styles.topBarLeft}>
          <Pressable
            onPress={handleGoBack}
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <ChevronLeft size={22} />
          </Pressable>
          <Text style={styles.topBarTitle}>채팅방 관리</Text>
        </View>

        <View style={styles.topBarRight}>
          <Pressable
            onPress={handleToggleRoomMute}
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <BellOff
              size={20}
              color={isRoomMuted ? '#fb923c' : '#0f172a'}
            />
          </Pressable>
          <Pressable
            onPress={handleToggleFavorite}
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <Star
              size={20}
              color={isFavorite ? '#facc15' : '#0f172a'}
              fill={isFavorite ? '#facc15' : 'none'}
            />
          </Pressable>
          <Pressable
            onPress={handleShareRoom}
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <Share2 size={20} />
          </Pressable>
          <Pressable
            onPress={handleOpenSettings}
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <SettingsIcon size={20} />
          </Pressable>
        </View>
      </View>

      {/* 본문 */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
          </View>
        )}

        {/* 방 카드 */}
        <View style={styles.roomCard}>
          <View style={styles.roomCoverRow}>
            <View style={styles.roomCoverWrapper}>
              {coverImage ? (
                <Image
                  source={{ uri: coverImage }}
                  style={styles.roomCoverImage}
                />
              ) : (
                <View style={styles.roomCoverPlaceholder}>
                  <Text style={styles.roomCoverInitial}>
                    {roomTitle.slice(0, 1)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.roomInfoCol}>
              <Text style={styles.roomName}>{roomTitle}</Text>
              <Text style={styles.roomSubMeta}>
                참여자 {participantCount}명
              </Text>
            </View>
          </View>
        </View>

        {/* 콘텐츠 섹션 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>콘텐츠</Text>

          <View style={styles.sectionCard}>
            <RowItem
              icon={<ImageIcon size={20} />}
              label="사진/동영상"
              onPress={handleOpenMedia}
            />
            <Divider />
            <RowItem
              icon={<FileText size={20} />}
              label="파일"
              onPress={handleOpenFiles}
            />
            <Divider />
            <RowItem
              icon={<Link2 size={20} />}
              label="링크"
              onPress={handleOpenLinks}
            />
          </View>
        </View>

        {/* 채팅방 기능 섹션 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>채팅방 기능</Text>

          <View style={styles.sectionCard}>
            <RowItem
              icon={<Megaphone size={20} />}
              label="공지"
              onPress={handleOpenNotice}
            />
            <Divider />
            <RowItem
              icon={<Calendar size={20} />}
              label="일정"
              onPress={handleOpenSchedule}
            />

            {!isSelfChat && (
              <>
                <Divider />
                <RowItem
                  icon={<ListTodo size={20} />}
                  label="투표"
                  onPress={handleOpenPoll}
                />
                <Divider />
                <RowItem
                  icon={<HelpCircle size={20} />}
                  label="퀴즈"
                  onPress={handleOpenQuiz}
                />
              </>
            )}

            <Divider />
            <RowItem
              icon={<Bot size={20} />}
              label="오픈채팅봇 활성화"
              onPress={handleOpenBot}
            />
          </View>
        </View>

        {/* 참가자 목록 */}
        <View style={styles.section}>
          <View style={styles.participantHeaderRow}>
            <Text style={styles.sectionTitle}>
              대화상대 {participantCount}
            </Text>

            <Pressable
              style={styles.inviteBtn}
              onPress={handleInviteFriends}
            >
              <UserPlus size={18} color="#0066FF" />
              <Text style={styles.inviteBtnText}>친구 초대</Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            {participants.map((p, index) => (
              <React.Fragment key={p.id}>
                {index > 0 && <Divider />}
                <Pressable
                  style={styles.participantRow}
                  onPress={() => handlePressParticipant(p)}
                  onLongPress={() =>
                    handleLongPressParticipant(p)
                  }
                >
                  {p.avatar_url ? (
                    <Image
                      source={{ uri: p.avatar_url }}
                      style={styles.participantAvatar}
                    />
                  ) : (
                    <View
                      style={styles.participantAvatarPlaceholder}
                    >
                      <Text style={styles.participantInitial}>
                        {p.nickname.slice(0, 1)}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View style={styles.participantNameRow}>
                      <Text style={styles.participantName}>
                        {p.isMe ? `나 (${p.nickname})` : p.nickname}
                      </Text>
                      {p.isOwner && (
                        <Text style={styles.ownerBadge}>방장</Text>
                      )}
                      {blockedUserIds.includes(p.id) && (
                        <Text style={styles.blockedBadge}>차단</Text>
                      )}
                      {mutedUserIds.includes(p.id) && (
                        <Text style={styles.mutedBadge}>무음</Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              </React.Fragment>
            ))}

            {!loading && participants.length === 0 && (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>
                  아직 참가자가 없습니다.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 채팅방 나가기 */}
        <View style={styles.footer}>
          <Pressable
            style={styles.leaveButton}
            onPress={handleLeaveRoom}
          >
            <Text style={styles.leaveButtonText}>채팅방 나가기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ───────────── 재사용 컴포넌트 ───────────── */

type RowItemProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

function RowItem({ icon, label, onPress }: RowItemProps) {
  return (
    <Pressable style={styles.rowItem} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIconWrapper}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <ChevronLeft
        size={18}
        style={{ transform: [{ rotate: '180deg' }] }}
      />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

/* ───────────── 스타일 ───────────── */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
  },
  loadingRow: {
    paddingTop: 16,
    paddingBottom: 4,
  },

  topBar: {
    height: 54,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    padding: 6,
    marginLeft: 2,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginLeft: 2,
  },

  roomCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roomCoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomCoverWrapper: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 14,
    backgroundColor: '#e2e8f0',
  },
  roomCoverImage: {
    width: '100%',
    height: '100%',
  },
  roomCoverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCoverInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#475569',
  },
  roomInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  roomSubMeta: {
    fontSize: 13,
    color: '#64748b',
  },

  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },

  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#ffffff',
  },
  rowLabel: {
    fontSize: 14,
    color: '#0f172a',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginLeft: 52,
  },

  participantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  inviteBtnText: {
    marginLeft: 4,
    fontSize: 13,
    color: '#0066FF',
    fontWeight: '600',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  participantAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantName: {
    fontSize: 14,
    color: '#0f172a',
  },
  ownerBadge: {
    marginLeft: 6,
    fontSize: 11,
    color: '#f97316',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  blockedBadge: {
    marginLeft: 6,
    fontSize: 11,
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  mutedBadge: {
    marginLeft: 6,
    fontSize: 11,
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },

  emptyRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
  },

  footer: {
    marginTop: 24,
  },
  leaveButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#b91c1c',
  },
});
