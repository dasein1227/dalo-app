import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { getDisplayName, getInitialFromName } from '../../profile/postDetail/helpers';
import type { PostDetailStyles } from '../../profile/postDetail/styles';
import type { PostLikeUserRow, TranslateFn } from '../../profile/postDetail/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  users: PostLikeUserRow[];
  myId: string | null;
  onPressProfile: (userId: string) => void;
  t: TranslateFn;
  styles: PostDetailStyles;
};

export function CollectionLikesSheet({
  visible,
  onClose,
  loading,
  users,
  myId,
  onPressProfile,
  t,
  styles,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={local.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.commentSheet, local.sheet]}>
          <View style={styles.sheetHandle} />
          <View style={styles.likesHeaderRow}>
            <Text style={styles.likesHeaderTitle}>{t('post:likes.title')}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.likesHeaderClose}>{t('common:close')}</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.likesEmptyBox}>
              <ActivityIndicator />
            </View>
          ) : users.length === 0 ? (
            <View style={styles.likesEmptyBox}>
              <Text style={{ color: '#6b7280' }}>{t('post:likes.empty')}</Text>
            </View>
          ) : (
            <ScrollView>
              {users.map((user) => {
                const name = getDisplayName(t, false, user.profiles);
                const avatar = user.profiles?.avatar_url ?? null;
                const initial = getInitialFromName(name);
                const isMe = !!myId && user.user_id === myId;

                return (
                  <View key={user.user_id} style={styles.likeUserRow}>
                    <Pressable style={styles.likeUserInfo} onPress={() => onPressProfile(user.user_id)}>
                      {avatar ? (
                        <Image source={{ uri: avatar }} style={styles.likeUserAvatar} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[styles.likeUserAvatar, styles.avatarFallback]}>
                          <Text style={styles.avatarFallbackTxt}>{initial}</Text>
                        </View>
                      )}
                      <Text style={styles.likeUserName}>{name}</Text>
                    </Pressable>

                    {!isMe ? (
                      <View style={styles.likeUserActionBtn}>
                        <Text style={styles.likeUserActionTxt}>{t('post:likes.follow')}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { minHeight: '30%' },
});
