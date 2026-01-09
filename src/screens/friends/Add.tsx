// src/screens/friends/Add.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  StatusBar as RNStatusBar,
  ScrollView,
  Dimensions,
  Share,
  Image,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import {
  ChevronLeft,
  QrCode,
  IdCard,
  Contact2,
  UserPlus2,
  Share2,
  Camera as CameraIcon,
  X,
  Search as SearchIcon,
} from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Contacts from 'expo-contacts';

import { supabase } from '@/lib/supabase';

type TabKey = 'qr' | 'contacts' | 'id' | 'request';
type SearchMode = 'id' | 'phone';

type MyProfile = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

type SearchUser = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  relation_status: 'none' | 'pending_in' | 'pending_out' | 'accepted' | 'blocked';
  friendship_id: string | null;
};

type FriendRequestItem = {
  friendship_id: string;
  created_at: string;
  message: string | null;
  other_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

type RequestsPayload = {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
};

type ContactRow = {
  id: string;
  name: string;
  phone: string;
};

const BG = '#FFFFFF';
const TEXT = '#111827';
const MUTED = '#6B7280';
const HAIRLINE = '#E5E7EB';
const ACCENT = '#FF5A7A';

const MAX_MESSAGE = 80;

async function rpc<T>(fn: string, args?: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

function safeMsg(e: any) {
  return (e?.message ?? String(e)) as string;
}

function normalizePhone(p: string) {
  const trimmed = (p ?? '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

export default function FriendAddScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabKey>('qr');

  // =========================
  // ✅ StatusBar/상단바 정책 (List.tsx와 동일)
  // =========================
  const applyStatusBar = useCallback(() => {
    try {
      (navigation as any).setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: 'dark',
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS !== 'android') return;
    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle('dark-content', true);
    } catch {}
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar();
      let t1: any = null;
      let t2: any = null;

      try {
        requestAnimationFrame(() => applyStatusBar());
      } catch {}

      t1 = setTimeout(() => applyStatusBar(), 0);
      t2 = setTimeout(() => applyStatusBar(), 60);

      return () => {
        if (t1) clearTimeout(t1);
        if (t2) clearTimeout(t2);
      };
    }, [applyStatusBar]),
  );

  useEffect(() => {
    applyStatusBar();
  }, [applyStatusBar]);

  // my profile
  const [me, setMe] = useState<MyProfile | null>(null);
  const myQrValue = useMemo(() => {
    if (!me?.id) return null;
    return `coonn:user:${me.id}`;
  }, [me?.id]);

  // request message
  const [reqMessage, setReqMessage] = useState('');

  // QR Camera
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [qrVisible, setQrVisible] = useState(false);
  const [scanned, setScanned] = useState(false);

  // Search modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<SearchMode>('id');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const searchDebounce = useRef<any>(null);

  // Contacts modal
  const [contactsVisible, setContactsVisible] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsQ, setContactsQ] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);

  // Requests (incoming/outgoing)
  const [reqLoading, setReqLoading] = useState(false);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);

  const loadMe = useCallback(async () => {
    try {
      const prof = await rpc<MyProfile>('get_my_profile_v1');
      setMe(prof ?? null);
    } catch {
      setMe(null);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    try {
      const payload = await rpc<RequestsPayload>('list_friend_requests_v1');
      setIncoming(payload?.incoming ?? []);
      setOutgoing(payload?.outgoing ?? []);
    } catch (e: any) {
      Alert.alert('불러오기 실패', safeMsg(e).slice(0, 200));
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setReqLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (activeTab === 'request') {
      loadRequests();
    }
  }, [activeTab, loadRequests]);

  const openSearch = useCallback((mode: SearchMode) => {
    setModalMode(mode);
    setSearchQuery('');
    setSearchResults([]);
    setModalVisible(true);
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = (q ?? '').trim();
      if (!trimmed) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const payload = await rpc<{ items: SearchUser[] }>('search_users_v1', {
          q: trimmed,
          mode: modalMode,
          lim: 20,
        });
        setSearchResults(payload?.items ?? []);
      } catch (e: any) {
        Alert.alert('검색 실패', safeMsg(e).slice(0, 200));
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [modalMode],
  );

  useEffect(() => {
    if (!modalVisible) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      if (searchQuery.trim().length >= (modalMode === 'phone' ? 6 : 2)) {
        runSearch(searchQuery);
      }
    }, 250);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [modalVisible, modalMode, runSearch, searchQuery]);

  const sendRequest = useCallback(
    async (targetId: string) => {
      try {
        const msg = reqMessage.trim().slice(0, MAX_MESSAGE);
        await rpc('send_friend_request', { target_id: targetId, message: msg || null });
        Alert.alert('완료', '친구 요청을 보냈습니다.');
        setReqMessage('');
        setModalVisible(false);
        setSearchQuery('');
        setSearchResults([]);
        loadRequests();
      } catch (e: any) {
        Alert.alert('요청 실패', safeMsg(e).slice(0, 200));
      }
    },
    [reqMessage, loadRequests],
  );

  const acceptRequest = useCallback(
    async (friendshipId: string) => {
      try {
        await rpc('accept_friend_request', { friendship_id: friendshipId });
        await loadRequests();
      } catch (e: any) {
        Alert.alert('수락 실패', safeMsg(e).slice(0, 200));
      }
    },
    [loadRequests],
  );

  const rejectRequest = useCallback(
    async (friendshipId: string) => {
      try {
        await rpc('reject_friend_request', { friendship_id: friendshipId });
        await loadRequests();
      } catch (e: any) {
        Alert.alert('거절 실패', safeMsg(e).slice(0, 200));
      }
    },
    [loadRequests],
  );

  const cancelRequest = useCallback(
    async (friendshipId: string) => {
      try {
        await rpc('cancel_friend_request', { friendship_id: friendshipId });
        await loadRequests();
      } catch (e: any) {
        Alert.alert('취소 실패', safeMsg(e).slice(0, 200));
      }
    },
    [loadRequests],
  );

  const openQrCamera = useCallback(async () => {
    const granted = camPermission?.granted;
    if (!granted) {
      const res = await requestCamPermission();
      if (!res?.granted) {
        Alert.alert('권한 필요', '카메라 권한이 필요합니다.');
        return;
      }
    }
    setScanned(false);
    setQrVisible(true);
  }, [camPermission?.granted, requestCamPermission]);

  const handleQrData = useCallback(
    async (data: string) => {
      if (scanned) return;
      setScanned(true);

      const raw = (data ?? '').trim();
      let userId: string | null = null;
      if (raw.startsWith('coonn:user:')) {
        userId = raw.replace('coonn:user:', '').trim();
      }

      if (!userId || userId.length < 10) {
        Alert.alert('실패', '유효하지 않은 QR 코드입니다.');
        setScanned(false);
        return;
      }

      setQrVisible(false);
      setModalMode('id');
      setSearchQuery(userId);
      setSearchResults([]);
      setModalVisible(true);

      runSearch(userId);
    },
    [runSearch, scanned],
  );

  const openContacts = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '연락처 권한이 필요합니다.');
        return;
      }

      setContactsVisible(true);
      setContactsQ('');
      setContactsLoading(true);

      const res = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 500,
        sort: Contacts.SortTypes.FirstName,
      });

      const rows: ContactRow[] = [];
      for (const c of res.data ?? []) {
        const name = (c.name ?? '').trim() || '이름없음';
        const phones = (c.phoneNumbers ?? [])
          .map((p) => normalizePhone(p?.number ?? ''))
          .filter(Boolean);

        const phone = phones[0];
        if (!phone) continue;

        rows.push({ id: c.id, name, phone });
      }

      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        if (seen.has(r.phone)) return false;
        seen.add(r.phone);
        return true;
      });

      setContacts(unique);
    } catch (e: any) {
      Alert.alert('연락처 불러오기 실패', safeMsg(e).slice(0, 200));
      setContacts([]);
      setContactsVisible(false);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const filteredContacts = useMemo(() => {
    const q = contactsQ.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, contactsQ]);

  const pickContact = useCallback(
    async (row: ContactRow) => {
      const phone = row.phone;
      if (!phone) return;

      setContactsVisible(false);
      setActiveTab('contacts');

      setModalMode('phone');
      setSearchQuery(phone);
      setSearchResults([]);
      setModalVisible(true);
      runSearch(phone);
    },
    [runSearch],
  );

  const shareMyQr = useCallback(async () => {
    if (!me?.id) return;
    try {
      await Share.share({
        message: `내 CO·ONN QR\n${myQrValue}`,
      });
    } catch {}
  }, [me?.id, myQrValue]);

  const modalTitle = useMemo(() => {
    if (modalMode === 'phone') return '연락처로 친구 찾기';
    return 'CO·ONN ID / 친구 코드로 찾기';
  }, [modalMode]);

  const modalPlaceholder = useMemo(() => {
    if (modalMode === 'phone') return '휴대폰 번호를 입력하세요';
    return 'CO·ONN ID 또는 친구 코드를 입력하세요';
  }, [modalMode]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RNStatusBar backgroundColor="transparent" translucent={true} barStyle="dark-content" />

      {/* Top bar wrapper: StatusBar 영역까지 확장 (List.tsx 방식) */}
      <View style={[styles.topBarWrap, { paddingTop: Math.max(insets.top, 0) + 4 }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.topLeft} hitSlop={10} onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color={TEXT} />
          </Pressable>
          <Text style={styles.topTitle}>친구 추가</Text>
          <View style={styles.topRight} />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TabBtn
          icon={<QrCode size={20} color={activeTab === 'qr' ? '#fff' : TEXT} />}
          label="QR 코드"
          active={activeTab === 'qr'}
          onPress={() => setActiveTab('qr')}
        />
        <TabBtn
          icon={<Contact2 size={20} color={activeTab === 'contacts' ? '#fff' : TEXT} />}
          label="연락처"
          active={activeTab === 'contacts'}
          onPress={() => {
            setActiveTab('contacts');
            openContacts();
          }}
        />
        <TabBtn
          icon={<IdCard size={20} color={activeTab === 'id' ? '#fff' : TEXT} />}
          label="CO·ONN ID"
          active={activeTab === 'id'}
          onPress={() => {
            setActiveTab('id');
            openSearch('id');
          }}
        />
        <TabBtn
          icon={<UserPlus2 size={20} color={activeTab === 'request' ? '#fff' : TEXT} />}
          label="친구요청"
          active={activeTab === 'request'}
          onPress={() => setActiveTab('request')}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* QR */}
        {activeTab === 'qr' && (
          <>
            <Section title="내 QR 코드" />
            <View style={styles.card}>
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                {myQrValue ? (
                  <QRCode value={myQrValue} size={180} />
                ) : (
                  <View style={[styles.qrBox, { alignItems: 'center', justifyContent: 'center' }]}>
                    <ActivityIndicator />
                  </View>
                )}
              </View>

              <View style={styles.rowBtns}>
                <Pressable style={[styles.btn, styles.primary]} onPress={shareMyQr}>
                  <Share2 size={18} color="#fff" />
                  <Text style={styles.btnTxtWhite}>공유</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.dark]} onPress={openQrCamera}>
                  <CameraIcon size={18} color="#fff" />
                  <Text style={styles.btnTxtWhite}>스캔</Text>
                </Pressable>
              </View>

              <Text style={styles.helpText}>QR 코드를 공유하거나 스캔하여 친구를 추가할 수 있습니다.</Text>
            </View>
          </>
        )}

        {/* Contacts */}
        {activeTab === 'contacts' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Text style={styles.helpText}>연락처 권한이 허용되어 있으면 연락처에서 친구를 검색할 수 있습니다.</Text>
            <Pressable
              style={[styles.btn, styles.primary, { alignSelf: 'flex-start', marginTop: 10 }]}
              onPress={openContacts}
            >
              <SearchIcon size={18} color="#fff" />
              <Text style={styles.btnTxtWhite}>연락처 열기</Text>
            </Pressable>
          </View>
        )}

        {/* Search by ID */}
        {activeTab === 'id' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Text style={styles.helpText}>CO·ONN ID 또는 친구 코드를 입력해 검색할 수 있습니다.</Text>
          </View>
        )}

        {/* Friend requests */}
        {activeTab === 'request' && (
          <>
            <Section title="친구 요청 메시지" />
            <View style={styles.card}>
              <TextInput
                style={styles.msgInput}
                value={reqMessage}
                onChangeText={setReqMessage}
                placeholder="(선택) 요청 메시지"
                placeholderTextColor="#9CA3AF"
                maxLength={MAX_MESSAGE}
              />
              <Text style={styles.msgHint}>
                {reqMessage.length}/{MAX_MESSAGE}
              </Text>
            </View>

            <Section title={`받은 친구 요청 (${incoming.length})`} />
            {reqLoading ? (
              <ActivityIndicator style={{ marginVertical: 10 }} />
            ) : incoming.length === 0 ? (
              <Text style={styles.emptyText}>받은 친구 요청이 없습니다.</Text>
            ) : (
              incoming.map((r) => (
                <RequestRow
                  key={r.friendship_id}
                  item={r}
                  variant="incoming"
                  onAccept={() => acceptRequest(r.friendship_id)}
                  onReject={() => rejectRequest(r.friendship_id)}
                />
              ))
            )}

            <Section title={`보낸 친구 요청 (${outgoing.length})`} />
            {reqLoading ? (
              <ActivityIndicator style={{ marginVertical: 10 }} />
            ) : outgoing.length === 0 ? (
              <Text style={styles.emptyText}>보낸 친구 요청이 없습니다.</Text>
            ) : (
              outgoing.map((r) => (
                <RequestRow
                  key={r.friendship_id}
                  item={r}
                  variant="outgoing"
                  onCancel={() => cancelRequest(r.friendship_id)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* QR camera modal */}
      <Modal visible={qrVisible} animationType="slide" onRequestClose={() => setQrVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={styles.qrTopBar}>
            <Pressable hitSlop={10} onPress={() => setQrVisible(false)}>
              <X size={22} color="#fff" />
            </Pressable>
            <Text style={styles.qrTopTitle}>QR 스캔</Text>
            <View style={{ width: 22 }} />
          </View>

          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(e) => handleQrData((e as any)?.data)}
          />
          <View style={styles.qrHintWrap}>
            <Text style={styles.qrHint}>QR 코드를 화면 중앙에 맞춰주세요.</Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Contacts modal */}
      <Modal
        transparent
        visible={contactsVisible}
        animationType="fade"
        onRequestClose={() => setContactsVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setContactsVisible(false)}>
          <Pressable style={styles.modalCardWide} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>연락처</Text>
              <Pressable hitSlop={10} onPress={() => setContactsVisible(false)}>
                <X size={20} color={TEXT} />
              </Pressable>
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={contactsQ}
                onChangeText={setContactsQ}
                placeholder="이름/번호 검색"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {contactsLoading ? (
              <ActivityIndicator style={{ marginVertical: 10 }} />
            ) : filteredContacts.length === 0 ? (
              <Text style={styles.emptyText}>표시할 연락처가 없습니다.</Text>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(i) => `${i.id}-${i.phone}`}
                style={{ maxHeight: 420 }}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                renderItem={({ item }) => (
                  <Pressable style={styles.contactRow} onPress={() => pickContact(item)}>
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarTxt}>
                        {(item.name?.[0] ?? 'U').toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.searchSub} numberOfLines={1}>
                        {item.phone}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Search Modal */}
      <Modal
        transparent
        visible={modalVisible}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <Pressable hitSlop={10} onPress={() => setModalVisible(false)}>
                <X size={20} color={TEXT} />
              </Pressable>
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={modalPlaceholder}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={modalMode === 'phone' ? 'phone-pad' : 'default'}
                returnKeyType="search"
                onSubmitEditing={() => runSearch(searchQuery)}
              />
              <Pressable style={styles.searchBtn} onPress={() => runSearch(searchQuery)}>
                <Text style={styles.searchBtnText}>검색</Text>
              </Pressable>
            </View>

            {searchLoading ? (
              <ActivityIndicator style={{ marginVertical: 10 }} />
            ) : searchResults.length === 0 ? (
              <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
            ) : (
              <View style={{ maxHeight: 340 }}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {searchResults.map((u) => {
                    const canRequest = u.relation_status === 'none' || u.relation_status === 'blocked';
                    const label =
                      u.relation_status === 'accepted'
                        ? '친구'
                        : u.relation_status === 'pending_out'
                        ? '요청됨'
                        : u.relation_status === 'pending_in'
                        ? '받은요청'
                        : '요청';

                    return (
                      <View key={u.id} style={styles.searchRow}>
                        {u.avatar_url ? (
                          <Image source={{ uri: u.avatar_url }} style={styles.avatar} />
                        ) : (
                          <View style={[styles.avatar, styles.avatarFallback]}>
                            <Text style={styles.avatarTxt}>
                              {(u.nickname?.[0] ?? 'U').toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={styles.searchName} numberOfLines={1}>
                            {u.nickname || u.follow_id || '사용자'}
                          </Text>
                          <Text style={styles.searchSub} numberOfLines={1}>
                            {u.follow_id ||
                              u.friend_code ||
                              u.phone_number ||
                              u.id.slice(0, 8) + '…'}
                          </Text>
                        </View>

                        {u.relation_status === 'pending_in' && u.friendship_id ? (
                          <Pressable
                            style={[styles.smallBtn, styles.accept]}
                            onPress={() => acceptRequest(u.friendship_id!)}
                          >
                            <Text style={styles.smallBtnTxtWhite}>수락</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            disabled={!canRequest}
                            style={[styles.smallBtn, canRequest ? styles.primary : styles.disabled]}
                            onPress={() => sendRequest(u.id)}
                          >
                            <Text
                              style={canRequest ? styles.smallBtnTxtWhite : styles.smallBtnTxtMuted}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Text style={[styles.helpText, { paddingHorizontal: 4, paddingTop: 10 }]}>
              요청 메시지는 “친구요청” 탭에서 설정됩니다. (최대 {MAX_MESSAGE}자)
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TabBtn({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabBtn} onPress={onPress}>
      <View style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function RequestRow({
  item,
  variant,
  onAccept,
  onReject,
  onCancel,
}: {
  item: FriendRequestItem;
  variant: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
}) {
  const name = item.nickname || item.follow_id || item.friend_code || '사용자';
  const sub =
    item.follow_id || item.friend_code || item.phone_number || item.other_id.slice(0, 8) + '…';

  return (
    <View style={styles.requestRow}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarTxt}>{(name?.[0] ?? 'U').toUpperCase()}</Text>
        </View>
      )}

      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={styles.requestName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.requestSub} numberOfLines={1}>
          {sub}
        </Text>
        {item.message ? (
          <Text style={styles.requestMsg} numberOfLines={2}>
            {item.message}
          </Text>
        ) : null}
      </View>

      {variant === 'incoming' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={[styles.smallBtn, styles.accept]} onPress={onAccept}>
            <Text style={styles.smallBtnTxtWhite}>수락</Text>
          </Pressable>
          <Pressable style={[styles.smallBtn, styles.reject]} onPress={onReject}>
            <Text style={styles.smallBtnTxtWhite}>거절</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[styles.smallBtn, styles.ghost]} onPress={onCancel}>
          <Text style={styles.smallBtnTxtMuted}>취소</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // ✅ top bar wrapper (List.tsx 정책과 동일하게 SafeAreaTop 직접 처리)
  topBarWrap: {
    backgroundColor: '#fff',
  },

  // top bar
  topBar: {
    height: 54,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: 0,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topLeft: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: TEXT },
  topRight: { width: 44 },

  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  tabBtn: { width: '23%', alignItems: 'center' },
  tabIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HAIRLINE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  tabIconActive: { backgroundColor: TEXT, borderColor: TEXT },
  tabLabel: { marginTop: 6, fontSize: 12, color: TEXT, fontWeight: '600' },
  tabLabelActive: { color: TEXT },

  sectionHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: TEXT },

  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },
  qrBox: { width: 180, height: 180, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 12 },
  rowBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: { backgroundColor: ACCENT },
  dark: { backgroundColor: TEXT },
  btnTxtWhite: { color: '#fff', fontWeight: '800', fontSize: 13 },

  helpText: { marginTop: 10, color: MUTED, fontSize: 12, lineHeight: 16 },

  msgInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HAIRLINE,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    color: TEXT,
    fontSize: 14,
  },
  msgHint: { marginTop: 8, textAlign: 'right', color: MUTED, fontSize: 12 },

  emptyText: { color: MUTED, paddingHorizontal: 16, paddingVertical: 8 },

  requestRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  requestName: { fontSize: 15, fontWeight: '800', color: TEXT },
  requestSub: { marginTop: 2, color: MUTED, fontSize: 12 },
  requestMsg: { marginTop: 6, color: TEXT, fontSize: 12, lineHeight: 16 },

  avatar: { width: 44, height: 44, borderRadius: 18, backgroundColor: '#e5e7eb', marginRight: 10 },
  avatarFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800' },

  smallBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: { backgroundColor: '#111827' },
  reject: { backgroundColor: '#EF4444' },
  ghost: { borderWidth: 1, borderColor: HAIRLINE, backgroundColor: '#fff' },
  disabled: { backgroundColor: '#E5E7EB' },
  smallBtnTxtWhite: { color: '#fff', fontWeight: '800' },
  smallBtnTxtMuted: { color: TEXT, fontWeight: '800' },

  // modals
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  modalCardWide: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: TEXT },

  inputWrap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HAIRLINE,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    color: TEXT,
  },
  searchBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '800' },

  searchRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  searchName: { fontSize: 14, fontWeight: '800', color: TEXT },
  searchSub: { marginTop: 2, fontSize: 12, color: MUTED },

  contactRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#f3f4f6' },

  // QR camera modal top
  qrTopBar: {
    height: 54,
    paddingHorizontal: 14,
    paddingLeft: 10,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qrTopTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  qrHintWrap: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center' },
  qrHint: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    fontSize: 12,
  },
});
