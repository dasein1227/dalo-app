// src/screens/chat/capture/chatCaptureTypes.ts

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { View } from "react-native";
import type { ChatCaptureSelectionFrame } from "../components/MessageList/MessageList";

export type ChatCaptureToastInput =
  | string
  | {
      message: string;
      tone?: any;
      showMark?: boolean;
    };

export type ChatCaptureToastFn = (params: ChatCaptureToastInput) => void;

export type ChatCaptureSnapshot = {
  displayText?: string | null;
  replyPreview?: any;
  isLocalFlipped?: boolean;
  mode?: string | null;
};

export type ChatCaptureSelectionState = {
  selectedIdSet: Set<string>;
  count: number;
  exit: () => void;
  clear: () => void;
};

export type UseChatScreenshotCaptureArgs = {
  items?: any[];
  interactionLocked?: boolean;
  captureBlockedBySecure?: boolean;
  attachmentsOpen?: boolean;
  attachmentSheetRef?: RefObject<any>;
  setAttachmentsOpen?: (value: boolean) => void;
  scheduleDockLockRelease?: (delayMs?: number) => void;
  showFloatingToast?: ChatCaptureToastFn;
  title?: string;
  me?: string | null;
  theme?: any;
  roomType?: any;
  headerAvatarUrl?: string | null;
};

export type ChatCaptureTargetProps = {
  ref: RefObject<View | null>;
  onLayout: () => void;
};

export type ChatCaptureMessageListProps = {
  captureChromeVisible: boolean;
  captureSelectionFrame: ChatCaptureSelectionFrame;
  onCaptureItemRef: (id: string, node: View | null) => void;
  onCaptureViewportChange: () => void;
  onCaptureScrollYChange: (scrollY: number) => void;
  onCaptureListRef?: (node: any | null) => void;
  captureAnonymousLabelMap?: Record<string, string>;
};

export type ChatScreenshotCaptureController = {
  targetRef: RefObject<View | null>;
  targetProps: ChatCaptureTargetProps;
  messageListProps: ChatCaptureMessageListProps;

  active: boolean;
  anonymize: boolean;
  setAnonymize: Dispatch<SetStateAction<boolean>>;
  interactionLocked: boolean;
  chromeVisible: boolean;
  processingCoverVisible: boolean;
  processingCoverUri: string | null;

  selection: ChatCaptureSelectionState;
  startFromMessage: (message: any, snapshot?: ChatCaptureSnapshot | null) => void;
  startEmpty: () => void;
  toggleMessage: (message: any, snapshot?: ChatCaptureSnapshot | null) => void;
  save: () => Promise<void>;
  share: () => Promise<void>;
  exit: () => void;

  // Compatibility aliases for current Chat.tsx wiring.
  captureSelection: ChatCaptureSelectionState;
  captureJob: null;
  captureAnonymize: boolean;
  setCaptureAnonymize: Dispatch<SetStateAction<boolean>>;
  captureModeActive: boolean;
  captureInteractionLocked: boolean;
  captureChromeVisible: boolean;
  captureProcessingCoverVisible: boolean;
  captureProcessingCoverUri: string | null;
  handleToggleCaptureMessage: (message: any, snapshot?: ChatCaptureSnapshot | null) => void;
  handleStartCaptureFromMessage: (message: any, snapshot?: ChatCaptureSnapshot | null) => void;
  handleStartCaptureEmpty: () => void;
  handleSaveCapture: () => Promise<void>;
  handleShareCapture: () => Promise<void>;
};
