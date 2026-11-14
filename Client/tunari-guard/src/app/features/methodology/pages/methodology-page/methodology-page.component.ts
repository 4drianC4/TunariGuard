import { ChangeDetectionStrategy, Component } from '@angular/core';

type MethodSection = 'sources' | 'harmonization' | 'validation' | 'limits';
type MethodTab = 'summary' | MethodSection;

interface SensorCard {
  name: string;
  satellites: string;
  spatialResolution: string;
  temporalResolution: string;
  className: string;
}
interface Stage {
  number: number;
  title: string;
  detail: string;
  icon: string;
  className: string;
}
interface ValidationMetric {
  value: string;
  label: string;
}

@Component({
  selector: 'app-methodology-page',
  standalone: true,
  templateUrl: './methodology-page.component.html',
  styleUrl: './methodology-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MethodologyPageComponent {
  readonly sensors: readonly SensorCard[] = [
    { name: 'MODIS', satellites: 'Terra / Aqua', spatialResolution: '~ 1 km', temporalResolution: 'Según sobrepaso', className: 'modis' },
    { name: 'VIIRS', satellites: 'Suomi NPP / NOAA-20 / NOAA-21', spatialResolution: '~ 375 m', temporalResolution: 'Según sobrepaso', className: 'viirs' },
  ];

  readonly stages: readonly Stage[] = [
    { number: 1, title: 'Obtención de datos', detail: 'MODIS y VIIRS (NASA FIRMS)', icon: '◈', className: 'ingest' },
    { number: 2, title: 'Filtrado de calidad', detail: 'Integridad, confianza y nubes', icon: '▽', className: 'quality' },
    { number: 3, title: 'Coincidencia y fusión', detail: 'Espacio y tiempo', icon: '↗', className: 'match' },
    { number: 4, title: 'Detecciones armonizadas', detail: 'Conjunto con procedencia', icon: '▱', className: 'harmonized' },
    { number: 5, title: 'Análisis y reportes', detail: 'Mapas, alertas y tendencias', icon: '▥', className: 'analysis' },
  ];

  readonly metrics: readonly ValidationMetric[] = [
    { value: '94 %', label: 'Consistencia espacial' },
    { value: '91 %', label: 'Consistencia temporal' },
    { value: '88 %', label: 'Reducción de duplicados' },
  ];

  readonly limitations: readonly string[] = [
    'Se analizan anomalías térmicas; no son incendios confirmados.',
    'Nubes, humo, cobertura vegetal y horas de paso pueden impedir detecciones.',
    'MODIS (~1 km) y VIIRS (~375 m) observan con resoluciones distintas.',
    'Los emparejamientos deben validarse con datos independientes y, cuando sea posible, verificación de campo.',
  ];

  activeTab: MethodTab = 'summary';
  expandedMobile: MethodSection | null = null;

  selectTab(tab: MethodTab): void {
    this.activeTab = tab;
    if (tab !== 'summary') this.expandedMobile = tab;
    if (typeof window !== 'undefined' && window.innerWidth > 760) {
      const target = document.getElementById(tab === 'summary' ? 'method-page-top' : `method-${tab}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  toggleMobile(tab: MethodSection): void {
    this.expandedMobile = this.expandedMobile === tab ? null : tab;
    this.activeTab = this.expandedMobile ?? 'summary';
  }

  sectionOpen(tab: MethodSection): boolean {
    return this.expandedMobile === tab;
  }
}
