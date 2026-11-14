import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';

import {
  DOCUMENT,
  isPlatformBrowser
} from '@angular/common';

import { PLATFORM_ID } from '@angular/core';

import { PageHeaderComponent } from
  '../../../../shared/components/page-header/page-header.component';

// ==========================================
// TIPOS
// ==========================================

type MethodSection =
  | 'sources'
  | 'harmonization'
  | 'validation'
  | 'limits';

type MethodTab = 'summary' | MethodSection;

// ==========================================
// INTERFACES
// ==========================================

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

// ==========================================
// COMPONENTE
// ==========================================

@Component({
  selector: 'app-methodology-page',
  standalone: true,
  imports: [PageHeaderComponent],
  templateUrl: './methodology-page.component.html',
  styleUrl: './methodology-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MethodologyPageComponent {

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  // ========================================
  // SENSORES
  // ========================================

  readonly sensors: readonly SensorCard[] = [
    {
      name: 'MODIS',
      satellites: 'Terra / Aqua',
      spatialResolution: '~ 1 km',
      temporalResolution: 'Según sobrepaso',
      className: 'modis'
    },
    {
      name: 'VIIRS',
      satellites: 'Suomi NPP / NOAA-20 / NOAA-21',
      spatialResolution: '~ 375 m',
      temporalResolution: 'Según sobrepaso',
      className: 'viirs'
    }
  ];

  // ========================================
  // ETAPAS DE ARMONIZACIÓN
  // ========================================

  readonly stages: readonly Stage[] = [
    {
      number: 1,
      title: 'Obtención de datos',
      detail: 'MODIS y VIIRS (NASA FIRMS)',
      icon: '◈',
      className: 'ingest'
    },
    {
      number: 2,
      title: 'Filtrado de calidad',
      detail: 'Integridad, confianza y nubes',
      icon: '▽',
      className: 'quality'
    },
    {
      number: 3,
      title: 'Coincidencia y fusión',
      detail: 'Espacio y tiempo',
      icon: '↗',
      className: 'match'
    },
    {
      number: 4,
      title: 'Detecciones armonizadas',
      detail: 'Conjunto con procedencia',
      icon: '▱',
      className: 'harmonized'
    },
    {
      number: 5,
      title: 'Análisis y reportes',
      detail: 'Mapas, alertas y tendencias',
      icon: '▥',
      className: 'analysis'
    }
  ];

  // ========================================
  // MÉTRICAS DEMOSTRATIVAS
  // ========================================

  readonly metrics: readonly ValidationMetric[] = [
    {
      value: '94 %',
      label: 'Consistencia espacial'
    },
    {
      value: '91 %',
      label: 'Consistencia temporal'
    },
    {
      value: '88 %',
      label: 'Reducción de duplicados'
    }
  ];

  // ========================================
  // LIMITACIONES
  // ========================================

  readonly limitations: readonly string[] = [
    'Se analizan anomalías térmicas; no son incendios confirmados.',
    'Nubes, humo, cobertura vegetal y horas de paso pueden impedir detecciones.',
    'MODIS (~1 km) y VIIRS (~375 m) observan con resoluciones distintas.',
    'Los emparejamientos deben validarse con datos independientes y, cuando sea posible, verificación de campo.'
  ];

  // ========================================
  // ESTADO DE NAVEGACIÓN
  // ========================================

  // Se mantienen propiedades convencionales para
  // conservar la compatibilidad con el HTML actual.

  activeTab: MethodTab = 'summary';

  expandedMobile: MethodSection | null = null;

  // ========================================
  // SELECCIONAR PESTAÑA
  // ========================================

  selectTab(tab: MethodTab): void {

    this.activeTab = tab;

    if (tab !== 'summary') {
      this.expandedMobile = tab;
    }

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const windowRef = this.document.defaultView;

    if (!windowRef || windowRef.innerWidth <= 760) {
      return;
    }

    const targetId =
      tab === 'summary'
        ? 'method-page-top'
        : `method-${tab}`;

    const target = this.document.getElementById(targetId);

    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  // ========================================
  // ACORDEÓN RESPONSIVE
  // ========================================

  toggleMobile(tab: MethodSection): void {

    this.expandedMobile =
      this.expandedMobile === tab
        ? null
        : tab;

    this.activeTab =
      this.expandedMobile ?? 'summary';
  }

  // ========================================
  // CONSULTAR SECCIÓN ABIERTA
  // ========================================

  sectionOpen(tab: MethodSection): boolean {
    return this.expandedMobile === tab;
  }
}