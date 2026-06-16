// src/screens/chat/schedule/LinkedText.tsx

import React, { useMemo } from 'react';
import { Linking, Text, type TextStyle, type StyleProp } from 'react-native';

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|kr|co|io|me|app|dev|ai|shop|store|xyz)(?:\/[^\s<>()]*)?)/gi;

const trimTrailingPunctuation = (value: string): { url: string; trailing: string } => {
  let url = value;
  let trailing = '';

  while (/[.,!?;:)]$/.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
};

const normalizeUrl = (value: string): string => {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

type Segment =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string; href: string; trailing: string };

const parseSegments = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let lastIndex = 0;

  text.replace(URL_REGEX, (match, _g1, index: number) => {
    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }

    const { url, trailing } = trimTrailingPunctuation(match);
    segments.push({ type: 'url', value: url, href: normalizeUrl(url), trailing });
    lastIndex = index + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
};

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
};

export default function LinkedText({ text, style, linkStyle }: Props) {
  const segments = useMemo(() => parseSegments(text), [text]);

  return (
    <Text style={style} selectable>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <Text key={`text-${index}`}>{segment.value}</Text>;
        }

        return (
          <React.Fragment key={`url-${index}`}>
            <Text
              style={linkStyle}
              onPress={() => {
                void Linking.openURL(segment.href).catch(() => undefined);
              }}
            >
              {segment.value}
            </Text>
            {segment.trailing ? <Text>{segment.trailing}</Text> : null}
          </React.Fragment>
        );
      })}
    </Text>
  );
}
