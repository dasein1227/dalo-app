// src/screens/chat/ChatRoomEdit.tsx

import React, { useMemo, useState, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
  Switch,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  useIsFocused,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { Camera, X, EyeOff, ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SafeScreen } from "../../components/layout";
import { SystemBars } from "react-native-edge-to-edge";

import { supabase } from "@/lib/supabase";
import { syncChatRooms } from "@/lib/chatSync/roomSync";
import { createChatRoomEditTheme } from "./ChatRoomEdit.theme";
import { getChatTheme, type ChatRoomType } from "./theme/chatTheme";
import { useChatStatusBar } from "./hooks/useChatStatusBar";
import SimpleMediaPicker, { type SimplePickedImage } from "@/components/SimpleMediaPicker";

const MAX_NAME_LENGTH = 50;

type PickedRoomCover = {
  uri: string;
  contentType: string;
  ext: string;
};

type UploadedRoomCover = {
  publicUrl: string;
  objectKey: string | null;
  bucket: string | null;
};

const ROOM_COVER_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

function normalizeRoomKind(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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
  if (ROOM_COVER_CONTENT_TYPES.has(normalized)) return normalized;
  return contentTypeFromExt(fallbackExt);
}

function pickedCoverFromAsset(
  asset: SimplePickedImage,
): PickedRoomCover {
  const ext = sanitizeImageExt(
    typeof asset.filename === "string" && asset.filename.includes(".")
      ? asset.filename.split(".").pop()
      : extFromUri(asset.uri),
  );

  return {
    uri: asset.uri,
    ext,
    contentType: normalizeImageContentType(asset.contentType, ext),
  };
}

async function uploadRoomCoverToR2(
  roomId: string | number,
  userId: string,
  picked: PickedRoomCover,
): Promise<UploadedRoomCover> {
  // Reuse the already-deployed business-upload presign function.
  // business-upload intentionally accepts only folders under "businesses/".
  // Keep chat room covers isolated under a non-business system subfolder so the
  // existing R2 bucket/env setup does not need to change.
  const safeRoomId = String(roomId).replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "-");
  const folder = `businesses/_chat-room-covers/rooms/${safeRoomId}/users/${safeUserId}`;

  const { data, error } = await supabase.functions.invoke("business-upload", {
    body: {
      folder,
      contentType: picked.contentType,
      ext: picked.ext,
    },
  });

  if (error) throw error;

  const uploadUrl = String((data as any)?.uploadUrl ?? "");
  const publicUrl = String((data as any)?.publicUrl ?? "");
  const objectKey = String((data as any)?.key ?? (data as any)?.path ?? "").trim() || null;
  const bucket = String((data as any)?.bucket ?? "").trim() || null;
  const uploadContentType = String(
    (data as any)?.contentType ?? picked.contentType,
  );

  if (!uploadUrl || !publicUrl) {
    throw new Error("invalid_upload_presign_response");
  }

  const blob = await (await fetch(picked.uri)).blob();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": uploadContentType,
    },
    body: blob as any,
  });

  if (!putRes.ok) {
    throw new Error(`r2_upload_failed:${putRes.status}`);
  }

  return { publicUrl, objectKey, bucket };
}

function extractManagedRoomCoverObjectKey(publicUrl: string | null | undefined): string | null {
  const raw = String(publicUrl ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return key.startsWith("businesses/_chat-room-covers/rooms/") ? key : null;
  } catch {
    const key = raw.replace(/^\/+/, "");
    return key.startsWith("businesses/_chat-room-covers/rooms/") ? key : null;
  }
}

function buildRoomCoverSourceId(roomId: string | number, userId: string): string {
  return `${String(roomId)}:${String(userId)}`;
}

async function resolveBusinessUploadBucketForRoomCover(userId: string): Promise<string | null> {
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "-");

  const { data, error } = await supabase.functions.invoke("business-upload", {
    body: {
      folder: `businesses/_chat-room-covers/_bucket-probe/users/${safeUserId}`,
      contentType: "image/jpeg",
      ext: "jpg",
    },
  });

  if (error) throw error;

  return String((data as any)?.bucket ?? "").trim() || null;
}

