import { LanguageService } from '../../../../core/i18n/language.service';

import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { MonthDetailComponent } from '../month-detail/month-detail.component';
import { MetricsService } from '../../../../application/services/metrics.service';

interface CalendarCell {
  readonly year: number;
  readonly month: number;
  readonly count: number | null;
  readonly level: number;
}

interface PopoverPosition {
  top: number;
  left: number;
}

@Component({
  selector: 'app-history-calendar',
  standalone: true,
  imports: [MonthDetailComponent],
  templateUrl: './history-calendar.component.html',
  styleUrl: './history-calendar.component.scss',
})


export class HistoryCalendarComponent {
  readonly t = inject(LanguageService).text;
  constructor() {
    effect(() => {
      this.metrics.records();
      this.selectedCell.set(null);
      this.currentPage.set(1);
    });
  }

  readonly popoverPosition = signal<PopoverPosition | null>(null);

  /** Cierra el detalle al hacer clic fuera del popover.
   * Los clics en otra celda se dejan pasar para poder cambiar de mes.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.selectedCell()) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    if (
      target.closest('[data-history-popover]') ||
      target.closest('[data-history-month-cell]')
    ) {
      return;
    }

    this.closeDetail();
  }

  /** Cierra el detalle cuando el usuario desplaza la página fuera del calendario. */
  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.selectedCell()) {
      this.closeDetail();
    }
  }

  /** Navegación del calendario en bloques de cinco años. */
  readonly currentPage = signal(1);
  readonly yearsPerPage = 5;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.years().length / this.yearsPerPage)));
  readonly visibleCalendar = computed(() => {
    const start = (this.currentPage() - 1) * this.yearsPerPage;
    return this.calendar().slice(start, start + this.yearsPerPage);
  });
  readonly visibleYearRange = computed(() => {
    const rows = this.visibleCalendar();
    if (!rows.length) return '';
    return `${rows[0].year} – ${rows[rows.length - 1].year}`;
  });

  readonly hasRecords = computed(
    () => this.metrics.records().length > 0,
  );

  readonly hasAvailableMonths = computed(
    () => this.calendar().some((year) =>
      year.cells.some((month) => month.count !== null),
    ),
  );

  private readonly metrics = inject(MetricsService);

  /**
 * Mes seleccionado por el usuario.
 */
  readonly selectedCell = signal<CalendarCell | null>(null);

  /**
   * Fuente actualmente seleccionada.
   */
  readonly selectedSource = this.metrics.selectedSource;

  /**
   * Seleccionar un mes del calendario.
   */

  selectMonth(cell: CalendarCell, event: MouseEvent): void {
    if (cell.count === null) {
      return;
    }

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();

    const popoverWidth = 320;
    const popoverHeight = 210;
    const spacing = 12;

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    // Preferimos abrir a la derecha de la celda.
    let left = rect.right + spacing;

    // Si no hay espacio, abrimos a la izquierda.
    if (left + popoverWidth > viewportWidth - spacing) {
      left = rect.left - popoverWidth - spacing;
    }

    // Evitar que salga de los límites horizontales.
    left = Math.max(
      spacing,
      Math.min(left, viewportWidth - popoverWidth - spacing),
    );

    // Alinear con la celda y ajustar verticalmente.
    let top = rect.top;

    if (top + popoverHeight > viewportHeight - spacing) {
      top = viewportHeight - popoverHeight - spacing;
    }

    top = Math.max(spacing, top);

    this.selectedCell.set(cell);
    this.popoverPosition.set({ top, left });
  }

  closeDetail(): void {
    this.selectedCell.set(null);
    this.popoverPosition.set(null);
  }

  previousPeriod(): void {
    this.closeDetail();
    this.currentPage.update(page => Math.max(1, page - 1));
  }

  nextPeriod(): void {
    this.closeDetail();
    this.currentPage.update(page => Math.min(this.totalPages(), page + 1));
  }


  /**
   * Comprobar si una celda está seleccionada.
   */
  isSelected(cell: CalendarCell): boolean {
    const selected = this.selectedCell();

    return selected?.year === cell.year
      && selected?.month === cell.month;
  }

  readonly years = computed(() => {
    const records = this.metrics.records();
    if (!records.length) return [];
    const min = Math.min(...records.map(record => record.year));
    const max = Math.max(...records.map(record => record.year));
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  });

  readonly months = [
    'Ene', 'Feb', 'Mar', 'Abr',
    'May', 'Jun', 'Jul', 'Ago',
    'Sep', 'Oct', 'Nov', 'Dic',
  ];

  /**
   * Actividad máxima de la fuente seleccionada.
   */
  private readonly maxActivity = computed(() => {
    const records = this.metrics.records();

    return Math.max(
      0,
      ...records.map(record => record.activityCount),
    );
  });

  /**
   * Construye la matriz de años y meses.
   *
   * null significa que no existe registro para ese mes.
   * No debe interpretarse como actividad cero.
   */
  readonly calendar = computed(() => {
    const records = this.metrics.records();

    return this.years().map(year => ({
      year,
      cells: this.months.map((_, index): CalendarCell => {
        const month = index + 1;

        const record = records.find(
          item => item.year === year && item.month === month,
        );

        if (!record) {
          return {
            year,
            month,
            count: null,
            level: -1,
          };
        }

        const max = this.maxActivity();

        const level = max === 0
          ? 0
          : Math.min(
            4,
            Math.ceil((record.activityCount / max) * 4),
          );

        return {
          year,
          month,
          count: record.activityCount,
          level,
        };
      }),
    }));
  });

  readonly availableMonths = computed(() =>
    this.metrics.records().filter(record => true).length,
  );

  readonly unavailableMonths = computed(() => {
    const fromYear = this.metrics.selectedFromYear();
    const toYear = this.metrics.selectedToYear();
    if (fromYear === null || toYear === null) return 0;
    const monthsInRange = (toYear - fromYear + 1) * 12;
    return Math.max(0, monthsInRange - this.availableMonths());
  });

  getMonthName(month: number): string {
    return this.t(this.months[month - 1]);
  }
}
