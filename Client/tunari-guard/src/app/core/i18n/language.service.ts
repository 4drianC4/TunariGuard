import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import en from './en.json';
import es from './es.json';

export type AppLanguage = 'es' | 'en';
const catalogs: Record<AppLanguage, Readonly<Record<string, string>>> = { es, en };
const STORAGE_KEY = 'tunari-guard.language';

export function translate(language: AppLanguage, key: string, values?: Record<string, string | number>): string {
  const catalog = catalogs[language];
  const message = Object.hasOwn(catalog, key) ? catalog[key] : key;
  return values ? message.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match) : message;
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  readonly language = signal<AppLanguage>(this.initialLanguage());
  readonly locale = computed(() => this.language() === 'es' ? 'es-BO' : 'en-US');
  readonly text = (key: string | null | undefined, values?: Record<string, string | number>) =>
    translate(this.language(), key ?? '', values);
  readonly area = (name: string): string => {
    if (this.language() === 'en') {
      return this.text(name.replace(/^Distrito (\d+)$/, 'District $1').replace(/^Sector del Tunari en (.+)$/, 'Tunari sector in $1'));
    }
    const translated = name.replace(/^District (\d+)$/, 'Distrito $1').replace(/^Tunari sector in (.+)$/, 'Sector del Tunari en $1');
    const officialNames: Record<string, string> = {
      'Tunari National Park': 'Parque Nacional Tunari',
      'Entire Cochabamba municipality': 'Municipio completo de Cochabamba',
      'Municipality of Cochabamba': 'Municipio de Cochabamba',
      'Peri-urban areas (GAMC)': 'Zonas periurbanas (GAMC)',
      '2750 m elevation zone (GAMC)': 'Zona Cota 2750 (GAMC)',
    };
    return Object.hasOwn(officialNames, translated) ? officialNames[translated] : translated;
  };

  fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Accept-Language', this.language());
    return fetch(input, { ...init, headers });
  }

  constructor() { this.document.documentElement.lang = this.language(); }

  setLanguage(language: AppLanguage): void {
    this.language.set(language);
    this.document.documentElement.lang = language;
    if (isPlatformBrowser(this.platformId)) {
      try { localStorage.setItem(STORAGE_KEY, language); } catch { /* storage unavailable */ }
    }
  }

  private initialLanguage(): AppLanguage {
    if (!isPlatformBrowser(this.platformId)) return 'es';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'es' || saved === 'en') return saved;
      return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
    } catch { return 'es'; }
  }
}
