declare global {
  // eslint-disable-next-line no-var
  var __COONN_CHAT_PUSH_TASK_DEFINED__: boolean | undefined;
}

/**
 * Android 리치푸시 정본에서는 네이티브 FirebaseMessagingService가
 * 백그라운드/종료 상태의 알림 렌더링과 액션 처리를 담당한다.
 *
 * 이 파일은 기존 import 경로를 깨지 않도록 유지하는 no-op placeholder다.
 */
if (!global.__COONN_CHAT_PUSH_TASK_DEFINED__) {
  global.__COONN_CHAT_PUSH_TASK_DEFINED__ = true;
}

export {};
