import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { inject } from '@angular/core';
import type * as L from 'leaflet';
import { HotspotMapComponent } from '../../components/hotspot-map/hotspot-map.component';
import { MapStateService } from '../../../../application/services/map-state.service';
import { MapEntitySelection } from '../../../../domain/models/map-entity-selection.model';
import type { MapPeriod } from '../../models/map-period.model';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-map-page', standalone: true,
  imports: [HotspotMapComponent, PageHeaderComponent],
  templateUrl: './map-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent {
  readonly dates = inject(DetectionDatesService);
  readonly mapState = inject(MapStateService);

  constructor() {
    effect(() => {
      const current = this.mapState.period();
      const from = this.dates.clamp(current.from);
      const to = this.dates.clamp(current.to);
      if (from !== current.from || to !== current.to) this.mapState.setPeriod({ from, to });
    });
  }

  onContextChange({ areaId, period }: { areaId: string; period: MapPeriod }): void {
    this.mapState.areaId.set(areaId);
    if (this.mapState.period().from !== period.from || this.mapState.period().to !== period.to) {
      this.mapState.setPeriod(period);
    }
  }

  onSelectionChange(selection: MapEntitySelection | null): void {
    this.mapState.setSelectedEntity(selection);
  }

  onAreaOfInterestChange(area: ReturnType<L.Polygon['toGeoJSON']> | null): void {
    this.mapState.setAreaOfInterest(area);
  }
}
