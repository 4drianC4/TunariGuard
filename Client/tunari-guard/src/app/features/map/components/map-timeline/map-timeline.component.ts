import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MapPeriod } from '../../../../domain/models/map-period.model';

/** Read-only summary of the period applied to the map. */
@Component({
  selector: 'app-map-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-timeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapTimelineComponent {
  @Input({ required: true }) period: MapPeriod = { from: '', to: '' };
}
