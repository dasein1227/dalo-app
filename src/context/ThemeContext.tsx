import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { supabase } from '@/lib/supabase';

// ✅ 1. 방금 만든 테마 파일 가져오기 (경로 확인 필수!)
import { lightTheme, darkTheme, ThemeColors } from '@/theme/colors';

type ThemePref = 'system' | 'light' | 'dark';

interface ThemeContextType {
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
  isDark: boolean;
  colors: ThemeColors; // ✅ 여기에 색상표가 통째로 담깁니다.
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const systemScheme = useColorScheme();

  // 2. 다크모드 판별 로직
  const isDark = useMemo(() => {
    if (themePref === 'dark') return true;
    if (themePref === 'light') return false;
    return systemScheme === 'dark';
  }, [themePref, systemScheme]);

  // ✅ 3. 현재 모드에 맞는 색상표(colors) 선택
  // isDark가 true면 트루블랙 테마, false면 라이트 테마를 내보냄
  const colors = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  // 4. 테마 변경 함수 (즉시 반영 + DB 저장)
  const updateTheme = async (newPref: ThemePref) => {
    setThemePref(newPref); // 화면 먼저 바꿈 (반응속도 UP)
    
    // 로그인 상태라면 DB에도 저장
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await supabase
        .from('profiles')
        .update({ theme_pref: newPref, theme_pref_updated_at: new Date() })
        .eq('id', session.user.id);
    }
  };

  // 5. 앱 켤 때 DB에서 내 설정 가져오기
  useEffect(() => {
    const fetchTheme = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data } = await supabase
        .from('profiles')
        .select('theme_pref')
        .eq('id', session.user.id)
        .maybeSingle();

      if (data?.theme_pref) {
        setThemePref(data.theme_pref as ThemePref);
      }
    };
    fetchTheme();
  }, []);

  return (
    // ✅ value에 colors를 추가해서 앱 전체에 뿌려줍니다.
    <ThemeContext.Provider value={{ themePref, setThemePref: updateTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};