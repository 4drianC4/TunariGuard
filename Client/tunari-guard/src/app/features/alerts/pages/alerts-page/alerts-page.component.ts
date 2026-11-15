import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { DetectionDateDirective } from '../../../../shared/directives/detection-date.directive';
import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { auditTime } from 'rxjs';
import { RealtimeClientService } from '../../../../data-access/realtime/realtime-client.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { MapInfoComponent } from '../../../map/components/map-info.component';
import { AlertMapComponent } from '../../components/alert-map/alert-map.component';
import { ALERT_COLORS, MONTHLY_LEVEL, SEVERITY_LEVEL, type AlertEvent, type AlertStatus } from '../../alert-event';
import { AlertsApi } from '../../data-access/alerts-api.service';

const initialFilters = { desde: '', hasta: '', area_id: '', severidad: '', estado: '', fuente: 'real' };

@Component({
  selector: 'app-alerts-page',
  imports: [DetectionDateDirective, DatePipe, DecimalPipe, PercentPipe, FormsModule, PageHeaderComponent, AlertMapComponent, MapInfoComponent],
  templateUrl: './alerts-page.component.html',
  styleUrl: './alerts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertsPageComponent {
  readonly dates = inject(DetectionDatesService);
  private readonly api = inject(AlertsApi);
  readonly colors = ALERT_COLORS;
  readonly severityLevel = SEVERITY_LEVEL;
  readonly monthlyLevel = MONTHLY_LEVEL;
  readonly applied = signal(initialFilters);
  draft = { ...initialFilters };
  readonly page = signal(1);
  readonly selectedId = signal('');
  readonly focusRequest = signal(0);
  readonly mobileFiltersOpen = signal(false);
  readonly filterError = signal('');
  readonly saveError = signal('');
  readonly saving = signal(false);
  readonly saved = signal(false);
  private editorBase?: AlertEvent;
  editStatus: AlertStatus = 'Pendiente';
  editNote = '';

  readonly result = resource({
    params: () => ({ filters: this.applied(), page: this.page() }),
    loader: ({ params: { filters, page }, abortSignal }) => this.api.list({
      ...(filters.desde ? { desde: filters.desde } : {}),
      ...(filters.hasta ? { hasta: filters.hasta } : {}),
      ...(filters.area_id ? { area_id: filters.area_id } : {}),
      ...(filters.severidad ? { severidad: filters.severidad } : {}),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.fuente === 'real' ? { modo: 'live', origen: 'REAL' } :
        filters.fuente === 'replay' ? { modo: 'replay' } :
        filters.fuente === 'simulated' ? { modo: 'live', origen: 'SIMULATED' } : {}),
      page, limit: 10,
    }, abortSignal),
  });
  readonly monthly = resource({ loader: ({ abortSignal }) => this.api.monthly(abortSignal) });
  readonly monthlyArea = signal('');
  readonly context = computed(() => {
    const items = this.monthly.hasValue() ? this.monthly.value().items : [];
    const id = this.monthlyArea() || this.applied().area_id;
    return items.find((item) => item.area_id === id) ??
      items.find((item) => item.area_id === 'parque-tunari') ?? items[0];
  });
  private readonly areaCatalog = resource({ loader: ({ abortSignal }) => this.api.list({ limit: 1 }, abortSignal) });
  readonly areas = computed(() => this.areaCatalog.hasValue() ? this.areaCatalog.value().areas : this.data()?.areas ?? []);
  readonly data = computed(() => this.result.hasValue() ? this.result.value() : undefined);
  readonly detail = resource({
    params: () => this.selectedId() || undefined,
    loader: ({ params, abortSignal }) => this.api.detail(params, abortSignal),
  });
  readonly selected = computed(() => this.detail.hasValue() && this.detail.value().uuid === this.selectedId()
    ? this.detail.value() : this.data()?.items.find((item) => item.uuid === this.selectedId()));
  readonly severityOptions = ['Media', 'Alta', 'Crítica'] as const;
  readonly statuses: AlertStatus[] = ['Pendiente', 'En revisión', 'En análisis', 'Verificada'];
  readonly statusColors: Record<AlertStatus, number> = {
    Pendiente: 2, 'En revisión': 3, 'En análisis': 1, Verificada: 0,
  };

  constructor() {
    inject(RealtimeClientService).alertChanges$.pipe(auditTime(300), takeUntilDestroyed()).subscribe(() => {
      this.result.reload();
      this.detail.reload();
      this.areaCatalog.reload();
    });
    effect(() => {
      if (!this.detail.hasValue() || this.saving()) return;
      const current = this.detail.value();
      const base = this.editorBase;
      if (base?.uuid === current.uuid && this.editStatus === base.status && this.editNote === (base.note ?? '')) {
        this.setEditor(current);
      }
    });
    effect(() => {
      const data = this.data();
      if (!data) return;
      if (this.page() > data.pages) this.page.set(data.pages);
    });
  }

  applyFilters(): void {
    const error = this.dates.rangeError(this.draft.desde, this.draft.hasta);
    this.filterError.set(error);
    if (error) return;
    this.selectedId.set('');
    this.monthlyArea.set('');
    this.page.set(1);
    this.applied.set({ ...this.draft });
    this.mobileFiltersOpen.set(false);
  }

  clearFilters(): void {
    this.draft = { ...initialFilters };
    this.applyFilters();
  }

  setPage(page: number): void {
    this.selectedId.set('');
    this.page.set(page);
  }

  select(alert: AlertEvent): void {
    this.saved.set(false);
    this.selectedId.set(alert.uuid);
    this.setEditor(alert);
  }

  private setEditor(alert: AlertEvent): void {
    this.editorBase = alert;
    this.editStatus = alert.status;
    this.editNote = alert.note ?? '';
    this.saveError.set('');
  }

  async save(alert: AlertEvent): Promise<void> {
    if (this.saving()) return;
    this.saved.set(false);
    this.saving.set(true);
    this.saveError.set('');
    try {
      const updated = await this.api.update(alert.uuid, this.editStatus, this.editNote);
      if (this.selectedId() === updated.uuid) {
        this.setEditor(updated);
        this.detail.set(updated);
        this.saved.set(true);
      }
      this.detail.reload();
      this.result.reload();
    } catch (error) {
      if (this.selectedId() === alert.uuid) this.saveError.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la consulta.';
  }

  showOnMap(): void {
    this.focusRequest.update((value) => value + 1);
    document.getElementById('tg-alert-map')?.scrollIntoView({ block: 'nearest' });
  }
}
