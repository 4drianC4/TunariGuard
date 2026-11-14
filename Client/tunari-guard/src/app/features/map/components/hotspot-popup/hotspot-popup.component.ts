import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Observation } from '../../models/observation.model';
import { MapDataOrigin } from '../../models/map-data.model';

@Component({
  selector: 'app-hotspot-popup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hotspot-popup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotspotPopupComponent {
  @Input() observation: Observation | null = null;
  @Input() origin: MapDataOrigin = 'DEMO';
  @Output() readonly close = new EventEmitter<void>();
}
