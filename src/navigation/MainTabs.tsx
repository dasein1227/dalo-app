// src/navigation/MainTabs.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Home, MapPinned, MessageCircle, Users, Store } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import MapStack from "@/navigation/MapStack";
import ChatRoomsScreen from "@/screens/chat/List";
import FriendsList from "@/screens/friends/List";
import BusinessFeed from "@/screens/business/Feed";
import HomeScreen from "@/screens/home/Main";

export type MainTabsParamList = {
  Home: undefined;
  ChatList:
    | {
        mode: "personal" | "group" | "open" | "beacon";
      }
    | undefined;
  FriendsList: undefined;
  MapStack: undefined;
  BusinessFeed: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export default function MainTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,

        // ✅ 라벨 숨기고 아이콘만
        tabBarShowLabel: false,

        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#9AA0A6",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 54,
        },
      }}
    >
      {/* 1) Home */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />

      {/* 2) Chat */}
      <Tab.Screen
        name="ChatList"
        component={ChatRoomsScreen}
        initialParams={{ mode: "personal" }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />

      {/* 3) Friends */}
      <Tab.Screen
        name="FriendsList"
        component={FriendsList}
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />

      {/* 4) Map */}
      <Tab.Screen
        name="MapStack"
        component={MapStack}
        options={{
          tabBarIcon: ({ color, size }) => <MapPinned color={color} size={size} />,
        }}
      />

      {/* 5) Shop / Explore */}
      <Tab.Screen
        name="BusinessFeed"
        component={BusinessFeed}
        options={{
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
