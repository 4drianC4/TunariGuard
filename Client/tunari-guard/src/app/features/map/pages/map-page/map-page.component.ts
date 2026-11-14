import { ChangeDetectionStrategy, Component } from '@angular/core';
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
  readonly mapState = inject(MapStateService);

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
