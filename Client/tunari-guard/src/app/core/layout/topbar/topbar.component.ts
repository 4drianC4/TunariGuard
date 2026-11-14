
import {
  Component,
  ElementRef,
  HostListener,
  inject,
  ViewChild
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LiveUpdatesService } from '../../../application/services/live-updates.service';

type NotificationType = 'alert' | 'success' | 'info';

interface TunariNotification {
  id: number;
  title: string;
  message: string;
  time: string;
  type: NotificationType;
  read: boolean;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent {
  readonly liveUpdates = inject(LiveUpdatesService);

  @ViewChild('notificationContainer')
  notificationContainer?: ElementRef<HTMLElement>;

  notificationsOpen = false;

  notifications: TunariNotification[] = [
    {
      id: 1,
      title: 'Anomalía térmica detectada',
      message:
        'Se registró un punto de calor en el área de monitoreo.',
      time: 'Hace 5 minutos · DEMO',
      type: 'alert',
      read: false
    },
    {
      id: 2,
      title: 'Datos satelitales procesados',
      message:
        'Se completó una actualización de observaciones MODIS y VIIRS.',
      time: 'Hace 20 minutos · DEMO',
      type: 'success',
      read: false
    },
    {
      id: 3,
      title: 'Armonización disponible',
      message:
        'Los resultados de comparación satelital están listos para revisar.',
      time: 'Hace 1 hora · DEMO',
      type: 'info',
      read: false
    },
    {
      id: 4,
      title: 'Reporte de monitoreo',
      message:
        'Se generó un resumen de actividad térmica de demostración.',
      time: 'Hace 3 horas · DEMO',
      type: 'success',
      read: true
    }
  ];

  constructor(private readonly router: Router) {}

  get unreadCount(): number {
    return this.notifications.filter(item => !item.read).length;
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
  }

  closeNotifications(): void {
    this.notificationsOpen = false;
  }

  markAllAsRead(): void {
    this.notifications = this.notifications.map(item => ({
      ...item,
      read: true
    }));
  }

  openNotification(item: TunariNotification): void {
    this.notifications = this.notifications.map(notification =>
      notification.id === item.id
        ? { ...notification, read: true }
        : notification
    );

    this.closeNotifications();

    if (item.type === 'alert') {
      this.goToAlerts();
    }
  }

  goToAlerts(): void {
    this.closeNotifications();

    // Ajustar si tu ruta de Alertas es diferente.
    void this.router.navigate(['/alertas']);
  }

  trackNotification(
    index: number,
    item: TunariNotification
  ): number {
    return item.id;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.notificationsOpen) {
      return;
    }

    const target = event.target;

    if (
      target instanceof Node &&
      !this.notificationContainer?.nativeElement.contains(target)
    ) {
      this.closeNotifications();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeNotifications();
  }
}
