import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export function findExistingRoute(
  navigation: NavigationProp<ParamListBase> & any,
  candidates: string[],
): string | null {
  let nav: any = navigation;
  while (nav) {
    const names = nav.getState?.()?.routeNames as string[] | undefined;
    if (Array.isArray(names)) {
      for (const candidate of candidates) {
        if (names.includes(candidate)) return candidate;
      }
    }
    nav = nav.getParent?.();
  }
  return null;
}

export function navigateKnown(
  navigation: NavigationProp<ParamListBase> & any,
  candidates: string[],
  params?: Record<string, unknown>,
): boolean {
  const route = findExistingRoute(navigation, candidates);
  if (!route) return false;
  navigation.navigate(route as never, params as never);
  return true;
}
