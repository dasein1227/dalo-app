// src/hooks/useNetworkGuard.ts
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

export default function useNetworkGuard() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      if (!state.isConnected || state.isInternetReachable === false) {
        navigation.navigate('Offline', {
          reason: '네트워크 연결이 끊어졌습니다.',
          autoBackOnOnline: true,
        });
      }
    });

    return () => unsub();
  }, [navigation]);
}
