// src/components/ThemedStatusBar.tsx (새로 생성 추천)
import React from 'react';
import { StatusBar, Platform } from 'react-native';

interface Props {
  isDark?: boolean; // 나중에는 전역 테마 Hook에서 가져오면 됨
}

export default function ThemedStatusBar({ isDark = false }: Props) {
  return (
    <StatusBar
      // 1. 글씨 색상 자동 전환
      barStyle={isDark ? 'light-content' : 'dark-content'}
      
      // 2. 안드로이드 투명 처리 (배경색은 Layout이 담당)
      backgroundColor="transparent"
      translucent={true} 
    />
  );
}