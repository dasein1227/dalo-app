// src/screens/business/components/NoticesTab.tsx
import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { styles } from './bizStyles';
import type { BusinessNotice } from './businessTypes';

export type { BusinessNotice } from './businessTypes';

type NoticesTabProps = {
  notices: BusinessNotice[];

  newNoticeTitle: string;
  newNoticeBody: string;
  newNoticeImageUrl: string | null;
  postingNotice: boolean;
  editingNoticeId: string | null;

  onChangeTitle: (text: string) => void;
  onChangeBody: (text: string) => void;
  onPressAddImage: () => void;
  onSubmitNotice: () => void;
  onEditNotice: (notice: BusinessNotice) => void;
  onDeleteNotice: (noticeId: string) => void;
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const NoticesTab: React.FC<NoticesTabProps> = ({
  notices,
  newNoticeTitle,
  newNoticeBody,
  newNoticeImageUrl,
  postingNotice,
  editingNoticeId,
  onChangeTitle,
  onChangeBody,
  onPressAddImage,
  onSubmitNotice,
  onEditNotice,
  onDeleteNotice,
}) => {
  return (
    <View style={styles.tabContent}>
      {/* 공지 등록 */}
      <View style={styles.card}>
        <SectionHeader title="공지 등록" />
        <View style={styles.posterFormRow}>
          <Pressable style={styles.imagePickerBox} onPress={onPressAddImage}>
            {newNoticeImageUrl ? (
              <Image
                source={{ uri: newNoticeImageUrl }}
                style={styles.imagePickerPreview}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.imagePickerText}>공지 이미지 (선택)</Text>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.posterTitleInput}
              value={newNoticeTitle}
              onChangeText={onChangeTitle}
              placeholder="공지 제목 (선택)"
            />
            <TextInput
              style={styles.posterInput}
              value={newNoticeBody}
              onChangeText={onChangeBody}
              placeholder="공지 내용을 입력하거나 이미지로만 등록할 수 있습니다."
              multiline
            />
            <Pressable
              style={styles.posterSubmitButton}
              onPress={onSubmitNotice}
              disabled={postingNotice}
            >
              {postingNotice ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.posterSubmitText}>
                  {editingNoticeId ? '수정' : '등록'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* 등록된 공지 */}
      <View style={styles.card}>
        <SectionHeader title="등록된 공지" />
        {notices.length === 0 ? (
          <Text style={styles.mutedText}>등록된 공지가 없습니다.</Text>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 4 }}
          >
            {notices.map((nt) => (
              <View key={nt.id} style={styles.posterListRow}>
                {nt.image_url && (
                  <Image
                    source={{ uri: nt.image_url }}
                    style={styles.posterThumb}
                    resizeMode="cover"
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.posterTitle}>
                    {nt.title || '제목 없음'}
                  </Text>
                  {nt.body ? (
                    <Text style={styles.posterBody} numberOfLines={3}>
                      {nt.body}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      marginTop: 4,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Pressable onPress={() => onEditNotice(nt)} hitSlop={8}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: '#4B5563',
                        }}
                      >
                        수정
                      </Text>
                    </Pressable>
                    <Text
                      style={{
                        marginHorizontal: 4,
                        fontSize: 12,
                        color: '#D1D5DB',
                      }}
                    >
                      ·
                    </Text>
                    <Pressable
                      onPress={() => onDeleteNotice(nt.id)}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: '#EF4444',
                        }}
                      >
                        삭제
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default NoticesTab;
