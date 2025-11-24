import React from 'react';
import { Marker } from 'react-native-maps';
import { View, Text } from 'react-native';

export default function BeaconMarker({
  coord, members, status, onPress,
}: {
  coord: { latitude: number; longitude: number };
  members: number;
  status?: string;
  onPress?: () => void;
}) {
  return (
    <Marker coordinate={coord} onPress={onPress}>
      <View style={{ alignItems:'center', shadowColor:'#000', shadowOpacity:0.2, shadowRadius:6, elevation:6 }}>
        <View style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, backgroundColor:'#0b1020', borderWidth:2, borderColor:'#fff' }}>
          <Text style={{ color:'#fff', fontWeight:'700' }} numberOfLines={1}>{status ?? '비콘'}</Text>
        </View>
        <View style={{ width:0, height:0, borderLeftWidth:8, borderRightWidth:8, borderTopWidth:12, borderStyle:'solid',
          borderLeftColor:'transparent', borderRightColor:'transparent', borderTopColor:'#0b1020', marginTop:-1 }}/>
        <View style={{ position:'absolute', top:-8, right:-12, minWidth:22, height:22, borderRadius:11, paddingHorizontal:6,
          backgroundColor:'#fff', alignItems:'center', justifyContent:'center' }}>
          <Text style={{ fontWeight:'800', color:'#0b1020' }}>{members}</Text>
        </View>
      </View>
    </Marker>
  );
}
