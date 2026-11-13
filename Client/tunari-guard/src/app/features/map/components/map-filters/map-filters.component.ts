import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Observation } from '../../models/observation.model';
import { MapObservationFilters } from '../../models/map-observation-filters.model';

@Component({
  selector: 'app-map-filters',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-filters.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFiltersComponent {
  @Input({ required: true }) observations: readonly Observation[] = [];
  @Input({ required: true }) filters: MapObservationFilters = {
    minConfidence: '',
    minFrpMw: null,
    dayNight: '',
    platforms: [],
  };

  @Output() readonly filtersChange = new EventEmitter<Partial<MapObservationFilters>>();
  @Output() readonly reset = new EventEmitter<void>();

  get confidenceOptions(): NonNullable<Observation['confidenceLevel']>[] {
    const order = { LOW: 1, NOMINAL: 2, HIGH: 3 } as const;
    return [...new Set(
      this.observations.map((observation) => observation.confidenceLevel)
        .filter((value): value is NonNullable<Observation['confidenceLevel']> => value != null),
    )].sort((left, right) => order[left] - order[right]);
  }

  get hasFrpValues(): boolean {
    return this.observations.some((observation) => observation.frpMw != null);
  }

  get hasDayNightValues(): boolean {
    return this.observations.some((observation) => observation.dayNight != null);
  }

  get platformOptions(): string[] {
    return [...new Set(this.observations.map((observation) => observation.platform).filter(Boolean))].sort();
  }

  togglePlatform(platform: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const platforms = checked
      ? [...new Set([...this.filters.platforms, platform])]
      : this.filters.platforms.filter((item) => item !== platform);
    this.filtersChange.emit({ platforms });
  }

  setConfidenceThreshold(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const minConfidence = value === 'LOW' || value === 'NOMINAL' || value === 'HIGH' ? value : '';
    this.filtersChange.emit({ minConfidence });
  }

  setDayNight(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const dayNight = value === 'D' || value === 'N' ? value : '';
    this.filtersChange.emit({ dayNight });
  }

  setFrpThreshold(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filtersChange.emit({ minFrpMw: value === '' ? null : Number(value) });
  }
}
