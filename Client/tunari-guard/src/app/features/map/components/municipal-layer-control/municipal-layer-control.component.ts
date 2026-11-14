import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface MunicipalLayerControlItem {
  id: string;
  name: string;
  purpose: string;
  visible: boolean;
  legendUrl: string;
  status: 'idle' | 'ready' | 'loading' | 'error';
  legendFailed: boolean;
}

@Component({
  selector: 'app-municipal-layer-control',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './municipal-layer-control.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' }
})
export class MunicipalLayerControlComponent {
  @Input({ required: true }) layers: MunicipalLayerControlItem[] = [];
  @Input() open = false;
  @Output() readonly openChange = new EventEmitter<boolean>();
  @Output() readonly visibilityChange = new EventEmitter<{ id: string; visible: boolean }>();
  @Output() readonly legendError = new EventEmitter<string>();
  @Output() readonly retry = new EventEmitter<string>();

  togglePanel(): void {
    this.openChange.emit(!this.open);
  }

  setLayerVisibility(id: string, event: Event): void {
    this.visibilityChange.emit({
      id,
      visible: (event.target as HTMLInputElement).checked,
    });
  }
}
