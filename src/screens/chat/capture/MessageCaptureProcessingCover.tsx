// src/screens/chat/capture/MessageCaptureProcessingCover.tsx

import React, { memo } from "react";
import { Image, StyleSheet, View } from "react-native";

import type { ChatTheme } from "../theme/chatTheme";

type Props = {
  visible: boolean;
  theme: ChatTheme;
  imageUri?: string | null;
};

function MessageCaptureProcessingCover({ visible, theme, imageUri }: Props) {
  if (!visible) return null;

  const surface = (theme as any)?.background ?? (theme as any)?.inputBg ?? "#FFFFFF";

  return (
    <View
      pointerEvents="auto"
      style={[styles.root, { backgroundColor: surface }]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          resizeMode="stretch"
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    overflow: "hidden",
  },
});

export default memo(MessageCaptureProcessingCover);
