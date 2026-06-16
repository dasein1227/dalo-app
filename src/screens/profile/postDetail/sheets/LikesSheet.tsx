import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDisplayName, getInitialFromName } from '../helpers';
import type { PostDetailStyles } from '../styles';
import type { PostLikeUserRow, TranslateFn } from '../types';

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

export function LikesSheet({
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
      <Pressable style={styles.backdrop} onPress={onClose} />

      <SafeAreaView style={localStyles.sheetWrap} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <View style={[localStyles.sheetInner, { maxHeight: '85%', minHeight: '30%' }]}>
          <View style={styles.likesHeaderRow}>
            <Text style={styles.likesHeaderTitle}>{t('post.likes.title')}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.likesHeaderClose}>{t('common.close')}</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.likesEmptyBox}>
              <ActivityIndicator />
            </View>
          ) : users.length === 0 ? (
            <View style={styles.likesEmptyBox}>
              <Text style={{ color: '#6b7280' }}>{t('post.likes.empty')}</Text>
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
                        <Image
                          source={{ uri: avatar }}
                          style={styles.likeUserAvatar}
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={[styles.likeUserAvatar, styles.avatarFallback]}>
                          <Text style={styles.avatarFallbackTxt}>{initial}</Text>
                        </View>
                      )}
                      <Text style={styles.likeUserName}>{name}</Text>
                    </Pressable>

                    {!isMe && (
                      <Pressable
                        style={styles.likeUserActionBtn}
                        onPress={() =>
                          Alert.alert(
                            t('common.preparing'),
                            t('post.likes.follow_chat_soon'),
                          )
                        }
                      >
                        <Text style={styles.likeUserActionTxt}>{t('post.likes.follow')}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sheetInner: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 10,
  },
});
