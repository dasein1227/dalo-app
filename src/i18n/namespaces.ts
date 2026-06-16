export const I18N_NAMESPACES = [
  'common',
  'imageEditor',
  'media',
  'errors',
  'auth',
  'phone',
  'legal',
  'permissions',
  'beacons',
  'business',
  'post',
  'friends',
  'chat',
  'push',
  'profile',
  'settings',
  'home',
  'system',
  'placeholders',
  'location',
  'mediaViewer',
  'report',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export const DEFAULT_NAMESPACE: I18nNamespace = 'common';

export function isI18nNamespace(value: unknown): value is I18nNamespace {
  return typeof value === 'string' && I18N_NAMESPACES.includes(value as I18nNamespace);
}
