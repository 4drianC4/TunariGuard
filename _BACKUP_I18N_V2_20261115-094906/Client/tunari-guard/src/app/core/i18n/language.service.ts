import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type AppLanguage = 'es' | 'en';
const STORAGE_KEY = 'tunari-guard.language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  readonly language = signal<AppLanguage>(this.initialLanguage());

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
