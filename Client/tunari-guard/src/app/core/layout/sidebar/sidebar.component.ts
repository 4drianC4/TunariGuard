import { LanguageService } from '../../i18n/language.service';
import { inject, ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  host: {
    class: 'tg-responsive-v2',
    '[class.tg-collapsed]': 'collapsed()',
    '[class.tg-mobile-open]': 'mobileOpen()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly i18n = inject(LanguageService);
  readonly t = this.i18n.text;
  readonly brandLogo = () => '/assets/logos/SVG/' + (this.i18n.language() === 'en' ? 'LOGOHORIZONTALINGLES.svg' : 'LOGOHORIZONTALWHITE.svg');
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  toggleDesktop(): void {
    this.collapsed.update(value => !value);
  }

  toggleMobile(): void {
    this.mobileOpen.update(value => !value);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMobile();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 800) this.closeMobile();
  }
  readonly nav = [
    { path: '/inicio', icon: 'home', label: 'Inicio' },
    { path: '/mapa', icon: 'map', label: 'Mapa de focos' },
    { path: '/historial', icon: 'history', label: 'Historial' },
    { path: '/armonizacion', icon: 'harmonization', label: 'Armonización' },
    { path: '/alertas', icon: 'bell', label: 'Alertas' },
    { path: '/distritos', icon: 'districts', label: 'Distritos' },
    { path: '/reportes', icon: 'reports', label: 'Reportes' },
    { path: '/proyecciones', icon: 'trend', label: 'Proyecciones' },
    { path: '/metodologia', icon: 'methodology', label: 'Metodología' },
  ] as const;
}