async function enqueueRoomCoverDeleteJob(params: {
  publicUrl: string | null | undefined;
  bucket: string | null | undefined;
  roomId: string | number;
  userId: string;
}): Promise<void> {
  const objectKey = extractManagedRoomCoverObjectKey(params.publicUrl);
  if (!objectKey) return;

  let bucket = String(params.bucket ?? "").trim();
  if (!bucket) {
    bucket = (await resolveBusinessUploadBucketForRoomCover(params.userId)) ?? "";
  }

  if (!bucket) {
    throw new Error("room_cover_delete_bucket_missing");
  }

  const { error } = await supabase.rpc("enqueue_chat_room_cover_delete_v1", {
    p_bucket: bucket,
    p_object_key: objectKey,
    p_source_id: buildRoomCoverSourceId(params.roomId, params.userId),
  });

  if (error) throw error;
}

const CHAT_THEME_KEYS = new Set<ChatRoomType>([
  "self",
  "dm",
  "group",
  "business_dm",
  "open",
  "beacon",
  "coonn_light",
  "coonn_dark",
]);

function normalizeChatThemeKey(value: unknown): ChatRoomType | null {
  if (typeof value !== "string") return null;
  return CHAT_THEME_KEYS.has(value as ChatRoomType)
    ? (value as ChatRoomType)
    : null;
}

function ChatRoomEditStatusBars({
  visible,
  systemBarsStyle,
  backgroundColor,
}: {
  visible: boolean;
  systemBarsStyle: "light" | "dark";
  backgroundColor: string;
}) {
  if (!visible) return null;

  return (
    <>
      <SystemBars style={systemBarsStyle} />
      <StatusBar
        translucent={false}
        backgroundColor={backgroundColor}
        barStyle={systemBarsStyle === "dark" ? "dark-content" : "light-content"}
      />
    </>
  );
}

const GroupAvatarGrid = ({
  members,
  size = 100,
  borderColor,
  emptyColor,
  radius,
}: {
  members: string[];
  size?: number;
  borderColor: string;
  emptyColor: string;
  radius: number;
}) => {
  const urls = members.filter(Boolean).slice(0, 4);

  if (urls.length === 0) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: emptyColor,
        }}
      />
    );
  }

  if (urls.length === 1) {
    return (
      <Image
        source={{ uri: urls[0] }}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: emptyColor,
      }}
    >
      <View style={styles.groupGridInner}>
        {urls.map((uri, idx) => (
          <Image
            key={`${uri}-${idx}`}
            source={{ uri }}
            style={{
              width: "50%",
              height: "50%",
              borderWidth: 1,
              borderColor,
            }}
          />
        ))}
      </View>
    </View>
  );
};

