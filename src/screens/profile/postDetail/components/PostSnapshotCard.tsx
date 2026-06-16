import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';

import type { DetailedPost } from '../types';

type Props = {
  post: DetailedPost;
  onReady?: () => void;
  brandLabel?: string;
};

// --- 화면(styles.ts) 비율을 1440px 해상도에 맞게 환산한 상수들 ---
const CANVAS_WIDTH = 1440;
const SIDE_MARGIN = 72;         
const HEADER_HEIGHT = 160;      
const AVATAR_SIZE = 140;        

// 👇 동적 하단 여백을 위한 상수
const CHIN_MIN_HEIGHT = 480;    // 글씨가 없어도 기본적으로 유지할 폴라로이드 턱의 최소 높이
const CAPTION_LINE_HEIGHT = 74; // 본문 줄간격
const CAPTION_MARGIN_TOP = 100; // 본문 상단 여백
const CAPTION_MARGIN_BOTTOM = 200; // 버그 수정: 이 값은 캡션 높이 계산에서 제외됩니다.

function getDisplayName(post: DetailedPost, fallbackName: string) {
  return post.profiles?.nickname || post.profiles?.follow_id || fallbackName;
}

function getInitial(post: DetailedPost, fallbackName: string) {
  const source = getDisplayName(post, fallbackName).trim();
  return source ? source.slice(0, 1).toUpperCase() : '?';
}

function getImageRatio(post: DetailedPost) {
  const media = post.post_media?.[0];
  if (media?.width && media?.height && media.width > 0 && media.height > 0) {
    return media.width / media.height;
  }
  return 3 / 4; 
}

