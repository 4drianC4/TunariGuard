import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
@Component({
  selector: 'app-sidebar', standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly nav = [
    { path: '/inicio', icon: '◫', label: 'Inicio' },
    { path: '/mapa', icon: '◎', label: 'Mapa de focos' },
    { path: '/historial', icon: '◷', label: 'Historial' },
    { path: '/armonizacion', icon: '⇄', label: 'Armonización' },
    { path: '/alertas', icon: '!', label: 'Alertas' },
    { path: '/distritos', icon: '▦', label: 'Distritos' },
    { path: '/reportes', icon: '▤', label: 'Reportes' },
    { path: '/metodologia', icon: '◇', label: 'Metodología' },
  ];
}