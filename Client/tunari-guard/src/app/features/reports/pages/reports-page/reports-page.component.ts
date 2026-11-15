import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { DetectionDateDirective } from '../../../../shared/directives/detection-date.directive';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapInfoComponent } from '../../../map/components/map-info.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { exportReport, type ExportFormat } from '../../data-access/report-export';
import {
  ReportsApiService, type ReportArea, type ReportData, type ReportFilters, type ReportKind,
} from '../../data-access/reports-api.service';

const reportTypes: Record<ReportKind, string> = {
  detections: 'Detecciones térmicas',
  alerts: 'Resumen de anomalías',
  districts: 'Reporte por distrito',
  history: 'Tendencia mensual',
  comparison: 'Comparación de sensores',
};

const sourceLabels = {
  ALL: 'Todos los satélites',
  HARMONIZED: 'Índice armonizado',
  MODIS: 'MODIS',
  VIIRS: 'VIIRS',
};

interface ReportView {
  filters: ReportFilters;
  area: string;
  areaNotice: string | null;
  method: string;
  data: ReportData;
}

interface DownloadRecord {
  title: string;
  date: string;
  format: ExportFormat;
  fileName: string;
  blob: Blob;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [DetectionDateDirective, DecimalPipe, FormsModule, PageHeaderComponent, MapInfoComponent],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  readonly dates = inject(DetectionDatesService);
  private readonly api = inject(ReportsApiService);
  private request?: AbortController;
  private defaults: ReportFilters = {
    kind: 'detections', area: 'parque-tunari', from: '', to: '', source: 'ALL', confidence: '', alertLevel: '',
  };

