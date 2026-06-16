import React from "react";
import { Platform } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import {
  NavigationContainer,
  type LinkingOptions,
  getStateFromPath as getDefaultStateFromPath,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAppTheme } from "@/theme/useAppTheme";
import { createRootNavigationTheme } from "./RootNavigator.theme";
import {
  navigationRef,
  flushPendingPushNavigation,
} from "@/navigation/navigationRef";

import MainTabs from "./MainTabs";
import NearNews from "@/screens/home/NearNews";
import Notifications from "@/screens/notifications/Notifications";

import SplashGate from "@/screens/system/SplashGate";
import NotFound from "@/screens/system/NotFound";
import Offline from "@/screens/system/Offline";

import Login from "@/screens/auth/Login";
import PhoneVerification from "@/screens/auth/PhoneVerification";
import ProfileSetup from "@/screens/auth/ProfileSetup";

import CreateBeacon from "@/screens/beacons/Create";
import EditBeacon from "@/screens/beacons/Edit";
import MembersBeacon from "@/screens/beacons/Members";
import BeaconDetail from "@/screens/beacons/Detail";

import MapMain from "@/screens/map/Main";
import LocationPicker from "@/components/map/LocationPicker";

import ChatRoomsScreen from "@/screens/chat/List";
import Chat from "@/screens/chat/Chat";
import ChatCollection from "@/screens/chat/Collection";
import LongMessageView from "@/screens/chat/LongMessageView";
import ChatInvite from "@/screens/chat/Invite";
import ChatScheduleDetail from "@/screens/chat/schedule/ChatScheduleDetail";
import ChatScheduleEditor from "@/screens/chat/schedule/ChatScheduleEditor";

import ChatMenuScreen from "@/screens/chat/ChatMenu";
import ChatSettingScreen from "@/screens/chat/ChatSetting";
import ChatRoomEdit from "@/screens/chat/ChatRoomEdit";
import ChatRoomGate from "@/screens/chat/ChatRoomGate";
import OpenChatProfileEdit from "@/screens/chat/OpenChatProfileEdit";
import OpenChatProfileViewer from "@/screens/chat/OpenChatProfileViewer";
import ChatRoomDataScreen from "@/screens/chat/ChatRoomData";

import MediaViewer from "@/components/MediaViewer";

import ProfileView from "@/screens/profile/View";
import ProfileEdit from "@/screens/profile/Edit";
import PostDetail from "@/screens/profile/postDetail";
import CreatePost from "@/screens/profile/CreatePost";
import EditPost from "@/screens/profile/EditPost";
import PostCollectionViewer from "@/screens/collection/PostCollectionViewer";

import FriendsListScreen from "@/screens/friends/List";
import FriendGroupsScreen from "@/screens/friends/Groups";
import FriendGroupMembersScreen from "@/screens/friends/GroupMembers";
import FriendEditScreen from "@/screens/friends/Edit";
import AddFriendScreen from "@/screens/friends/Add";

import ReportReasonList from "@/screens/report/ReasonList";
import ReportReasonDetail from "@/screens/report/ReasonDetail";
import ReportGuide from "@/screens/report/Guide";
import ReportDone from "@/screens/report/Done";

import TermsConsent from "@/screens/legal/TermsConsent";

import SettingsHome from "@/screens/settings/Home";
import SettingsNotification from "@/screens/settings/Notification";
import SettingsPrivacy from "@/screens/settings/Privacy";
import AccountSettings from "@/screens/settings/AccountSettings";
import PersonalityType from "@/screens/settings/PersonalityType";
import ThemeSettings from "@/screens/settings/ThemeSettings";
import DataStorageCenter from "@/screens/settings/DataStorageCenter";
import SettingsLabs from "@/screens/settings/Labs";
import OpenProfileList from "@/screens/settings/openProfiles/List";

import CustomerCenterHome from "@/screens/settings/support/CustomerCenterHome";
import CustomerCenterList from "@/screens/settings/support/CustomerCenterList";
import CustomerCenterDetail from "@/screens/settings/support/CustomerCenterDetail";
import PolicyViewer from "@/screens/settings/support/PolicyViewer";
import NoticeList from "@/screens/settings/support/NoticeList";
import ContactForm from "@/screens/settings/support/ContactForm";

import BusinessRegister from "@/screens/business/BusinessRegister";
import BusinessUnregister from "@/screens/business/BusinessUnregister";
import BusinessCreate from "@/screens/business/Create";
import BusinessDetail from "@/screens/business/Detail";
import MyBusinessList from "@/screens/business/MyBusinessList";
import BusinessManager from "@/screens/business/BusinessManager";
import BusinessEvents from "@/screens/business/BusinessEvents";

const Stack = createNativeStackNavigator();

const ChatCollectionScreen = ChatCollection as React.ComponentType<any>;
const ChatScheduleDetailScreen = ChatScheduleDetail as React.ComponentType<any>;
const ChatScheduleEditorScreen = ChatScheduleEditor as React.ComponentType<any>;

function decodePathPart(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeQueryValue(value: string | null | undefined): string {
  return decodePathPart(value).trim();
}

function splitIncomingPath(path: string) {
  const source = String(path ?? "").trim();
  const queryStart = source.indexOf("?");
  const rawPath = queryStart >= 0 ? source.slice(0, queryStart) : source;
  const rawQuery = queryStart >= 0 ? source.slice(queryStart + 1) : "";
  const cleanPath = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const segments = cleanPath
    .split("/")
    .map((segment) => decodePathPart(segment))
    .filter(Boolean);

  return { rawQuery, segments };
}

function readQueryParam(rawQuery: string, keys: string[]): string {
  if (!rawQuery) return "";

  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const pairs = rawQuery.split("&");

  for (const pair of pairs) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : "";
    const key = decodePathPart(rawKey).toLowerCase();
    if (!wanted.has(key)) continue;
    return normalizeQueryValue(rawValue.replace(/\+/g, " "));
  }

  return "";
}

function compactQuery(rawQuery: string, omitKeys: string[] = []): string {
  if (!rawQuery) return "";

  const omit = new Set(omitKeys.map((key) => key.toLowerCase()));
  return rawQuery
    .split("&")
    .filter((pair) => {
      if (!pair) return false;
      const eq = pair.indexOf("=");
      const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
      const key = decodePathPart(rawKey).toLowerCase();
      return !omit.has(key);
    })
    .join("&");
}

function appendQuery(pathname: string, rawQuery: string): string {
  const query = rawQuery.trim();
  return query ? `${pathname}?${query}` : pathname;
}

function encodeRoutePart(value: string | number): string {
  return encodeURIComponent(String(value));
}

function buildFriendListPath(rawQuery: string): string {
  const query = compactQuery(rawQuery, ["initialTab"]);
  const hasSource = Boolean(readQueryParam(query, ["source"]));
  const nextQuery = hasSource
    ? query
    : query
      ? `source=push&${query}`
      : "source=push";
  return appendQuery("friends", nextQuery);
}

function buildQueryWithParams(
  rawQuery: string,
  params: Record<string, string | number | null | undefined>,
  omitKeys: string[] = [],
): string {
  const baseQuery = compactQuery(rawQuery, omitKeys).trim();
  const extraQuery = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return [extraQuery, baseQuery].filter(Boolean).join("&");
}

function buildFriendAddPath(rawQuery: string, rawUserId?: string): string {
  const userId = normalizeQueryValue(rawUserId ?? readQueryParam(rawQuery, ["userId", "user_id", "id"]));
  const query = buildQueryWithParams(
    rawQuery,
    {
      userId,
      source: readQueryParam(rawQuery, ["source"]) || "link",
    },
    ["userId", "user_id", "id", "source"],
  );

  return appendQuery("friends/add", query);
}

