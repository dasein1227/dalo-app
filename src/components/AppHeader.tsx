// src/components/AppHeader.tsx
import React from 'react';
import {
  View, Text, Pressable, Platform, StatusBar, StyleSheet, Image,
  ViewStyle, TextStyle,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = {
  title?: string;
  showBack?: boolean;
  right?: React.ReactNode;
  containerStyle?: ViewStyle;
  titleStyle?: TextStyle;
  logoSource?: any;
};

export default function AppHeader({
  title,
  showBack = false,
  right,
  containerStyle,
  titleStyle,
  logoSource,
}: Props) {
  // ✅ 제네릭 호출 대신 캐스팅 (Babel이 TS 문법을 확실히 먹으면 둘 다 OK)
  const navigation = useNavigation() as unknown as NativeStackNavigationProp<any>;
  const isIOS = Platform.OS === 'ios';

  return (
    <>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <View
        style={[
          styles.container,
          { paddingTop: isIOS ? 8 : 4, paddingBottom: 8 },
          containerStyle,
        ]}
      >
        <View style={styles.left}>
          {showBack ? (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}
            >
              <ChevronLeft size={22} color="#000" />
            </Pressable>
          ) : logoSource ? (
            <Image source={logoSource} style={styles.logo} resizeMode="contain" fadeDuration={0} />
          ) : null}
        </View>

        {title ? (
          <Text style={[styles.title, titleStyle]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <View style={styles.right}>{right}</View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 54,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  left: { width: 40, justifyContent: 'center', alignItems: 'flex-start' },
  backButton: { padding: 4 },
  logo: { width: 26, height: 26 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#000' },
  right: { width: 40, justifyContent: 'center', alignItems: 'flex-end' },
});
