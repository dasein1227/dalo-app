import React, { useEffect } from "react";
import { BackHandler, Keyboard } from "react-native";
import { useTranslation } from "react-i18next";

import RoomAccessBlockOverlay from "./RoomAccessBlockOverlay";
import { useChatRoomAccessGuard } from "../hooks/useChatRoomAccessGuard";

export type RoomAccessGuardOverlayProps = {
  roomId: number | string | null | undefined;
  roomIdOk?: boolean;
  me?: string | null | undefined;
  navigation: any;
  topInset?: number;
  bottomInset?: number;
  lockSecureRoom?: () => void;
  chatListRouteName?: string;
};

export default function RoomAccessGuardOverlay({
  roomId,
  roomIdOk,
  me,
  navigation,
  topInset = 0,
  bottomInset = 0,
  lockSecureRoom,
  chatListRouteName,
}: RoomAccessGuardOverlayProps) {
  const { t } = useTranslation();
  const { isKickedRoomBlocked, handleConfirmKickedExit } = useChatRoomAccessGuard({
    roomId,
    roomIdOk,
    me,
    navigation,
    lockSecureRoom,
    chatListRouteName,
  });

  useEffect(() => {
    if (!isKickedRoomBlocked) return;
    Keyboard.dismiss();
  }, [isKickedRoomBlocked]);

  useEffect(() => {
    if (!isKickedRoomBlocked) return undefined;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    const unsubscribe = navigation?.addListener?.("beforeRemove", (event: any) => {
      event.preventDefault();
    });

    return () => {
      sub.remove();
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isKickedRoomBlocked, navigation]);

  return (
    <RoomAccessBlockOverlay
      visible={isKickedRoomBlocked}
      topInset={topInset}
      bottomInset={bottomInset}
      title={t("chat:room.kickedTitle")}
      message={t("chat:room.kickedMessage")}
      confirmLabel={t("common:confirm")}
      onConfirm={handleConfirmKickedExit}
    />
  );
}
