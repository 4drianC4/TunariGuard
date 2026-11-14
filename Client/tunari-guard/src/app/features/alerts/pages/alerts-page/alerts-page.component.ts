import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

type Severity = 'Crítica' | 'Alta' | 'Media';
type Status = 'En revisión' | 'Pendiente' | 'En análisis' | 'Verificada';
interface AlertEvent {
  id: string; district: string; severity: Severity; status: Status;
  detected: string; date: string; time: string; source: string;
  confidence: number; lat: number; lng: number; x: number; y: number;
}
const seeds: Omit<AlertEvent, 'id' | 'date' | 'detected' | 'time'>[] = [
  { district: 'Tiquipaya', severity: 'Crítica', status: 'En revisión', source: 'VIIRS (NASA)', confidence: 94, lat: -17.3456, lng: -66.1823, x: 43, y: 33 },
  { district: 'Sacaba', severity: 'Alta', status: 'Pendiente', source: 'VIIRS (NASA)', confidence: 90, lat: -17.3921, lng: -66.0381, x: 69, y: 42 },
  { district: 'Colcapirhua', severity: 'Alta', status: 'Pendiente', source: 'MODIS (NASA)', confidence: 88, lat: -17.3971, lng: -66.2370, x: 29, y: 57 },
  { district: 'Vinto', severity: 'Media', status: 'En análisis', source: 'VIIRS (NASA)', confidence: 82, lat: -17.3920, lng: -66.3171, x: 78, y: 76 },
  { district: 'Quillacollo', severity: 'Media', status: 'En análisis', source: 'MODIS (NASA)', confidence: 85, lat: -17.3990, lng: -66.2820, x: 20, y: 47 },
  { district: 'Cochabamba', severity: 'Crítica', status: 'En revisión', source: 'VIIRS (NASA)', confidence: 93, lat: -17.3651, lng: -66.1604, x: 61, y: 54 },
  { district: 'Sipe Sipe', severity: 'Alta', status: 'Verificada', source: 'MODIS (NASA)', confidence: 89, lat: -17.4532, lng: -66.3610, x: 52, y: 67 },
  { district: 'Tiquipaya', severity: 'Media', status: 'Pendiente', source: 'VIIRS (NASA)', confidence: 79, lat: -17.3502, lng: -66.1951, x: 35, y: 28 },
];
const minutes = ['10:24', '09:57', '09:21', '08:47', '08:30', '07:42', '06:56', '06:10'];
const allAlerts: AlertEvent[] = Array.from({ length: 26 }, (_, i) => {
  const seed = seeds[i % seeds.length];
  const day = 14 - Math.floor(i / 8);
  const date = `2026-11-${String(day).padStart(2, '0')}`;
  const time = minutes[i % minutes.length];
  return { ...seed, id: `AL-${String(142 - i).padStart(4, '0')}`, date, time,
    detected: `${day} nov, ${time}`, x: Math.min(87, seed.x + (i % 3) * 2), y: Math.min(86, seed.y + (i % 2) * 3) };
});

@Component({
  selector: 'app-alerts-page',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  templateUrl: './alerts-page.component.html',
  styleUrl: './alerts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertsPageComponent {
  readonly alerts = allAlerts;
  readonly districts = ['Todos los distritos', 'Tiquipaya', 'Sacaba', 'Colcapirhua', 'Vinto', 'Quillacollo', 'Cochabamba', 'Sipe Sipe'];
  dateFrom = '2026-11-01'; dateTo = '2026-11-14'; district = 'Todos los distritos'; severity = 'Todas';
  readonly activeFrom = signal('2026-11-01'); readonly activeTo = signal('2026-11-14');
  readonly activeDistrict = signal('Todos los distritos'); readonly activeSeverity = signal('Todas');
  readonly page = signal(1); readonly pageSize = 5; readonly selectedId = signal('AL-0142');
  readonly mobileFiltersOpen = signal(false); readonly mapZoom = signal(1);
  readonly statuses = signal<Record<string, Status>>({});
  readonly filtered = computed(() => this.alerts.filter(a =>
    a.date >= this.activeFrom() && a.date <= this.activeTo() &&
    (this.activeDistrict() === 'Todos los distritos' || a.district === this.activeDistrict()) &&
    (this.activeSeverity() === 'Todas' || a.severity === this.activeSeverity())
  ));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly selected = computed(() => this.alerts.find(a => a.id === this.selectedId()) ?? null);
  readonly selectedStatus = computed(() => this.statuses()[this.selectedId()] ?? this.selected()?.status ?? 'Pendiente');
  readonly counts = computed(() => ({
    critical: this.filtered().filter(a => a.severity === 'Crítica').length,
    high: this.filtered().filter(a => a.severity === 'Alta').length,
    medium: this.filtered().filter(a => a.severity === 'Media').length,
    review: this.filtered().filter(a => (this.statuses()[a.id] ?? a.status) === 'En revisión').length,
  }));
  applyFilters(): void {
    if (this.dateFrom > this.dateTo) { const old = this.dateFrom; this.dateFrom = this.dateTo; this.dateTo = old; }
    this.activeFrom.set(this.dateFrom); this.activeTo.set(this.dateTo);
    this.activeDistrict.set(this.district); this.activeSeverity.set(this.severity);
    this.page.set(1); this.mobileFiltersOpen.set(false);
    if (!this.filtered().some(a => a.id === this.selectedId())) this.selectedId.set(this.filtered()[0]?.id ?? '');
  }
  clearFilters(): void {
    this.dateFrom = '2026-11-01'; this.dateTo = '2026-11-14';
    this.district = 'Todos los distritos'; this.severity = 'Todas'; this.applyFilters();
  }
  setPage(page: number): void { this.page.set(Math.max(1, Math.min(this.pages(), page))); }
  selectAlert(id: string): void { this.selectedId.set(id); }
  toggleFilters(): void { this.mobileFiltersOpen.update(v => !v); }
  setStatus(status: Status): void {
    const id = this.selectedId(); if (id) this.statuses.update(values => ({ ...values, [id]: status }));
  }
  zoom(delta: number): void { this.mapZoom.update(v => Math.max(1, Math.min(1.8, +(v + delta).toFixed(1)))); }
  resetZoom(): void { this.mapZoom.set(1); }
  severityClass(severity: Severity): string { return severity === 'Crítica' ? 'critical' : severity === 'Alta' ? 'high' : 'medium'; }
  statusClass(status: Status): string { return status === 'En revisión' ? 'review' : status === 'Verificada' ? 'verified' : status === 'En análisis' ? 'analysis' : 'pending'; }
  currentStatus(a: AlertEvent): Status { return this.statuses()[a.id] ?? a.status; }
  showAlertOnMap(): void { document.getElementById('tg-alert-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
