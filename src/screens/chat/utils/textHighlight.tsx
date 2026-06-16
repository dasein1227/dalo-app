import React from 'react';
import { Text, type TextStyle } from 'react-native';

/**
 * 텍스트 내에서 검색어(query)와 일치하는 부분을 찾아 highlightColor 배경을 입혀줍니다.
 * 대소문자를 구분하지 않습니다 (case-insensitive).
 */
export function renderHighlightedText(
  fullText: string | null | undefined,
  query: string,
  baseStyle: TextStyle,
  highlightColor: string
) {
  const text = fullText || '';
  
  // 검색어가 없거나 빈 문자열이면 그냥 원본 텍스트 반환
  if (!query || !query.trim()) {
    return <Text style={baseStyle}>{text}</Text>;
  }

  // 특수문자 이스케이프 처리 (검색어에 ?, * 등이 들어갈 경우 대비)
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 정규식으로 분리 (괄호를 사용해 구분자도 결과 배열에 포함)
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <Text style={baseStyle}>
      {parts.map((part, index) => {
        // 소문자로 변환하여 비교 (대소문자 무시 검색)
        const isMatch = part.toLowerCase() === query.toLowerCase();
        
        return isMatch ? (
          <Text
            key={`${index}-${part}`}
            style={[
              // 기본 스타일 상속 (폰트 크기 등)
              baseStyle, 
              // ✅ 여기가 핵심: 테마에서 가져온 하이라이트 색상 적용
              { backgroundColor: highlightColor, color: baseStyle.color } 
            ]}
          >
            {part}
          </Text>
        ) : (
          <Text key={`${index}-${part}`}>{part}</Text>
        );
      })}
    </Text>
  );
}