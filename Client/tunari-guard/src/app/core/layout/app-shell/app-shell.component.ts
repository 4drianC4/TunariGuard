import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LiveTranslationService } from '../../i18n/live-translation.service';
import { LiveUpdatesService } from '../../../application/services/live-updates.service';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { MascotAssistantComponent } from '../../../shared/components/mascot-assistant/mascot-assistant.component';

@Component({
  selector: 'app-app-shell', standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, MascotAssistantComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  constructor() {
    inject(LiveUpdatesService).start();
    inject(LiveTranslationService);
  }
}
