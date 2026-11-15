import { areaLabel, currentLanguage, t } from '../../../shared/i18n/language.js';
/**
 * Mensaje según `nivel_alerta` de la alerta del mes en curso (fuego.alerta_mes_en_curso).
 * El nivel lo calcula el modelo estadístico del equipo de datos: aquí solo se traduce a texto.
 * Reglas del paquete: es una señal estadística que requiere verificación, no confirma un
 * incendio, y nunca se presenta como "ocurre una vez cada N años".
 */

export type MonthlyLevel = 'normal' | 'elevada' | 'alta' | 'muy_alta' | 'sin_baseline';

export interface MonthlyAlertRow {
  area_id: string;
  nombre_visible: string;
  fecha_corte: string;
  mes: string;
  dias_transcurridos: number;
  celdas_dia_observadas: number;
  esperado_modelo: number | null;
  probabilidad_exceso: number | null;
  satelite_base: string;
  nivel_alerta: string;
  lectura: string;
}

interface LevelInfo {
  title: string;
  /** Misma escala que las alertas operativas; null cuando no hay nada que vigilar. */
  severity: 'Crítica' | 'Alta' | 'Media' | null;
  /** Probabilidad máxima del nivel (umbrales del paquete), para el texto. */
  maxProbabilityPct: number | null;
}

const LEVELS: Record<MonthlyLevel, LevelInfo> = {
  muy_alta: { title: 'Actividad extremadamente inusual', severity: 'Crítica', maxProbabilityPct: 1 },
  alta: { title: 'Actividad muy inusual', severity: 'Alta', maxProbabilityPct: 5 },
  elevada: { title: 'Actividad inusual (vigilancia)', severity: 'Media', maxProbabilityPct: 10 },
  normal: { title: 'Dentro de lo esperable', severity: null, maxProbabilityPct: null },
  sin_baseline: { title: 'Sin historial suficiente', severity: null, maxProbabilityPct: null },
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function isMonthlyLevel(value: string): value is MonthlyLevel {
  return value in LEVELS;
}

export function monthlyContext(row: MonthlyAlertRow) {
  const level: MonthlyLevel = isMonthlyLevel(row.nivel_alerta) ? row.nivel_alerta : 'normal';
  const info = LEVELS[level];
  const [anio, mes] = row.mes.split('-').map(Number);
  const periodo = `los primeros ${row.dias_transcurridos} días de ${MESES[(mes ?? 1) - 1]} de ${anio}`;
  const celdas = row.celdas_dia_observadas === 1 ? '1 celda-día' : `${row.celdas_dia_observadas} celdas-día`;
  const esperado = row.esperado_modelo !== null ? `, cuando lo esperable según el modelo era ~${formatear(row.esperado_modelo)}` : '';

  let detalle: string;
  if (level === 'sin_baseline') {
    detalle = 'No hay suficientes años de historia para comparar este tramo del mes.';
  } else if (info.maxProbabilityPct !== null) {
    detalle =
      `Un tramo así o más alto ocurre en el ${info.maxProbabilityPct} % de los casos o menos (según el modelo). ` +
      'Es una señal estadística: requiere verificación y no confirma un incendio.';
  } else {
    detalle = 'Dentro de lo esperable para este tramo del mes.';
  }

  const english = currentLanguage() === 'en';
  const name = areaLabel(row.nombre_visible);
  const title = t(info.title);
  const englishMessage = () => {
    const month = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(anio!, (mes ?? 1) - 1, 1)));
    const quantity = `${row.celdas_dia_observadas} heat ${row.celdas_dia_observadas === 1 ? 'cell-day' : 'cell-days'}`;
    const expected = row.esperado_modelo === null ? '' : `, versus about ${formatear(row.esperado_modelo)} expected by the model`;
    const conclusion = info.maxProbabilityPct === null
      ? level === 'sin_baseline' ? 'There is insufficient history for this part of the month.' : 'Within the expected range for this part of the month.'
      : `The model estimates a ${info.maxProbabilityPct}% or lower chance of activity this high. Verification is required.`;
    return `${title} in ${name}: ${quantity} in the first ${row.dias_transcurridos} days of ${month} (${row.satelite_base})${expected}. ${conclusion}`;
  };
  return {
    area_id: row.area_id,
    nombre_visible: name,
    nivel_alerta: level,
    title,
    severity: info.severity,
    /** true si conviene destacarla (elevada, alta o muy alta). */
    isAlert: info.severity !== null,
    message: english ? englishMessage() :
      `${info.title} en ${row.nombre_visible}: en ${periodo} se registraron ${celdas} de calor ` +
      `(${row.satelite_base})${esperado}. ${detalle}`,
    lectura: t(row.lectura),
    fecha_corte: row.fecha_corte,
    mes: row.mes,
    dias_transcurridos: row.dias_transcurridos,
    celdas_dia_observadas: row.celdas_dia_observadas,
    esperado_modelo: row.esperado_modelo,
    probabilidad_exceso: row.probabilidad_exceso,
    satelite_base: row.satelite_base,
  };
}

function formatear(valor: number): string {
  return (Math.round(valor * 10) / 10).toString();
}