  readonly reportTypes = reportTypes;
  readonly sourceLabels = sourceLabels;
  readonly icons: Record<ReportKind, string> = {
    detections: 'fire', alerts: 'bell', districts: 'districts', history: 'trend', comparison: 'harmonization',
  };
  readonly exportLabels: Record<ExportFormat, string> = {
    PDF: 'Resumen, hasta 20 filas', CSV: 'Todas las filas', Excel: 'Todas las filas y contexto', GeoJSON: 'Puntos geográficos',
  };
  readonly kinds = Object.keys(reportTypes) as ReportKind[];
  readonly areas = signal<ReportArea[]>([]);
  readonly coverage = signal('');
  readonly view = signal<ReportView | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly recent = signal<DownloadRecord[]>([]);
  readonly coverageNotice = computed(() => {
    const report = this.view();
    const coverage = this.coverage();
    if (!report || !coverage) return null;
    const cutoff = report.filters.kind === 'detections' ? coverage : coverage.slice(0, 7);
    if (report.filters.from > cutoff) {
      return 'El período está fuera de la cobertura declarada del paquete.';
    }
    if (report.filters.to > cutoff) {
      return 'El período supera la cobertura declarada del paquete. Los resultados pueden estar incompletos.';
    }
    return null;
  });
  readonly page = signal(0);
  readonly pageSize = 15;
  readonly pageCount = computed(() => Math.ceil((this.view()?.data.rows.length ?? 0) / this.pageSize));
  readonly visibleRows = computed(() => {
    const offset = this.page() * this.pageSize;
    return this.view()?.data.rows.slice(offset, offset + this.pageSize) ?? [];
  });
  readonly chart = computed(() => {
    const view = this.view();
    if (!view) return null;
    const { kind } = view.filters;
    let entries: { label: string; values: (number | null)[] }[];
    if (view.data.detections) {
      const counts = new Map<string, number>();
      for (const detection of view.data.detections) {
        const month = detection.fecha_bo.slice(0, 7);
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
      entries = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, values: [count] }));
    } else {
      const start = kind === 'alerts' ? 4 : 1;
      const end = kind === 'alerts' ? 6 : kind === 'comparison' ? 3 : 2;
      entries = view.data.rows.map((row) => ({
        label: String(row[0]),
        values: row.slice(start, end).map((value) => typeof value === 'number' ? value : null),
      }));
    }
    const displayed = kind === 'districts' ? entries : entries.slice(-12);
    if (!displayed.some((entry) => entry.values.some((value) => value !== null))) return null;
    const max = Math.max(1, ...displayed.flatMap((entry) => entry.values.map((value) => value ?? 0)));
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const limit = Math.ceil(max / step) * step;
    return { entries: displayed, max: limit, ticks: [limit, limit / 2, 0], comparison: kind === 'comparison', shortened: entries.length > displayed.length };
  });

  filters = { ...this.defaults };
  filtersExpanded = false;

  get monthly(): boolean { return this.filters.kind !== 'detections'; }
  showSource(kind: ReportKind): boolean {
    return kind === 'detections' || kind === 'history' || kind === 'districts';
  }

  get formats(): ExportFormat[] {
    return this.view()?.data.detections ? ['PDF', 'CSV', 'Excel', 'GeoJSON'] : ['PDF', 'CSV', 'Excel'];
  }

  ngOnInit(): void { void this.initialize(); }
  ngOnDestroy(): void { this.request?.abort(); }

  async initialize(): Promise<void> {
    const controller = this.beginRequest();
    try {
      const [areas, coverage] = await Promise.all([
        this.api.areas(controller.signal), this.api.coverage(controller.signal), this.dates.load(),
      ]);
      if (controller.signal.aborted) return;
      if (!areas.length || !/^\d{4}-\d{2}-\d{2}$/.test(coverage)) {
        throw new Error('El paquete de datos no informa áreas o fecha de cobertura.');
      }
      this.areas.set(areas);
      this.coverage.set(coverage);
      this.defaults = {
        ...this.defaults,
        area: areas.find((area) => area.area_id === 'parque-tunari')?.area_id ?? areas[0].area_id,
        from: this.dates.clamp(coverage.slice(0, 4) + '-01-01'),
        to: this.dates.clamp(coverage),
      };
      this.filters = { ...this.defaults };
      await this.apply();
    } catch (error) {
      this.finishError(error, controller);
    }
  }

  changeKind(kind: ReportKind): void {
    if (kind === this.filters.kind) return;
    const from = this.filters.from || this.defaults.from;
    const to = this.filters.to || this.defaults.to;
    this.filters = {
      ...this.filters, kind,
      from: kind === 'detections' ? this.dates.clamp(from.length === 7 ? from + '-01' : from) : from.slice(0, 7),
      to: kind === 'detections' ? this.dates.clamp(to.length === 7 ? this.lastDayOf(to) : to) : to.slice(0, 7),
      source: kind === 'detections' ? 'ALL' : 'HARMONIZED',
      confidence: '', alertLevel: '',
    };
    void this.apply();
  }

  async apply(): Promise<void> {
    const controller = this.beginRequest();
    const filters = { ...this.filters };
    try {
      if (!filters.from || !filters.to) throw new Error('Selecciona un período válido.');
      const rangeError = this.dates.rangeError(filters.from, filters.to, this.monthly ? 'month' : 'day');
      if (rangeError) throw new Error(rangeError);
      const data = await this.api.load(filters, controller.signal);
      if (controller.signal.aborted) return;
      const selectedArea = this.areas().find((entry) => entry.area_id === filters.area);
      const area = filters.kind === 'districts' ? 'Distritos de Cochabamba' : selectedArea?.nombre_visible ?? filters.area;
      const areaNotice = filters.kind === 'districts' ? null : selectedArea?.advertencia ?? null;
      const method = filters.kind === 'detections' ? 'Conteo de registros satelitales' :
        filters.kind === 'alerts' ? 'Comparación con el mismo mes de años anteriores' :
        filters.kind === 'comparison' || filters.source === 'MODIS' || filters.source === 'VIIRS' ? 'Celdas-día por sensor' :
        selectedArea?.metodo_indice === 'mixto_calibrado' && filters.kind !== 'districts' ? 'Índice armonizado MODIS y VIIRS' :
        'VIIRS en escala MODIS';
      this.view.set({ filters, area, areaNotice, method, data });
      this.loading.set(false);
    } catch (error) {
      this.finishError(error, controller);
    }
  }

  reset(): void {
    const kind = this.filters.kind;
    this.filters = { ...this.defaults };
    if (kind === this.defaults.kind) void this.apply();
    else this.changeKind(kind);
  }

  generate(format: ExportFormat): void {
    const view = this.view();
    if (!view?.data.rows.length || !this.formats.includes(format)) return;
    const { filters, data } = view;
    const title = this.reportTypes[filters.kind];
    const now = new Date();
    const date = now.toLocaleString('es-BO', { timeZone: 'America/La_Paz' });
    const coverageNotice = this.coverageNotice();
    const details = [
      'Tunari Guard · ' + title,
      'Área: ' + view.area,
      `Período: ${filters.from} a ${filters.to} (hora de Bolivia)`,
      'Generado: ' + date,
      'Fuente: NASA FIRMS · paquete de análisis fuego',
      'Cobertura informada: ' + this.coverage(),
      'Método: ' + view.method,
      ...(this.showSource(filters.kind) ? ['Selección: ' + sourceLabels[filters.source]] : []),
      ...(filters.confidence ? ['Confianza mínima: ' + filters.confidence] : []),
      ...(filters.alertLevel ? ['Nivel de alerta: ' + filters.alertLevel.replaceAll('_', ' ')] : []),
      `${data.headline.label}: ${data.headline.value ?? 'Sin cobertura'} ${data.headline.unit}`,
      data.notice,
      ...(coverageNotice ? [coverageNotice] : []),
      ...(view.areaNotice ? [view.areaNotice] : []),
    ];
    const { blob, extension } = exportReport(format, data, details);
    const fileName = `TunariGuard_${filters.kind}_${filters.from}_${filters.to}.${extension}`;
    const download = { title, date, format, fileName, blob };
    this.download(download);
    this.recent.update((records) => [download, ...records].slice(0, 6));
  }

  download(record: DownloadRecord): void {
    const link = document.createElement('a');
    const url = URL.createObjectURL(record.blob);
    link.href = url;
    link.download = record.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  private beginRequest(): AbortController {
    this.request?.abort();
    this.request = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.view.set(null);
    this.page.set(0);
    return this.request;
  }

  private finishError(error: unknown, controller: AbortController): void {
    if (controller.signal.aborted) return;
    this.error.set(error instanceof Error ? error.message : 'No se pudo consultar la API.');
    this.loading.set(false);
  }

  private lastDayOf(month: string): string {
    const day = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
    return month + '-' + day;
  }
}