export default function ChatRoomEdit() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const {
    roomId,
    roomType = "dm",
    initialName = "",
    baseTitle = "채팅방",
    initialImage = null,
    useDefaultCover = false,
    participants = [],
    chatThemeKey: routeChatThemeKey,
    themeOverride,
  } = route.params || {};

  const resolvedChatThemeKey = useMemo<ChatRoomType>(() => {
    return (
      normalizeChatThemeKey(themeOverride) ??
      normalizeChatThemeKey(routeChatThemeKey) ??
      normalizeChatThemeKey(roomType) ??
      "dm"
    );
  }, [roomType, routeChatThemeKey, themeOverride]);

  const chatTheme = useMemo(
    () => getChatTheme(resolvedChatThemeKey),
    [resolvedChatThemeKey],
  );
  const ui = useMemo(
    () => createChatRoomEditTheme(chatTheme, resolvedChatThemeKey),
    [chatTheme, resolvedChatThemeKey],
  );
  const { expoBarStyle } = useChatStatusBar({
    navigation,
    headerBg: chatTheme.background,
  });
  const systemBarsStyle =
    expoBarStyle === "dark" || (expoBarStyle as string) === "dark-content"
      ? "dark"
      : "light";

  const [name, setName] = useState(initialName || "");
  const [imageUri, setImageUri] = useState<string | null>(initialImage);
  const [isCoverHidden, setIsCoverHidden] = useState<boolean>(useDefaultCover);
  const [pickedCover, setPickedCover] = useState<PickedRoomCover | null>(null);
  const [isCoverCleared, setIsCoverCleared] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedRoomType = normalizeRoomKind(roomType);
  const isBeaconRoom = normalizedRoomType === "beacon";
  const canEditRoomName = !isBeaconRoom;
  const canHideCover = !isBeaconRoom;
  const canEditImage = normalizedRoomType === "group";
  const effectiveCoverHidden = canHideCover && isCoverHidden;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handlePickImage = () => {
    if (isSaving) return;

    if (effectiveCoverHidden) {
      Alert.alert(
        t("chat:roomEdit.alertTitle"),
        t("chat:roomEdit.unhideBeforeChange"),
      );
      return;
    }

    if (!canEditImage) return;

    Keyboard.dismiss();
    setPickerVisible(true);
  };

  const handlePickedImage = (images: SimplePickedImage[]) => {
    const asset = images[0];
    if (!asset?.uri) return;

    const picked = pickedCoverFromAsset(asset);
    setPickedCover(picked);
    setIsCoverCleared(false);
    setImageUri(picked.uri);
    setPickerVisible(false);
  };

  const handleClearCover = () => {
    if (!canEditImage || isSaving) return;

    Keyboard.dismiss();
    setPickedCover(null);
    setImageUri(null);
    setIsCoverHidden(false);
    setIsCoverCleared(true);
  };

  const handleSave = async () => {
    if (isSaving) return;

    try {
      setIsSaving(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: currentMember, error: currentMemberError } = await supabase
        .from("chat_members")
        .select("room_avatar_url")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (currentMemberError) throw currentMemberError;

      const previousRoomAvatarUrl = String(
        (currentMember as any)?.room_avatar_url ?? "",
      ).trim() || null;

      let uploadedCover: UploadedRoomCover | null = null;

      if (canEditImage && pickedCover?.uri) {
        uploadedCover = await uploadRoomCoverToR2(roomId, user.id, pickedCover);
      }

      const shouldClearRoomAvatar = canEditImage && isCoverCleared;

      const updates: any = {};
      if (canEditRoomName) updates.room_name = name.trim() || null;
      if (canHideCover) {
        updates.use_default_cover = shouldClearRoomAvatar ? false : isCoverHidden;
      }
      if (shouldClearRoomAvatar) updates.room_avatar_url = null;
      else if (uploadedCover?.publicUrl) updates.room_avatar_url = uploadedCover.publicUrl;

      if (Object.keys(updates).length > 0) {
        updates.room_profile_updated_at = new Date().toISOString();

        const { data: updatedMember, error } = await supabase
          .from("chat_members")
          .update(updates)
          .eq("room_id", roomId)
          .eq("user_id", user.id)
          .select(
            "room_id,user_id,room_name,room_avatar_url,use_default_cover,room_profile_updated_at",
          )
          .maybeSingle();

        if (error) throw error;
        if (!updatedMember) throw new Error("chat_member_update_not_applied");
      }

      const nextRoomAvatarUrl = shouldClearRoomAvatar
        ? null
        : uploadedCover?.publicUrl ?? previousRoomAvatarUrl;

      const shouldDeletePreviousCover = Boolean(
        canEditImage &&
          previousRoomAvatarUrl &&
          (shouldClearRoomAvatar || uploadedCover?.publicUrl) &&
          previousRoomAvatarUrl !== nextRoomAvatarUrl,
      );

      if (shouldDeletePreviousCover) {
        try {
          await enqueueRoomCoverDeleteJob({
            publicUrl: previousRoomAvatarUrl,
            bucket: uploadedCover?.bucket ?? null,
            roomId,
            userId: user.id,
          });
        } catch (deleteQueueError) {
          if (__DEV__) {
            console.warn(
              "[ChatRoomEdit] room cover delete enqueue failed",
              deleteQueueError,
            );
          }
        }
      }

      try {
        await syncChatRooms({
          reason: "chat_room_edit_save",
          force: true,
          minIntervalMs: 0,
        });
      } catch {
        // DB save already succeeded. Do not show a save failure for a local refresh failure.
      }

      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t("chat:roomEdit.saveFail"), t("chat:inviteScreen.tryAgain"));
    } finally {
      setIsSaving(false);
    }
  };

  const renderAvatar = () => {
    const avatarBaseStyle = [
      styles.avatarImage,
      {
        backgroundColor: ui.surfaceRaised,
        borderColor: ui.border,
        borderWidth: ui.hairline,
        borderRadius: ui.radius.avatar,
      },
    ];

    if (effectiveCoverHidden) {
      return (
        <View style={[avatarBaseStyle, styles.hiddenAvatarOverlay]}>
          <EyeOff size={32} color={ui.textDisabled} />
        </View>
      );
    }

    if (imageUri) {
      return <Image source={{ uri: imageUri }} style={avatarBaseStyle} />;
    }

    if (roomType === "dm") {
      const peerImage = participants.filter(Boolean)[0] || null;
      return peerImage ? (
        <Image source={{ uri: peerImage }} style={avatarBaseStyle} />
      ) : (
        <View style={avatarBaseStyle} />
      );
    }

    return (
      <GroupAvatarGrid
        members={participants.filter(Boolean)}
        size={100}
        radius={ui.radius.avatar}
        borderColor={ui.surface}
        emptyColor={ui.surfaceRaised}
      />
    );
  };

  return (
    <>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeScreen
        backgroundColor={ui.background}
        includeTopInset={false}
        includeBottomInset
        style={[styles.container, { backgroundColor: ui.background }]}
        contentStyle={styles.safeContent}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[
            styles.container,
            { backgroundColor: ui.background, paddingTop: insets.top },
          ]}
        >
          <ChatRoomEditStatusBars
            visible={isFocused}
            systemBarsStyle={systemBarsStyle}
            backgroundColor={ui.background}
          />
          <View style={[styles.header, { backgroundColor: ui.background }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={10}
                style={styles.backBtn}
                activeOpacity={0.72}
              >
                <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: ui.headerIcon }]}>
                {t("chat:roomEdit.title")}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleSave}
              hitSlop={10}
              activeOpacity={0.72}
              disabled={isSaving}
              style={isSaving ? styles.disabledAction : null}
            >
              <Text style={[styles.confirmText, { color: ui.headerIcon }]}>
                {t("common:ok")}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(28, insets.bottom + 120) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.avatarSection,
                {
                  backgroundColor: ui.surface,
                  borderColor: ui.border,
                  borderWidth: ui.hairline,
                  borderRadius: ui.radius.card,
                },
              ]}
            >
              <TouchableOpacity
                onPress={handlePickImage}
                activeOpacity={0.84}
                disabled={!canEditImage || isSaving}
                style={[styles.avatarWrapper, ui.avatarShadow]}
              >
                {renderAvatar()}

                {!effectiveCoverHidden && canEditImage && (
                  <View
                    style={[
                      styles.cameraBadge,
                      {
                        backgroundColor: ui.surface,
                        borderColor: ui.border,
                        borderWidth: ui.hairline,
                      },
                    ]}
                  >
                    <Camera size={16} color={ui.iconMuted} strokeWidth={2} />
                  </View>
                )}

                {!effectiveCoverHidden && canEditImage && imageUri && (
                  <TouchableOpacity
                    onPress={(event) => {
                      event.stopPropagation();
                      handleClearCover();
                    }}
                    activeOpacity={0.76}
                    disabled={isSaving}
                    hitSlop={8}
                    style={[
                      styles.coverClearBadge,
                      {
                        backgroundColor: ui.surface,
                        borderColor: ui.border,
                        borderWidth: ui.hairline,
                      },
                    ]}
                  >
                    <X size={14} color={ui.iconMuted} strokeWidth={2.4} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: ui.surface,
                  borderColor: ui.border,
                  borderWidth: ui.hairline,
                  borderRadius: ui.radius.card,
                },
              ]}
            >
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: ui.textPrimary }]}>
                    {t("chat:roomEdit.nameLabel")}
                  </Text>
                  <Text style={[styles.counter, { color: ui.textDisabled }]}>
                    {name.length}/{MAX_NAME_LENGTH}
                  </Text>
                </View>

                <View
                  style={[
                    styles.inputBox,
                    {
                      backgroundColor: ui.inputBackground,
                      borderColor: ui.inputBorder,
                      borderWidth: ui.hairline,
                      borderRadius: ui.radius.input,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: ui.textPrimary }]}
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder={baseTitle}
                    placeholderTextColor={ui.inputPlaceholder}
                    returnKeyType="done"
                    editable={!isSaving && canEditRoomName}
                  />
                  {name.length > 0 && canEditRoomName && (
                    <TouchableOpacity
                      onPress={() => setName("")}
                      disabled={isSaving}
                      style={styles.clearBtn}
                      hitSlop={10}
                      activeOpacity={0.72}
                    >
                      <View
                        style={[
                          styles.clearIconBg,
                          { backgroundColor: ui.textDisabled },
                        ]}
                      >
                        <X size={12} color={ui.surface} strokeWidth={2.4} />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {canHideCover && (
                <>
                  <View
                    style={[styles.divider, { backgroundColor: ui.divider }]}
                  />

                  <View style={styles.optionRow}>
                    <View style={styles.optionTextBox}>
                      <Text
                        style={[styles.optionLabel, { color: ui.textPrimary }]}
                      >
                        {t("chat:roomEdit.hidePhoto")}
                      </Text>
                      <Text
                        style={[styles.optionDesc, { color: ui.textSecondary }]}
                      >
                        {t("chat:roomEdit.hidePhotoDesc")}
                      </Text>
                    </View>
                    <Switch
                      value={isCoverHidden}
                      onValueChange={setIsCoverHidden}
                      disabled={isSaving}
                      trackColor={{
                        false: ui.switchTrackOff,
                        true: ui.switchTrackOn,
                      }}
                      thumbColor={ui.switchThumb}
                    />
                  </View>
                </>
              )}
            </View>

            {normalizedRoomType === "dm" ? (
              <Text style={[styles.helperText, { color: ui.textSecondary }]}>
                {t("chat:roomEdit.helperLine1")}
                {"\n"}
                {t("chat:roomEdit.helperLine2")}
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
        </SafeScreen>
      </TouchableWithoutFeedback>

      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handlePickedImage}
        maxSelect={1}
        imageProcessing="cover"
        headerTitle={t("media:select_photo", { defaultValue: "사진 선택" })}
        themeColor={ui.headerIcon}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
  },
  groupGridInner: {
    flexWrap: "wrap",
    flexDirection: "row",
    width: "100%",
    height: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 52,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backBtn: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 2,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "500",
  },
  disabledAction: {
    opacity: 0.45,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 34,
    marginBottom: 12,
    overflow: "hidden",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 100,
    height: 100,
  },
  hiddenAvatarOverlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  coverClearBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  formCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    overflow: "hidden",
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  counter: {
    fontSize: 12,
    fontWeight: "400",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 54,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  clearBtn: {
    padding: 4,
  },
  clearIconBg: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  textAreaBox: {
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 78,
    fontSize: 15,
    lineHeight: 21,
    padding: 0,
    fontWeight: "400",
  },
  openProfileBlock: {
    paddingTop: 16,
  },
  tagFieldGap: {
    marginTop: 16,
  },
  openSearchRow: {
    minHeight: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  optionRow: {
    minHeight: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionTextBox: {
    flex: 1,
    paddingRight: 12,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 13,
    fontWeight: "400",
  },
  helperText: {
    marginTop: 18,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "400",
  },
});
