import { LanguageService } from '../../../core/i18n/language.service';
import { Component, inject, input } from '@angular/core';

@Component({
  selector: 'app-map-info',
  template: `
    <button #trigger type="button" [attr.aria-label]="t('Información sobre {topic}', { topic: topic() })"
      [attr.aria-description]="text()" (pointerenter)="show(trigger, bubble)"
      (pointerleave)="hideUnlessFocused(trigger, bubble)" (focus)="show(trigger, bubble)"
      (blur)="bubble.hidePopover()" (click)="show(trigger, bubble)" (keydown.escape)="bubble.hidePopover()">
      <span aria-hidden="true">i</span>
    </button>
    <div #bubble popover="manual" aria-hidden="true">{{ text() }}</div>
  `,
  styles: `
    :host { display: inline-block; vertical-align: middle; }
    button {
      display: inline-grid;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      cursor: help;
      color: #526b4c;
    }
    button:focus-visible { outline: 2px solid #526b4c; border-radius: 50%; }
    button span {
      display: grid;
      place-items: center;
      width: 1rem;
      height: 1rem;
      border: 1px solid currentColor;
      border-radius: 50%;
      font: bold .7rem/1 system-ui;
    }
    [popover] {
      position: fixed;
      inset: auto;
      margin: 0;
      width: max-content;
      max-width: min(16rem, calc(100vw - 16px));
      padding: .5rem .625rem;
      border: 1px solid #526b4c;
      border-radius: .5rem;
      background: #30351f;
      color: #fffcf7;
      box-shadow: 0 4px 9px rgb(60 45 25 / 18%);
      font: 400 .75rem/1.4 Inter, system-ui, sans-serif;
      letter-spacing: normal;
      text-transform: none;
      pointer-events: none;
    }
  `,
})
export class MapInfoComponent {
  readonly t = inject(LanguageService).text;
  readonly topic = input.required<string>();
  readonly text = input.required<string>();

  show(trigger: HTMLButtonElement, bubble: HTMLElement): void {
    if (!bubble.matches(':popover-open')) bubble.showPopover();
    const { left, top, bottom } = trigger.getBoundingClientRect();
    const { width, height } = bubble.getBoundingClientRect();
    bubble.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    bubble.style.top = `${bottom + height + 12 <= window.innerHeight ? bottom + 4 : Math.max(8, top - height - 4)}px`;
  }

  hideUnlessFocused(trigger: HTMLButtonElement, bubble: HTMLElement): void {
    if (!trigger.matches(':focus-visible')) bubble.hidePopover();
  }
}
