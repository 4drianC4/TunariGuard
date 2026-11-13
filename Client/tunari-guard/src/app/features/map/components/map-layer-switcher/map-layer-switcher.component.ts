import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { SensorType } from '../../../../domain/enums/sensor-type.enum';
import { Observation } from '../../models/observation.model';

@Component({
  selector: 'app-map-layer-switcher',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-layer-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLayerSwitcherComponent {
  @Input({ required: true }) observations: readonly Observation[] = [];
  @Input({ required: true }) visibleSensors: readonly SensorType[] = [];
  @Output() readonly visibilityChange = new EventEmitter<{ sensor: SensorType; visible: boolean }>();

  readonly sensors: readonly { sensor: SensorType; colorClass: string }[] = [
    { sensor: SensorType.VIIRS, colorClass: 'bg-[#DC2626]' },
    { sensor: SensorType.MODIS, colorClass: 'bg-[#2563EB]' },
  ];

  count(sensor: SensorType): number {
    return this.observations.filter((observation) => observation.sensor === sensor).length;
  }

  isVisible(sensor: SensorType): boolean {
    return this.visibleSensors.includes(sensor);
  }

  toggle(sensor: SensorType, event: Event): void {
    this.visibilityChange.emit({
      sensor,
      visible: (event.target as HTMLInputElement).checked,
    });
  }
}