function normalizeIncomingDeepLinkPath(path: string): string {
  const { rawQuery, segments } = splitIncomingPath(path);
  if (!segments.length) return path;

  const first = String(segments[0] ?? "").toLowerCase();
  const second = String(segments[1] ?? "").toLowerCase();

  if (first === "auth" && second === "callback") {
    return appendQuery("login", rawQuery);
  }

  if (first === "notifications" || first === "notification" || first === "alarm") {
    return appendQuery("notifications", rawQuery);
  }

  const queryRoomId = readQueryParam(rawQuery, ["roomId", "room_id", "id"]);
  const queryPostId = readQueryParam(rawQuery, ["postId", "post_id", "id"]);
  const queryBeaconId = readQueryParam(rawQuery, [
    "beaconId",
    "beacon_id",
    "id",
  ]);
  const queryScheduleId = readQueryParam(rawQuery, [
    "scheduleId",
    "schedule_id",
    "id",
  ]);
  if (first === "chat") {
    const roomId = segments[1] || queryRoomId;
    if (roomId) {
      return appendQuery(
        `chat/${encodeRoutePart(roomId)}`,
        compactQuery(rawQuery, ["roomId", "room_id", "id"]),
      );
    }
    return appendQuery("chat", rawQuery);
  }
  if (first === "push" && second === "chat") {
    const roomId = segments[2] || queryRoomId;
    if (roomId) {
      return appendQuery(
        `chat/${encodeRoutePart(roomId)}`,
        compactQuery(rawQuery, ["roomId", "room_id", "id"]),
      );
    }
  }

  if (first === "add") {
    return buildFriendAddPath(rawQuery, segments[1] || readQueryParam(rawQuery, ["userId", "user_id", "id"]));
  }

  if (first === "friends" && second === "add") {
    return buildFriendAddPath(rawQuery, readQueryParam(rawQuery, ["userId", "user_id", "id"]));
  }

  if (first === "post") {
    const postId = segments[1] || queryPostId;
    if (postId) {
      return appendQuery(
        `post/${encodeRoutePart(postId)}`,
        compactQuery(rawQuery, ["postId", "post_id", "id"]),
      );
    }
  }

  if (first === "push" && second === "post") {
    const postId = segments[2] || queryPostId;
    if (postId) {
      return appendQuery(
        `post/${encodeRoutePart(postId)}`,
        compactQuery(rawQuery, ["postId", "post_id", "id"]),
      );
    }
  }

  if (first === "schedule") {
    const scheduleId = segments[1] || queryScheduleId;
    if (scheduleId) {
      return appendQuery(
        `schedule/${encodeRoutePart(scheduleId)}`,
        compactQuery(rawQuery, ["scheduleId", "schedule_id", "id"]),
      );
    }
  }

  if (first === "push" && second === "schedule") {
    const scheduleId = segments[2] || queryScheduleId;
    if (scheduleId) {
      return appendQuery(
        `schedule/${encodeRoutePart(scheduleId)}`,
        compactQuery(rawQuery, ["scheduleId", "schedule_id", "id"]),
      );
    }
  }

  if (first === "beacon") {
    const beaconId = segments[1] || queryBeaconId;
    const third = String(segments[2] ?? "").toLowerCase();
    if (beaconId && third === "members") {
      return appendQuery(
        `beacon/${encodeRoutePart(beaconId)}/members`,
        compactQuery(rawQuery, ["beaconId", "beacon_id", "id"]),
      );
    }
    if (beaconId) {
      return appendQuery(
        `beacon/${encodeRoutePart(beaconId)}`,
        compactQuery(rawQuery, ["beaconId", "beacon_id", "id"]),
      );
    }
  }

  if (first === "push" && second === "beacon") {
    const beaconId = segments[2] || queryBeaconId;
    const fourth = String(segments[3] ?? "").toLowerCase();
    if (beaconId && fourth === "members") {
      return appendQuery(
        `beacon/${encodeRoutePart(beaconId)}/members`,
        compactQuery(rawQuery, ["beaconId", "beacon_id", "id"]),
      );
    }
    if (beaconId) {
      return appendQuery(
        `beacon/${encodeRoutePart(beaconId)}`,
        compactQuery(rawQuery, ["beaconId", "beacon_id", "id"]),
      );
    }
  }
  if (first === "friends" && second === "requests") {
    return buildFriendListPath(rawQuery);
  }

  if (
    first === "push" &&
    second === "friends" &&
    String(segments[2] ?? "").toLowerCase() === "requests"
  ) {
    return buildFriendListPath(rawQuery);
  }

  return path;
}

const linking: LinkingOptions<any> = {
  prefixes: ["coonn://", "https://coonn.geniewise.net"],
  config: {
    screens: {
      SplashGate: "splash",
      Login: "login",
      ProfileSetup: "profile-setup",
      MainTabs: "main",
      NearNews: "near-news",
      Notifications: "notifications",
      BusinessEvents: "business/events",

      ChatList: "chat",
      Chat: {
        path: "chat/:roomId",
        parse: {
          roomId: (value: string) => Number(value),
          title: (value: string) => value,
          roomTitle: (value: string) => value,
          room_title: (value: string) => value,
          roomType: (value: string) => value,
          room_type: (value: string) => value,
          type: (value: string) => value,
          avatarUrl: (value: string) => value,
          avatar_url: (value: string) => value,
          peerAvatarUrl: (value: string) => value,
          peer_avatar_url: (value: string) => value,
          senderAvatarUrl: (value: string) => value,
          sender_avatar_url: (value: string) => value,
          roomAvatarUrl: (value: string) => value,
          room_avatar_url: (value: string) => value,
          coverImageUrl: (value: string) => value,
          cover_image_url: (value: string) => value,
          imageUrlPrimary: (value: string) => value,
          image_url_primary: (value: string) => value,
          themeOverride: (value: string) => value,
          theme_override: (value: string) => value,
          chatTheme: (value: string) => value,
          chatThemeKey: (value: string) => value,
          senderNickname: (value: string) => value,
          sender_nickname: (value: string) => value,
          notificationTitle: (value: string) => value,
          notification_title: (value: string) => value,
          source: (value: string) => value,
          beaconId: (value: string) => value,
        },
      },

      ChatRoomGate: {
        path: "chat/gate/:kind/:roomId",
        parse: {
          kind: (value: string) => value,
          roomId: (value: string) => Number(value),
        },
      },

      OpenChatProfileEdit: {
        path: "chat/open/:roomId/edit",
        parse: {
          roomId: (value: string) => Number(value),
        },
      },

      LongMessageView: "chat/long-message",

      ChatCollection: {
        path: "chat/:roomId/collection",
        parse: {
          roomId: (value: string) => Number(value),
          title: (value: string) => value,
          initialTab: (value: string) => value,
        },
      },

      ChatScheduleDetail: {
        path: "schedule/:scheduleId",
        parse: {
          scheduleId: (value: string) => String(value),
          roomId: (value: string) => Number(value),
          roomTitle: (value: string) => value,
        },
      },

      FriendList: "friends",
      FriendAdd: {
        path: "friends/add",
        parse: {
          userId: (value: string) => String(value),
          source: (value: string) => String(value),
        },
      },

      PostDetail: {
        path: "post/:postId",
        parse: {
          postId: (value: string) => String(value),
        },
      },

      MembersBeacon: {
        path: "beacon/:beaconId/members",
        parse: {
          beaconId: (value: string) => String(value),
        },
      },

      BeaconDetail: {
        path: "beacon/:beaconId",
        parse: {
          beaconId: (value: string) => String(value),
        },
      },

      NotFound: "*",
    },
  },
  getStateFromPath(path, options) {
    return getDefaultStateFromPath(
      normalizeIncomingDeepLinkPath(path),
      options,
    );
  },
};

