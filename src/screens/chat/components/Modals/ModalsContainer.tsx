// src/screens/chat/components/Modals/ModalsContainer.tsx
import React, { useState } from 'react';
import MediaPickerModal from '../../MediaPickerModal';
import VoiceRecorderModal from '../../VoiceRecorderModal';

type Props = {
  visibleMedia: boolean;
  setVisibleMedia: (v: boolean) => void;

  visibleVoice: boolean;
  setVisibleVoice: (v: boolean) => void;

  // 전송 함수: 이미지/비디오/음성 파일 전송 시 호출
  onSendMedia?: (fileUrl: string, kind: string) => Promise<void>;
  onSendVoice?: (audioUrl: string) => Promise<void>;
};

export default function ModalsContainer({
  visibleMedia,
  setVisibleMedia,

  visibleVoice,
  setVisibleVoice,

  onSendMedia,
  onSendVoice,
}: Props) {
  // MediaPickerModal 이 요구하는 품질 상태를 여기서 내부적으로 관리
  const [photoQuality, setPhotoQuality] = useState<
    'low' | 'standard' | 'original'
  >('standard');
  const [videoQuality, setVideoQuality] = useState<'standard' | 'high'>(
    'standard',
  );

  const THEME_COLOR = '#EF4444'; // 기존 OUR_RED 비슷한 컬러

  return (
    <>
      {/* 📎 이미지·비디오·파일 첨부 */}
      <MediaPickerModal
        visible={visibleMedia}
        onClose={() => setVisibleMedia(false)}
        photoQuality={photoQuality}
        videoQuality={videoQuality}
        onChangePhotoQuality={setPhotoQuality}
        onChangeVideoQuality={setVideoQuality}
        onSendSelected={async (assets, bundleSend) => {
          // TODO: 여기서 원래 Chat.tsx에 있던 업로드 로직 붙이면 됨
          setVisibleMedia(false);

          if (!onSendMedia) return;

          // 지금은 간단히 asset별로 한 번씩 콜백만 호출
          for (const a of assets) {
            const kind = a.isVideo ? 'video' : 'image';
            await onSendMedia(a.uri, kind);
          }
        }}
        themeColor={THEME_COLOR}
      />

      {/* 🎤 음성 녹음 */}
      <VoiceRecorderModal
        visible={visibleVoice}
        onClose={() => setVisibleVoice(false)}
        onSend={async (uri /*, durationMs */) => {
          setVisibleVoice(false);
          if (onSendVoice) {
            await onSendVoice(uri);
          }
        }}
        themeColor={THEME_COLOR}
      />
    </>
  );
}
