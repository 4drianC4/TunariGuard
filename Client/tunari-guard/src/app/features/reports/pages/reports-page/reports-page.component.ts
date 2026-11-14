import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [DecimalPipe, FormsModule, PageHeaderComponent],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ReportsApiService);
  private request?: AbortController;
  private defaults: ReportFilters = {
    kind: 'detections', area: 'parque-tunari', from: '', to: '', source: 'ALL', confidence: '', alertLevel: '',
  };

  readonly reportTypes = reportTypes;
  readonly sourceLabels = sourceLabels;
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
    if (kind === 'alerts') return null;
    let entries: { label: string; values: (number | null)[] }[];
    if (view.data.detections) {
      const counts = new Map<string, number>();
      for (const detection of view.data.detections) {
        const month = detection.fecha_bo.slice(0, 7);
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
      entries = [...counts].map(([label, count]) => ({ label, values: [count] }));
    } else {
      const end = kind === 'comparison' ? 3 : 2;
      entries = view.data.rows.map((row) => ({
        label: String(row[0]),
        values: row.slice(1, end).map((value) => typeof value === 'number' ? value : null),
      }));
    }
    const displayed = kind === 'districts' ? entries : entries.slice(-12);
    if (!displayed.some((entry) => entry.values.some((value) => value !== null))) return null;
    const max = Math.max(1, ...displayed.flatMap((entry) => entry.values.map((value) => value ?? 0)));
    return { entries: displayed, max, comparison: kind === 'comparison', shortened: entries.length > displayed.length };
  });

  filters = { ...this.defaults };
  filtersExpanded = false;
  format: ExportFormat = 'PDF';

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
        this.api.areas(controller.signal), this.api.coverage(controller.signal),
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
        from: coverage.slice(0, 4) + '-01-01',
        to: coverage,
      };
      this.filters = { ...this.defaults };
      await this.apply();
    } catch (error) {
      this.finishError(error, controller);
    }
  }

  changeKind(kind: ReportKind): void {
    const from = this.filters.from || this.defaults.from;
    const to = this.filters.to || this.defaults.to;
    this.filters = {
      ...this.filters, kind,
      from: kind === 'detections' ? (from.length === 7 ? from + '-01' : from) : from.slice(0, 7),
      to: kind === 'detections' ? (to.length === 7 ? this.lastDayOf(to) : to) : to.slice(0, 7),
      source: kind === 'detections' ? 'ALL' : 'HARMONIZED',
      confidence: '', alertLevel: '',
    };
    void this.apply();
  }

  async apply(): Promise<void> {
    const controller = this.beginRequest();
    const filters = { ...this.filters };
    try {
      const pattern = this.monthly ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
      if (!pattern.test(filters.from) || !pattern.test(filters.to) || filters.from > filters.to) {
        throw new Error('Selecciona un período válido. El inicio debe ser anterior o igual al fin.');
      }
      if (this.monthly && (filters.from < '2000-01' || filters.to > '2100-12')) {
        throw new Error('Selecciona meses entre los años 2000 y 2100.');
      }
      const data = await this.api.load(filters, controller.signal);
      if (controller.signal.aborted) return;
      const selectedArea = this.areas().find((entry) => entry.area_id === filters.area);
      const area = filters.kind === 'districts' ? 'Distritos de Cochabamba' : selectedArea?.nombre_visible ?? filters.area;
      const areaNotice = filters.kind === 'districts' ? null : selectedArea?.advertencia ?? null;
      this.view.set({ filters, area, areaNotice, data });
      if (!this.formats.includes(this.format)) this.format = 'PDF';
      this.loading.set(false);
    } catch (error) {
      this.finishError(error, controller);
    }
  }

  reset(): void {
    const kind = this.filters.kind;
    this.filters = { ...this.defaults };
    this.changeKind(kind);
  }

  generate(): void {
    const view = this.view();
    if (!view?.data.rows.length || !this.formats.includes(this.format)) return;
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
      ...(this.showSource(filters.kind) ? ['Selección: ' + sourceLabels[filters.source]] : []),
      ...(filters.confidence ? ['Confianza mínima: ' + filters.confidence] : []),
      ...(filters.alertLevel ? ['Nivel de alerta: ' + filters.alertLevel.replaceAll('_', ' ')] : []),
      `${data.headline.label}: ${data.headline.value ?? 'Sin cobertura'} ${data.headline.unit}`,
      data.notice,
      ...(coverageNotice ? [coverageNotice] : []),
      ...(view.areaNotice ? [view.areaNotice] : []),
    ];
    const { blob, extension } = exportReport(this.format, data, details);
    const fileName = `TunariGuard_${filters.kind}_${filters.from}_${filters.to}.${extension}`;
    const download = { title, date, format: this.format, fileName, blob };
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
