import { Directive, ElementRef, inject, input } from '@angular/core';
import { DetectionDatesService, type DateUnit } from '../../application/services/detection-dates.service';

@Directive({
  selector: 'input[tgDetectionDate]',
  host: {
    '[attr.min]': 'dates.min(tgDetectionDate())',
    '[attr.max]': 'dates.max(tgDetectionDate())',
    '(blur)': 'keepInRange()',
  },
})
export class DetectionDateDirective {
  readonly tgDetectionDate = input<DateUnit>('day');
  protected readonly dates = inject(DetectionDatesService);
  private readonly field = inject<ElementRef<HTMLInputElement>>(ElementRef);

  protected keepInRange(): void {
    const input = this.field.nativeElement;
    if (!input.validity.rangeUnderflow && !input.validity.rangeOverflow) return;

    input.value = input.validity.rangeUnderflow ? input.min : input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
