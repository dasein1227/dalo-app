// src/lib/r2Upload.ts
import * as FileSystem from 'expo-file-system/legacy'; // ✅ legacy API로 변경
import { supabase } from '@/lib/supabase';

/**
 * 로컬 이미지 파일을 Supabase Edge Function을 통해
 * Cloudflare R2(public bucket)에 업로드하고 최종 공개 URL을 리턴.
 *
 * @param localUri    ImagePicker / ImageManipulator 에서 받은 파일 uri
 * @param path        R2 내 경로 (예: "posts/{postId}/123456.jpg")
 * @param contentType MIME 타입 (예: "image/jpeg")
 */
export async function uploadImageToR2(
  localUri: string,
  path: string,
  contentType: string = 'image/jpeg',
): Promise<string> {
  // 1) Edge Function에서 presigned URL 받기
  const { data, error } = await supabase.functions.invoke('r2-presign-upload', {
    body: { path, contentType },
  });

  if (error) {
    console.error('r2-presign-upload error', error);
    throw new Error(error.message ?? 'r2-presign-upload 호출 실패');
  }

  const uploadUrl: string | undefined = data?.uploadUrl;
  const publicUrl: string | undefined = data?.publicUrl;

  if (!uploadUrl || !publicUrl) {
    console.error('잘못된 presign 응답', data);
    throw new Error('presigned URL 응답이 올바르지 않습니다.');
  }

  // 2) presigned URL 로 실제 파일 PUT 업로드
  const uploadRes = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    // uploadType은 생략 → 기본값(바이너리 업로드) 사용
  });

  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    console.error('R2 PUT 실패', uploadRes.status, uploadRes.body);
    throw new Error('R2 업로드에 실패했습니다.');
  }

  // 3) 최종 public URL 반환
  return publicUrl;
}
