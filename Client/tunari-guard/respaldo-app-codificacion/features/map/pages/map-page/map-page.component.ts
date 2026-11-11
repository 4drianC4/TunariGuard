import { ChangeDetectionStrategy, Component } from '@angular/core';
@Component({
  selector: 'app-map-page', standalone: true,
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent {}