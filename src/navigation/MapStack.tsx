// src/navigation/MapStack.tsx
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAppTheme } from "@/theme/useAppTheme";

// 화면들
import MapMain from "@/screens/map/Main";
import CreateBeacon from "@/screens/beacons/Create";
import BeaconDetail from "@/screens/beacons/Detail";
// 필요하면 나중에 Edit, Members 등도 추가 가능
// import EditBeacon from "@/screens/beacons/Edit";
// import BeaconMembers from "@/screens/beacons/Members";

export type MapStackParamList = {
  MapMain: { highlightBeaconId?: number | string } | undefined;
  CreateBeacon: undefined;
  BeaconDetail: { beaconId: string } ;
};

const Stack = createNativeStackNavigator<MapStackParamList>();

export default function MapStack() {
  const { colors } = useAppTheme();

  const stackContentStyle = React.useMemo(
    () => ({ backgroundColor: colors.background }),
    [colors.background],
  );

  return (
    <Stack.Navigator
      initialRouteName="MapMain"
      screenOptions={{
        headerShown: false,
        freezeOnBlur: false,
        contentStyle: stackContentStyle,
        // 우리 전역 정책: StatusBar/header는 각 화면이 직접 처리
      }}
    >
      {/* 지도 메인 (탭에서 보이는 첫 화면) */}
      <Stack.Screen
        name="MapMain"
        component={MapMain}
      />

      {/* 비콘 생성 화면 (플로팅 + 버튼 눌렀을 때 이동) */}
      <Stack.Screen
        name="CreateBeacon"
        component={CreateBeacon}
      />

      {/* 비콘 상세 화면 (MapMain -> "자세히" 눌렀을 때 push) */}
      <Stack.Screen
        name="BeaconDetail"
        component={BeaconDetail}
      />
    </Stack.Navigator>
  );
}
