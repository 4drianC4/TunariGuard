import { LanguageService } from '../../../../core/i18n/language.service';
import { MapInfoComponent } from '../map-info.component';
import { CommonModule } from '@angular/common';
import { inject, ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Observation, SatellitePlatform } from '../../models/observation.model';
import { MapObservationFilters } from '../../models/map-observation-filters.model';

@Component({
  selector: 'app-map-filters',
  standalone: true,
  imports: [MapInfoComponent, CommonModule],
  templateUrl: './map-filters.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFiltersComponent {
  readonly t = inject(LanguageService).text;
  @Input({ required: true }) observations: readonly Observation[] = [];
  @Input({ required: true }) filters: MapObservationFilters = {
    minConfidence: '',
    minFrpMw: null,
    dayNight: '',
    platforms: [],
  };

  @Output() readonly filtersChange = new EventEmitter<Partial<MapObservationFilters>>();
  @Output() readonly reset = new EventEmitter<void>();

  get hasFrpValues(): boolean {
    return this.observations.some((observation) => observation.frpMw != null);
  }

  get hasDayNightValues(): boolean {
    return this.observations.some((observation) => observation.dayNight != null);
  }

  readonly platformOptions: ReadonlyArray<{ value: SatellitePlatform; label: string; color: string }> = [
    { value: 'TERRA', label: 'MODIS · Terra', color: '#2563EB' },
    { value: 'AQUA', label: 'MODIS · Aqua', color: '#2563EB' },
    { value: 'SNPP', label: 'VIIRS · Suomi NPP', color: '#DC2626' },
    { value: 'NOAA20', label: 'VIIRS · NOAA-20', color: '#DC2626' },
    { value: 'NOAA21', label: 'VIIRS · NOAA-21', color: '#DC2626' },
  ];

  togglePlatform(platform: SatellitePlatform, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const platforms: SatellitePlatform[] = checked
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
    const dayNight = value === 'DAY' || value === 'NIGHT' ? value : '';
    this.filtersChange.emit({ dayNight });
  }

  setFrpThreshold(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filtersChange.emit({ minFrpMw: value === '' ? null : Number(value) });
  }
}
