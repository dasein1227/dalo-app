import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
  StyleSheet,
  LayoutAnimation,
  Modal,
} from 'react-native';
import { 
  Plus, 
  MoreVertical, 
  Utensils, 
  Image as ImageIcon,
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native';

import { enableLayoutAnimationOnce } from '@/utils/enableLayoutAnimation';

import { useBusinessComponentTheme, type BusinessComponentTheme } from './businessTheme';
import type {
  BusinessMenu,
  BusinessMenuItem,
  MenuItemsByMenuId,
} from './businessTypes';

enableLayoutAnimationOnce();

type ActionSheetTarget = {
  type: 'board' | 'item';
  id: string;
  parentId?: string;
  data?: BusinessMenu | BusinessMenuItem;
} | null;

type Props = {
  readOnly?: boolean;
  menus: BusinessMenu[];
  filteredMenus: BusinessMenu[];
  menuItemsByMenuId: MenuItemsByMenuId;
  menuCategories: string[];
  activeMenuCategory: string;
  defaultCurrency?: string;
  onChangeMenuCategory: (cat: string) => void;
  newMenuTitle: string;
  onChangeNewMenuTitle: (v: string) => void;
  newMenuCategory: string;
  onChangeNewMenuCategory: (v: string) => void;
  creatingMenu: boolean;
  onCreateMenuBoard: () => void;
  onEditMenuBoard: (menu: BusinessMenu) => void;
  onDeleteMenuBoard: (menuId: string) => void;
  onOpenMenuItemModal: (menuId: string, item?: BusinessMenuItem) => void;
  onDeleteMenuItem: (menuId: string, itemId: string) => void;
  onOpenMenuPreview: (menu: BusinessMenu, item: BusinessMenuItem) => void;
};

const DEFAULT_CURRENCY = 'KRW';

const CURRENCY_LABELS: Record<string, string> = {
  KRW: '원',
  USD: '$',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  HKD: 'HK$',
  TWD: 'NT$',
  SGD: 'S$',
  THB: '฿',
  VND: '₫',
  PHP: '₱',
  IDR: 'Rp',
  MYR: 'RM',
  INR: '₹',
  AED: 'د.إ',
  SAR: '﷼',
  TRY: '₺',
  RUB: '₽',
  BRL: 'R$',
  MXN: 'MX$',
  CHF: 'CHF',
};

function normalizeCurrency(value?: unknown): string {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return raw || DEFAULT_CURRENCY;
}

function formatMenuPrice(
  item: BusinessMenuItem,
  emptyText: string,
  currencyValue?: unknown,
): string {
  if (typeof item.price !== 'number') return emptyText;

  const currency = normalizeCurrency(currencyValue);
  const unit = CURRENCY_LABELS[currency] ?? currency;
  const amount = item.price.toLocaleString();

  if (currency === 'KRW') return `${amount}${unit}`;
  if (currency === 'CHF') return `${amount} ${unit}`;
  return `${unit}${amount}`;
}

export const MenuTab: React.FC<Props> = ({
  readOnly = false,
  menus,
  filteredMenus,
  menuItemsByMenuId,
  menuCategories,
  activeMenuCategory,
  defaultCurrency = DEFAULT_CURRENCY,
  onChangeMenuCategory,
  newMenuTitle,
  onChangeNewMenuTitle,
  newMenuCategory,
  onChangeNewMenuCategory,
  creatingMenu,
  onCreateMenuBoard,
  onEditMenuBoard,
  onDeleteMenuBoard,
  onOpenMenuItemModal,
  onDeleteMenuItem,
  onOpenMenuPreview,
}) => {
  const { t } = useTranslation();
  const { theme: ui } = useBusinessComponentTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [actionSheetTarget, setActionSheetTarget] = useState<ActionSheetTarget>(null);

  const toggleAddBoard = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsAddingBoard((prev) => !prev);
  };

  const closeActionSheet = () => {
    setActionSheetTarget(null);
  };

  const runAfterActionSheetClose = (fn: () => void) => {
    closeActionSheet();
    requestAnimationFrame(fn);
  };

  const handleMoreOptions = (
    type: 'board' | 'item',
    id: string,
    parentId?: string,
    data?: BusinessMenu | BusinessMenuItem,
  ) => {
    setActionSheetTarget({ type, id, parentId, data });
  };

  const handleEditAction = () => {
    if (!actionSheetTarget) return;

    const { type, parentId, data } = actionSheetTarget;
    runAfterActionSheetClose(() => {
      if (type === 'board') {
        if (data) onEditMenuBoard(data as BusinessMenu);
        return;
      }

      if (parentId && data) {
        onOpenMenuItemModal(parentId, data as BusinessMenuItem);
      }
    });
  };

  const handleDeleteAction = () => {
    if (!actionSheetTarget) return;

    const { type, id, parentId } = actionSheetTarget;
    runAfterActionSheetClose(() => {
      if (type === 'board') {
        onDeleteMenuBoard(id);
        return;
      }

      if (parentId) {
        onDeleteMenuItem(parentId, id);
      }
    });
  };

  const actionSheetTitle = actionSheetTarget?.type === 'board'
    ? t('business:menu.boardManage')
    : t('business:menu.itemManage');

  return (
    <View style={styles.container}>
      {/* 1. 카테고리 탭 */}
      <View style={styles.categoryContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContent}>
          {menuCategories.map((cat) => {
            const isActive = activeMenuCategory === cat;
            return (
              <Pressable
                key={cat}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                onPress={() => onChangeMenuCategory(cat)}
              >
                <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. 메뉴판 추가 (관리자용) */}
      {!readOnly && (
        <View style={styles.addBoardContainer}>
          {!isAddingBoard ? (
            <Pressable style={styles.addBoardButton} onPress={toggleAddBoard}>
              <Plus size={18} color={ui.textSecondary} />
              <Text style={styles.addBoardButtonText}>{t('business:menu.addBoard')}</Text>
            </Pressable>
          ) : (
            <View style={styles.addBoardForm}>
              <Text style={styles.formTitle}>{t('business:menu.addBoardTitle')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  placeholder={t('business:menu.boardNamePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={newMenuTitle}
                  onChangeText={onChangeNewMenuTitle}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t('business:menu.categoryPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={newMenuCategory}
                  onChangeText={onChangeNewMenuCategory}
                />
              </View>
              <View style={styles.formActions}>
                <Pressable style={styles.cancelBtn} onPress={toggleAddBoard}>
                  <Text style={styles.cancelBtnText}>{t('business:common.cancel')}</Text>
                </Pressable>
                <Pressable style={styles.confirmBtn} onPress={onCreateMenuBoard} disabled={creatingMenu}>
                  {creatingMenu ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.confirmBtnText}>{t('business:menu.add')}</Text>}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 3. 리스트 */}
      {filteredMenus.length === 0 && !isAddingBoard ? (
        <View style={styles.emptyState}>
          <Utensils size={48} color={ui.textFaint} />
          <Text style={styles.emptyText}>
            {readOnly ? t('business:menu.emptyReadonly') : t('business:menu.emptyOwner')}
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredMenus.map((menu) => {
            const items = menuItemsByMenuId[menu.id] ?? [];
            return (
              <View key={menu.id} style={styles.menuBoardCard}>
                {/* 헤더 */}
                <View style={styles.boardHeader}>
                  <View style={styles.boardTitleRow}>
                    <Text style={styles.boardTitle}>{menu.name}</Text>
                    {menu.category && <View style={styles.boardBadge}><Text style={styles.boardBadgeText}>{menu.category}</Text></View>}
                  </View>
                  {!readOnly && (
                    <Pressable 
                      onPress={() => handleMoreOptions('board', menu.id, undefined, menu)} 
                      style={styles.iconBtn}
                      hitSlop={15}
                    >
                      <MoreVertical size={20} color={ui.textMuted} />
                    </Pressable>
                  )}
                </View>

                {/* 아이템 리스트 */}
                <View style={styles.itemContainer}>
                  {items.length === 0 ? (
                    <View style={styles.emptyItemBox}>
                      <Text style={styles.emptyItemText}>{t('business:menu.itemEmpty')}</Text>
                    </View>
                  ) : (
                    items.map((item, idx) => (
                      <View key={item.id}>
                        {idx > 0 && <View style={styles.divider} />}
                        
                        <Pressable 
                          style={({ pressed }) => [
                            styles.itemRow,
                            pressed && { backgroundColor: ui.background, opacity: 0.8 }
                          ]}
                          onPress={() => onOpenMenuPreview(menu, item)}
                        >
                          <View style={styles.itemInfo}>
                            <View style={styles.itemNameRow}>
                              {item.is_signature && <View style={styles.signatureBadge}><Text style={styles.signatureText}>{t('business:menu.signature')}</Text></View>}
                              <Text style={styles.itemName}>{item.name}</Text>
                            </View>
                            {item.description ? (
                              <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                            ) : null}
                            <Text style={styles.itemPrice}>
                              {formatMenuPrice(item, t('business:menu.priceEmpty'), defaultCurrency)}
                            </Text>
                          </View>

                          <View style={styles.itemRight}>
                            {item.image_url ? (
                              <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
                            ) : (
                              <View style={styles.itemImagePlaceholder}>
                                <ImageIcon size={20} color={ui.textFaint} />
                              </View>
                            )}

                            {!readOnly && (
                              <Pressable 
                                style={styles.itemMoreBtn}
                                onPress={(e) => {
                                  e.stopPropagation(); 
                                  handleMoreOptions('item', item.id, menu.id, item);
                                }}
                                hitSlop={20}
                              >
                                <View style={styles.moreBtnCircle}>
                                  <MoreVertical size={16} color={ui.textSecondary} />
                                </View>
                              </Pressable>
                            )}
                          </View>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>

                {/* 추가 버튼 (관리자) */}
                {!readOnly && (
                  <Pressable style={styles.addItemButton} onPress={() => onOpenMenuItemModal(menu.id)}>
                    <Plus size={16} color={ui.blue} />
                    <Text style={styles.addItemText}>{t('business:menu.addItem')}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={!!actionSheetTarget}
        transparent
        animationType="fade"
        onRequestClose={closeActionSheet}
      >
        <Pressable style={styles.actionSheetBackdrop} onPress={closeActionSheet}>
          <Pressable style={styles.actionSheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.actionSheetHandle} />
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>{actionSheetTitle}</Text>
              <Pressable style={styles.actionSheetCloseButton} onPress={closeActionSheet} hitSlop={12}>
                <X size={18} color={ui.textMuted} />
              </Pressable>
            </View>

            <Pressable style={styles.actionSheetRow} onPress={handleEditAction}>
              <View style={styles.actionSheetIconCircle}>
                <Pencil size={17} color={ui.textSecondary} />
              </View>
              <Text style={styles.actionSheetRowText}>{t('business:common.edit')}</Text>
            </Pressable>

            <Pressable style={styles.actionSheetRow} onPress={handleDeleteAction}>
              <View style={[styles.actionSheetIconCircle, styles.actionSheetDangerIconCircle]}>
                <Trash2 size={17} color={ui.danger} />
              </View>
              <Text style={[styles.actionSheetRowText, styles.actionSheetDangerText]}>{t('business:common.delete')}</Text>
            </Pressable>

            <Pressable style={styles.actionSheetCancelButton} onPress={closeActionSheet}>
              <Text style={styles.actionSheetCancelText}>{t('business:common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  categoryContainer: {
    backgroundColor: ui.surface,
    paddingVertical: 12,
    borderRadius: ui.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    marginBottom: 14,
  },
  categoryContent: { paddingHorizontal: 14, gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: ui.radius.full, backgroundColor: ui.primarySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairlineSoft },
  categoryChipActive: { backgroundColor: ui.text, borderColor: ui.text },
  categoryText: { fontSize: 14, fontWeight: '600', color: ui.textMuted },
  categoryTextActive: { color: ui.fixedWhite },
  addBoardContainer: { marginBottom: 14 },
  addBoardButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairline, borderStyle: 'dashed', borderRadius: ui.radius.xl, backgroundColor: ui.surface },
  addBoardButtonText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: ui.textSecondary },
  addBoardForm: { backgroundColor: ui.surface, padding: 16, borderRadius: ui.radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairline },
  formTitle: { fontSize: 16, fontWeight: '700', color: ui.text, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { height: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairlineSoft, borderRadius: ui.radius.md, paddingHorizontal: 12, fontSize: 14, color: ui.text, backgroundColor: ui.inputSurface },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: ui.radius.md, backgroundColor: ui.surfaceAlt },
  cancelBtnText: { color: ui.textSecondary, fontWeight: '600', fontSize: 14 },
  confirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: ui.radius.md, backgroundColor: ui.primaryStrong, minWidth: 70, alignItems: 'center' },
  confirmBtnText: { color: ui.fixedWhite, fontWeight: '600', fontSize: 14 },
  listContainer: { gap: 14 },
  menuBoardCard: { backgroundColor: ui.surface, borderRadius: ui.radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairline },
  boardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.hairlineSoft, backgroundColor: ui.surface },
  boardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  boardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: ui.text, letterSpacing: -0.24 },
  boardBadge: { marginLeft: 8, backgroundColor: ui.primarySoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: ui.radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairlineSoft },
  boardBadgeText: { fontSize: 11, color: ui.textMuted, fontWeight: '600' },
  iconBtn: { padding: 4 },
  itemContainer: { backgroundColor: ui.surface },
  emptyItemBox: { padding: 30, alignItems: 'center' },
  emptyItemText: { color: ui.textMuted, fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: ui.hairlineSoft, marginLeft: 16 },
  itemRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'flex-start', minHeight: 100 },
  itemInfo: { flex: 1, marginRight: 16, justifyContent: 'center' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  signatureBadge: { backgroundColor: ui.accent, paddingHorizontal: 5, paddingVertical: 2, borderRadius: ui.radius.sm, marginRight: 6 },
  signatureText: { color: ui.fixedWhite, fontSize: 10, fontWeight: '700' },
  itemName: { fontSize: 16, fontWeight: '600', color: ui.text, lineHeight: 22 },
  itemDesc: { fontSize: 13, color: ui.textMuted, marginBottom: 8, lineHeight: 18 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: ui.text },
  itemRight: { position: 'relative' },
  itemImage: { width: 88, height: 88, borderRadius: ui.radius.lg, backgroundColor: ui.imageSurface },
  itemImagePlaceholder: { width: 88, height: 88, borderRadius: ui.radius.lg, backgroundColor: ui.imageSurface, alignItems: 'center', justifyContent: 'center' },
  itemMoreBtn: { position: 'absolute', top: -6, right: -6, zIndex: 10 },
  moreBtnCircle: { backgroundColor: ui.surface, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairlineSoft },
  addItemButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.hairlineSoft, backgroundColor: ui.surface },
  addItemText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: ui.blue },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, backgroundColor: ui.surface, borderRadius: ui.radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: ui.hairline },
  emptyText: { marginTop: 16, fontSize: 16, fontWeight: '600', color: ui.textMuted },
  actionSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  actionSheetCard: {
    marginHorizontal: 10,
    marginBottom: 10,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderRadius: ui.radius.xl,
    backgroundColor: ui.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
  },
  actionSheetHandle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: ui.hairline,
    marginBottom: 10,
  },
  actionSheetHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairlineSoft,
    marginBottom: 4,
  },
  actionSheetTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: ui.text,
    letterSpacing: -0.18,
  },
  actionSheetCloseButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  actionSheetRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairlineSoft,
  },
  actionSheetIconCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: ui.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairlineSoft,
  },
  actionSheetDangerIconCircle: {
    backgroundColor: ui.dangerSoft,
    borderColor: ui.dangerSoft,
  },
  actionSheetRowText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: ui.text,
  },
  actionSheetDangerText: {
    color: ui.danger,
  },
  actionSheetCancelButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ui.radius.lg,
    marginTop: 12,
    backgroundColor: ui.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairlineSoft,
  },
  actionSheetCancelText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: ui.textSecondary,
  },
});
