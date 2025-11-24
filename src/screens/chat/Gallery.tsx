import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable, Dimensions, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type DBRow = {
  id: number;
  type?: 'image'|'video'|string|null;
  file_bucket?: string|null;
  file_key?: string|null;
  mime?: string|null;
  content?: string|null;
  created_at?: string|null;
};

type Item = {
  id: number;
  kind: 'image'|'video';
  bucket?: string|null;
  key?: string|null;
  url?: string|null;     // content 태그에서 바로 쓰는 URL
};

export default function MediaGalleryScreen({ route, navigation }: any) {
  const roomId: number = route.params.roomId;
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const size = (Dimensions.get('window').width - 4*4) / 3;

  // 서명 URL 캐시 (재렌더시 재사용)
  const urlCache = useRef<Record<string, string>>({}).current;

  const mapStructured = (r: DBRow): Item | null => {
    if (!r.file_bucket || !r.file_key) return null;
    const kind = r.type === 'video' ? 'video' : 'image';
    return { id: r.id, kind, bucket: r.file_bucket, key: r.file_key, url: null };
  };

  const mapTagged = (r: DBRow): Item | null => {
    const raw = String(r.content ?? '');
    const m = raw.match(/^\[(image|video)\](.+)$/);
    if (!m) return null;
    const kind = m[1] as 'image'|'video';
    const body = m[2];
    const [url] = body.split('|'); // |파일명 은 무시(갤러리엔 필요없음)
    if (!url) return null;
    return { id: r.id, kind, url: url.trim() };
  };

  const load = useCallback(async () => {
    setLoading(true);

    // 1) 리치 스키마 (type + file_*)
    let rich: Item[] = [];
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('id,type,file_bucket,file_key,mime,created_at')
        .eq('room_id', roomId)
        .in('type', ['image','video'])
        .order('created_at', { ascending:false })
        .limit(500);
      rich = (data ?? []).map(mapStructured).filter(Boolean) as Item[];
    } catch { /* ignore */ }

    // 2) 콘텐츠 태그 스키마 ([image]/[video])
    let tagged: Item[] = [];
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('id,content,created_at')
        .eq('room_id', roomId)
        .or('content.like.[image]%,content.like.[video]%')
        .order('created_at', { ascending:false })
        .limit(500);
      tagged = (data ?? []).map(mapTagged).filter(Boolean) as Item[];
    } catch { /* ignore */ }

    // 3) 병합(중복 id 제거, 최신 우선)
    const seen = new Set<number>();
    const merged: Item[] = [];
    for (const it of [...rich, ...tagged]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      merged.push(it);
    }

    setRows(merged);
    setLoading(false);
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  // 버킷/키 → 서명 URL (캐시)
  const ensureUrl = useCallback(async (item: Item): Promise<string | null> => {
    if (item.url) return item.url;
    if (!item.bucket || !item.key) return null;
    const cacheKey = `${item.bucket}::${item.key}`;
    if (urlCache[cacheKey]) return urlCache[cacheKey];
    try {
      const { data, error } = await supabase.storage.from(item.bucket).createSignedUrl(item.key, 60);
      if (error || !data?.signedUrl) return null;
      urlCache[cacheKey] = data.signedUrl;
      return data.signedUrl;
    } catch {
      return null;
    }
  }, [urlCache]);

  const render = ({ item }: { item: Item }) => {
    const [uri, setUri] = React.useState<string | null>(item.url ?? null);

    useEffect(() => {
      let mounted = true;
      (async () => {
        if (!uri) {
          const u = await ensureUrl(item);
          if (mounted) setUri(u);
        }
      })();
      return () => { mounted = false; };
    }, [item, uri]);

    return (
      <Pressable
        style={{ width: size, height: size, margin: 4 }}
        onPress={() => navigation.navigate('MediaViewer', { roomId, row: item, resolvedUrl: uri })}
        disabled={!uri}
      >
        <Image
          source={uri ? { uri } : undefined}
          style={{ width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#e5e7eb' }}
        />
        {item.kind === 'video' && (
          <View style={st.videoBadge}><Text style={st.videoTxt}>▶</Text></View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#fff' }}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <View style={st.header}><Text style={st.title}>사진/동영상</Text></View>
      {loading
        ? <View style={st.center}><ActivityIndicator /></View>
        : <FlatList data={rows} keyExtractor={(r)=>String(r.id)} renderItem={render} numColumns={3} />
      }
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  header:{ height:54, backgroundColor:'#fff', paddingHorizontal:14, paddingLeft:5, paddingTop:Platform.OS==='ios'?8:4, paddingBottom:8, justifyContent:'center', borderBottomWidth:1, borderColor:'#f3f4f6' },
  title:{ fontSize:18, fontWeight:'900', color:'#111827' },
  center:{ flex:1, alignItems:'center', justifyContent:'center' },
  videoBadge:{ position:'absolute', right:6, bottom:6, backgroundColor:'#111827aa', borderRadius:10, paddingHorizontal:6, paddingVertical:2 },
  videoTxt:{ color:'#fff', fontWeight:'900', fontSize:12 },
});
