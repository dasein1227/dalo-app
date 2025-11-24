import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Linking, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type FileItem = {
  id: number;
  name: string;
  size?: number | null;
  mime?: string | null;
  bucket?: string | null;
  key?: string | null;
  url?: string | null; // fallback 파싱용
};

export default function RoomFilesScreen({ route }: any) {
  const roomId: number = route.params.roomId;
  const [rows, setRows] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // 1) 리치 스키마(file_* 컬럼) 우선 시도
    let rich: FileItem[] = [];
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('id,file_bucket,file_key,file_name,size_bytes,mime,created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(500);

      rich = (data ?? [])
        .filter(r => r.file_bucket && r.file_key && r.file_name)
        .map((r: any) => ({
          id: r.id as number,
          name: r.file_name as string,
          size: r.size_bytes ?? null,
          mime: r.mime ?? null,
          bucket: r.file_bucket ?? null,
          key: r.file_key ?? null,
          url: null,
        }));
    } catch {
      // 무시하고 fallback 진행
    }

    // 2) fallback: content 파싱([file]URL|name)
    let parsed: FileItem[] = [];
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('id,content,created_at')
        .eq('room_id', roomId)
        .like('content', '[file]%')
        .order('created_at', { ascending: false })
        .limit(500);

      parsed = (data ?? []).map((r: any) => {
        const raw = String(r.content ?? '');
        // 형태: [file]https://...|파일명
        const body = raw.replace(/^\[file\]/, '');
        const [url, name] = body.split('|');
        return {
          id: r.id as number,
          name: (name || url || '파일').trim(),
          size: null,
          mime: null,
          bucket: null,
          key: null,
          url: url?.trim() || null,
        } as FileItem;
      }).filter(it => !!it.url || !!it.bucket);
    } catch {
      // 무시
    }

    // 중복 제거(같은 id 우선 rich 유지)
    const map = new Map<number, FileItem>();
    for (const item of [...rich, ...parsed]) {
      if (!map.has(item.id)) map.set(item.id, item);
    }

    setRows(Array.from(map.values()));
    setLoading(false);
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  const open = async (r: FileItem) => {
    try {
      // 버킷/키가 있으면 서명 URL, 없으면 URL 직접 오픈
      if (r.bucket && r.key) {
        const { data, error } = await supabase.storage.from(r.bucket).createSignedUrl(r.key, 60);
        if (error || !data?.signedUrl) throw error || new Error('URL 생성 실패');
        await Linking.openURL(data.signedUrl);
      } else if (r.url) {
        await Linking.openURL(r.url);
      }
    } catch (e) {
      // 실패 시 무시
    }
  };

  const fmtSize = (b?: number | null) => {
    if (!b || b <= 0) return '';
    const kb = b / 1024;
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb.toFixed(0)} KB`;
  };

  const render = ({ item }: { item: FileItem }) => (
    <Pressable style={st.row} onPress={() => open(item)}>
      <Text numberOfLines={1} style={st.name}>{item.name}</Text>
      <Text style={st.sub}>{fmtSize(item.size)}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#fff' }}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <View style={st.header}><Text style={st.title}>파일함</Text></View>
      {loading
        ? <View style={st.center}><ActivityIndicator /></View>
        : <FlatList
            data={rows}
            keyExtractor={(r)=>String(r.id)}
            renderItem={render}
            ItemSeparatorComponent={()=> <View style={{height:10}} />}
            contentContainerStyle={{padding:14}}
          />
      }
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  header:{ height:54, backgroundColor:'#fff', paddingHorizontal:14, paddingLeft:5, paddingTop:Platform.OS==='ios'?8:4, paddingBottom:8, justifyContent:'center', borderBottomWidth:1, borderColor:'#f3f4f6' },
  title:{ fontSize:18, fontWeight:'900', color:'#111827' },
  center:{ flex:1, alignItems:'center', justifyContent:'center' },
  row:{ padding:12, borderWidth:1, borderColor:'#eef0f4', borderRadius:12, backgroundColor:'#fff' },
  name:{ fontWeight:'900', color:'#111827' },
  sub:{ marginTop:4, color:'#6b7280', fontSize:12 }
});
