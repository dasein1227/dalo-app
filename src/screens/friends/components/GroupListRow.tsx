import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/theme/useAppTheme';
import {
  createGroupListRowTheme,
  type GroupListRowTheme,
} from './GroupListRow.theme';

export type GroupPreviewMember = {
  user_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
};

type Props = {
  name: string;
  memberCount: number;
  previewMembers?: GroupPreviewMember[];
  isFavorite?: boolean;
  selected?: boolean;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  rightSlot?: React.ReactNode;
};

const AVATAR_SIZE = 50;

function initial(name?: string | null) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

type GroupListRowStyleSheet = ReturnType<typeof createStyles>;

function AvatarTile({
  member,
  size,
  radius,
  ui,
  styles,
}: {
  member?: GroupPreviewMember;
  size: number;
  radius: number;
  ui: GroupListRowTheme;
  styles: GroupListRowStyleSheet;
}) {
  if (member?.avatar_url) {
    return (
      <Image
        source={{ uri: member.avatar_url }}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={size >= 32 ? styles.avatarInitial : styles.stackInitial}>
        {initial(member?.nickname)}
      </Text>
    </View>
  );
}

function GroupAvatar({
  members,
  ui,
  styles,
}: {
  members: GroupPreviewMember[];
  ui: GroupListRowTheme;
  styles: GroupListRowStyleSheet;
}) {
  const count = Math.min(members.length, 4);

  if (count === 0) {
    return (
      <View style={[styles.avatar, styles.emptyAvatar]}>
        <Users size={20} color={ui.colors.avatarIcon} strokeWidth={1.9} />
      </View>
    );
  }

  if (count === 1) {
    return (
      <View style={styles.avatarClip}>
        <AvatarTile
          member={members[0]}
          size={AVATAR_SIZE}
          radius={ui.radius.avatar}
          ui={ui}
          styles={styles}
        />
      </View>
    );
  }

  return (
    <View style={styles.groupContainer}>
      {members.slice(0, 4).map((member, index) => {
        let size = 0;
        let pos: Record<string, number | string> = {};

        if (count === 2) {
          size = 32;
          if (index === 0) pos = { top: 0, left: 0, zIndex: 1 };
          if (index === 1) pos = { bottom: 0, right: 0, zIndex: 0 };
        } else if (count === 3) {
          if (index === 0) {
            size = 32;
            pos = { top: 0, left: '50%', marginLeft: -16 };
          }
          if (index === 1) {
            size = 26;
            pos = { bottom: 0, left: 0 };
          }
          if (index === 2) {
            size = 26;
            pos = { bottom: 0, right: 0 };
          }
        } else {
          size = 22;
          pos = {
            top: index < 2 ? 0 : 'auto',
            bottom: index >= 2 ? 0 : 'auto',
            left: index % 2 === 0 ? 0 : 'auto',
            right: index % 2 !== 0 ? 0 : 'auto',
          };
        }

        return (
          <View
            key={member.user_id || `${index}`}
            style={[
              styles.groupItem,
              { width: size, height: size, borderRadius: size / 2 },
              pos,
            ]}
          >
            <AvatarTile
              member={member}
              size={size}
              radius={size / 2}
              ui={ui}
              styles={styles}
            />
          </View>
        );
      })}
    </View>
  );
}

export default function GroupListRow({
  name,
  memberCount,
  previewMembers,
  selected = false,
  subtitle,
  onPress,
  onLongPress,
  rightSlot,
}: Props) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createGroupListRowTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const members = previewMembers ?? [];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
    >
      <View style={styles.left}>
        <View style={styles.avatarWrap}>
          <GroupAvatar members={members} ui={ui} styles={styles} />
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle ?? t('friends:group.memberCount', { count: memberCount })}
          </Text>
        </View>
      </View>

      <View style={styles.rightSlot}>{rightSlot ?? null}</View>
    </Pressable>
  );
}

function createStyles(ui: GroupListRowTheme) {
  return StyleSheet.create({
    row: {
      minHeight: 74,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: ui.colors.rowBackground,
    },
    rowSelected: {
      backgroundColor: ui.colors.rowSelectedBackground,
    },
    rowPressed: {
      backgroundColor: ui.colors.rowPressedBackground,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      paddingRight: 8,
    },
    avatarWrap: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      marginRight: 12,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: ui.radius.avatar,
      borderWidth: ui.borderWidth.avatar,
      borderColor: ui.colors.avatarBorder,
      backgroundColor: ui.colors.avatarBackground,
    },
    avatarClip: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: ui.radius.avatar,
      overflow: 'hidden',
      borderWidth: ui.borderWidth.avatar,
      borderColor: ui.colors.avatarBorder,
      backgroundColor: ui.colors.avatarBackground,
    },
    emptyAvatar: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupContainer: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      position: 'relative',
    },
    groupItem: {
      position: 'absolute',
      borderWidth: ui.borderWidth.groupAvatarItem,
      borderColor: ui.colors.groupAvatarItemBorder,
      backgroundColor: ui.colors.groupAvatarItemBackground,
      overflow: 'hidden',
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.avatarBackground,
    },
    avatarInitial: {
      fontWeight: ui.fontWeight.avatarFallback,
      fontSize: 18,
      color: ui.colors.avatarFallbackText,
    },
    stackInitial: {
      fontWeight: ui.fontWeight.stackFallback,
      fontSize: 10,
      color: ui.colors.avatarFallbackText,
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: ui.fontWeight.title,
      lineHeight: 21,
      color: ui.colors.titleText,
    },
    sub: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: ui.fontWeight.subtitle,
      lineHeight: 18,
      color: ui.colors.subtitleText,
    },
    rightSlot: {
      minWidth: 96,
      alignItems: 'flex-end',
      justifyContent: 'center',
      marginLeft: 8,
    },
  });
}
