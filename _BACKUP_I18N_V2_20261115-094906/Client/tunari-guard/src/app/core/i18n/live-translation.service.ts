import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { LanguageService } from './language.service';
import { UI_TRANSLATIONS } from './ui-translations';

const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'] as const;
const EXCLUDED = 'script,style,code,pre,textarea,[contenteditable="true"],svg';

@Injectable({ providedIn: 'root' })
export class LiveTranslationService {
  private readonly document = inject(DOCUMENT);
  private readonly platform = inject(PLATFORM_ID);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private observer?: MutationObserver;
  private readonly originals = new WeakMap<Text, string>();
  private readonly attributeOriginals = new WeakMap<Element, Map<string, string>>();
  private running = false;
  private scheduled = false;

  constructor() {
    if (!isPlatformBrowser(this.platform)) return;
    effect(() => {
      this.language.language();
      this.schedule();
    });
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this.document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: [...ATTRIBUTES]
    });
    this.destroyRef.onDestroy(() => this.observer?.disconnect());
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.translatePage();
    });
  }

  private translatePage(): void {
    if (this.running) return;
    this.running = true;
    this.observer?.disconnect();
    try {
      const lang = this.language.language();
      const walker = this.document.createTreeWalker(this.document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node as Text;
        const parent = text.parentElement;
        if (!parent || parent.closest(EXCLUDED)) continue;
        const current = text.nodeValue ?? '';
        const prior = this.originals.get(text);
        // Angular may replace text on change detection: remember the new original.
        if (prior === undefined || (current !== prior && current !== this.translate(prior))) {
          this.originals.set(text, current);
        }
        const original = this.originals.get(text) ?? current;
        const target = lang === 'en' ? this.translate(original) : original;
        if (current !== target) text.nodeValue = target;
      }
      const all = this.document.body.querySelectorAll('*');
      for (const element of all) {
        if (element.closest(EXCLUDED)) continue;
        let stored = this.attributeOriginals.get(element);
        if (!stored) { stored = new Map(); this.attributeOriginals.set(element, stored); }
        for (const attr of ATTRIBUTES) {
          const current = element.getAttribute(attr);
          if (current === null) continue;
          const prior = stored.get(attr);
          if (prior === undefined || (current !== prior && current !== this.translate(prior))) {
            stored.set(attr, current);
          }
          const original = stored.get(attr) ?? current;
          const target = lang === 'en' ? this.translate(original) : original;
          if (current !== target) element.setAttribute(attr, target);
        }
      }
    } finally {
      this.running = false;
      this.observer?.observe(this.document.body, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: [...ATTRIBUTES]
      });
    }
  }

  private translate(original: string): string {
    const trimmed = original.trim();
    if (!trimmed) return original;
    const exact = UI_TRANSLATIONS[trimmed];
    if (exact) return original.replace(trimmed, exact);
    // Only UI phrasing; do not alter identifiers, numeric data or scientific payloads.
    const dynamic = [
      [/^(\d+) sin leer$/, '$1 unread'],
      [/^(\d+) alertas más en la campanita$/, '$1 more alerts in notifications'],
      [/^1 alerta más en la campanita$/, '1 more alert in notifications'],
      [/^de (\d+) alertas filtradas$/, 'of $1 filtered alerts'],
      [/^Sin alertas con estos filtros$/, 'No alerts match these filters'],
    ] as const;
    for (const [pattern, replacement] of dynamic) {
      if (pattern.test(trimmed)) return original.replace(trimmed, trimmed.replace(pattern, replacement));
    }
    return original;
  }
}
