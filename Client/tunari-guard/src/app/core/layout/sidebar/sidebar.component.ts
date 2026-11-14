import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly nav = [
    { path: '/inicio', icon: 'home', label: 'Inicio' },
    { path: '/mapa', icon: 'map', label: 'Mapa de focos' },
    { path: '/historial', icon: 'history', label: 'Historial' },
    { path: '/armonizacion', icon: 'harmonization', label: 'Armonización' },
    { path: '/alertas', icon: 'bell', label: 'Alertas' },
    { path: '/distritos', icon: 'districts', label: 'Distritos' },
    { path: '/reportes', icon: 'reports', label: 'Reportes' },
    { path: '/metodologia', icon: 'methodology', label: 'Metodología' },
  ] as const;
}
