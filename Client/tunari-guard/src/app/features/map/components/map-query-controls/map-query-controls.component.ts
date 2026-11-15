import { LanguageService } from '../../../../core/i18n/language.service';
import { MapInfoComponent } from '../map-info.component';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { DetectionDateDirective } from '../../../../shared/directives/detection-date.directive';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { AnalysisArea } from '../../data-access/map-analysis.service';
import type { MapPeriod } from '../../models/map-period.model';

@Component({
  selector: 'app-map-query-controls',
  imports: [DetectionDateDirective, MapInfoComponent],
  templateUrl: './map-query-controls.component.html',
  styleUrl: './map-query-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapQueryControlsComponent {
  readonly t = inject(LanguageService).text;
  readonly areaText = inject(LanguageService).area;
  readonly dates = inject(DetectionDatesService);
  readonly areaId = input.required<string>();
  readonly areas = input.required<readonly Omit<AnalysisArea, 'geometria'>[]>();
  readonly period = input.required<MapPeriod>();
  readonly contextChange = output<{ areaId: string; period: MapPeriod }>();
  readonly centerArea = output<void>();
  readonly periodError = signal('');

  applyPeriod(from: string, to: string): void {
    const error = !from || !to
      ? 'Selecciona un rango de fechas válido.'
      : this.dates.rangeError(from, to);
    this.periodError.set(error);
    if (error) return;
    this.contextChange.emit({ areaId: this.areaId(), period: { from, to } });
  }
}
