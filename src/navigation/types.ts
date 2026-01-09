export type RootStackParamList = {
  // 시스템
  SplashGate: undefined;
  Offline: undefined;
  NotFound: undefined;
  PostLoginRouter: undefined;

  // 인증
  Login: undefined;
  PhoneVerification: undefined;

  // 탭 루트
  MainTabs: undefined;

  // 지도
  MapMain: undefined;
  MapPicker:
    | {
        roomId?: number;
        onPick?: ({ lat, lng }: { lat: number; lng: number }) => void;
        lat?: number;
        lng?: number;
      }
    | undefined;

  // 비콘
  CreateBeacon: undefined;
  EditBeacon: { id: number } | undefined;
  MembersBeacon: { id: number } | undefined;
  MyBeaconRooms: undefined;
  BeaconDetail: { beaconId: number } | undefined;

  // 채팅
  ChatList:
    | {
        mode?: 'personal' | 'group' | 'open' | 'beacon';
      }
    | undefined;
  Chat: { roomId: number } | undefined;
  ChatGallery: { roomId: number } | undefined;
  ChatFiles: { roomId: number } | undefined;
  ChatInvite: { roomId: number } | undefined;
  ChatManage: { roomId: number } | undefined;
  ChatMembers: { roomId: number } | undefined;
  MediaViewer: { uri: string } | undefined;
  ChatSetting:
  | {
      roomId: string;
      roomName?: string;

      memo?: string;
      maleCount?: number;
      femaleCount?: number;
      mixedCount?: number;
      totalCount?: number | null;

      publicGender?: 'all' | 'male' | 'female';
      minAge?: number | null;
      maxAge?: number | null;
    }
  | undefined;

  // 프로필
  ProfileView:
    | {
        user_id: string;
        isMe?: boolean;
        isBeacon?: boolean;
        isPrivateBeacon?: boolean;
      }
    | undefined;
  ProfileEdit: undefined;

  // 게시물
  PostDetail: { postId: string; user_id?: string };
  CreatePost: undefined;

  /** ✅ 추가 */
  EditPost: { postId: string };

  /** ✅ 팔로우 리스트 (팔로잉/팔로워/요청 탭) */
  ProfileFollowList: undefined;

  // 친구
  FriendAdd: undefined;

  // 법무
  TermsPrivacy: undefined;
  TermsConsent: undefined;

  // 설정
  SettingsHome: undefined;
  SettingsNotification: undefined;
  SettingsPrivacy: undefined;
  AccountSettings: {user_id: string; isMe?: boolean; };
  ThemeSettings: undefined;

  // 비즈니스
  BusinessRegister: undefined;
  BusinessUnregister: undefined;
  BusinessCreate: undefined;
  BusinessDetail: { businessId: string };
};
