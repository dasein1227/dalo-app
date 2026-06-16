import React from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';

type LetterpressTextProps = {
  text: string;
  style?: TextStyle | TextStyle[];
  highlightColor?: string;
  shadowColor?: string;
  numberOfLines?: number;
};

export const LetterpressText = React.memo(({
  text,
  style,
  highlightColor = 'rgba(255,255,255,0.75)',
  shadowColor = 'rgba(0,0,0,0.28)',
  numberOfLines = 1,
}: LetterpressTextProps) => (
  <View style={{ position: 'relative' }}>
    <Text
      style={[
        style,
        {
          position: 'absolute',
          left: 0,
          top: 1,
          color: highlightColor,
          textShadowColor: 'transparent',
        },
      ]}
      numberOfLines={numberOfLines}
    >
      {text}
    </Text>
    <Text
      style={[
        style,
        {
          color: StyleSheet.flatten(style)?.color ?? '#111',
          textShadowColor: shadowColor,
          textShadowOffset: { width: 0, height: -1 },
          textShadowRadius: 0,
        },
      ]}
      numberOfLines={numberOfLines}
    >
      {text}
    </Text>
  </View>
));
