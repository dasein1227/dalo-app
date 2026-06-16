import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";

import secureRuntimeStore, {
  useSecureRoomController,
  type SecureRoomPolicy,
} from "@/lib/chatSecurity/secureRuntimeStore";

type UseChatSecureSendControllerParams = {
  roomId: number | null;
  roomIdOk: boolean;
  me: string | null;
  isFocused: boolean;
  t: TFunction;
};

function normalizeRoomId(roomId: number | null | undefined): number | null {
  const n = Number(roomId ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function useChatSecureSendController({
  roomId,
  roomIdOk,
  me,
  isFocused,
  t,
}: UseChatSecureSendControllerParams) {
  const activeRoomId = roomIdOk ? normalizeRoomId(roomId) : null;
  const secureController = useSecureRoomController(activeRoomId, isFocused);
  const [secureSendEnabled, setSecureSendEnabled] = useState(false);
  const previousRoomIdRef = useRef<number | null>(activeRoomId);

  const touchSecureActivity = useCallback(() => {
    try {
      secureRuntimeStore.touch();
    } catch {}
  }, []);

  const lockSecureRoom = useCallback(() => {
    const targetRoomId = normalizeRoomId(activeRoomId ?? previousRoomIdRef.current);
    setSecureSendEnabled(false);
    if (!targetRoomId) return;
    try {
      secureRuntimeStore.lockRoom(targetRoomId);
    } catch {}
  }, [activeRoomId]);

  useEffect(() => {
    const previousRoomId = previousRoomIdRef.current;
    if (previousRoomId && activeRoomId && previousRoomId !== activeRoomId) {
      try {
        secureRuntimeStore.lockRoom(previousRoomId);
      } catch {}
      setSecureSendEnabled(false);
    }
    previousRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    if (!isFocused || !roomIdOk || !activeRoomId) {
      setSecureSendEnabled(false);
    }
  }, [activeRoomId, isFocused, roomIdOk]);

  useEffect(() => {
    if (secureController.state !== "unlocked" && secureSendEnabled) {
      setSecureSendEnabled(false);
    }
  }, [secureController.state, secureSendEnabled]);

  // 태블릿/저사양 기기에서 전역 idle interval이 unlock 직후 stale lastActiveAt을 보고
  // 30초 단위로 보안 세션을 잠그는 현상을 막는다. 채팅방이 실제로 열려 있고
  // 보안 세션이 풀린 동안에는 현재 room 세션을 active 사용 중으로 간주한다.
  useEffect(() => {
    if (!isFocused || !activeRoomId || !secureController.isUnlocked) return;
    touchSecureActivity();
    const timer = setInterval(touchSecureActivity, 20000);
    return () => clearInterval(timer);
  }, [activeRoomId, isFocused, secureController.isUnlocked, touchSecureActivity]);

  useEffect(() => {
    return () => {
      const targetRoomId = normalizeRoomId(previousRoomIdRef.current);
      if (!targetRoomId) return;
      try {
        secureRuntimeStore.lockRoom(targetRoomId);
      } catch {}
    };
  }, []);

  const showSecureStatus = useCallback((_message: string | null) => {
    // 보안 토글/전송 상태는 헤더 아이콘 상태로만 표현한다.
    // 플로팅 토스트는 채팅 진입/복호화 UX를 방해하므로 표시하지 않는다.
  }, []);

  const shouldUseSecureForSend = useCallback(() => {
    return (
      secureController.policy === "required" ||
      secureController.isUnlocked ||
      secureSendEnabled
    );
  }, [secureController.isUnlocked, secureController.policy, secureSendEnabled]);

  const prepareSecureRoom = useCallback(async () => {
    if (!roomIdOk || !activeRoomId || !me) return null;
    const policy: SecureRoomPolicy =
      secureController.policy === "required" ? "required" : "mixed";
    const ready = await (secureRuntimeStore as any).ensureSecureRoomReady({
      roomId: activeRoomId,
      policy,
      promptMessage: t("chat:secure.promptAuth", {
        defaultValue: "보안 메시지 전송을 위해 인증해 주세요.",
      }),
    });
    touchSecureActivity();
    return {
      enabled: true,
      senderDeviceId: ready.deviceId,
      secureEpoch: ready.epoch,
      keyFingerprint: ready.keyFingerprint,
    };
  }, [activeRoomId, me, roomIdOk, secureController.policy, t, touchSecureActivity]);

  const handleToggleSecure = useCallback(async () => {
    if (!roomIdOk || !activeRoomId) return;

    if (secureSendEnabled || secureController.isUnlocked) {
      try {
        secureRuntimeStore.lockRoom(activeRoomId);
      } catch {}
      setSecureSendEnabled(false);
      showSecureStatus(t("chat:secure.off", { defaultValue: "보안모드 꺼짐" }));
      return;
    }

    try {
      const ready = await prepareSecureRoom();
      if (!ready) throw new Error("secure_ready_unavailable");
      touchSecureActivity();
      setSecureSendEnabled(true);
      showSecureStatus(t("chat:secure.on", { defaultValue: "보안모드 켜짐" }));
    } catch {
      setSecureSendEnabled(false);
      showSecureStatus(
        t("chat:secure.readyFail", { defaultValue: "보안모드 준비 실패" }),
      );
    }
  }, [
    activeRoomId,
    prepareSecureRoom,
    roomIdOk,
    secureController.isUnlocked,
    secureSendEnabled,
    showSecureStatus,
    t,
    touchSecureActivity,
  ]);

  const resolveSecureSendConfig = useCallback(async () => {
    if (!shouldUseSecureForSend()) return null;
    try {
      const config = await prepareSecureRoom();
      touchSecureActivity();
      return config;
    } catch {
      showSecureStatus(
        t("chat:secure.sendReadyFail", { defaultValue: "보안 전송 준비 실패" }),
      );
      return null;
    }
  }, [
    prepareSecureRoom,
    shouldUseSecureForSend,
    showSecureStatus,
    t,
    touchSecureActivity,
  ]);

  return {
    secureController,
    secureSendEnabled,
    shouldUseSecureForSend,
    prepareSecureRoom,
    showSecureStatus,
    handleToggleSecure,
    resolveSecureSendConfig,
    lockSecureRoom,
    touchSecureActivity,
  };
}
