// src/screens/business/components/MenuTab.tsx
import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { styles } from './bizStyles';
import { SectionHeader } from './SectionHeader';
import type {
  BusinessMenu,
  BusinessMenuItem,
  MenuItemsByMenuId,
} from './businessTypes';

type Props = {
  menus: BusinessMenu[];
  filteredMenus: BusinessMenu[];
  menuItemsByMenuId: MenuItemsByMenuId;
  menuCategories: string[];
  activeMenuCategory: string;
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

export const MenuTab: React.FC<Props> = ({
  menus,
  filteredMenus,
  menuItemsByMenuId,
  menuCategories,
  activeMenuCategory,
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
  return (
    <View style={styles.tabContent}>
      {/* 메뉴판 추가 */}
      <View style={styles.card}>
        <SectionHeader title="메뉴판 추가" />
        <View style={styles.menuCreateRow}>
          <TextInput
            style={styles.menuBoardInput}
            value={newMenuTitle}
            onChangeText={onChangeNewMenuTitle}
            placeholder="메뉴판 이름 (예: 메인 메뉴, 런치 세트)"
          />
          <TextInput
            style={styles.menuBoardInput}
            value={newMenuCategory}
            onChangeText={onChangeNewMenuCategory}
            placeholder="카테고리 (예: 전체, 한식, 일식)"
          />
          <Pressable
            style={styles.menuCreateButton}
            onPress={onCreateMenuBoard}
            disabled={creatingMenu}
          >
            {creatingMenu ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.menuCreateButtonText}>추가</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* 카테고리 탭 */}
      {menus.length > 0 && (
        <View style={styles.card}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.menuCategoryTabs}
          >
            {menuCategories.map((cat) => {
              const active = activeMenuCategory === cat;
              return (
                <Pressable
                  key={cat}
                  style={[
                    styles.menuCategoryChip,
                    active && styles.menuCategoryChipActive,
                  ]}
                  onPress={() => onChangeMenuCategory(cat)}
                >
                  <Text
                    style={[
                      styles.menuCategoryChipText,
                      active && styles.menuCategoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 실제 메뉴 리스트 */}
      {filteredMenus.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.mutedText}>등록된 메뉴판이 아직 없습니다.</Text>
        </View>
      ) : (
        filteredMenus.map((menu) => {
          const items = menuItemsByMenuId[menu.id] ?? [];
          return (
            <View key={menu.id} style={styles.card}>
              <View style={styles.menuBoardHeader}>
                <Text style={styles.menuBoardTitle}>{menu.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {menu.category ? (
                    <Text style={styles.menuBoardCategory}>{menu.category}</Text>
                  ) : null}
                  <Pressable onPress={() => onEditMenuBoard(menu)} hitSlop={8}>
                    <Text style={{ fontSize: 12, color: '#4B5563' }}>수정</Text>
                  </Pressable>
                  <Pressable onPress={() => onDeleteMenuBoard(menu.id)} hitSlop={8}>
                    <Text style={{ fontSize: 12, color: '#EF4444' }}>삭제</Text>
                  </Pressable>
                </View>
              </View>

              {/* 메뉴판 설명 */}
              {menu.description ? (
                <Text style={styles.menuBoardDescription}>{menu.description}</Text>
              ) : null}

              {/* 메뉴 추가 버튼 */}
              <Pressable
                style={styles.menuAddButton}
                onPress={() => onOpenMenuItemModal(menu.id)}
              >
                <Text style={styles.menuAddButtonText}>메뉴 추가</Text>
              </Pressable>

              {/* 메뉴 아이템 목록 */}
              {items.length === 0 ? (
                <Text style={[styles.mutedText, { marginTop: 8 }]}>
                  이 메뉴판에 등록된 메뉴가 없습니다.
                </Text>
              ) : (
                items.map((item) => {
                  const hasImage = !!item.image_url;

                  return (
                    <Pressable
                      key={item.id}
                      style={styles.menuItemCard}
                      onPress={() => onOpenMenuPreview(menu, item)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.menuItemTitleRow}>
                          {item.is_signature && (
                            <View style={styles.menuBadge}>
                              <Text style={styles.menuBadgeText}>대표</Text>
                            </View>
                          )}
                          <Text style={styles.menuItemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                        </View>

                        {item.description ? (
                          <Text style={styles.menuItemDesc} numberOfLines={2}>
                            {item.description}
                          </Text>
                        ) : null}

                        {typeof item.price === 'number' && (
                          <Text style={styles.menuItemPrice}>
                            {item.price.toLocaleString()}원
                          </Text>
                        )}

                        {/* 하단 액션: 수정 / 삭제 */}
                        <View
                          style={{
                            flexDirection: 'row',
                            marginTop: 6,
                            alignItems: 'center',
                          }}
                        >
                          <Pressable
                            onPress={() => onOpenMenuItemModal(menu.id, item)}
                            hitSlop={8}
                          >
                            <Text style={{ fontSize: 12, color: '#4B5563' }}>
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
                            onPress={() => onDeleteMenuItem(menu.id, item.id)}
                            hitSlop={8}
                          >
                            <Text style={{ fontSize: 12, color: '#EF4444' }}>
                              삭제
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {hasImage && (
                        <View style={styles.menuItemImageWrapper}>
                          <Image
                            source={{ uri: item.image_url! }}
                            style={styles.menuItemImage}
                            resizeMode="cover"
                          />
                        </View>
                      )}
                    </Pressable>
                  );
                })
              )}
            </View>
          );
        })
      )}
    </View>
  );
};
