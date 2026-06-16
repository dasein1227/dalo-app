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
  Megaphone, 
  X 
} from 'lucide-react-native';

import { useBusinessComponentTheme, type BusinessComponentTheme } from './businessTheme';
import type { BusinessNotice } from './businessTypes';


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
  
  // ✅ [추가] 폼 취소 핸들러
  onCancelForm?: () => void;

  onEditNotice: (notice: BusinessNotice) => void;
  onDeleteNotice: (noticeId: string) => void;
};

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
  onCancelForm,
  onEditNotice,
  onDeleteNotice,
}) => {
  const { t } = useTranslation();
  const { theme: ui } = useBusinessComponentTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

const isEditing = !!editingNoticeId;
  const showCancel = isEditing || !!newNoticeTitle || !!newNoticeBody || !!newNoticeImageUrl;

  const renderForm = () => (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>
          {isEditing ? t('business:notices.editTitle') : t('business:notices.newTitle')}
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
          {newNoticeImageUrl ? (
            <View style={{ width: '100%', height: '100%' }}>
              <Image
                source={{ uri: newNoticeImageUrl }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <Pressable
                style={styles.removeImageBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  if (onCancelForm) onCancelForm(); // 전체 초기화
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
          {newNoticeImageUrl && isEditing && (
            <View style={styles.editBadge}>
              <Edit2 size={12} color="#FFF" />
            </View>
          )}
        </Pressable>

        {/* 오른쪽: 입력 필드 */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.inputTitle}
            value={newNoticeTitle}
            onChangeText={onChangeTitle}
            placeholder={t('business:notices.titlePlaceholder')}
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.inputBody}
            value={newNoticeBody}
            onChangeText={onChangeBody}
            placeholder={t('business:notices.bodyPlaceholder')}
            placeholderTextColor="#9CA3AF"
            multiline
          />
          <Pressable
            style={[
              styles.submitBtn,
              (!newNoticeTitle && !newNoticeBody && !newNoticeImageUrl) && styles.submitBtnDisabled
            ]}
            onPress={onSubmitNotice}
            disabled={postingNotice || (!newNoticeTitle && !newNoticeBody && !newNoticeImageUrl)}
          >
            {postingNotice ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isEditing ? t('business:notices.submitEdit') : t('business:notices.submitNew')}
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
          {t('business:notices.listTitle')} <Text style={styles.countText}>{notices.length}</Text>
        </Text>
      </View>

      {notices.length === 0 ? (
        <View style={styles.emptyState}>
          <Megaphone size={48} color={ui.textFaint} />
          <Text style={styles.emptyText}>{t('business:notices.empty')}</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {notices.map((nt) => (
            <View key={nt.id} style={styles.noticeCard}>
              {/* 카드 상단: 이미지 (있을 경우) */}
              {nt.image_url && (
                <Image
                  source={{ uri: nt.image_url }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
              )}
              
              {/* 카드 내용 */}
              <View style={styles.cardBody}>
                <View style={styles.cardHeaderRow}>
                  {/* 중요 공지 뱃지 느낌 */}
                  <View style={styles.noticeBadge}>
                    <Text style={styles.noticeBadgeText}>{t('business:notices.badge')}</Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {nt.title || t('business:common.titleFallback')}
                  </Text>
                </View>
                
                {nt.body ? (
                  <Text style={styles.cardDesc} numberOfLines={3}>
                    {nt.body}
                  </Text>
                ) : null}

                {/* 하단 액션 버튼 */}
                <View style={styles.cardActions}>
                  <Pressable 
                    style={styles.actionBtn} 
                    onPress={() => onEditNotice(nt)}
                    hitSlop={10}
                  >
                    <Edit2 size={14} color={ui.textSecondary} />
                    <Text style={styles.actionText}>{t('business:common.edit')}</Text>
                  </Pressable>
                  
                  <View style={styles.verticalLine} />
                  
                  <Pressable 
                    style={styles.actionBtn}
                    onPress={() => onDeleteNotice(nt.id)}
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
      
      {/* 하단 여백 View 제거됨 */}
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
  
  noticeCard: {
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
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  noticeBadge: { 
    backgroundColor: ui.blueSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: ui.radius.sm, marginRight: 8 
  },
  noticeBadgeText: { color: ui.blue, fontSize: 11, fontWeight: '700' },
  
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


export default NoticesTab;
