// src/screens/AddFriendScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Friendship = { id:number; requester:string; addressee:string; status:'pending'|'accepted'|'blocked'; created_at:string };
type Profile = { id:string; nickname:string|null; handle:string|null; email:string|null; phone:string|null };

const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function AddFriendScreen(){
  const [me,setMe]=useState<string>('');
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(false);
  const [results,setResults]=useState<Profile[]>([]);
  const [incoming,setIncoming]=useState<Friendship[]>([]);
  const [outgoing,setOutgoing]=useState<Friendship[]>([]);
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  const loadRequests=useCallback(async()=>{
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user) return;
    setMe(user.id);
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
    const rows=(data??[]) as Friendship[];
    setIncoming(rows.filter(r=>r.status==='pending' && r.addressee===user.id));
    setOutgoing(rows.filter(r=>r.status==='pending' && r.requester===user.id));
  },[]);

  useEffect(()=>{ loadRequests(); },[loadRequests]);

  // 검색: @handle / email / phone / nickname + UUID fallback
  useEffect(()=>{
    if(debounceRef.current) clearTimeout(debounceRef.current);
    if(!q.trim()){ setResults([]); return; }
    debounceRef.current=setTimeout(async()=>{
      try{
        setLoading(true);
        const term=q.trim();
        let filter='';
        if(term.startsWith('@')) filter=`handle.ilike.${term.toLowerCase()}`;
        else if(uuidRe.test(term)) filter=`id.eq.${term}`;
        else if(term.includes('@')) filter=`email.ilike.%${term}%`;
        else if(term.replace(/[^0-9]/g,'').length>=9) filter=`phone.eq.${term.replace(/[^0-9]/g,'')}`;
        else filter=`nickname.ilike.%${term}%`;

        const { data, error } = await supabase
          .from('profiles')
          .select('id,nickname,handle,email,phone')
          .or(filter)
          .limit(30);
        if(error) throw error;
        setResults((data??[]).filter((p:Profile)=>p.id!==me));
      }catch(e:any){
        Alert.alert('검색 실패', e.message ?? String(e));
      }finally{ setLoading(false); }
    },300);
    return ()=>{ if(debounceRef.current) clearTimeout(debounceRef.current); };
  },[q,me]);

  const sendRequest=useCallback(async(target:string)=>{
    try{
      if(target===me) throw new Error('본인에게는 보낼 수 없습니다.');
      const { data: exists } = await supabase
        .from('friendships')
        .select('id,status,requester,addressee')
        .or(`and(requester.eq.${me},addressee.eq.${target}),and(requester.eq.${target},addressee.eq.${me})`)
        .limit(1).maybeSingle();
      if(exists){
        if(exists.status==='accepted') throw new Error('이미 친구입니다.');
        if(exists.status==='pending') throw new Error('대기중 요청이 있습니다.');
      }
      const { error } = await supabase.from('friendships').insert({ requester: me, addressee: target });
      if(error) throw error;
      Alert.alert('완료','요청을 보냈습니다.');
      loadRequests();
    }catch(e:any){ Alert.alert('실패', e.message ?? String(e)); }
  },[me, loadRequests]);

  const accept=useCallback(async(f:Friendship)=>{
    const { error } = await supabase.from('friendships').update({ status:'accepted' }).eq('id',f.id);
    if(!error) loadRequests();
  },[loadRequests]);

  const reject=useCallback(async(f:Friendship)=>{
    const { error } = await supabase.from('friendships').update({ status:'blocked' }).eq('id',f.id);
    if(!error) loadRequests();
  },[loadRequests]);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#fff' }}>
      <Text style={a.title}>친구 추가</Text>

      <View style={a.inputRow}>
        <TextInput
          style={a.input}
          value={q}
          onChangeText={setQ}
          placeholder="예) @coonn / someone@email.com / 01000000000 / 닉네임"
          autoCapitalize="none"
        />
      </View>

      {loading ? <ActivityIndicator style={{ marginVertical:8 }}/> : (
        <FlatList
          data={results}
          keyExtractor={i=>i.id}
          renderItem={({item})=>(
            <View style={a.row}>
              <View style={{ flex:1, paddingRight:8 }}>
                <Text style={a.name} numberOfLines={1}>{item.nickname || item.handle || item.email}</Text>
                <Text style={a.sub} numberOfLines={1}>{item.handle ? `@${item.handle}` : (item.email || item.phone || item.id)}</Text>
              </View>
              <Pressable style={a.btn} onPress={()=>sendRequest(item.id)}>
                <Text style={a.btnTxt}>요청</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={a.empty}>검색 결과가 없습니다.</Text>}
        />
      )}

      <Text style={a.section}>받은 요청</Text>
      <FlatList
        data={incoming}
        keyExtractor={i=>String(i.id)}
        renderItem={({item})=>(
          <View style={a.row}>
            <Text style={[a.name,{flex:1}]}>from {item.requester.slice(0,8)}…</Text>
            <Pressable style={[a.btn,{backgroundColor:'#111827'}]} onPress={()=>accept(item)}><Text style={a.btnTxt}>수락</Text></Pressable>
            <Pressable style={[a.btn,{backgroundColor:'#e5e7eb'}]} onPress={()=>reject(item)}><Text style={[a.btnTxt,{color:'#111827'}]}>거절</Text></Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={a.empty}>없습니다.</Text>}
      />

      <Text style={a.section}>보낸 요청</Text>
      <FlatList
        data={outgoing}
        keyExtractor={i=>String(i.id)}
        renderItem={({item})=>(
          <View style={a.row}>
            <Text style={[a.name,{flex:1}]}>to {item.addressee.slice(0,8)}…</Text>
            <Text style={a.sub}>대기중…</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={a.empty}>없습니다.</Text>}
      />
    </SafeAreaView>
  );
}

const a = StyleSheet.create({
  title:{ paddingHorizontal:16, paddingTop:10, paddingBottom:6, fontSize:18, fontWeight:'800' },
  inputRow:{ paddingHorizontal:16, paddingBottom:8 },
  input:{ height:44, borderWidth:1, borderColor:'#e5e7eb', borderRadius:10, paddingHorizontal:12 },
  section:{ paddingHorizontal:16, paddingVertical:10, fontSize:16, fontWeight:'700' },
  empty:{ paddingHorizontal:16, color:'#6b7280' },
  row:{ flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:16, paddingVertical:10 },
  name:{ fontSize:15, fontWeight:'700', color:'#111827' },
  sub:{ fontSize:12, color:'#6b7280' },
  btn:{ height:32, paddingHorizontal:12, borderRadius:8, backgroundColor:'#111827', alignItems:'center', justifyContent:'center' },
  btnTxt:{ color:'#fff', fontWeight:'700' },
});
