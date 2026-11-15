import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Subject, type ObservedValueOf } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveUpdatesService } from '../../../application/services/live-updates.service';
import { TopbarComponent } from './topbar.component';
import { LanguageService } from '../../i18n/language.service';

describe('TopbarComponent', () => {
  afterEach(() => localStorage.removeItem('tunari-guard.language'));

  it('muestra el toast de prueba sin agregar una alerta a la campanita', () => {
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '?toast=critica');
    try {
      TestBed.configureTestingModule({
        imports: [TopbarComponent],
        providers: [
          provideRouter([]),
          { provide: LiveUpdatesService, useValue: {
            enabled: false, alertNotifications$: NEVER, removedAlerts$: NEVER,
          } },
        ],
      });
      TestBed.inject(LanguageService).setLanguage('es');
      const fixture = TestBed.createComponent(TopbarComponent);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.alert-toast')?.textContent).toContain('Crítica · Prueba');
      expect(element.querySelector<HTMLElement>('.alert-toast')?.style.getPropertyValue('--alert-accent'))
        .toBe('#e94119');
      expect(element.querySelector('.notifications__count')).toBeNull();
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('muestra una alerta del parque y reproduce un tono una sola vez', () => {
    const alertNotifications = new Subject<ObservedValueOf<LiveUpdatesService['alertNotifications$']>>();
    const removedAlerts = new Subject<string[]>();
    const tone = {
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn((target) => target),
      start: vi.fn(),
      stop: vi.fn(),
    };
    vi.stubGlobal('AudioContext', class {
      state = 'running';
      currentTime = 1;
      createOscillator = () => tone;
      createGain = () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      });
      close = async () => undefined;
    });

    try {
      TestBed.configureTestingModule({
        imports: [TopbarComponent],
        providers: [
          provideRouter([]),
          { provide: LiveUpdatesService, useValue: {
            enabled: false, alertNotifications$: alertNotifications, removedAlerts$: removedAlerts,
          } },
        ],
      });
      TestBed.inject(LanguageService).setLanguage('es');
      const fixture = TestBed.createComponent(TopbarComponent);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      element.querySelector<HTMLButtonElement>('.notifications__trigger')!.click();

      const payload = {
        emittedAtUtc: '2026-11-15T12:45:00Z',
        alerts: [{
          id: 'AL-0012', district: 'Parque Nacional Tunari', severity: 'Alta' as const,
          simulated: true, message: 'Se detectó un foco de calor.',
          districtByLanguage: { en: 'Tunari National Park', es: 'Parque Nacional Tunari' },
          messageByLanguage: { en: 'A hotspot was detected.', es: 'Se detectó un foco de calor.' },
        }],
      };
      alertNotifications.next(payload);
      alertNotifications.next(payload);
      fixture.detectChanges();

      expect(element.querySelector('.notifications__count')?.textContent?.trim()).toBe('1');
      expect(element.querySelector('.notification-item__title')?.textContent?.trim())
        .toBe('Parque Nacional Tunari · Alta · Simulada');
      expect(element.querySelectorAll('.notification-item')).toHaveLength(1);
      expect(tone.start).toHaveBeenCalledTimes(1);
      expect(element.querySelector<HTMLElement>('.alert-toast')?.style.getPropertyValue('--alert-accent'))
        .toBe('#fb8308');
      expect(element.querySelector('.alert-toast img')?.getAttribute('src'))
        .toBe('/assets/tuni-piezas/tuni-cabeza.webp');

      alertNotifications.next({
        ...payload,
        alerts: [{ ...payload.alerts[0]!, id: 'AL-0013', severity: 'Crítica' }],
      });
      fixture.detectChanges();
      expect(element.querySelector<HTMLElement>('.alert-toast')?.style.getPropertyValue('--alert-accent'))
        .toBe('#e94119');
      expect(element.querySelector('.alert-toast')?.textContent).toContain('1 alerta más en la campanita');
      element.querySelector<HTMLButtonElement>('app-language-switcher button[lang=en]')!.click();
      fixture.detectChanges();
      expect(document.documentElement.lang).toBe('en');
      expect(localStorage.getItem('tunari-guard.language')).toBe('en');
      expect(element.querySelector('.alert-toast')?.textContent).toContain('Tunari National Park · Critical · Simulated');
      expect(element.querySelector('.alert-toast')?.textContent).toContain('A hotspot was detected.');
      expect(element.querySelector('.notifications__count')?.textContent?.trim()).toBe('2');
      element.querySelector<HTMLButtonElement>('app-language-switcher button[lang=es]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('.alert-toast')?.textContent).toContain('Crítica · Simulada');
      element.querySelector<HTMLButtonElement>('.alert-toast__close')!.click();
      fixture.detectChanges();
      expect(element.querySelector('.alert-toast')).toBeNull();
      expect(element.querySelector('.notifications__count')?.textContent?.trim()).toBe('2');

      fixture.componentInstance.markAllAsRead();
      fixture.detectChanges();
      expect(element.querySelector('.notifications__count')).toBeNull();

      removedAlerts.next(['AL-0012', 'AL-0013']);
      fixture.detectChanges();
      expect(element.querySelector('.notification-item')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
