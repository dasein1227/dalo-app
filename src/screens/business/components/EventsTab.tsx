// src/screens/business/components/EventsTab.tsx
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
import type { BusinessEvent } from './businessTypes';

// 필요하다면 다른 곳에서 이 파일을 통해서도 타입을 쓸 수 있게 re-export
export type { BusinessEvent } from './businessTypes';

type EventsTabProps = {
  events: BusinessEvent[];

  newEventTitle: string;
  newEventBody: string;
  newEventImageUrl: string | null;
  postingEvent: boolean;
  editingEventId: string | null;

  onChangeTitle: (text: string) => void;
  onChangeBody: (text: string) => void;
  onPressAddImage: () => void;
  onSubmitEvent: () => void;
  onEditEvent: (ev: BusinessEvent) => void;
  onDeleteEvent: (eventId: string) => void;
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const EventsTab: React.FC<EventsTabProps> = ({
  events,
  newEventTitle,
  newEventBody,
  newEventImageUrl,
  postingEvent,
  editingEventId,
  onChangeTitle,
  onChangeBody,
  onPressAddImage,
  onSubmitEvent,
  onEditEvent,
  onDeleteEvent,
}) => {
  return (
    <View style={styles.tabContent}>
      {/* 이벤트 등록 */}
      <View style={styles.card}>
        <SectionHeader title="이벤트 등록" />
        <View style={styles.posterFormRow}>
          <Pressable style={styles.imagePickerBox} onPress={onPressAddImage}>
            {newEventImageUrl ? (
              <Image
                source={{ uri: newEventImageUrl }}
                style={styles.imagePickerPreview}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.imagePickerText}>포스터 이미지 (선택)</Text>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.posterTitleInput}
              value={newEventTitle}
              onChangeText={onChangeTitle}
              placeholder="이벤트 제목 (선택)"
            />
            <TextInput
              style={styles.posterInput}
              value={newEventBody}
              onChangeText={onChangeBody}
              placeholder="이벤트 내용을 입력하거나 이미지로만 등록할 수 있습니다."
              multiline
            />
            <Pressable
              style={styles.posterSubmitButton}
              onPress={onSubmitEvent}
              disabled={postingEvent}
            >
              {postingEvent ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.posterSubmitText}>
                  {editingEventId ? '수정' : '등록'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* 등록된 이벤트 */}
      <View style={styles.card}>
        <SectionHeader title="등록된 이벤트" />
        {events.length === 0 ? (
          <Text style={styles.mutedText}>등록된 이벤트가 없습니다.</Text>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 4 }}
          >
            {events.map((ev) => (
              <View key={ev.id} style={styles.posterListRow}>
                {ev.image_url && (
                  <Image
                    source={{ uri: ev.image_url }}
                    style={styles.posterThumb}
                    resizeMode="cover"
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.posterTitle}>
                    {ev.title || '제목 없음'}
                  </Text>
                  {ev.body ? (
                    <Text style={styles.posterBody} numberOfLines={3}>
                      {ev.body}
                    </Text>
                  ) : null}

                  <View
                    style={{
                      flexDirection: 'row',
                      marginTop: 4,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Pressable onPress={() => onEditEvent(ev)} hitSlop={8}>
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
                      onPress={() => onDeleteEvent(ev.id)}
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

export default EventsTab;
