/**
 * Forma de los datos para la vista /historial del frontend (HistoricalRecord en
 * Client/.../domain/models/historical-record.model.ts), más campos de contexto.
 */

export type FuenteHistorial = 'HARMONIZED' | 'MODIS' | 'VIIRS';
export type MedidaHistorial = 'celdas_dia' | 'detecciones';

export interface RegistroHistorial {
  readonly year: number;
  readonly month: number;
  readonly source: FuenteHistorial;
  /**
   * HARMONIZED: índice en celdas-día MODIS-equivalentes. MODIS/VIIRS: conteo bruto (celdas-día o
   * detecciones, según `medida`). null = sin valor comparable: pintar en gris, nunca como cero.
   */
  readonly activityCount: number | null;
  readonly origin: 'NASA_FIRMS';
  /** Solo MODIS/VIIRS: detecciones y celdas-día del mes, y detecciones por satélite. */
  readonly detections?: number;
  readonly cellDays?: number;
  readonly bySatellite?: Record<string, number>;
  /** true si el mes incluye datos NRT (provisionales, se reemplazan cuando NASA publica el estándar). */
  readonly provisional?: boolean;
  /** Solo HARMONIZED: calidad del índice según el paquete de datos. */
  readonly quality?: string | null;
}

export interface FilaSensor {
  area_id: string;
  mes: string;
  detecciones: number;
  celdas_dia: number;
  provisional: boolean;
  por_fuente: Record<string, number>;
}

export interface FilaArmonizada {
  area_id: string;
  mes: string;
  indice: number | null;
  calidad_indice: string | null;
}

export function registroDeSensor(fila: FilaSensor, fuente: 'MODIS' | 'VIIRS', medida: MedidaHistorial): RegistroHistorial {
  const { year, month } = anioMes(fila.mes);
  return {
    year,
    month,
    source: fuente,
    activityCount: medida === 'detecciones' ? fila.detecciones : fila.celdas_dia,
    origin: 'NASA_FIRMS',
    detections: fila.detecciones,
    cellDays: fila.celdas_dia,
    bySatellite: fila.por_fuente,
    provisional: fila.provisional,
  };
}

export function registroArmonizado(fila: FilaArmonizada): RegistroHistorial {
  const { year, month } = anioMes(fila.mes);
  return {
    year,
    month,
    source: 'HARMONIZED',
    activityCount: fila.indice,
    origin: 'NASA_FIRMS',
    quality: fila.calidad_indice,
  };
}

export interface ResumenHistorial {
  /** Suma de los meses con valor (los null no cuentan). */
  readonly total: number;
  readonly monthsWithData: number;
  /** Promedio por mes con valor. */
  readonly monthlyAverage: number;
  readonly peak: { year: number; month: number; activityCount: number } | null;
}

/** Los mismos indicadores que muestra la cabecera de /historial, ignorando meses sin valor. */
export function resumir(registros: readonly RegistroHistorial[]): ResumenHistorial {
  let total = 0;
  let monthsWithData = 0;
  let peak: ResumenHistorial['peak'] = null;
  for (const r of registros) {
    if (r.activityCount === null) continue;
    total += r.activityCount;
    monthsWithData++;
    if (!peak || r.activityCount > peak.activityCount) {
      peak = { year: r.year, month: r.month, activityCount: r.activityCount };
    }
  }
  return {
    total: redondear(total),
    monthsWithData,
    monthlyAverage: monthsWithData ? redondear(total / monthsWithData) : 0,
    peak,
  };
}

/** Agrupa filas por área conservando el orden de llegada. */
export function agruparPorArea<T extends { area_id: string }>(filas: readonly T[]): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const fila of filas) {
    const grupo = grupos.get(fila.area_id);
    if (grupo) grupo.push(fila);
    else grupos.set(fila.area_id, [fila]);
  }
  return grupos;
}

function anioMes(mes: string): { year: number; month: number } {
  const [year, month] = mes.split('-').map(Number);
  return { year: year!, month: month! };
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
