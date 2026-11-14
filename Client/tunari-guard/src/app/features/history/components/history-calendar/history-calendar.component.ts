
import { Component, computed, effect, inject, signal, } from '@angular/core';
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
  constructor() {
    effect(() => {
      this.metrics.selectedSource();
      this.selectedCell.set(null);
    });
  }

  readonly popoverPosition = signal<PopoverPosition | null>(null);

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


  /**
   * Comprobar si una celda está seleccionada.
   */
  isSelected(cell: CalendarCell): boolean {
    const selected = this.selectedCell();

    return selected?.year === cell.year
      && selected?.month === cell.month;
  }

  readonly years = Array.from(
    { length: 22 },
    (_, index) => 2005 + index,
  );

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

    return this.years.map(year => ({
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
    this.metrics.records().length,
  );

  readonly unavailableMonths = computed(() =>
    22 * 12 - this.availableMonths(),
  );

  getMonthName(month: number): string {
    return this.months[month - 1];
  }
}
