import { supabase } from "@/lib/supabase";
import * as ImageManipulator from "expo-image-manipulator";

const FN_BASE =
  // Supabase Edge Function URL (프로젝트 콘솔 → Functions 탭에서 확인)
  // 예: https://<project-ref>.functions.supabase.co
  process.env.EXPO_PUBLIC_FN_BASE!;

export async function uploadChatImage(roomId: number, localUri: string) {
  // 1) 리사이즈 & 압축
  const manipulated = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 1440 } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
  );

  const blob = await (await fetch(manipulated.uri)).blob();
  const mime = blob.type || "image/jpeg";
  const size = blob.size;

  // (선택) SHA-256 해시
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 2) presign 발급
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token ?? "";

  const presignRes = await fetch(`${FN_BASE}/upload-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      roomId,
      mime,
      size,
      variant: "medium",
      ext: "jpg",
      hash,
    }),
  });
  if (!presignRes.ok) {
    throw new Error(`presign failed: ${await presignRes.text()}`);
  }
  const { uploadUrl, publicUrl, meta, msgId } = await presignRes.json();

  // 3) R2에 PUT 업로드
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`R2 upload failed: ${await putRes.text()}`);
  }

  // 4) 메시지 저장 (messages 스키마에 맞게 수정)
  const { error } = await supabase.from("messages").insert({
    id: msgId,
    room_id: roomId,
    type: "image",
    content_url: publicUrl,
    meta,
    storage_provider: "r2",
  });
  if (error) throw error;

  return { url: publicUrl, meta, msgId };
}
