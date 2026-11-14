
import { Component, input } from '@angular/core';

import { HistorySource } from '../../../../domain/models/historical-record.model';

@Component({
  selector: 'app-month-detail',
  standalone: true,
  imports: [],
  templateUrl: './month-detail.component.html',
  styleUrl: './month-detail.component.scss',
})
export class MonthDetailComponent {
  readonly year = input.required<number>();
  readonly month = input.required<number>();
  readonly count = input.required<number>();
  readonly source = input.required<HistorySource>();

  readonly monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril',
    'Mayo', 'Junio', 'Julio', 'Agosto',
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  get monthName(): string {
    return this.monthNames[this.month() - 1] ?? 'Mes desconocido';
  }

  get sourceName(): string {
    const names: Record<HistorySource, string> = {
      HARMONIZED: 'Armonizado',
      MODIS: 'MODIS',
      VIIRS: 'VIIRS',
    };

    return names[this.source()];
  }
}
