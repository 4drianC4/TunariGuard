import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LanguageService, type AppLanguage } from './language.service';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="language-switcher" role="group" [attr.aria-label]="i18n.text('Idioma')">
      <button type="button" [class.active]="i18n.language() === 'es'"
        [attr.aria-pressed]="i18n.language() === 'es'" [attr.aria-label]="i18n.text('Español')" lang="es" (click)="set('es')">ES</button>
      <span aria-hidden="true">|</span>
      <button type="button" [class.active]="i18n.language() === 'en'"
        [attr.aria-pressed]="i18n.language() === 'en'" [attr.aria-label]="i18n.text('Inglés')" lang="en" (click)="set('en')">EN</button>
    </div>
  `,
  styles: [`
    :host{display:inline-flex;align-items:center}
    .language-switcher{display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #d9dfd1;border-radius:10px;background:#fff;color:#65705b;font:600 11px/1 system-ui}
    button{border:0;background:transparent;color:inherit;padding:5px 6px;border-radius:6px;cursor:pointer;font:inherit}
    button.active{background:#e9efe2;color:#34452b}
    button:focus-visible{outline:2px solid #718b52;outline-offset:2px}
  `]
})
export class LanguageSwitcherComponent {
  readonly i18n = inject(LanguageService);
  set(language: AppLanguage): void { this.i18n.setLanguage(language); }
}
