import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: '<section class="stat"><p>{{label()}}</p><strong>{{value()}}</strong><small>{{caption()}}</small></section>',
  styles: ['.stat{background:#132237;border:1px solid #2c4055;border-radius:14px;padding:23px;min-height:140px}.stat p{margin:0 0 15px;color:#a9bcd2;font-size:13px}.stat strong{font-size:34px;display:block;letter-spacing:-.04em}.stat small{display:block;color:#8fa9c1;margin-top:10px;font-size:12px}'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly caption = input('');
}