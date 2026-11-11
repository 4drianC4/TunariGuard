import { ChangeDetectionStrategy, Component } from '@angular/core';
@Component({
  selector: 'app-methodology-page', standalone: true,
  templateUrl: './methodology-page.component.html',
  styleUrl: './methodology-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MethodologyPageComponent {}