import React, { useState, memo, useCallback } from 'react';
import MediaPickerModal from '@/components/MediaPickerModal';
import VoiceRecorderModal from '@/components/VoiceRecorderModal';
import { ChatTheme, resolveRoomType } from '../../theme/chatTheme';

export type PhotoQuality = 'low' | 'standard' | 'original';
export type VideoQuality = 'high' | 'standard';

type Props = {
  mediaVisible: boolean;
  setMediaVisible: (v: boolean) => void;
  voiceVisible: boolean;
  setVoiceVisible: (v: boolean) => void;

  onSendMedia: (assets: any[], bundleSend: boolean) => Promise<void>;
  onSendVoice: (uri: string, durationMs: number, waveform: number[]) => Promise<void>;
  
  theme: ChatTheme;
  roomType?: string;
};

const UploadModals = memo(function UploadModals({
  mediaVisible,
  setMediaVisible,
  voiceVisible,
  setVoiceVisible,
  onSendMedia,
  onSendVoice,
  theme,
  roomType,
}: Props) {
  const [photoQuality, setPhotoQuality] = useState<PhotoQuality>('standard');
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('high');

  const handleCloseMedia = useCallback(() => setMediaVisible(false), [setMediaVisible]);
  const handleCloseVoice = useCallback(() => setVoiceVisible(false), [setVoiceVisible]);

  return (
    <>
      <MediaPickerModal
        visible={mediaVisible}
        onClose={handleCloseMedia}
        photoQuality={photoQuality}
        videoQuality={videoQuality}
        onChangePhotoQuality={setPhotoQuality}
        onChangeVideoQuality={setVideoQuality}
        onSendSelected={onSendMedia}
        theme={theme}
      />

      <VoiceRecorderModal
        visible={voiceVisible}
        onClose={handleCloseVoice}
        onSend={onSendVoice}
        // 🚀 핵심: 여기서 theme 전체를 던져줘야 모달이 방 색깔을 알 수 있습니다!
        theme={theme}
        roomType={resolveRoomType({ type: (roomType ?? 'dm') as any })}
      />
    </>
  );
});

export default UploadModals;