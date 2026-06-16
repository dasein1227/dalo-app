# CO·ONN Theme Drop-in 적용 위치

## 포함 파일

```txt
src/theme/colors.ts
src/theme/tokens.ts
src/theme/ThemeProvider.tsx
src/theme/useAppTheme.ts
```

## 1. 파일 복사 위치

압축을 풀고 아래 경로에 그대로 복사한다.

```txt
C:\dalo-app\src\theme\colors.ts
C:\dalo-app\src\theme\tokens.ts
C:\dalo-app\src\theme\ThemeProvider.tsx
C:\dalo-app\src\theme\useAppTheme.ts
```

기존 `src/theme/colors.ts`가 있으면 이 파일로 교체한다.

## 2. App.tsx 연결

기존 ThemeContext를 바로 제거하지 말고, 우선 새 Provider를 루트에 추가한다.
이름 충돌 방지를 위해 alias로 import한다.

```tsx
import { ThemeProvider as AppThemeProvider } from '@/theme/ThemeProvider';
```

그리고 NavigationContainer 또는 RootNavigator를 감싸는 루트 영역에 추가한다.

예시:

```tsx
<SafeAreaProvider>
  <AppThemeProvider initialPreference="system">
    {/* 기존 Provider / NavigationContainer / RootNavigator 유지 */}
  </AppThemeProvider>
</SafeAreaProvider>
```

이미 기존 `ThemeProvider`가 있다면 삭제하지 말고 이렇게 둔다.

```tsx
<SafeAreaProvider>
  <AppThemeProvider initialPreference="system">
    <기존ThemeProvider>
      {/* 기존 앱 내용 */}
    </기존ThemeProvider>
  </AppThemeProvider>
</SafeAreaProvider>
```

## 3. 화면에서 사용

다음 단계부터 화면에서는 기존 `@/context/ThemeContext`의 `useTheme()` 대신 새 hook을 사용한다.

```tsx
import { useAppTheme } from '@/theme/useAppTheme';

const { colors, tokens, isDark, mode } = useAppTheme();
```

## 4. Main.tsx 적용은 다음 단계

이번 압축 파일은 공통 기반 4개만 포함한다.
Main 화면은 다음 단계에서 별도 파일을 추가한다.

```txt
src/screens/home/Main.theme.ts
src/screens/home/Main.tsx
```

Main 화면 수정 원칙:

```txt
- 기능 로직 건드리지 않음
- Supabase 로직 건드리지 않음
- FlatList / 탭 / 네비게이션 로직 건드리지 않음
- 하드코딩 색상, radius, border, shadow만 정리
```

## 5. 디자인 기준

Light Mode:

```txt
background: #F8F9FA
surface/card: #FFFFFF
brand black: #0A0A0A
text primary: #121212
border: rgba(0, 0, 0, 0.08)
```

Dark Mode:

```txt
background: #000000
surface/card: #000000
brand black: #000000
text primary: #F9FAFB
border: rgba(255, 255, 255, 0.12)
raised surface: #121212 only when exceptional
```

Geometry:

```txt
main/card/banner radius: 20
inner/chip radius: 14
capsule radius: 999
border: StyleSheet.hairlineWidth
shadow: forbidden except floating functional UI
```
