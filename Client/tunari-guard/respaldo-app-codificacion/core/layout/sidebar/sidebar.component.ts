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
    { path: '/inicio', icon: 'â—«', label: 'Inicio' },
    { path: '/mapa', icon: 'â—Ž', label: 'Mapa de focos' },
    { path: '/historial', icon: 'â—·', label: 'Historial' },
    { path: '/armonizacion', icon: 'â‡„', label: 'ArmonizaciÃ³n' },
    { path: '/alertas', icon: '!', label: 'Alertas' },
    { path: '/distritos', icon: 'â–¦', label: 'Distritos' },
    { path: '/reportes', icon: 'â–¤', label: 'Reportes' },
    { path: '/metodologia', icon: 'â—‡', label: 'MetodologÃ­a' },
  ];
}