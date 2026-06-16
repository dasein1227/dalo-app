// src/screens/chat/capture/ChatCaptureTarget.tsx

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  children: React.ReactNode;
  backgroundColor?: string | null;
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: () => void;
};

const ChatCaptureTarget = React.forwardRef<View, Props>(
  ({ children, backgroundColor, visible = true, style, onLayout }, ref) => {
    return (
      <View
        ref={ref}
        collapsable={false}
        onLayout={onLayout}
        style={[
          styles.root,
          backgroundColor ? { backgroundColor } : null,
          !visible ? styles.hidden : null,
          style,
        ]}
      >
        {children}
      </View>
    );
  },
);

ChatCaptureTarget.displayName = "ChatCaptureTarget";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  hidden: {
    opacity: 0,
  },
});

export default ChatCaptureTarget;
