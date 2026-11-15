import { LanguageService } from '../../../../core/i18n/language.service';

import { inject, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HistorySource } from '../../../../domain/models/historical-record.model';

@Component({
  selector: 'app-month-detail',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './month-detail.component.html',
  styleUrl: './month-detail.component.scss',
})
export class MonthDetailComponent {
  readonly t = inject(LanguageService).text;
  readonly locale = inject(LanguageService).locale;
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
    return this.t(this.monthNames[this.month() - 1] ?? 'Mes desconocido');
  }

  get sourceName(): string {
    const names: Record<HistorySource, string> = {
      HARMONIZED: 'Índice armonizado',      MODIS: 'MODIS',      VIIRS: 'VIIRS',
    };

    return names[this.source()];
  }
}
