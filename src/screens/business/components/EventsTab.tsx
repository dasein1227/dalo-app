import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Calendar, 
  X 
} from 'lucide-react-native';

import { useBusinessComponentTheme, type BusinessComponentTheme } from './businessTheme';
import type { BusinessEvent } from './businessTypes';


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
  
  // ✅ [추가] 폼 취소 핸들러
  onCancelForm?: () => void;

  onEditEvent: (ev: BusinessEvent) => void;
  onDeleteEvent: (eventId: string) => void;
};

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
  onCancelForm,
  onEditEvent,
  onDeleteEvent,
}) => {
  const { t } = useTranslation();
  const { theme: ui } = useBusinessComponentTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

const isEditing = !!editingEventId;
  // 취소 버튼 표시 조건: 수정 중이거나, 뭔가 입력했을 때
  const showCancel = isEditing || !!newEventTitle || !!newEventBody || !!newEventImageUrl;

  const renderForm = () => (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>
          {isEditing ? t('business:events.editTitle') : t('business:events.newTitle')}
        </Text>
        {showCancel && onCancelForm && (
          <Pressable onPress={onCancelForm} hitSlop={10}>
            <Text style={styles.cancelText}>{t('business:common.cancel')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.formContent}>
        {/* 왼쪽: 이미지 선택 */}
        <Pressable style={styles.imagePicker} onPress={onPressAddImage}>
          {newEventImageUrl ? (
            <View style={{ width: '100%', height: '100%' }}>
              <Image
                source={{ uri: newEventImageUrl }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <Pressable
                style={styles.removeImageBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  // 이미지만 삭제하는 로직이 없으면 전체 취소 혹은 부모에서 처리
                  // 여기선 편의상 폼 취소로 연결 (필요시 이미지만 null로 하는 콜백 추가 가능)
                  if (onCancelForm) onCancelForm();
                }}
              >
                <X size={12} color="#FFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Plus size={24} color={ui.textMuted} />
              <Text style={styles.placeholderText}>{t('business:common.photo')}</Text>
            </View>
          )}
          {newEventImageUrl && isEditing && (
            <View style={styles.editBadge}>
              <Edit2 size={12} color="#FFF" />
            </View>
          )}
        </Pressable>

        {/* 오른쪽: 입력 필드 */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.inputTitle}
            value={newEventTitle}
            onChangeText={onChangeTitle}
            placeholder={t('business:events.titlePlaceholder')}
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.inputBody}
            value={newEventBody}
            onChangeText={onChangeBody}
            placeholder={t('business:events.bodyPlaceholder')}
            placeholderTextColor="#9CA3AF"
            multiline
          />
          <Pressable
            style={[
              styles.submitBtn,
              (!newEventTitle && !newEventBody && !newEventImageUrl) && styles.submitBtnDisabled
            ]}
            onPress={onSubmitEvent}
            disabled={postingEvent || (!newEventTitle && !newEventBody && !newEventImageUrl)}
          >
            {postingEvent ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isEditing ? t('business:events.submitEdit') : t('business:events.submitNew')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderForm()}

      <View style={styles.divider} />

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {t('business:events.listTitle')} <Text style={styles.countText}>{events.length}</Text>
        </Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Calendar size={48} color={ui.textFaint} />
          <Text style={styles.emptyText}>{t('business:events.empty')}</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {events.map((ev) => (
            <View key={ev.id} style={styles.eventCard}>
              {/* 카드 상단: 이미지 (있을 경우) */}
              {ev.image_url && (
                <Image
                  source={{ uri: ev.image_url }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
              )}
              
              {/* 카드 내용 */}
              <View style={styles.cardBody}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {ev.title || t('business:common.titleFallback')}
                  </Text>
                  
                  {/* 날짜 배지 (예시) */}
                  {/* <View style={styles.dateBadge}><Text style={styles.dateText}>D-Day</Text></View> */}
                </View>
                
                {ev.body ? (
                  <Text style={styles.cardDesc} numberOfLines={3}>
                    {ev.body}
                  </Text>
                ) : null}

                {/* 하단 액션 버튼 */}
                <View style={styles.cardActions}>
                  <Pressable 
                    style={styles.actionBtn} 
                    onPress={() => onEditEvent(ev)}
                    hitSlop={10}
                  >
                    <Edit2 size={14} color={ui.textSecondary} />
                    <Text style={styles.actionText}>{t('business:common.edit')}</Text>
                  </Pressable>
                  
                  <View style={styles.verticalLine} />
                  
                  <Pressable 
                    style={styles.actionBtn}
                    onPress={() => onDeleteEvent(ev.id)}
                    hitSlop={10}
                  >
                    <Trash2 size={14} color={ui.danger} />
                    <Text style={[styles.actionText, { color: ui.danger }]}>{t('business:common.delete')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
      
      {/* ✅ 하단 여백 View 제거됨 (부모 ScrollView Padding으로 대체) */}
    </View>
  );
};

const createStyles = (ui: BusinessComponentTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.background,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
  },

  // Form
  formContainer: {
    backgroundColor: ui.surface,
    padding: 16,
    borderRadius: ui.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
  },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  formTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: ui.text, letterSpacing: -0.2 },
  cancelText: { fontSize: 13, color: ui.textMuted, fontWeight: '600', paddingHorizontal: 4 },

  formContent: { flexDirection: 'row', gap: 12 },
  
  imagePicker: {
    width: 90, height: 120,
    borderRadius: ui.radius.lg,
    backgroundColor: ui.imageSurface, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairline,
    borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center' },
  placeholderText: { fontSize: 12, color: ui.textMuted, marginTop: 4, fontWeight: '500' },
  
  removeImageBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 4,
    alignItems: 'center',
  },

  inputContainer: { flex: 1, justifyContent: 'flex-start' },
  inputTitle: {
    fontSize: 15, lineHeight: 20, fontWeight: '600', color: ui.text,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.hairlineSoft,
    paddingVertical: 8, marginBottom: 8,
  },
  inputBody: {
    flex: 1, textAlignVertical: 'top',
    fontSize: 14, lineHeight: 20, color: ui.textSecondary,
    minHeight: 60,
  },
  
  submitBtn: {
    backgroundColor: ui.primaryStrong, borderRadius: ui.radius.md,
    paddingVertical: 10, alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: ui.imageSurface },
  submitBtnText: { color: ui.fixedWhite, fontWeight: '600', fontSize: 14 },

  divider: { height: 14, backgroundColor: 'transparent' },

  // List
  listHeader: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 13, backgroundColor: ui.surface,
    borderTopLeftRadius: ui.radius.xl,
    borderTopRightRadius: ui.radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairlineSoft,
  },
  listTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: ui.text, letterSpacing: -0.2 },
  countText: { color: ui.accent },

  listContainer: {
    paddingHorizontal: 16,
    backgroundColor: ui.surface,
    borderBottomLeftRadius: ui.radius.xl,
    borderBottomRightRadius: ui.radius.xl,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    overflow: 'hidden',
  },
  
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairlineSoft,
  },
  cardImage: {
    width: 88,
    height: 88,
    borderRadius: ui.radius.lg,
    backgroundColor: ui.imageSurface,
    marginRight: 14,
  },
  
  cardBody: { flex: 1, minWidth: 0, padding: 0 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: ui.text, flex: 1, letterSpacing: -0.2 },
  
  cardDesc: { fontSize: 14, color: ui.textSecondary, lineHeight: 20, marginBottom: 12 },
  
  cardActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingTop: 10,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  actionText: { fontSize: 13, color: ui.textSecondary, marginLeft: 4, fontWeight: '500' },
  verticalLine: { width: StyleSheet.hairlineWidth, height: 12, backgroundColor: ui.hairline, marginHorizontal: 4 },

  emptyState: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 60, backgroundColor: ui.surface,
    borderBottomLeftRadius: ui.radius.xl,
    borderBottomRightRadius: ui.radius.xl,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
  },
  emptyText: { marginTop: 12, fontSize: 14, color: ui.textMuted },
});


export default EventsTab;
