// src/screens/business/components/FeedTab.tsx
import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Image,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { styles } from './bizStyles';
import { supabase } from '@/lib/supabase';

export type FeedTabProps = {
  businessId: string;
  // 예전 prop 그대로 두지만, 실제 개수(items.length) 기준 & 화면에는 안 씀
  visitorFeedCountLabel?: string;
};

type RawFeedItem = any; // posts + post_media 조인 결과

export const FeedTab: React.FC<FeedTabProps> = ({ businessId }) => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RawFeedItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setErrorText(null);

    try {
      // ✅ 이 가게에 태그된 게시물만
      const { data, error } = await supabase
        .from('posts')
        .select(
          `
          id,
          caption,
          created_at,
          business_id,
          business_name,
          post_media (*)
        `,
        )
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setErrorText('피드를 불러오는 중 오류가 발생했습니다.');
        return;
      }

      setItems((data ?? []) as RawFeedItem[]);
    } catch (e) {
      console.error(e);
      setErrorText('피드를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const getImageUrl = (item: RawFeedItem): string | null => {
    if (item.image_url) return item.image_url;
    if (item.thumbnail_url) return item.thumbnail_url;

    if (Array.isArray(item.post_media) && item.post_media.length > 0) {
      const first = item.post_media[0];
      return (
        first.thumbnail_url ||
        first.url ||
        first.image_url ||
        first.media_url ||
        first.file_url ||
        null
      );
    }
    return null;
  };

  // 👉 가게 방문자 피드 → 공통 PostDetail 로 이동
  //    mode: 'business', businessId 같이 넘겨서 "가게 태그 게시물 모음" 모드로 동작
  const handlePressItem = (item: RawFeedItem, index: number) => {
    if (!item.id) return;

    navigation.navigate('PostDetail', {
      postId: item.id,
      businessId,
      mode: 'business',
      initialIndex: index,
    });
  };

  const hasFeeds = items.length > 0;

  if (loading) {
    return (
      <View style={[styles.tabContent, { paddingHorizontal: 0 }]}>
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (errorText) {
    return (
      <View style={[styles.tabContent, { paddingHorizontal: 16 }]}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>방문자 피드</Text>
          <Text
            style={[
              styles.mutedText,
              { marginTop: 8, color: '#DC2626' },
            ]}
          >
            {errorText}
          </Text>
          <Pressable
            style={{ marginTop: 12 }}
            onPress={loadFeed}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: '#111827',
              }}
            >
              다시 불러오기
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!hasFeeds) {
    return (
      <View style={[styles.tabContent, { paddingHorizontal: 16 }]}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>방문자 피드</Text>
          <Text style={styles.mutedText}>
            아직 방문자 피드가 없습니다.
          </Text>
        </View>
      </View>
    );
  }

  // ✅ 피드 있을 때: 상단 카드 없이 바로 그리드만 (인스타 탐색처럼)
  return (
    <View style={[styles.tabContent, { paddingHorizontal: 0, paddingTop: 0 }]}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          // 좌우 꽉 차게
          paddingHorizontal: 0,
          paddingTop: 0,
          paddingBottom: 24,
        }}
      >
        {items.map((item, index) => {
          const imageUrl = getImageUrl(item);
          if (!imageUrl) return null;

          return (
            <Pressable
              key={item.id}
              onPress={() => handlePressItem(item, index)}
              style={{
                width: '33.3333%',
                aspectRatio: 1,
                padding: 2,
              }}
            >
              <View
                style={{
                  flex: 1,
                  // 라운드 최소로 (거의 네모)
                  borderRadius: 2,
                  overflow: 'hidden',
                  backgroundColor: '#e5e7eb',
                }}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
