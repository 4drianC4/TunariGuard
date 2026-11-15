import { LanguageService } from '../../../../core/i18n/language.service';
import { DecimalPipe } from '@angular/common';
import { inject, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MonthlyProjectionItem } from '../../../../application/services/projections.service';
import type { HistoryApiRecord } from '../../../../domain/models/historical-record.model';

@Component({
  selector: 'app-historical-projection-chart',
  imports: [DecimalPipe],
  templateUrl: './historical-projection-chart.component.html',
  styleUrl: './historical-projection-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricalProjectionChartComponent {
  readonly t = inject(LanguageService).text;
  readonly locale = inject(LanguageService).locale;
  readonly history = input.required<readonly HistoryApiRecord[]>();
  readonly projection = input.required<readonly MonthlyProjectionItem[]>();
  readonly compact = input(false);
  readonly loading = input(false);
  readonly historyUnavailable = input(false);
  readonly projectionUnavailable = input(false);

  readonly chart = computed(() => {
    const historical = this.history()
      .filter(({ source }) => source === 'HARMONIZED')
      .map(({ year, month, activityCount }) => ({
        month: `${year}-${String(month).padStart(2, '0')}`,
        value: Number(activityCount ?? 0),
        projected: false,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const lastMonth = historical.at(-1)?.month ?? '';
    const forecast = this.projection()
      .filter(({ mes }) => mes > lastMonth)
      .map(({ mes, indice_esperado_modelo }) => ({ month: mes, value: indice_esperado_modelo, projected: true }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const timeline = [...historical, ...forecast];
    if (!timeline.length) return null;

    const width = this.compact() ? 520 : 1120;
    const right = width - 28;
    const max = Math.max(1, ...timeline.map(({ value }) => value));
    const points = timeline.map((point, index) => ({
      ...point,
      x: timeline.length === 1 ? width / 2 : 62 + (right - 62) * index / (timeline.length - 1),
      y: 250 - point.value * 205 / max,
    }));

    const line = (series: typeof points) => series.map(({ x, y }) => `${x},${y}`).join(' ');
    const range = (series: typeof timeline) => series.length
      ? `${series[0].month} – ${series.at(-1)?.month}`
      : null;
    const yearTicks = points.filter(({ month }, index) => index === 0 || month.endsWith('-01'));
    const stride = this.compact() ? Math.ceil(yearTicks.length / 6) : 1;
    const forecastIndex = historical.length;

    return {
      width,
      right,
      points,
      range: range(timeline),
      historyRange: range(historical),
      projectionRange: range(forecast),
      historyLine: line(points.slice(0, forecastIndex)),
      projectionLine: forecast.length ? line(points.slice(Math.max(0, forecastIndex - 1))) : '',
      boundary: historical.length && forecast.length ? points[forecastIndex].x : null,
      yearTicks: yearTicks.filter((_, index) => index % stride === 0),
      valueTicks: [0, 1, 2, 3, 4].map((index) => ({ y: 45 + index * 51, value: max * (4 - index) / 4 })),
    };
  });
}
