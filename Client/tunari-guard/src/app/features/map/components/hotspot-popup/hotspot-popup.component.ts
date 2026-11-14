import { MapInfoComponent } from '../map-info.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { DistrictAssignment, Observation, ObservationSource } from '../../models/observation.model';
import { MapDataOrigin } from '../../models/map-data.model';

@Component({
  selector: 'app-hotspot-popup',
  standalone: true,
  imports: [MapInfoComponent, CommonModule],
  templateUrl: './hotspot-popup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotspotPopupComponent {
  readonly confidenceLabels: Record<string, string> = { LOW: 'Baja', NOMINAL: 'Nominal', HIGH: 'Alta' };
  readonly districtLabels: Record<DistrictAssignment, string> = {
    PENDING: 'Pendiente', ASSIGNED: 'Asignado', OUTSIDE: 'Fuera de los distritos', AMBIGUOUS: 'Sin un distrito único',
  };
  readonly sourceLabels: Record<ObservationSource, string> = {
    NASA_FIRMS: 'NASA FIRMS', IMPORTED: 'Datos importados', SIMULATED: 'Simulación',
  };
  readonly detectionTypeLabels: Record<number, string> = {
    0: 'Posible incendio de vegetación',
    1: 'Volcán',
    2: 'Fuente térmica fija en tierra',
    3: 'Fuente térmica costa afuera',
  };
  @Input() observation: Observation | null = null;
  @Input() origin: MapDataOrigin = 'DEMO';
  @Output() readonly close = new EventEmitter<void>();
}
