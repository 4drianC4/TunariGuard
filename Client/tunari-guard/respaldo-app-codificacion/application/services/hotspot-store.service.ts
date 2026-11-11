import { computed, Injectable, signal } from '@angular/core';
import { DEMO_HOTSPOTS } from '../../data-access/mock/hotspots.mock';
import { DEMO_OBSERVATIONS } from '../../data-access/mock/observations.mock';
import { DataOrigin } from '../../domain/enums/data-origin.enum';
import { SensorType } from '../../domain/enums/sensor-type.enum';
import { HarmonizedHotspot } from '../../domain/models/harmonized-hotspot.model';
import { SatelliteObservation } from '../../domain/models/satellite-observation.model';

@Injectable({ providedIn: 'root' })
export class HotspotStoreService {
  readonly observations = signal<readonly SatelliteObservation[]>(DEMO_OBSERVATIONS);
  readonly hotspots = signal<readonly HarmonizedHotspot[]>(DEMO_HOTSPOTS);
  readonly totalObservations = computed(() => this.observations().length);
  readonly modisCount = computed(() => this.observations().filter(o => o.sensor === SensorType.MODIS).length);
  readonly viirsCount = computed(() => this.observations().filter(o => o.sensor === SensorType.VIIRS).length);
  readonly hotspotsCount = computed(() => this.hotspots().length);
  readonly demoMode = computed(() => this.observations().some(o => o.source === DataOrigin.SIMULATED));
  setObservations(data: readonly SatelliteObservation[]): void { this.observations.set(data); }
  setHotspots(data: readonly HarmonizedHotspot[]): void { this.hotspots.set(data); }
}