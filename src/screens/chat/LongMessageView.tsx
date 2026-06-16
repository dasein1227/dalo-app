import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Share2 } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '@/theme/useAppTheme';

type LongMessageMode = 'original' | 'translated';

type LongMessageRouteParams = {
  title?: string | null;
  senderName?: string | null;
  content?: string | null;
  originalText?: string | null;
  translatedText?: string | null;
  initialMode?: LongMessageMode | 'content';
};

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export default function LongMessageView() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const params = (route.params ?? {}) as LongMessageRouteParams;

  const content = cleanText(params.content);
  const originalText = cleanText(params.originalText) || content;
  const translatedText = cleanText(params.translatedText);
  const senderName = cleanText(params.senderName) || cleanText(params.title) || t('chat:longMessage.message');

  const availableModes = useMemo(() => {
    const modes: Array<{ key: LongMessageMode; label: string; text: string }> = [];

    if (translatedText) {
      modes.push({ key: 'translated', label: t('chat:longMessage.translation'), text: translatedText });
    }

    if (originalText && originalText !== translatedText) {
      modes.push({ key: 'original', label: t('chat:longMessage.original'), text: originalText });
    }

    if (!modes.length) {
      modes.push({ key: 'original', label: t('chat:longMessage.original'), text: content });
    }

    return modes;
  }, [content, originalText, t, translatedText]);

  const initialKey = useMemo<LongMessageMode>(() => {
    const requested = params.initialMode === 'translated' || params.initialMode === 'original'
      ? params.initialMode
      : undefined;

    if (requested && availableModes.some((mode) => mode.key === requested)) {
      return requested;
    }

    if (availableModes.some((mode) => mode.key === 'translated')) {
      return 'translated';
    }

    return availableModes[0]?.key ?? 'original';
  }, [availableModes, params.initialMode]);

  const [modeKey, setModeKey] = useState<LongMessageMode>(initialKey);
  const selected = availableModes.find((mode) => mode.key === modeKey) ?? availableModes[0];
  const readableText = selected?.text ?? '';

  const themeColors = appTheme.colors as any;

  const colors = {
    background: themeColors?.background ?? '#FFFFFF',
    surface: themeColors?.surface ?? '#FFFFFF',
    text: themeColors?.textPrimary ?? themeColors?.foreground ?? '#111111',
    subtext: themeColors?.textSecondary ?? themeColors?.textTertiary ?? '#6F737A',
    border: themeColors?.border ?? 'rgba(0,0,0,0.08)',
    chip: themeColors?.surfaceSubtle ?? themeColors?.backgroundGrouped ?? 'rgba(0,0,0,0.055)',
  };

  const handleShare = async () => {
    if (!readableText) return;
    try {
      await Share.share({ message: readableText });
    } catch {}
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerButton}>
          <ChevronLeft size={25} color={colors.text} strokeWidth={2.25} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {senderName}
        </Text>

        <View style={styles.headerRight}>
          {availableModes.length > 1 ? (
            <View style={[styles.modePill, { backgroundColor: colors.chip }]}> 
              {availableModes.map((mode) => {
                const active = mode.key === modeKey;
                return (
                  <Pressable
                    key={mode.key}
                    onPress={() => setModeKey(mode.key)}
                    hitSlop={6}
                    style={[
                      styles.modeItem,
                      active && { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.modeText, { color: active ? colors.text : colors.subtext }]}> 
                      {mode.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable onPress={handleShare} hitSlop={12} style={styles.headerButton}>
            <Share2 size={20} color={colors.text} strokeWidth={2.05} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.bodyText, { color: colors.text }]} selectable>
          {readableText}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginLeft: 2,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modePill: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 2,
    gap: 1,
  },
  modeItem: {
    minWidth: 42,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  modeText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 44,
  },
  bodyText: {
    fontSize: 18,
    lineHeight: 31,
    fontWeight: '400',
    letterSpacing: -0.25,
  },
});
