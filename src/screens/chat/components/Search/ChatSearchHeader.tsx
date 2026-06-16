// src/screens/chat/components/Search/ChatSearchHeader.tsx
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Pressable } from 'react-native';
import { X, ChevronLeft } from 'lucide-react-native';

import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

import {
  CHAT_SEARCH_CONTROLS_METRICS,
  chatSearchControlStyles as styles,
  createChatSearchControlsTheme,
} from './ChatSearchControls.theme';

type SelectedMember = {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
} | null;

type Props = {
  theme: ChatTheme;
  insetsTop: number;

  selectedMember: SelectedMember;

  q: string;
  onChangeQ: (v: string) => void;

  onClose: () => void;
  onClearQ: () => void;
  onRemoveMember: () => void;
};

export default function ChatSearchHeader({
  theme,
  insetsTop,
  selectedMember,
  q,
  onChangeQ,
  onClose,
  onClearQ,
  onRemoveMember,
}: Props) {
  const { t } = useTranslation();
  const ui = useMemo(() => createChatSearchControlsTheme(theme), [theme]);

  return (
    <View
      style={[
        styles.headerWrap,
        {
          backgroundColor: ui.headerBg,
          borderBottomColor: ui.borderSoft,
          paddingTop: Math.max(insetsTop, 0),
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={onClose}
          hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
          style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: ui.pressedOnHeader }]}
          accessibilityRole="button"
          accessibilityLabel={t('chat:search.close')}
        >
          <ChevronLeft
            size={CHAT_SEARCH_CONTROLS_METRICS.backIconSize}
            color={ui.text}
            strokeWidth={CHAT_SEARCH_CONTROLS_METRICS.backIconStroke}
          />
        </Pressable>

        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: ui.searchBg,
              borderColor: ui.border,
            },
          ]}
        >
          {!!selectedMember && (
            <View style={[styles.memberChip, { borderColor: ui.borderSoft }]}> 
              <Text style={[styles.chipName, { color: ui.text }]} numberOfLines={1} allowFontScaling={false}>
                {selectedMember.name}
              </Text>

              <Pressable
                onPress={onRemoveMember}
                hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
                style={({ pressed }) => [styles.chipCloseButton, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={t('chat:search.clearSender')}
              >
                <X
                  size={16}
                  color={ui.clearIcon}
                  strokeWidth={CHAT_SEARCH_CONTROLS_METRICS.actionIconStroke}
                />
              </Pressable>
            </View>
          )}

          <TextInput
            value={q}
            onChangeText={onChangeQ}
            placeholder={t('chat:search.placeholder')}
            placeholderTextColor={ui.placeholder}
            style={[styles.input, { color: ui.text }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
            autoFocus
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('chat:search.inputAccessibility')}
          />

          {!!q?.trim() && (
            <Pressable
              onPress={onClearQ}
              hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.65 }]}
              accessibilityRole="button"
              accessibilityLabel={t('chat:search.clearKeyword')}
            >
              <View style={[styles.clearButtonInner, { backgroundColor: ui.clearBg }]}> 
                <X
                  size={14}
                  color={ui.text}
                  strokeWidth={CHAT_SEARCH_CONTROLS_METRICS.actionIconStroke}
                />
              </View>
            </Pressable>
          )}
        </View>

        <View style={styles.rightSpacer} />
      </View>
    </View>
  );
}
