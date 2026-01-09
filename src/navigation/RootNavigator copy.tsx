import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

/* tabs */
import MainTabs from './MainTabs';

/* system */
import SplashGate from '@/screens/system/SplashGate';
import NotFound from '@/screens/system/NotFound';
import Offline from '@/screens/system/Offline';
// ❌ 제거: PostLoginRouter import

/* auth */
import Login from '@/screens/auth/Login';
import PhoneVerification from '@/screens/auth/PhoneVerification';

/* beacons */
import CreateBeacon from '@/screens/beacons/Create';
import EditBeacon from '@/screens/beacons/Edit';
import MembersBeacon from '@/screens/beacons/Members';
import BeaconDetail from '@/screens/beacons/Detail';

/* map */
import MapMain from '@/screens/map/Main';
import MapPicker from '@/screens/map/Picker';

/* chat */
import ChatRoomsScreen from '@/screens/chat/List';
import Chat from '@/screens/chat/Chat';
import ChatGallery from '@/screens/chat/Gallery';
import ChatFiles from '@/screens/chat/Files';
import ChatInvite from '@/screens/chat/Invite';
import ChatManage from '@/screens/chat/Manage';
import Members from '@/screens/chat/Members';
import MediaViewer from '@/screens/chat/MediaViewer';
import ChatSetting from '@/screens/chat/Setting';

/* profile */
import ProfileView from '@/screens/profile/View';
import ProfileEdit from '@/screens/profile/Edit';
import PostDetail from '@/screens/profile/PostDetail';
import CreatePost from '@/screens/profile/CreatePost';
import EditPost from '@/screens/profile/EditPost';
import ProfileFollowList from '@/screens/profile/FollowList';

/* friends */
import AddFriendScreen from '@/screens/friends/Add';

/* legal */
import TermsPrivacy from '@/screens/legal/TermsPrivacy';
import TermsConsent from '@/screens/legal/TermsConsent';

/* settings */
import SettingsHome from '@/screens/settings/Home';
import SettingsNotification from '@/screens/settings/Notification';
import SettingsPrivacy from '@/screens/settings/Privacy';
import AccountSettings from '@/screens/settings/AccountSettings';
import ThemeSettings from '@/screens/settings/ThemeSettings';

/* business */
import BusinessRegister from '@/screens/business/BusinessRegister';
import BusinessUnregister from '@/screens/business/BusinessUnregister';
import BusinessCreate from '@/screens/business/Create';
import BusinessDetail from '@/screens/business/Detail';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * ✅ 여기 색이 "투명 Status/NavBar 뒤에 비칠" 전역 바탕색이다.
 * App.tsx의 APP_BASE_BG 와 반드시 동일하게 맞춰라.
 */
const APP_BASE_BG = '#0B1220';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: APP_BASE_BG, // ✅ 절대 #fff로 두면 안됨
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="SplashGate"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          ...(Platform.OS === 'android'
            ? {
                statusBarTranslucent: true,
                statusBarColor: 'transparent',
                statusBarStyle: 'light',
                navigationBarColor: 'transparent',
              }
            : null),
        }}
      >
        {/* system */}
        <Stack.Screen name="SplashGate" component={SplashGate} />
        <Stack.Screen name="Offline" component={Offline} />
        <Stack.Screen name="NotFound" component={NotFound} />
        {/* ❌ 제거: <Stack.Screen name="PostLoginRouter" ... /> */}

        {/* auth */}
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="PhoneVerification" component={PhoneVerification} />

        {/* tabs root */}
        <Stack.Screen name="MainTabs" component={MainTabs} />

        {/* map */}
        <Stack.Screen name="MapMain" component={MapMain} />
        <Stack.Screen name="MapPicker" component={MapPicker} />

        {/* beacons */}
        <Stack.Screen name="CreateBeacon" component={CreateBeacon} />
        <Stack.Screen name="EditBeacon" component={EditBeacon} />
        <Stack.Screen name="MembersBeacon" component={MembersBeacon} />
        <Stack.Screen name="BeaconDetail" component={BeaconDetail} />

        {/* chat */}
        <Stack.Screen name="ChatList" component={ChatRoomsScreen} />
        <Stack.Screen name="Chat" component={Chat} />
        <Stack.Screen name="ChatGallery" component={ChatGallery} />
        <Stack.Screen name="ChatFiles" component={ChatFiles} />
        <Stack.Screen name="ChatInvite" component={ChatInvite} />
        <Stack.Screen name="ChatManage" component={ChatManage} />
        <Stack.Screen name="ChatMembers" component={Members} />
        <Stack.Screen name="MediaViewer" component={MediaViewer} />
        <Stack.Screen
          name="ChatSetting"
          component={ChatSetting}
          options={{ headerShown: false }}
        />

        {/* profile */}
        <Stack.Screen name="ProfileView" component={ProfileView} />
        <Stack.Screen name="ProfileEdit" component={ProfileEdit} />
        <Stack.Screen name="PostDetail" component={PostDetail} />
        <Stack.Screen name="CreatePost" component={CreatePost} />
        <Stack.Screen name="EditPost" component={EditPost} />
        <Stack.Screen name="ProfileFollowList" component={ProfileFollowList} />

        {/* friends */}
        <Stack.Screen name="FriendAdd" component={AddFriendScreen} />

        {/* legal */}
        <Stack.Screen name="TermsPrivacy" component={TermsPrivacy} />
        <Stack.Screen name="TermsConsent" component={TermsConsent} />

        {/* settings */}
        <Stack.Screen name="SettingsHome" component={SettingsHome} />
        <Stack.Screen name="SettingsNotification" component={SettingsNotification} />
        <Stack.Screen name="SettingsPrivacy" component={SettingsPrivacy} />
        <Stack.Screen name="AccountSettings" component={AccountSettings} />
        <Stack.Screen
          name="ThemeSettings"
          component={ThemeSettings}
          options={{ headerShown: false }}
        />

        {/* business */}
        <Stack.Screen name="BusinessRegister" component={BusinessRegister} />
        <Stack.Screen name="BusinessUnregister" component={BusinessUnregister} />
        <Stack.Screen name="BusinessCreate" component={BusinessCreate} />
        <Stack.Screen name="BusinessDetail" component={BusinessDetail} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
