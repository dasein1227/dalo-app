// src/navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

/* tabs */
import MainTabs from './MainTabs';

/* system */
import SplashGate from '@/screens/system/SplashGate';
import NotFound from '@/screens/system/NotFound';
import Offline from '@/screens/system/Offline';
import PostLoginRouter from '@/screens/system/PostLoginRouter';

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

/* profile */
import ProfileView from '@/screens/profile/View';
import ProfileEdit from '@/screens/profile/Edit';
import PostDetail from '@/screens/profile/PostDetail';
import CreatePost from '@/screens/profile/CreatePost';

/* legal */
import TermsPrivacy from '@/screens/legal/TermsPrivacy';
import TermsConsent from '@/screens/legal/TermsConsent';

/* settings */
import SettingsHome from '@/screens/settings/Home';
import SettingsNotification from '@/screens/settings/Notification';
import SettingsPrivacy from '@/screens/settings/Privacy';
import AccountSettings from '@/screens/settings/AccountSettings';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#fff' },
};

export default function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        initialRouteName="SplashGate"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {/* system */}
        <Stack.Screen name="SplashGate" component={SplashGate} />
        <Stack.Screen name="Offline" component={Offline} />
        <Stack.Screen name="NotFound" component={NotFound} />
        <Stack.Screen name="PostLoginRouter" component={PostLoginRouter} />

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

        {/* profile */}
        <Stack.Screen name="ProfileView" component={ProfileView} />
        <Stack.Screen name="ProfileEdit" component={ProfileEdit} />
        <Stack.Screen name="PostDetail" component={PostDetail} />
        <Stack.Screen name="CreatePost" component={CreatePost} />

        {/* legal */}
        <Stack.Screen name="TermsPrivacy" component={TermsPrivacy} />
        <Stack.Screen name="TermsConsent" component={TermsConsent} />

        {/* settings */}
        <Stack.Screen name="SettingsHome" component={SettingsHome} />
        <Stack.Screen
          name="SettingsNotification"
          component={SettingsNotification}
        />
        <Stack.Screen name="SettingsPrivacy" component={SettingsPrivacy} />
        <Stack.Screen name="AccountSettings" component={AccountSettings} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
