import { LanguageService } from '../../../../core/i18n/language.service';

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';

import {
  DOCUMENT,
  isPlatformBrowser,
} from '@angular/common';

import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

// ==========================================
// TIPOS
// ==========================================

type MethodSection =
  | 'sources'
  | 'harmonization'
  | 'validation'
  | 'limits';

type MethodTab = 'summary' | MethodSection;

interface MethodSensor {
  name: string;
  satellites: string;
  resolution: string;
  status: string;
  className: 'modis' | 'viirs';
}

interface MethodStage {
  number: number;
  title: string;
  detail: string;
  icon: string;
  className: string;
}

interface MethodMetric {
  value: string;
  label: string;
}

interface MethodDocument {
  name: string;
  detail: string;
  file: string;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MethodologyPageComponent {
  readonly i18n = inject(LanguageService);
  readonly t = this.i18n.text;

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  // ========================================
  // NAVEGACIÓN
  // ========================================

  activeTab: MethodTab = 'summary';

  expandedMobile: MethodSection | null = null;

  // ========================================
  // FUENTES SATELITALES
  // ========================================

  readonly sensors: readonly MethodSensor[] = [
    {
      name: 'MODIS',
      satellites: 'Terra / Aqua',
      resolution: '≈ 1 km',
      status: 'Fuente de referencia',
      className: 'modis',
    },
    {
      name: 'VIIRS',
      satellites: 'Suomi-NPP / NOAA-20 / NOAA-21',
      resolution: '≈ 375 m',
      status: 'NOAA-20 y NOAA-21 activos*',
      className: 'viirs',
    },
  ];

  // ========================================
  // ETAPAS DEL PROCESAMIENTO
  // ========================================

  readonly stages: readonly MethodStage[] = [
    {
      number: 1,
      title: 'Descarga FIRMS',
      detail: 'Productos MODIS y VIIRS',
      icon: '↓',
      className: 'ingest',
    },
    {
      number: 2,
      title: 'Filtro de calidad',
      detail: 'Tipo 0; confianza no baja',
      icon: '◇',
      className: 'quality',
    },
    {
      number: 3,
      title: 'Grilla de Bolivia',
      detail: 'Celdas de 1 km · UTC−4',
      icon: '▦',
      className: 'match',
    },
    {
      number: 4,
      title: 'Normalización',
      detail: 'VIIRS ÷ 2,8715',
      icon: '÷',
      className: 'harmonized',
    },
    {
      number: 5,
      title: 'Resultados',
      detail: 'Alertas, series y conglomerados',
      icon: '▥',
      className: 'analysis',
    },
  ];

  // ========================================
  // VALIDACIÓN 2022–2025
  // ========================================

  readonly metrics: readonly MethodMetric[] = [
    {
      value: '27,0 %',
      label: 'Error trimestral (WAPE)',
    },
    {
      value: '16,3 %',
      label: 'Error anual (WAPE)',
    },
    {
      value: '+0,7 %',
      label: 'Sesgo medio',
    },
  ];

  // ========================================
  // SUPUESTOS Y LIMITACIONES
  // ========================================

  readonly limitations: readonly string[] = [
    'Una anomalía térmica detectada por satélite no confirma por sí sola un incendio forestal.',

    'Nubes, humo, cobertura vegetal y hora de paso pueden afectar las observaciones.',

    'MODIS y VIIRS tienen distintas resoluciones; sus detecciones no son directamente comparables.',

    'El factor 2,8715 fue ajustado con datos de 2013–2025 y debe revisarse con datos de 2026.',

    'Se conserva la procedencia original de cada detección; no se fusionan puntos individuales.',

    'Las detecciones NRT son provisionales y pueden ser reemplazadas por productos estándar.',

    'Las alertas representan actividad térmica inusual, no la gravedad de un incendio confirmado.',
  ];

  // ========================================
  // DOCUMENTACIÓN PDF
  // ========================================

  readonly documents: readonly MethodDocument[] = [
    {
      name: 'Fuentes de datos',
      detail: 'Satélites, horarios y cobertura',
      file: '01_Fuentes_de_datos_con_horas.pdf',
    },
    {
      name: 'Armonización',
      detail: 'Factor, grilla y método RMA',
      file: '02_Armonizacion.pdf',
    },
    {
      name: 'Validación 2022–2025',
      detail: 'Indicadores y pruebas estadísticas',
      file: '03_Validacion.pdf',
    },
    {
      name: 'Supuestos y límites',
      detail: 'Alcance e incertidumbre',
      file: '04_Supuestos_y_limites.pdf',
    },
    {
      name: 'Documentación del método',
      detail: 'Procedimiento y referencias',
      file: '05_Documentacion_del_metodo.pdf',
    },
  ];

  // ========================================
  // URL DE DOCUMENTOS
  // ========================================

  documentUrl(file: string): string {
    const folder = this.i18n.language() === 'en' ? 'en/' : '';
    return `/assets/metodologia/${folder}${file}`;
  }

  // Documento principal para descargar
  readonly mainDocument =
    '05_Documentacion_del_metodo.pdf';

  // ========================================
  // ACORDEONES MÓVILES
  // ========================================

  sectionOpen(tab: MethodSection): boolean {
    return this.expandedMobile === tab;
  }

  toggleMobile(tab: MethodSection): void {
    this.expandedMobile =
      this.expandedMobile === tab ? null : tab;

    this.activeTab =
      this.expandedMobile ?? 'summary';
  }

  // ========================================
  // NAVEGACIÓN POR SECCIONES
  // ========================================

  selectTab(tab: MethodTab): void {
    this.activeTab = tab;

    this.expandedMobile =
      tab === 'summary' ? null : tab;

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const windowRef = this.document.defaultView;

    if (!windowRef) {
      return;
    }

    // En móvil se utiliza el acordeón.
    if (windowRef.innerWidth <= 760) {
      return;
    }

    const sectionId =
      tab === 'summary'
        ? 'method-page-top'
        : `method-${tab}`;

    const target =
      this.document.getElementById(sectionId);

    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}
