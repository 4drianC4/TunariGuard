import { ChangeDetectionStrategy, Component } from '@angular/core';
@Component({
  selector: 'app-districts-page', standalone: true,
  templateUrl: './districts-page.component.html',
  styleUrl: './districts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistrictsPageComponent {}