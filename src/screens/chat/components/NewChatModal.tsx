import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Camera, Check, Search, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import SimpleMediaPicker, {
  type SimplePickedImage,
} from "@/components/SimpleMediaPicker";
import UniversalImageEditor from "@/components/UniversalImageEditor";
import OpenProfileJoinModal, {
  type OpenProfileJoinSelection,
} from "@/screens/chat/openProfiles/OpenProfileJoinModal";
import { useAppTheme } from "@/theme/useAppTheme";
import { createNewChatModalTheme } from "./NewChatModal.theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onChatCreated: () => void;
  navigation: any;
};

type CreateMode = "normal" | "open";
type FriendRow = { id: string; nickname: string; avatar_url?: string | null };
type RoomType = "dm" | "group" | "open";

const isFriendRow = (value: FriendRow | null | undefined): value is FriendRow =>
  Boolean(value && value.id && value.nickname);

const AVATAR_SIZE = 50;
const HEADER_SIDE_WIDTH = 84;
const OPEN_COVER_PREVIEW_WIDTH = 156;
const OPEN_COVER_PREVIEW_HEIGHT = 195;
const OPEN_COVER_EDITOR_RATIO =
  OPEN_COVER_PREVIEW_WIDTH / OPEN_COVER_PREVIEW_HEIGHT;
const MAX_OPEN_DESCRIPTION_LENGTH = 500;
const MAX_OPEN_TAGS = 12;

type PickedOpenCover = {
  uri: string;
  contentType: string;
  ext: string;
};

const OPEN_COVER_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

function getInitial(name?: string | null) {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

function normalizeDisplayText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function sanitizeImageExt(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  if (cleaned === "jpeg") return "jpg";
  if (cleaned === "heif") return "heic";
  if (["jpg", "png", "webp", "heic", "gif"].includes(cleaned)) return cleaned;
  return "jpg";
}

function extFromUri(uri: string): string {
  const path =
    String(uri ?? "")
      .split("?")[0]
      ?.split("#")[0] ?? "";
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return sanitizeImageExt(match?.[1] ?? "jpg");
}

function contentTypeFromExt(ext: string): string {
  switch (sanitizeImageExt(ext)) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "gif":
      return "image/gif";
    case "jpg":
    default:
      return "image/jpeg";
  }
}

function normalizeImageContentType(
  value: unknown,
  fallbackExt: string,
): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  const normalized = raw === "image/jpg" ? "image/jpeg" : raw;
  if (OPEN_COVER_CONTENT_TYPES.has(normalized)) return normalized;
  return contentTypeFromExt(fallbackExt);
}

function pickedCoverFromSimpleImage(image: SimplePickedImage): PickedOpenCover {
  const ext = sanitizeImageExt(
    image.ext ?? image.filename?.split(".").pop() ?? extFromUri(image.uri),
  );

  return {
    uri: image.uri,
    ext,
    contentType: normalizeImageContentType(image.contentType, ext),
  };
}

async function uploadOpenCoverToR2(
  roomId: string | number,
  picked: PickedOpenCover,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("open-upload", {
    body: {
      scope: "chat_room_cover",
      roomId,
      contentType: picked.contentType,
      ext: picked.ext,
    },
  });

  if (error) throw error;

  const uploadUrl = String((data as any)?.uploadUrl ?? "");
  const publicUrl = String((data as any)?.publicUrl ?? "");
  const uploadContentType = String(
    (data as any)?.contentType ?? picked.contentType,
  );

  if (!uploadUrl || !publicUrl) {
    throw new Error("invalid_upload_presign_response");
  }

  const blob = await (await fetch(picked.uri)).blob();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": uploadContentType },
    body: blob as any,
  });

  if (!putRes.ok) {
    throw new Error(`r2_upload_failed:${putRes.status}`);
  }

  return publicUrl;
}

function normalizeOpenTagsInput(value: string): string[] {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(/[#,/\n]/)
        .map((tag) => tag.trim().replace(/^#+/, "").toLowerCase())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, MAX_OPEN_TAGS);
}

function getGroupedFriendItemStyle(
  index: number,
  count: number,
  radius: number,
  hairline: number,
  borderColor: string,
): ViewStyle {
  const isFirst = index === 0;
  const isLast = index === count - 1;

  return {
    borderTopLeftRadius: isFirst ? radius : 0,
    borderTopRightRadius: isFirst ? radius : 0,
    borderBottomLeftRadius: isLast ? radius : 0,
    borderBottomRightRadius: isLast ? radius : 0,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderTopWidth: isFirst ? hairline : 0,
    borderBottomWidth: isLast ? hairline : 0,
    borderColor,
  };
}

export default function NewChatModal({
  visible,
  onClose,
  onChatCreated,
  navigation,
}: Props) {
  const appTheme = useAppTheme();
  const ui = useMemo(() => createNewChatModalTheme(appTheme), [appTheme]);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [mode, setMode] = useState<CreateMode>("normal");
  const [title, setTitle] = useState("");
  const [openDescription, setOpenDescription] = useState("");
  const [openTagsText, setOpenTagsText] = useState("");
  const [openSearchable, setOpenSearchable] = useState(true);
  const [openCoverUri, setOpenCoverUri] = useState<string | null>(null);
  const [openPickedCover, setOpenPickedCover] =
    useState<PickedOpenCover | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [openCoverEditorUri, setOpenCoverEditorUri] = useState<string | null>(
    null,
  );
  const [pendingOpenCover, setPendingOpenCover] =
    useState<PickedOpenCover | null>(null);
  const [openProfilePickerVisible, setOpenProfilePickerVisible] =
    useState(false);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forceGroupMode, setForceGroupMode] = useState(false);

  useEffect(() => {
    if (visible) {
      void loadFriends();
      setMode("normal");
      setTitle("");
      setOpenDescription("");
      setOpenTagsText("");
      setOpenSearchable(true);
      setOpenCoverUri(null);
      setOpenPickedCover(null);
      setPickerVisible(false);
      setOpenCoverEditorUri(null);
      setPendingOpenCover(null);
      setOpenProfilePickerVisible(false);
      setSelectedIds([]);
      setForceGroupMode(false);
      setFriendSearch("");
    }
  }, [visible]);

  const loadFriends = async () => {
    try {
      setLoadingFriends(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: friendMetaRows } = await supabase
        .from("friend_meta")
        .select("friend_user_id, alias, is_hidden, is_friend")
        .eq("owner_user_id", userId)
        .eq("is_friend", true)
        .eq("is_hidden", false);

      const friendMetaById = new Map<string, { alias: string | null }>();
      for (const row of friendMetaRows ?? []) {
        const friendUserId = String((row as any)?.friend_user_id ?? "");
        if (!friendUserId) continue;
        friendMetaById.set(friendUserId, {
          alias: normalizeDisplayText((row as any)?.alias),
        });
      }

      let ids = Array.from(friendMetaById.keys());

      if (!ids.length) {
        const { data: frs } = await supabase
          .from("friendships")
          .select("requester, addressee")
          .or(`requester.eq.${userId},addressee.eq.${userId}`)
          .eq("status", "accepted");

        ids = Array.from(
          new Set(
            (frs ?? [])
              .map((f: any) =>
                f.requester === userId ? f.addressee : f.requester,
              )
              .filter(Boolean)
              .map(String),
          ),
        );
      }

      if (!ids.length) {
        setFriends([]);
        return;
      }

      const { data: pf } = await supabase
        .from("profiles")
        .select("id, nickname, follow_id, avatar_url")
        .in("id", ids);

      const profileById = new Map<string, any>();
      for (const profile of pf ?? []) {
        profileById.set(String((profile as any).id), profile);
      }

      const list: FriendRow[] = [];

      for (const id of ids) {
        const profile = profileById.get(id);
        if (!profile) continue;

        const alias = friendMetaById.get(id)?.alias;
        const nickname =
          alias ??
          normalizeDisplayText(profile.nickname) ??
          normalizeDisplayText(profile.follow_id) ??
          t("chat:newChat.noName");

        list.push({
          id,
          nickname,
          avatar_url: normalizeDisplayText(profile.avatar_url),
        });
      }

      list.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));

      setFriends(list);
    } catch {
      return;
    } finally {
      setLoadingFriends(false);
    }
  };

  const filteredFriends = useMemo(() => {
    const keyword = friendSearch.trim().toLowerCase();
    if (!keyword) return friends;
    return friends.filter((friend) =>
      friend.nickname.toLowerCase().includes(keyword),
    );
  }, [friendSearch, friends]);

  const selectedFriends = useMemo(
    () =>
      selectedIds
        .map((id) => friends.find((friend) => friend.id === id))
        .filter(isFriendRow),
    [friends, selectedIds],
  );

  useEffect(() => {
    if (selectedIds.length === 0 && forceGroupMode) {
      setForceGroupMode(false);
    }
  }, [forceGroupMode, selectedIds.length]);

  const isOpenMode = mode === "open";
  const isForcedGroupDraft =
    mode === "normal" && forceGroupMode && selectedIds.length > 0;
  const roomType: RoomType = isOpenMode
    ? "open"
    : selectedIds.length > 1 || isForcedGroupDraft
      ? "group"
      : "dm";
  const isGroupDraft = roomType === "group" && mode === "normal";
  const titleValue = title.trim();
  const canCreate = isOpenMode ? titleValue.length > 0 : selectedIds.length > 0;
  const createLabel =
    isOpenMode || isGroupDraft
      ? t("chat:newChat.create")
      : t("chat:newChat.start");
  const normalizedOpenTags = useMemo(
    () => normalizeOpenTagsInput(openTagsText),
    [openTagsText],
  );

  const toggleMember = (id: string) => {
    if (mode !== "normal") return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const switchMode = (nextMode: CreateMode) => {
    setMode(nextMode);
    setTitle("");
    setOpenDescription("");
    setOpenTagsText("");
    setOpenSearchable(true);
    setOpenCoverUri(null);
    setOpenPickedCover(null);
    setPickerVisible(false);
    setOpenCoverEditorUri(null);
    setPendingOpenCover(null);
    setOpenProfilePickerVisible(false);
    setSelectedIds([]);
    setForceGroupMode(false);
    setFriendSearch("");
  };

  const handlePickOpenCover = () => {
    if (creating || !isOpenMode) return;
    setPickerVisible(true);
  };

  const handlePickedOpenCover = (images: SimplePickedImage[]) => {
    const image = images[0];
    if (!image?.uri) {
      setPickerVisible(false);
      return;
    }

    const picked = pickedCoverFromSimpleImage(image);
    setPendingOpenCover(picked);
    setOpenCoverEditorUri(picked.uri);
    setPickerVisible(false);
  };

  const handleCloseOpenCoverEditor = () => {
    if (creating) return;
    setOpenCoverEditorUri(null);
    setPendingOpenCover(null);
  };

  const handleSaveEditedOpenCover = (uri: string) => {
    const edited: PickedOpenCover = {
      uri,
      ext: "jpg",
      contentType: "image/jpeg",
    };

    setOpenPickedCover(edited);
    setOpenCoverUri(uri);
    setOpenCoverEditorUri(null);
    setPendingOpenCover(null);
  };

  const handleClearOpenCover = () => {
    if (creating) return;
    setOpenPickedCover(null);
    setOpenCoverUri(null);
    setOpenCoverEditorUri(null);
    setPendingOpenCover(null);
  };

  const applyHostOpenProfileToRoom = async (
    roomId: string | number,
    userId: string,
    profile: OpenProfileJoinSelection,
  ) => {
    const { error } = await supabase
      .from("chat_members")
      .update({
        open_profile_id: profile.id,
        room_nickname: String(profile.nickname ?? "").trim() || t("chat:newChat.userFallback"),
        room_avatar_url: String(profile.avatar_url ?? "").trim() || null,
        room_avatar_visible: true,
        room_status_message:
          String(profile.status_message ?? "").trim() || null,
        room_profile_updated_at: new Date().toISOString(),
      })
      .eq("room_id", Number(roomId))
      .eq("user_id", userId);

    if (error) throw error;
  };

  const createRoom = async (openProfile?: OpenProfileJoinSelection) => {
    if (mode === "normal" && selectedIds.length === 0) {
      Alert.alert(t("common:notice"), t("chat:newChat.selectPartnerRequired"));
      return;
    }

    if (mode === "open" && !titleValue) {
      Alert.alert(t("common:notice"), t("chat:newChat.openTitleRequired"));
      return;
    }

    if (mode === "open" && !openProfile) {
      setOpenProfilePickerVisible(true);
      return;
    }

    try {
      setCreating(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const me = session?.user?.id;
      if (!me) return;

      let roomTitle = titleValue;
      if (!roomTitle) {
        if (roomType === "dm") {
          roomTitle = selectedFriends[0]?.nickname ?? t("chat:newChat.privateChatTitle");
        } else if (roomType === "group") {
          roomTitle = t("chat:newChat.groupChatTitle");
        } else {
          roomTitle = t("chat:newChat.openChatTitle");
        }
      }

      let nextRoomId: string | null = null;

      if (roomType === "dm") {
        const peerId = selectedIds[0];
        if (!peerId) {
          Alert.alert(
            t("common:notice"),
            t("chat:newChat.selectPartnerRequired"),
          );
          return;
        }

        const { data, error } = await supabase.rpc("get_or_create_dm_room", {
          peer_id: peerId,
        });

        if (error || !data)
          throw error ?? new Error("Failed to create chat room");
        nextRoomId = String(data);
      } else {
        const { data, error } = await supabase.rpc(
          "create_chat_room_with_members",
          {
            p_room_type: roomType,
            p_title: roomTitle,
            p_member_ids: roomType === "open" ? [] : selectedIds,
          },
        );

        if (error || !data)
          throw error ?? new Error("Failed to create chat room");
        nextRoomId = String(data);
      }

      if (!nextRoomId) throw new Error("Failed to create chat room");

      let openCoverPublicUrl: string | null = null;

      if (roomType === "open") {
        if (!openProfile) throw new Error("open_profile_required");

        await applyHostOpenProfileToRoom(nextRoomId, me, openProfile);

        const uploadedCoverUrl = openPickedCover
          ? await uploadOpenCoverToR2(nextRoomId, openPickedCover)
          : null;
        openCoverPublicUrl = uploadedCoverUrl;

        const { error: profileError } = await supabase.rpc(
          "update_open_chat_room_profile_v1",
          {
            p_room_id: Number(nextRoomId),
            p_title: roomTitle,
            p_description: openDescription.trim(),
            p_tags: normalizedOpenTags,
            p_category: null,
            p_is_searchable: openSearchable,
            p_max_members: null,
            p_cover_image_url: uploadedCoverUrl,
          },
        );

        if (profileError) throw profileError;
      }

      setOpenProfilePickerVisible(false);
      onClose();
      onChatCreated();
      navigation.navigate("Chat", {
        roomId: nextRoomId,
        id: nextRoomId,
        room_id: nextRoomId,
        title: roomTitle,
        roomTitle,
        custom_title: roomTitle,
        cover_image_url:
          roomType === "open"
            ? (openCoverPublicUrl ?? openCoverUri ?? undefined)
            : undefined,
        roomCover:
          roomType === "open"
            ? (openCoverPublicUrl ?? openCoverUri ?? undefined)
            : undefined,
        type: roomType,
        roomType,
        open_profile_id: openProfile?.id,
        room_nickname: openProfile?.nickname,
        room_avatar_url: openProfile?.avatar_url ?? null,
      });
    } catch (e: any) {
      Alert.alert(t("common:error"), e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleCreate = () => {
    void createRoom();
  };

  const handleCreateOpenRoomWithProfile = async (
    profile: OpenProfileJoinSelection,
  ) => {
    if (creating) return;
    await createRoom(profile);
  };

  const ModeButton = ({
    value,
    label,
  }: {
    value: CreateMode;
    label: string;
  }) => {
    const isActive = mode === value;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.modeBtn,
          {
            borderRadius: ui.radius.tabItem,
            opacity: pressed ? ui.pressedOpacity : 1,
          },
          isActive
            ? {
                backgroundColor: ui.tabActiveBackground,
                ...ui.selectedTabShadow,
              }
            : null,
        ]}
        onPress={() => switchMode(value)}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.modeText,
            { color: isActive ? ui.tabTextActive : ui.tabText },
            isActive && styles.modeTextActive,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"}
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.safeContainer, { backgroundColor: ui.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={[styles.header, { backgroundColor: ui.headerBackground }]}>
          <View pointerEvents="none" style={styles.headerTitleBox}>
            <Text
              style={[styles.headerTitle, { color: ui.textPrimary }]}
              numberOfLines={1}
            >
              {t("chat:newChat.title")}
            </Text>
          </View>

          <Pressable onPress={onClose} style={styles.cancelBtn} hitSlop={10}>
            <Text
              style={[styles.cancelText, { color: ui.cancelText }]}
              numberOfLines={1}
            >
              {t("common:cancel")}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCreate}
            disabled={creating || !canCreate}
            style={({ pressed }) => [
              styles.createBtn,
              {
                backgroundColor: canCreate
                  ? ui.primaryButtonBackground
                  : ui.disabledButtonBackground,
                borderRadius: ui.radius.button,
                opacity: pressed ? ui.pressedOpacity : 1,
              },
            ]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={ui.primaryButtonText} />
            ) : (
              <Text
                numberOfLines={1}
                style={[
                  styles.createText,
                  {
                    color: canCreate
                      ? ui.primaryButtonText
                      : ui.disabledButtonText,
                  },
                ]}
              >
                {createLabel}
              </Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={[
              styles.modeContainer,
              {
                backgroundColor: ui.tabTrackBackground,
                borderRadius: ui.radius.tabTrack,
              },
            ]}
          >
            <ModeButton value="normal" label={t("chat:newChat.modeNormal")} />
            <ModeButton value="open" label={t("chat:newChat.modeOpen")} />
          </View>

          {isOpenMode ? (
            <ScrollView
              style={styles.openScroll}
              contentContainerStyle={[
                styles.openScrollContent,
                { paddingBottom: Math.max(36, insets.bottom + 28) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.openSection}>
                <Text
                  style={[styles.sectionTitle, { color: ui.textSecondary }]}
                >
                  {t("chat:newChat.openSectionTitle")}
                </Text>

                <View style={styles.coverPickerWrap}>
                  <Pressable
                    onPress={handlePickOpenCover}
                    disabled={creating}
                    style={({ pressed }) => [
                      styles.coverPicker,
                      {
                        backgroundColor: ui.avatarBackground,
                        borderColor: ui.avatarBorder,
                        borderRadius: ui.radius.avatar,
                        opacity: pressed ? ui.pressedOpacity : 1,
                      },
                    ]}
                  >
                    {openCoverUri ? (
                      <Image
                        source={{ uri: openCoverUri }}
                        style={styles.coverPreview}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <Camera
                          size={24}
                          color={ui.iconMuted}
                          strokeWidth={1.9}
                        />
                        <Text
                          style={[
                            styles.coverPlaceholderText,
                            { color: ui.textSecondary },
                          ]}
                        >
                          {t("chat:newChat.coverPhoto")}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  {openCoverUri ? (
                    <Pressable
                      onPress={handleClearOpenCover}
                      hitSlop={10}
                      style={[
                        styles.coverClearButton,
                        {
                          backgroundColor: ui.surface,
                          borderColor: ui.borderSoft,
                        },
                      ]}
                    >
                      <X size={14} color={ui.iconMuted} strokeWidth={1.9} />
                    </Pressable>
                  ) : null}
                </View>

                <TextInput
                  style={[
                    styles.titleInput,
                    {
                      backgroundColor: ui.inputBackground,
                      borderColor: ui.inputBorder,
                      color: ui.textPrimary,
                      borderRadius: ui.radius.input,
                    },
                  ]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t("chat:newChat.openNamePlaceholder")}
                  placeholderTextColor={ui.textPlaceholder}
                  returnKeyType="done"
                />
                <View style={styles.openFieldGap}>
                  <TextInput
                    style={[
                      styles.descriptionInput,
                      {
                        backgroundColor: ui.inputBackground,
                        borderColor: ui.inputBorder,
                        color: ui.textPrimary,
                        borderRadius: ui.radius.input,
                      },
                    ]}
                    value={openDescription}
                    onChangeText={setOpenDescription}
                    maxLength={MAX_OPEN_DESCRIPTION_LENGTH}
                    placeholder={t("chat:newChat.openDescriptionPlaceholder")}
                    placeholderTextColor={ui.textPlaceholder}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.openFieldGap}>
                  <TextInput
                    style={[
                      styles.titleInput,
                      {
                        backgroundColor: ui.inputBackground,
                        borderColor: ui.inputBorder,
                        color: ui.textPrimary,
                        borderRadius: ui.radius.input,
                      },
                    ]}
                    value={openTagsText}
                    onChangeText={setOpenTagsText}
                    placeholder={t("chat:newChat.openTagsPlaceholder")}
                    placeholderTextColor={ui.textPlaceholder}
                    returnKeyType="done"
                  />
                </View>

                <View
                  style={[styles.searchableRow, { borderColor: ui.divider }]}
                >
                  <View style={styles.searchableTextBox}>
                    <Text
                      style={[
                        styles.searchableTitle,
                        { color: ui.textPrimary },
                      ]}
                    >
                      {t("chat:newChat.searchVisible")}
                    </Text>
                    <Text
                      style={[
                        styles.searchableDesc,
                        { color: ui.textSecondary },
                      ]}
                    >
                      {t("chat:newChat.searchVisibleDesc")}
                    </Text>
                  </View>
                  <Switch
                    value={openSearchable}
                    onValueChange={setOpenSearchable}
                    trackColor={{
                      false: ui.borderSoft,
                      true: ui.primaryButtonBackground,
                    }}
                    thumbColor={ui.surface}
                  />
                </View>

                <Text style={[styles.helperText, { color: ui.textSecondary }]}>
                  {t("chat:newChat.openHelper")}
                </Text>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.friendListSection}>
              <Text style={[styles.sectionTitle, { color: ui.textSecondary }]}>
                {t("chat:newChat.partnerSectionTitle")}
                {selectedIds.length > 0 ? (
                  <Text style={{ color: ui.textPrimary }}>
                    {" "}
                    {selectedIds.length}
                  </Text>
                ) : null}
              </Text>

              {selectedIds.length > 0 ? (
                <View
                  style={[
                    styles.groupModeRow,
                    {
                      backgroundColor: ui.groupedBackground,
                      borderColor: ui.groupedBorder,
                      borderRadius: ui.radius.input,
                    },
                  ]}
                >
                  <View style={styles.groupModeTextBox}>
                    <Text
                      style={[styles.groupModeTitle, { color: ui.textPrimary }]}
                    >
                      {t("chat:newChat.groupModeTitle")}
                    </Text>
                    <Text
                      style={[
                        styles.groupModeDesc,
                        { color: ui.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {selectedIds.length > 1
                        ? t("chat:newChat.groupModeAutoDesc")
                        : t("chat:newChat.groupModeSingleDesc")}
                    </Text>
                  </View>
                  <Switch
                    value={isGroupDraft}
                    disabled={creating || selectedIds.length > 1}
                    onValueChange={setForceGroupMode}
                    trackColor={{
                      false: ui.borderSoft,
                      true: ui.primaryButtonBackground,
                    }}
                    thumbColor={ui.surface}
                  />
                </View>
              ) : null}


              {isGroupDraft ? (
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[
                      styles.titleInput,
                      {
                        backgroundColor: ui.inputBackground,
                        borderColor: ui.inputBorder,
                        color: ui.textPrimary,
                        borderRadius: ui.radius.input,
                      },
                    ]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder={t("chat:newChat.groupTitlePlaceholder")}
                    placeholderTextColor={ui.textPlaceholder}
                    returnKeyType="done"
                  />
                </View>
              ) : null}

              <View
                style={[
                  styles.searchBar,
                  {
                    backgroundColor: ui.inputBackground,
                    borderColor: ui.inputBorder,
                    borderRadius: ui.radius.input,
                  },
                ]}
              >
                <Search size={17} color={ui.iconMuted} strokeWidth={2} />
                <TextInput
                  style={[styles.searchInput, { color: ui.textPrimary }]}
                  placeholder={t("chat:newChat.searchNamePlaceholder")}
                  value={friendSearch}
                  onChangeText={setFriendSearch}
                  placeholderTextColor={ui.textPlaceholder}
                  autoCorrect={false}
                />
              </View>

              {loadingFriends ? (
                <ActivityIndicator style={styles.loader} color={ui.loader} />
              ) : filteredFriends.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: ui.textDisabled }]}>
                    {t("chat:newChat.emptyFriends")}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredFriends}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.friendListContent,
                    { paddingBottom: Math.max(40, insets.bottom + 40) },
                  ]}
                  renderItem={({ item, index }) => {
                    const isSelected = selectedIds.includes(item.id);
                    const total = filteredFriends.length;

                    return (
                      <Pressable
                        style={({ pressed }) => [
                          styles.friendRow,
                          {
                            backgroundColor: isSelected
                              ? ui.rowSelectedBackground
                              : ui.groupedBackground,
                          },
                          getGroupedFriendItemStyle(
                            index,
                            total,
                            ui.radius.listGroup,
                            ui.hairline,
                            ui.groupedBorder,
                          ),
                          pressed && { opacity: ui.pressedOpacity },
                        ]}
                        onPress={() => toggleMember(item.id)}
                      >
                        {item.avatar_url ? (
                          <Image
                            source={{ uri: item.avatar_url }}
                            style={[
                              styles.avatar,
                              {
                                borderRadius: ui.radius.avatar,
                                backgroundColor: ui.avatarBackground,
                                borderColor: ui.avatarBorder,
                              },
                            ]}
                          />
                        ) : (
                          <View
                            style={[
                              styles.avatarFallback,
                              {
                                borderRadius: ui.radius.avatar,
                                backgroundColor: ui.avatarBackground,
                                borderColor: ui.avatarBorder,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.avatarText,
                                { color: ui.avatarText },
                              ]}
                            >
                              {getInitial(item.nickname)}
                            </Text>
                          </View>
                        )}

                        <Text
                          style={[
                            styles.friendName,
                            { color: ui.textPrimary },
                            isSelected && styles.friendNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {item.nickname}
                        </Text>

                        <View
                          style={[
                            styles.checkBox,
                            {
                              borderRadius: ui.radius.check,
                              borderColor: isSelected
                                ? ui.checkBackground
                                : ui.checkBorder,
                              backgroundColor: isSelected
                                ? ui.checkBackground
                                : "transparent",
                            },
                          ]}
                        >
                          {isSelected ? (
                            <Check
                              size={13}
                              color={ui.checkIcon}
                              strokeWidth={2.2}
                            />
                          ) : null}
                        </View>

                        {index < total - 1 ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.rowDivider,
                              { backgroundColor: ui.groupedDivider },
                            ]}
                          />
                        ) : null}
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handlePickedOpenCover}
        maxSelect={1}
        imageProcessing="cover"
        headerTitle={t("chat:newChat.selectPhoto")}
        themeColor={ui.primaryButtonBackground}
      />

      <UniversalImageEditor
        visible={!!openCoverEditorUri}
        sourceUri={openCoverEditorUri ?? pendingOpenCover?.uri ?? ""}
        initialRatio={OPEN_COVER_EDITOR_RATIO}
        onClose={handleCloseOpenCoverEditor}
        onSave={handleSaveEditedOpenCover}
        themeColor={ui.primaryButtonBackground}
      />

      <OpenProfileJoinModal
        visible={openProfilePickerVisible}
        roomTitle={titleValue || t("chat:newChat.modeOpen")}
        submitting={creating}
        onCancel={() => {
          if (!creating) setOpenProfilePickerVisible(false);
        }}
        onSelectProfile={handleCreateOpenRoomWithProfile}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  header: {
    height: 56,
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 16,
  },
  headerTitleBox: {
    position: "absolute",
    left: HEADER_SIDE_WIDTH,
    right: HEADER_SIDE_WIDTH,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    maxWidth: "100%",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  cancelBtn: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    width: HEADER_SIDE_WIDTH - 16,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  createBtn: {
    position: "absolute",
    right: 16,
    top: 11,
    width: HEADER_SIDE_WIDTH - 16,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  createText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  modeContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 1,
    paddingHorizontal: 8,
  },
  modeText: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  modeTextActive: {
    fontWeight: "600",
  },
  openScroll: {
    flex: 1,
  },
  openScrollContent: {
    flexGrow: 1,
  },
  openSection: {
    paddingHorizontal: 16,
  },
  coverPickerWrap: {
    width: OPEN_COVER_PREVIEW_WIDTH,
    height: OPEN_COVER_PREVIEW_HEIGHT,
    alignSelf: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  coverPicker: {
    width: OPEN_COVER_PREVIEW_WIDTH,
    height: OPEN_COVER_PREVIEW_HEIGHT,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPreview: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  coverPlaceholderText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  coverClearButton: {
    position: "absolute",
    right: -7,
    top: -7,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  groupModeRow: {
    minHeight: 62,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  groupModeTextBox: {
    flex: 1,
    minWidth: 0,
  },
  groupModeTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  groupModeDesc: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    letterSpacing: -0.05,
  },
  groupModeActionBtn: {
    minHeight: 44,
    marginTop: -2,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  groupModeActionText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  inputWrapper: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.1,
    marginBottom: 8,
  },
  titleInput: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    fontWeight: "500",
  },
  descriptionInput: {
    minHeight: 100,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  openFieldGap: {
    marginTop: 10,
  },
  searchableRow: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  searchableTextBox: {
    flex: 1,
    minWidth: 0,
  },
  searchableTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  searchableDesc: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    letterSpacing: -0.05,
  },
  helperText: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  friendListSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchBar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "500",
  },
  loader: {
    marginTop: 40,
  },
  friendListContent: {
    paddingBottom: 40,
  },
  friendRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: "relative",
    overflow: "hidden",
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderWidth: 0.5,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "500",
  },
  friendName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    fontWeight: "500",
  },
  friendNameSelected: {
    fontWeight: "600",
  },
  checkBox: {
    width: 22,
    height: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  rowDivider: {
    position: "absolute",
    left: 78,
    right: 16,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 48,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
