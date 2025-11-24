// src/utils/coonnImage.ts
import * as ImageManipulator from "expo-image-manipulator";

// --------------------------------------
// CO·ONN 이미지 규칙
// --------------------------------------
const PROFILE_SIZE = 320;       // 320 × 320
const COVER_LONG_EDGE = 1600;   // 긴 변 기준 1600px
const POST_LONG_EDGE = 1080;    // 긴 변 기준 1080px

// JPEG 품질 설정
const PROFILE_QUALITY = 0.8;
const COVER_QUALITY = 0.82;
const POST_QUALITY = 0.83;

// ------------------------------
// 유틸: 긴 변 기준 리사이즈 사이즈 계산
// ------------------------------
function calcResizeDimensions(
  width: number,
  height: number,
  longEdge: number
) {
  if (width >= height) {
    const ratio = longEdge / width;
    return {
      width: longEdge,
      height: Math.round(height * ratio),
    };
  } else {
    const ratio = longEdge / height;
    return {
      width: Math.round(width * ratio),
      height: longEdge,
    };
  }
}

// --------------------------------------
// 1) 프로필 이미지 320×320 강제
// --------------------------------------
export async function resizeProfileImage(uri: string) {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        resize: { width: PROFILE_SIZE, height: PROFILE_SIZE },
      },
    ],
    {
      compress: PROFILE_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return manipulated.uri;
}

// --------------------------------------
// 2) 커버 이미지 (긴 변 1600px)
// --------------------------------------
export async function resizeCoverImage(
  uri: string,
  originalWidth: number,
  originalHeight: number
) {
  const { width, height } = calcResizeDimensions(
    originalWidth,
    originalHeight,
    COVER_LONG_EDGE
  );

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        resize: { width, height },
      },
    ],
    {
      compress: COVER_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return manipulated.uri;
}

// --------------------------------------
// 3) 포스트 이미지 (긴 변 1080px)
//    편집된 크롭 이미지를 기반으로 처리
// --------------------------------------
export async function resizePostImage(
  uri: string,
  originalWidth: number,
  originalHeight: number
) {
  const { width, height } = calcResizeDimensions(
    originalWidth,
    originalHeight,
    POST_LONG_EDGE
  );

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        resize: { width, height },
      },
    ],
    {
      compress: POST_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return manipulated.uri;
}

// --------------------------------------
// 4) 자동 선택 함수 (타입에 따라 처리)
// --------------------------------------
export type COONNImageType = "profile" | "cover" | "post";

export async function resizeByType(
  type: COONNImageType,
  uri: string,
  width: number,
  height: number
) {
  switch (type) {
    case "profile":
      return resizeProfileImage(uri);

    case "cover":
      return resizeCoverImage(uri, width, height);

    case "post":
      return resizePostImage(uri, width, height);

    default:
      throw new Error("Unknown image type");
  }
}
