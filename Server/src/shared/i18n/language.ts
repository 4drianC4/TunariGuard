import { AsyncLocalStorage } from 'node:async_hooks';
import english from './en.json' with { type: 'json' };

export type AppLanguage = 'es' | 'en';
const requestLanguage = new AsyncLocalStorage<AppLanguage>();
const translations: Readonly<Record<string, string>> = english;

export function resolveLanguage(value?: string | string[] | null): AppLanguage {
  const header = Array.isArray(value) ? value.join(',') : value;
  const preferences = (header ?? '').split(',').map((entry) => {
    const [tag, ...parameters] = entry.trim().toLowerCase().split(';');
    const language = tag?.split('-')[0];
    const weight = parameters.map((parameter) => parameter.trim()).find((parameter) => parameter.startsWith('q='));
    return { language, quality: weight ? Number(weight.slice(2)) : 1 };
  }).sort((a, b) => b.quality - a.quality);
  for (const { language, quality } of preferences) {
    if (quality > 0 && quality <= 1 && (language === 'es' || language === 'en')) return language;
  }
  return 'es';
}

export function currentLanguage(): AppLanguage {
  return requestLanguage.getStore() ?? 'es';
}

export function withLanguage<T>(language: AppLanguage, run: () => T): T {
  return requestLanguage.run(language, run);
}

export function localized<T>(language: AppLanguage, values: { es: T; en: T }): T {
  return values[language];
}

export function translate(language: AppLanguage, key: string, values: readonly unknown[] = []): string {
  const phrase = language === 'en' && Object.hasOwn(translations, key) ? translations[key]! : key;
  return phrase.replace(/\{(\d+)\}/g, (token, index: string) =>
    Number(index) <= values.length && Number(index) > 0 ? String(values[Number(index) - 1]) : token);
}

export function t(key: string): string {
  return translate(currentLanguage(), key);
}

export function msg(parts: TemplateStringsArray, ...values: unknown[]): string {
  const key = parts.reduce((text, part, index) => index ? text + '{' + index + '}' + part : part, '');
  return translate(currentLanguage(), key, values);
}

export function areaLabel(name: string, language = currentLanguage()): string {
  if (language === 'es') return name;
  const sector = /^Sector del Tunari en (.+)$/.exec(name);
  const district = /^Distrito\s+(\d+)$/.exec(name);
  if (sector) return `Tunari sector in ${sector[1]}`;
  if (district) return `District ${district[1]}`;
  return translate(language, name);
}
