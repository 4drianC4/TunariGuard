import {
  ChangeDetectionStrategy,
  Component,
  Input
} from '@angular/core';

import { UpperCasePipe } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [UpperCasePipe],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageHeaderComponent {

  @Input() section: string = 'inicio';

  @Input() title: string = 'Panel de monitoreo';

  @Input() description: string =
    'Resumen ejecutivo del estado de anomalías térmicas, alertas y actividad reciente.';

}