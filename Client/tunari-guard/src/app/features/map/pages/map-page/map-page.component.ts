import { ChangeDetectionStrategy, Component } from '@angular/core';
import { inject } from '@angular/core';
import type * as L from 'leaflet';
import { HotspotMapComponent } from '../../components/hotspot-map/hotspot-map.component';
import { MapStateService } from '../../../../application/services/map-state.service';
import { MapEntitySelection } from '../../../../domain/models/map-entity-selection.model';

@Component({
  selector: 'app-map-page', standalone: true,
  imports: [HotspotMapComponent],
  templateUrl: './map-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent {
  readonly mapState = inject(MapStateService);

  onSelectionChange(selection: MapEntitySelection | null): void {
    this.mapState.setSelectedEntity(selection);
  }

  onAreaOfInterestChange(area: ReturnType<L.Polygon['toGeoJSON']> | null): void {
    this.mapState.setAreaOfInterest(area);
  }
}
