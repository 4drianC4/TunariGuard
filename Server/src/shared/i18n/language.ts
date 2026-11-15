export type AppLanguage = 'es' | 'en';

export function resolveLanguage(value?: string | string[] | null): AppLanguage {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return 'es';
  const preferred = header.split(',')[0]?.trim().toLowerCase() ?? '';
  return preferred.startsWith('en') ? 'en' : 'es';
}

export function localized<T>(language: AppLanguage, values: { es: T; en: T }): T {
  return values[language];
}

/**
 * Use for user-facing API messages only. Never apply this helper to numeric
 * measurements, sensor codes, IDs, timestamps, coordinates or raw provider payloads.
 */
export const apiMessages = {
  invalidLanguage: {
    es: 'Idioma no compatible. Use es o en.',
    en: 'Unsupported language. Use es or en.',
  },
} as const;