export default function RootNavigator() {
  const appTheme = useAppTheme();
  const { colors, isDark } = appTheme;

  const navigationTheme = React.useMemo(
    () => createRootNavigationTheme(appTheme),
    [
      appTheme.mode,
      colors.background,
      colors.surface,
      colors.textPrimary,
      colors.border,
    ],
  );

  const stackContentStyle = React.useMemo(
    () => ({ backgroundColor: colors.background }),
    [colors.background],
  );

  const [currentRouteName, setCurrentRouteName] = React.useState<string | null>(null);

  const syncCurrentRouteName = React.useCallback(() => {
    setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? null);
  }, []);

  const handleNavigationReady = React.useCallback(() => {
    syncCurrentRouteName();
    flushPendingPushNavigation();
  }, [syncCurrentRouteName]);

  const systemBarStyle = currentRouteName === "OpenChatProfileViewer"
    ? "light"
    : isDark
      ? "light"
      : "dark";

  return (
    <>
      <SystemBars style={systemBarStyle} />
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavigationReady}
      onStateChange={syncCurrentRouteName}
      linking={linking}
      theme={navigationTheme}
    >
      <Stack.Navigator
        initialRouteName="SplashGate"
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          freezeOnBlur: true,
          contentStyle: stackContentStyle,
          statusBarStyle: isDark ? "light" : "dark",
          ...(Platform.OS === "android"
            ? {
                statusBarTranslucent: true,
                statusBarColor: "transparent",
                navigationBarColor: colors.background,
              }
            : null),
        }}
      >
        <Stack.Screen name="SplashGate" component={SplashGate} />
        <Stack.Screen name="Offline" component={Offline} />
        <Stack.Screen name="NotFound" component={NotFound} />

        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="PhoneVerification" component={PhoneVerification} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetup} />

        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="NearNews" component={NearNews} options={{ headerShown: false }} />
        <Stack.Screen name="Notifications" component={Notifications} />

        <Stack.Screen name="MapMain" component={MapMain} />
        <Stack.Screen name="LocationPicker" component={LocationPicker} />
        <Stack.Screen name="MapPicker" component={LocationPicker} />

        <Stack.Screen name="CreateBeacon" component={CreateBeacon} />
        <Stack.Screen name="EditBeacon" component={EditBeacon} />
        <Stack.Screen name="MembersBeacon" component={MembersBeacon} />
        <Stack.Screen name="BeaconDetail" component={BeaconDetail} />

        <Stack.Screen name="ChatList" component={ChatRoomsScreen} />
        <Stack.Screen name="Chat" component={Chat} />
        <Stack.Screen name="ChatCollection" component={ChatCollectionScreen} />
        <Stack.Screen
          name="ChatScheduleDetail"
          component={ChatScheduleDetailScreen}
        />
        <Stack.Screen
          name="ChatScheduleEditor"
          component={ChatScheduleEditorScreen}
        />
        <Stack.Screen name="LongMessageView" component={LongMessageView} />
        <Stack.Screen name="ChatInvite" component={ChatInvite} />

        <Stack.Screen name="ChatMenu" component={ChatMenuScreen} />
        <Stack.Screen name="ChatSetting" component={ChatSettingScreen} />
        <Stack.Screen name="ChatRoomEdit" component={ChatRoomEdit} />
        <Stack.Screen name="ChatRoomGate" component={ChatRoomGate} />
        <Stack.Screen
          name="OpenChatProfileViewer"
          component={OpenChatProfileViewer}
          options={{
            contentStyle: { backgroundColor: "#000000" },
            statusBarStyle: "light",
            ...(Platform.OS === "android"
              ? {
                  statusBarTranslucent: true,
                  statusBarColor: "transparent",
                  navigationBarColor: "#000000",
                }
              : null),
          }}
        />
        <Stack.Screen
          name="OpenChatProfileEdit"
          component={OpenChatProfileEdit}
        />
        <Stack.Screen name="ChatRoomData" component={ChatRoomDataScreen} />

        <Stack.Screen name="MediaViewer" component={MediaViewer} />

        <Stack.Screen name="ProfileView" component={ProfileView} />
        <Stack.Screen name="ProfileEdit" component={ProfileEdit} />
        <Stack.Screen name="PostDetail" component={PostDetail} />
        <Stack.Screen name="CreatePost" component={CreatePost} />
        <Stack.Screen name="EditPost" component={EditPost} />
        <Stack.Screen
          name="PostCollectionViewer"
          component={PostCollectionViewer}
        />

        <Stack.Screen name="FriendList" component={FriendsListScreen} />
        <Stack.Screen name="FriendGroups" component={FriendGroupsScreen} />
        <Stack.Screen
          name="FriendGroupMembers"
          component={FriendGroupMembersScreen}
        />
        <Stack.Screen name="FriendEdit" component={FriendEditScreen} />
        <Stack.Screen name="FriendAdd" component={AddFriendScreen} />

        <Stack.Screen name="ReportReasonList" component={ReportReasonList} />
        <Stack.Screen
          name="ReportReasonDetail"
          component={ReportReasonDetail}
        />
        <Stack.Screen name="ReportGuide" component={ReportGuide} />
        <Stack.Screen name="ReportDone" component={ReportDone} />

        <Stack.Screen name="TermsConsent" component={TermsConsent} />

        <Stack.Screen name="SettingsHome" component={SettingsHome} />
        <Stack.Screen
          name="SettingsNotification"
          component={SettingsNotification}
        />
        <Stack.Screen name="SettingsPrivacy" component={SettingsPrivacy} />
        <Stack.Screen name="AccountSettings" component={AccountSettings} />
        <Stack.Screen name="PersonalityType" component={PersonalityType} />
        <Stack.Screen name="OpenProfileList" component={OpenProfileList} />
        <Stack.Screen name="ThemeSettings" component={ThemeSettings} />
        <Stack.Screen name="DataStorageCenter" component={DataStorageCenter} />
        <Stack.Screen name="SettingsLabs" component={SettingsLabs} />

        <Stack.Screen
          name="CustomerCenterHome"
          component={CustomerCenterHome}
        />
        <Stack.Screen
          name="CustomerCenterList"
          component={CustomerCenterList}
        />
        <Stack.Screen
          name="CustomerCenterDetail"
          component={CustomerCenterDetail}
        />
        <Stack.Screen name="PolicyViewer" component={PolicyViewer} />
        <Stack.Screen name="NoticeList" component={NoticeList} />
        <Stack.Screen name="ContactForm" component={ContactForm} />

        <Stack.Screen name="BusinessRegister" component={BusinessRegister} />
        <Stack.Screen
          name="BusinessUnregister"
          component={BusinessUnregister}
        />
        <Stack.Screen name="BusinessCreate" component={BusinessCreate} />
        <Stack.Screen name="BusinessDetail" component={BusinessDetail} />
        <Stack.Screen name="BusinessEvents" component={BusinessEvents} />
        <Stack.Screen name="MyBusinessList" component={MyBusinessList} />
        <Stack.Screen name="BusinessManager" component={BusinessManager} />
      </Stack.Navigator>
    </NavigationContainer>
    </>
  );
}
