import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { LiveUpdatesService } from '../../../application/services/live-updates.service';
import { ALERT_COLORS, SEVERITY_LEVEL, type AlertSeverity } from '../../../features/alerts/alert-event';

const TOAST_DURATION_MS = 10_000;

interface TunariNotification {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  time: string;
  read: boolean;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss', '../../../../../public/assets/alert-toast.css']
})
export class TopbarComponent {
  readonly liveUpdates = inject(LiveUpdatesService);

  @ViewChild('notificationContainer')
  notificationContainer?: ElementRef<HTMLElement>;

  notificationsOpen = false;
  readonly notifications = signal<TunariNotification[]>([]);
  private readonly toastAlerts = signal<TunariNotification[]>([]);
  protected readonly toast = computed(() => {
    const [first, ...others] = this.toastAlerts();
    if (!first) return null;
    const alert = others.reduce((highest, item) =>
      SEVERITY_LEVEL[item.severity] > SEVERITY_LEVEL[highest.severity] ? item : highest, first);
    return { alert, color: ALERT_COLORS[SEVERITY_LEVEL[alert.severity]], others: others.length };
  });
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly timeFormat = new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  });
  private audio?: AudioContext;
  private soundEndsAt = 0;

  constructor(private readonly router: Router) {
    this.liveUpdates.alertNotifications$.pipe(takeUntilDestroyed()).subscribe(({ alerts, emittedAtUtc }) => {
      const current = this.notifications();
      const seen = new Set(current.map((item) => item.id));
      const incoming: TunariNotification[] = [];
      for (const alert of alerts) {
        if (seen.has(alert.id)) continue;
        seen.add(alert.id);
        incoming.push({
          id: alert.id,
          title: `${alert.district} · ${alert.severity}${alert.simulated ? ' · Simulada' : ''}`,
          message: alert.message,
          severity: alert.severity,
          time: this.timeFormat.format(new Date(emittedAtUtc)),
          read: false,
        });
      }
      if (!incoming.length) return;
      this.notifications.set([...incoming, ...current]);
      this.toastAlerts.update((items) => [...incoming, ...items]);
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.dismissToast(), TOAST_DURATION_MS);
      this.playNotificationSound();
    });

    this.liveUpdates.removedAlerts$.pipe(takeUntilDestroyed()).subscribe((ids) => {
      const removed = new Set(ids);
      this.notifications.update((items) => items.filter((item) => !removed.has(item.id)));
      this.toastAlerts.update((items) => items.filter((item) => !removed.has(item.id)));
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.toastTimer);
      void this.audio?.close().catch(() => undefined);
    });
  }

  get unreadCount(): number {
    return this.notifications().filter(item => !item.read).length;
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toastAlerts.set([]);
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
  }

  closeNotifications(): void {
    this.notificationsOpen = false;
  }

  markAllAsRead(): void {
    this.notifications.update((items) => items.map((item) => ({ ...item, read: true })));
  }

  openNotification(item: TunariNotification): void {
    this.notifications.update((items) => items.map((notification) =>
      notification.id === item.id ? { ...notification, read: true } : notification
    ));
    this.goToAlerts();
  }

  goToAlerts(): void {
    this.closeNotifications();
    void this.router.navigate(['/alertas']);
  }

  trackNotification(_index: number, item: TunariNotification): string {
    return item.id;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    this.enableSound();
    const target = event.target;
    if (this.notificationsOpen && target instanceof Node &&
      !this.notificationContainer?.nativeElement.contains(target)) {
      this.closeNotifications();
    }
  }

  @HostListener('document:keydown')
  enableSound(): void {
    // El navegador exige una interacción del usuario antes de habilitar audio.
    if (typeof AudioContext === 'undefined') return;
    const audio = this.audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeNotifications();
  }

  private playNotificationSound(): void {
    const audio = this.audio;
    if (!audio || audio.state !== 'running' || audio.currentTime < this.soundEndsAt) return;

    const start = audio.currentTime;
    this.soundEndsAt = start + 0.3;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.setValueAtTime(660, start);
    tone.frequency.setValueAtTime(880, start + 0.13);
    volume.gain.setValueAtTime(0.001, start);
    volume.gain.exponentialRampToValueAtTime(0.15, start + 0.03);
    volume.gain.exponentialRampToValueAtTime(0.001, this.soundEndsAt);
    tone.connect(volume).connect(audio.destination);
    tone.onended = () => {
      tone.disconnect();
      volume.disconnect();
    };
    tone.start(start);
    tone.stop(this.soundEndsAt);
  }
}
