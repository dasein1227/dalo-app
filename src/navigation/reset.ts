// src/navigation/reset.ts
import { CommonActions, type NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/types";

/** 스택을 지정한 라우트들로 리셋 */
export function resetStack(
  navigation: NavigationProp<RootStackParamList>,
  routeNames: (keyof RootStackParamList)[]
) {
  navigation.dispatch(
    CommonActions.reset({
      index: routeNames.length - 1,
      // CommonActions.reset은 PartialRoute를 받으므로 key 불필요
      routes: routeNames.map((name) => ({ name: name as never })),
    })
  );
}

/** 메인 탭의 MapMain으로 바로 리셋 */
export function resetToMainMap(navigation: NavigationProp<RootStackParamList>) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: "MainTabs" as never,
          // 중첩 네비 상태는 타입이 복잡하므로 안전하게 단언
          state: {
            index: 0,
            routes: [{ name: "MapMain" as never }],
          } as never,
        },
      ],
    })
  );
}
