import { z } from 'zod';

const area = z.string().nullable().describe('Nombre o código del área tal como lo pidió el usuario. null para el Parque Nacional Tunari.');
const mes = z.string().nullable().describe('Mes calendario en formato YYYY-MM. Conserva el mes pedido aunque todavía esté en curso.');
const satelite = z.enum(['MODIS-Terra', 'MODIS-Aqua', 'VIIRS-Suomi-NPP', 'VIIRS-NOAA-20', 'VIIRS-NOAA-21'])
  .nullable().describe('Satélite indicado por el usuario. NOAA-20 corresponde a VIIRS-NOAA-20. null si no indicó ninguno.');
export type SateliteTuni = z.infer<typeof satelite>;

export const consultas = {
  estado_mes: z.strictObject({ area }),
  ultimas_detecciones: z.strictObject({
    area,
    desde: z.string().nullable().describe('Primer día solicitado, inclusive, YYYY-MM-DD. null sin límite inicial.'),
    hasta: z.string().nullable().describe('Último día solicitado, inclusive, YYYY-MM-DD. null sin límite final.'),
    satelite,
  }),
  verificar_alerta: z.strictObject({
    area,
    corte: z.string().nullable().describe('Fecha de corte de la alerta, YYYY-MM-DD. null para consultar el último corte publicado.'),
    satelite,
  }),
  comparar_meses: z.strictObject({
    area,
    periodo: mes.describe('Primer mes YYYY-MM. null para el último mes completo disponible.'),
    referencia: mes.describe('Segundo mes YYYY-MM. null para el mismo mes del año anterior.'),
  }),
  alertas_operativas: z.strictObject({
    area: z.string().nullable().describe('Área tal como la pidió el usuario (parque, municipio, distrito o sector). null para todas las áreas.'),
    severidad: z.enum(['Crítica', 'Alta', 'Media']).nullable().describe('Severidad pedida. null para todas.'),
    solo_pendientes: z.boolean().describe('true si el usuario pregunta por alertas pendientes o sin revisar.'),
  }),
  consultar_metodologia: z.strictObject({
    tema: z.string().trim().min(1).max(300).describe('Términos relevantes de la documentación, en español.'),
  }),
  orientar: z.strictObject({
    motivo: z.enum(['saludo', 'area', 'periodo', 'fuera_de_alcance']),
  }),
};
export type Consulta = keyof typeof consultas;

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(1500),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(1500),
  })).max(8).default([]),
  consulta: z.enum(['estado_mes', 'ultimas_detecciones', 'comparar_meses', 'alertas_operativas']).optional(),
});
export type ChatBody = z.infer<typeof chatSchema>;

export function esConsulta(nombre: string): nombre is Consulta {
  return Object.hasOwn(consultas, nombre);
}

export const instruccionesPorConsulta: Record<Consulta, string> = {
  estado_mes: 'Consulta el estado estadístico del mes y la mediana histórica para el mismo tramo. También sirve para saber si la actividad acumulada ahora es normal o superior a lo habitual.',
  ultimas_detecciones: 'Lista las últimas cinco detecciones térmicas cargadas, con fecha, sensor y ubicación. Úsala para focos recientes y sus ubicaciones, no para conteos totales.',
  verificar_alerta: 'Verifica si las detecciones cargadas respaldan las celdas-día de una alerta mensual publicada. Selecciónala si el usuario pide reconstruir, comprobar, cotejar o explicar si cuadra una cifra de alerta comparándola con detecciones. El servidor toma el rango desde el primer día del mes hasta el corte.',
  comparar_meses: 'Compara el índice armonizado de dos meses calendario completos. Si se pide el mes en curso frente a un año específico, conserva ese mes en periodo. Solo usa null para pedir explícitamente el último mes completo.',
  alertas_operativas: 'Lista las alertas operativas más recientes de TunariGuard (detecciones de una pasada satelital dentro de un área vigilada) con su severidad (Crítica, Alta, Media) y estado de revisión, más el total por severidad. Úsala para «¿hay alertas?», «alertas críticas», «alertas pendientes», «últimas alertas» o alertas de un área. No es el nivel estadístico del mes (eso es estado_mes) ni confirma incendios.',
  consultar_metodologia: 'Busca en la documentación oficial del proyecto términos como celda-día, MODIS, VIIRS, armonización, alerta estadística, NRT, recurrencia y limitaciones.',
  orientar: 'Saluda o pide aclaración si falta un dato imprescindible. Usa fuera_de_alcance para pronósticos, confirmación de incendios, conteos y otros análisis que las funciones disponibles no pueden responder.',
};
