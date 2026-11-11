import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HotspotStoreService } from '../../../../application/services/hotspot-store.service';
import { StatCardComponent } from '../../../../shared/components/stat-card/stat-card.component';
@Component({
  selector: 'app-dashboard-page', standalone: true,
  imports: [StatCardComponent, RouterLink],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent { readonly store = inject(HotspotStoreService); }