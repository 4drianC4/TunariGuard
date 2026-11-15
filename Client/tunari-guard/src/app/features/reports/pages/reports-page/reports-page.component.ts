import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { DetectionDateDirective } from '../../../../shared/directives/detection-date.directive';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapInfoComponent } from '../../../map/components/map-info.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { buildReportChart } from '../../data-access/report-chart';
import type { ReportExportContext } from '../../data-access/report-pdf';
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
  private destroyed = false;
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
  readonly exporting = signal<ExportFormat | null>(null);
  readonly exportError = signal('');
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
    return view ? buildReportChart(view.data, view.filters.kind) : null;
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
  ngOnDestroy(): void {
    this.destroyed = true;
    this.request?.abort();
  }

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

  async generate(format: ExportFormat): Promise<void> {
    const view = this.view();
    if (!view?.data.rows.length || !this.formats.includes(format) || this.exporting()) return;

    this.exportError.set('');
    this.exporting.set(format);
    const context = this.exportContext(view);
    const { kind, from, to } = view.filters;
    try {
      const { blob, extension } = await exportReport(format, view.data, context);
      if (this.destroyed) return;
      const fileName = `TunariGuard_${kind}_${from}_${to}.${extension}`;
      const download = { title: context.title, date: context.date, format, fileName, blob };
      this.download(download);
      this.recent.update((records) => [download, ...records].slice(0, 6));
    } catch {
      this.exportError.set('No se pudo preparar la descarga. Intenta nuevamente.');
    } finally {
      this.exporting.set(null);
    }
  }

  private exportContext(view: ReportView): ReportExportContext {
    const { filters, data } = view;
    const fields: ReportExportContext['fields'] = [
      ['Área', view.area],
      ['Período', `${filters.from} a ${filters.to} (hora de Bolivia)`],
      ['Fuente', 'NASA FIRMS · paquete de análisis fuego'],
      ['Método', view.method],
    ];
    if (this.showSource(filters.kind)) fields.push(['Selección', sourceLabels[filters.source]]);
    if (filters.confidence) fields.push(['Confianza mínima', filters.confidence]);
    if (filters.alertLevel) fields.push(['Nivel de alerta', filters.alertLevel.replaceAll('_', ' ')]);

    return {
      title: this.reportTypes[filters.kind],
      date: new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' }),
      fields,
      notices: [data.notice, this.coverageNotice(), view.areaNotice].filter((notice): notice is string => !!notice),
    };
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
    this.exportError.set('');
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
