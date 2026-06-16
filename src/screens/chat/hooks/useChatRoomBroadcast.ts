import { useEffect, useRef, type MutableRefObject } from "react";

import { supabase } from "@/lib/supabase";

export type ChatRoomBroadcastRefs = {
  channelRef: MutableRefObject<any>;
  readyRef: MutableRefObject<boolean>;
  topicRef: MutableRefObject<string | null>;
};

type UseChatRoomBroadcastArgs = {
  roomId: number | null;
  roomIdOk: boolean;
  isFocused: boolean;
};

export function useChatRoomBroadcast({
  roomId,
  roomIdOk,
  isFocused,
}: UseChatRoomBroadcastArgs): ChatRoomBroadcastRefs {
  const channelRef = useRef<any>(null);
  const readyRef = useRef(false);
  const topicRef = useRef<string | null>(null);

  useEffect(() => {
    readyRef.current = false;

    const numericRoomId = roomIdOk && roomId ? Number(roomId) : null;
    if (!isFocused || !numericRoomId || !Number.isFinite(numericRoomId)) {
      const prev = channelRef.current;
      channelRef.current = null;
      topicRef.current = null;

      if (prev) {
        try {
          supabase.removeChannel(prev);
        } catch {}
      }

      return;
    }

    const topic = `room:${numericRoomId}`;
    const ch = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    });

    channelRef.current = ch;
    topicRef.current = topic;

    let disposed = false;

    ch.subscribe((status: string) => {
      if (disposed) return;
      readyRef.current = status === "SUBSCRIBED";
    });

    return () => {
      disposed = true;

      if (channelRef.current === ch) {
        channelRef.current = null;
        topicRef.current = null;
        readyRef.current = false;
      }

      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [isFocused, roomId, roomIdOk]);

  return {
    channelRef,
    readyRef,
    topicRef,
  };
}