function formatDateToken(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '--. --. --';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}. ${mm}. ${dd}`;
}

// 💡 [버그 수정 완료] 하단 여백(200px)을 더하지 않도록 롤백하여 황금 비율을 되찾았습니다.
function getCaptionHeight(caption: string) {
  if (!caption) return 0;
  // 가로 1296px, 폰트 52 기준 대략 1줄에 25글자. 최대 3줄(numberOfLines={3}) 제한
  const lines = Math.min(3, Math.max(1, Math.ceil(caption.length / 25)));
  // 오직 윗 여백과 줄간격만 더합니다.
  return CAPTION_MARGIN_TOP + (lines * CAPTION_LINE_HEIGHT);
}

// --- 전체 높이 동적 계산 (원본 사진 비율 + 캡션 길이에 따라 쭉쭉 늘어남) ---
export function getPostSnapshotHeight(post: DetailedPost) {
  const ratio = getImageRatio(post);
  const photoWidth = CANVAS_WIDTH - (SIDE_MARGIN * 2);
  const photoHeight = Math.round(photoWidth / ratio);

  const caption = (post.caption ?? '').trim();
  const dynamicChinHeight = CHIN_MIN_HEIGHT + getCaptionHeight(caption);

  return SIDE_MARGIN + HEADER_HEIGHT + photoHeight + dynamicChinHeight;
}

export function PostSnapshotCard({ post, onReady }: Props) {
  const { t } = useTranslation('post');
  const fallbackName = t('snapshot.noName', { defaultValue: '이름 없음' });
  const firstImage = post.post_media?.[0]?.file_url ?? null;
  const displayName = useMemo(() => getDisplayName(post, fallbackName), [post, fallbackName]);
  const initial = useMemo(() => getInitial(post, fallbackName), [post, fallbackName]);
  const ratio = useMemo(() => getImageRatio(post), [post]);
  const dateToken = useMemo(() => formatDateToken(post.created_at), [post.created_at]);
  
  const caption = (post.caption ?? '').trim();
  
  // 👇 캡션 높이를 포함한 턱 높이 계산
  const dynamicChinHeight = useMemo(() => {
    return CHIN_MIN_HEIGHT + getCaptionHeight(caption);
  }, [caption]);

  const photoWidth = CANVAS_WIDTH - (SIDE_MARGIN * 2);
  const photoHeight = useMemo(() => Math.round(photoWidth / ratio), [photoWidth, ratio]);
  
  const [heroLoaded, setHeroLoaded] = useState(!firstImage);

  useEffect(() => {
    setHeroLoaded(!firstImage);
  }, [firstImage, post.id]);

  useEffect(() => {
    if (!heroLoaded || !onReady) return;
    const id1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onReady();
      });
    });
    return () => cancelAnimationFrame(id1);
  }, [heroLoaded, onReady]);

  return (
    // 💡 에러 해결: 가장 바깥쪽을 View로 감싸고 collapsable을 여기에 줍니다.
    <View style={styles.canvas} collapsable={false}>
      {/* 💡 질감 이미지는 View 안에서 화면을 꽉 채우도록 수정했습니다. */}
      <ImageBackground 
        source={require('./assets/paper_texture.png')} 
        style={styles.textureBg}
        
        // 💡 [수정] 종이 질감이 더 선명하게 보이도록 회색 틴트값을 조금 더 진하게 조정했습니다.
        imageStyle={{ tintColor: '#e0e0de' }} // 연한 미색 대신 좀 더 깊이감 있는 회색
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {post.profiles?.avatar_url ? (
              <Image source={{ uri: post.profiles.avatar_url }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </View>
            )}
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </View>

        <View style={[styles.photoArea, { height: photoHeight }]}>
          {firstImage ? (
            <Image
              source={{ uri: firstImage }}
              style={styles.heroImage}
              resizeMode="cover" 
              onLoadEnd={() => setHeroLoaded(true)}
              fadeDuration={0}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>NO IMAGE</Text>
            </View>
          )}
        </View>

        {/* 👇 하단 영역에 계산된 동적 높이 적용 */}
        <View style={[styles.bottomChin, { height: dynamicChinHeight }]}>
          {!!caption && (
            <Text style={styles.captionText} numberOfLines={3}>
              {caption}
            </Text>
          )}

          {/* 💡 [최종 탑재] 직접 만들어오신 영롱한 coonn 음각 로고를 좌측 하단에 배치했습니다. */}
          <Image 
            source={require('./assets/mark.png')} // 💡 로고 파일 경로를 맞춰주세요!
            style={styles.brandMarkImage}
            resizeMode="contain" 
          />

          <Text style={styles.dateText}>{dateToken}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: CANVAS_WIDTH,
    backgroundColor: 'transparent',
  },
  // 💡 추가된 스타일: 종이 질감이 View 전체를 덮도록 flex: 1 적용
  textureBg: {
    flex: 1,
    width: '100%',
  },
  headerRow: {
    height: HEADER_HEIGHT + SIDE_MARGIN,
    paddingTop: 40, 
    paddingBottom: 40, 
    paddingHorizontal: SIDE_MARGIN, 
    flexDirection: 'row',
    alignItems: 'center', 
    backgroundColor: 'transparent',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  avatarFallbackText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 60, 
  },
  headerName: {
    marginLeft: 32, 
    fontSize: 60,   
    fontWeight: '700',
    color: '#111827',
  },
  photoArea: {
    width: CANVAS_WIDTH - (SIDE_MARGIN * 2),
    marginHorizontal: SIDE_MARGIN,
    backgroundColor: '#F3F4F6',
    borderRadius: 8, 
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  imageFallbackText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#8B8B8B',
    letterSpacing: 2,
  },
  bottomChin: {
    backgroundColor: 'transparent',
    position: 'relative',
  },
  captionText: {
    marginTop: CAPTION_MARGIN_TOP,
    // marginBottom: CAPTION_MARGIN_BOTTOM, // 버그 수정: 이 마진을 사용하지 않습니다.
    marginHorizontal: SIDE_MARGIN,
    fontSize: 75,
    lineHeight: CAPTION_LINE_HEIGHT,
    color: '#111827',
    fontWeight: '600',
  },
  // 🌟 [최종 탑재] 브랜드 로고 이미지 스타일 정의
  brandMarkImage: {
    position: 'absolute',
    left: SIDE_MARGIN,
    bottom: 96,           // 날짜 높이와 완벽히 대칭
    height: 100,          // 날짜 폰트 크기(85)를 고려한 고급스러운 크기
    width: 300,           // 비율 유지를 위한 넉넉한 너비
  },
  dateText: {
    position: 'absolute',
    right: SIDE_MARGIN,
    bottom: 96, 
    fontSize: 85, 
    color: '#F59E0B',
    letterSpacing: 2.2, 
    fontFamily: 'DS-DIGI',
    // 👇 음각(파인) 느낌을 위해 그림자를 좌측 상단(-, -)으로 이동!
    textShadowColor: 'rgba(0,0,0,0.3)', // 파인 깊이감을 위해 기존(0.22)보다 아주 살짝만 더 진하게
    textShadowOffset: { width: -2, height: -2 }, 
    textShadowRadius: 1.0,
  },
});