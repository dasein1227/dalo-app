// src/screens/business/components/PhotosTab.tsx
import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { styles } from './bizStyles';
import type { BusinessPhoto } from './businessTypes';

export type { BusinessPhoto } from './businessTypes';

type PhotosTabProps = {
  photos: BusinessPhoto[];

  // 대표 사진 URL (business.hero_image_url)
  heroImageUrl: string | null;

  // 폼 상태
  newPhotoImageUrl: string | null;
  newPhotoCaption: string;
  postingPhoto: boolean;
  editingPhotoId: string | null;

  onChangePhotoCaption: (text: string) => void;
  onPressAddImage: () => void;
  onSubmitPhoto: () => void;

  // 아래 그리드에서 사진 선택 / 삭제
  onEditPhoto: (photo: BusinessPhoto) => void;
  onDeletePhoto: (photoId: string) => void;

  // 대표 사진 설정 (기존 콜백 그대로 사용)
  onSetHeroPhoto: (photo: BusinessPhoto) => void;
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const PhotosTab: React.FC<PhotosTabProps> = ({
  photos,
  heroImageUrl,
  newPhotoImageUrl,
  newPhotoCaption,
  postingPhoto,
  editingPhotoId,
  onChangePhotoCaption,
  onPressAddImage,
  onSubmitPhoto,
  onEditPhoto,
  onDeletePhoto,
  onSetHeroPhoto,
}) => {
  // 상단 카드의 "대표" 버튼에서 쓸 현재 선택된(편집중) 사진
  const currentEditingPhoto =
    editingPhotoId != null
      ? photos.find((p) => p.id === editingPhotoId) ?? null
      : null;

  const handleSetHeroFromForm = () => {
    if (!currentEditingPhoto) {
      Alert.alert('사진 선택', '대표로 지정할 사진을 먼저 선택해 주세요.');
      return;
    }
    if (!currentEditingPhoto.image_url) {
      Alert.alert('사진 오류', '이미지가 없는 사진은 대표로 지정할 수 없습니다.');
      return;
    }
    onSetHeroPhoto(currentEditingPhoto);
  };

  const handleCancelForm = () => {
    // 캡션만 초기화 (이미지는 부모 상태 구조 때문에 여기서 완전 리셋은 못하지만
    // 최소한 글은 지워줌)
    onChangePhotoCaption('');
    // 이미지까지 비워야 하면 나중에 Create.tsx 쪽에
    // onResetPhotoForm 같은 콜백 하나 더 빼서 연결하자.
  };

  return (
    <View style={styles.tabContent}>
      {/* 위쪽: 사진 등록 카드 */}
      <View style={styles.card}>
        <SectionHeader title="가게 사진 등록" />
        <View style={styles.posterFormRow}>
          {/* 왼쪽: 이미지 선택 박스 */}
          <Pressable style={styles.imagePickerBox} onPress={onPressAddImage}>
            {newPhotoImageUrl ? (
              <Image
                source={{ uri: newPhotoImageUrl }}
                style={styles.imagePickerPreview}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.imagePickerText}>사진 선택 (선택)</Text>
            )}
          </Pressable>

          {/* 오른쪽: 캡션 + 버튼들 */}
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.posterInput}
              value={newPhotoCaption}
              onChangeText={onChangePhotoCaption}
              placeholder="사진 설명 또는 글만 적어도 됩니다."
              multiline
            />

            {/* 버튼 3개: 대표 / 수정·등록 / 취소 */}
            <View
              style={{
                marginTop: 8,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
              }}
            >
              {/* 대표 버튼 */}
              <Pressable
                style={styles.photoTopButton}
                onPress={handleSetHeroFromForm}
              >
                <Text style={styles.photoTopButtonText}>대표</Text>
              </Pressable>

              {/* 수정 / 등록 버튼 (기존 onSubmitPhoto 사용) */}
              <Pressable
                style={styles.photoTopButtonSubmit}
                onPress={onSubmitPhoto}
                disabled={postingPhoto}
              >
                {postingPhoto ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.photoTopButtonSubmitText}>
                    {editingPhotoId ? '수정' : '등록'}
                  </Text>
                )}
              </Pressable>

              {/* 취소 버튼 (폼만 리셋) */}
              <Pressable
                style={styles.photoTopButtonCancel}
                onPress={handleCancelForm}
              >
                <Text style={styles.photoTopButtonCancelText}>취소</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* 아래쪽: 등록된 사진 리스트 */}
      <View style={styles.card}>
        <SectionHeader title="등록된 사진" />
        {photos.length === 0 ? (
          <Text style={styles.mutedText}>아직 등록된 사진이 없습니다.</Text>
        ) : (
          <ScrollView
            contentContainerStyle={styles.photoGrid}
            showsVerticalScrollIndicator={false}
          >
            {photos.map((p) => {
              if (!p.image_url) return null;
              const isHero =
                !!heroImageUrl && p.image_url === heroImageUrl;

              return (
                <View key={p.id} style={styles.photoItemContainer}>
                  {/* 이미지 + 대표 배지 */}
                  <Pressable onPress={() => onEditPhoto(p)}>
                    <View style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: p.image_url }}
                        style={styles.photoGridImage}
                        resizeMode="cover"
                      />
                      {isHero && (
                        <View style={styles.mainPhotoTag}>
                          <Text style={styles.mainPhotoTagText}>대표</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>

                  {/* 아래 텍스트 액션: 수정 · 삭제 (깔끔하게) */}
                  <View
                    style={{
                      marginTop: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Pressable
                      onPress={() => onEditPhoto(p)}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: '#4B5563',
                        }}
                      >
                        수정
                      </Text>
                    </Pressable>

                    <Text
                      style={{
                        marginHorizontal: 4,
                        fontSize: 11,
                        color: '#D1D5DB',
                      }}
                    >
                      ·
                    </Text>

                    <Pressable
                      onPress={() => onDeletePhoto(p.id)}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: '#EF4444',
                        }}
                      >
                        삭제
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default PhotosTab;
