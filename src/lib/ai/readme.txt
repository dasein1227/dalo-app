src/lib/ai/types.ts : Provider 인터페이스

src/lib/ai/env.ts : EXPO_PUBLIC_AI_PROVIDER 기반 선택

src/lib/ai/providers/supabase.ts : supabase.functions.invoke 공통 래퍼(타임아웃/에러 정리)

src/lib/ai/providers/disabled.ts : 비활성 provider

src/lib/ai/provider.ts : 싱글톤 provider 선택

src/lib/ai/client.ts : aiInvoke() 공통 호출 함수

src/lib/ai/businessBriefing.ts : generateBusinessBriefing(businessId) (현재 ai-briefing에 맞춤)

src/lib/ai/searchInterpret.ts : interpretSearchQuery() (향후 ai-interpret용)

src/lib/ai/index.ts : 배럴 export