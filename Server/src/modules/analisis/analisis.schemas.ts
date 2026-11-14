import { z } from 'zod';
import { bbox, isoDay, queryBoolean } from '../../shared/query-schemas.js';
import { problemaDePoligono } from './domain/poligono.js';

const desde = isoDay.optional().describe('Desde, inclusive (YYYY-MM-DD, día en hora de Bolivia)');
const hasta = isoDay.optional().describe('Hasta, inclusive (YYYY-MM-DD)');
const rangoValido = (q: { desde?: string; hasta?: string }) => !q.desde || !q.hasta || q.desde <= q.hasta;
const errorRango = { message: 'desde debe ser anterior o igual a hasta', path: ['desde'] };

export const areaIdParamSchema = z.object({
  area_id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('Por ejemplo parque-tunari, municipio-cochabamba, distrito-09, mun-sacaba'),
});
export type AreaIdParam = z.infer<typeof areaIdParamSchema>;

export const listarAreasSchema = z.object({
  tipo: z.enum(['parque', 'municipio', 'distrito', 'municipio_parque', 'personalizada']).optional(),
  formato: z
    .enum(['json', 'geojson'])
    .default('json')
    .describe('geojson incluye la geometría de cada área (para pintar el mapa)'),
});
export type ListarAreasQuery = z.infer<typeof listarAreasSchema>;

export const calendarioSchema = z
  .object({
    desde_anio: z.coerce.number().int().min(2000).max(2100).optional(),
    hasta_anio: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine((q) => !q.desde_anio || !q.hasta_anio || q.desde_anio <= q.hasta_anio, {
    message: 'desde_anio debe ser menor o igual a hasta_anio',
    path: ['desde_anio'],
  });
export type CalendarioQuery = z.infer<typeof calendarioSchema>;

export const serieSchema = z
  .object({ escala: z.enum(['mensual', 'trimestral', 'anual']).default('anual'), desde, hasta })
  .refine(rangoValido, errorRango);
export type SerieQuery = z.infer<typeof serieSchema>;

export const rangoSchema = z.object({ desde, hasta }).refine(rangoValido, errorRango);
export type RangoQuery = z.infer<typeof rangoSchema>;

export const alertasSchema = z
  .object({
    desde,
    hasta,
    nivel: z.enum(['normal', 'elevada', 'alta', 'muy_alta']).optional(),
    variante: z.enum(['base', 'sin_fuentes_persistentes']).default('base'),
    solo_destacadas: queryBoolean.default(false).describe('Solo elevada, alta o muy_alta'),
    limite: z.coerce.number().int().min(1).max(10000).default(1000),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(rangoValido, errorRango);
export type AlertasQuery = z.infer<typeof alertasSchema>;

export const alertaMesSchema = z.object({
  historial: queryBoolean.default(false).describe('true = todos los cortes y los tres factores de enlace'),
});
export type AlertaMesQuery = z.infer<typeof alertaMesSchema>;

export const recurrenciaSchema = z.object({
  formato: z.enum(['json', 'geojson']).default('geojson'),
  excluir_fuentes_persistentes: queryBoolean.default(false),
});
export type RecurrenciaQuery = z.infer<typeof recurrenciaSchema>;

export const puntosCalientesSchema = z.object({
  solo_calientes: queryBoolean.default(true),
  formato: z.enum(['json', 'geojson']).default('geojson'),
});
export type PuntosCalientesQuery = z.infer<typeof puntosCalientesSchema>;

const fuentes = z.enum(['MODIS-Terra', 'MODIS-Aqua', 'VIIRS-Suomi-NPP', 'VIIRS-NOAA-20', 'VIIRS-NOAA-21']);

export const deteccionesSchema = z
  .object({
    area_id: z.string().trim().min(1).max(100).optional().describe('Sin área: todas las detecciones cargadas'),
    desde,
    hasta,
    fuente: z
      .union([fuentes, z.array(fuentes)])
      .optional()
      .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]))
      .describe('Repetible: ?fuente=VIIRS-NOAA-20&fuente=MODIS-Aqua'),
    confianza_minima: z.enum(['nominal', 'alta']).optional(),
    excluir_fuentes_persistentes: queryBoolean.default(false),
    bbox: bbox.optional(),
    formato: z.enum(['json', 'csv', 'geojson']).default('json'),
    limite: z.coerce.number().int().min(1).max(100000).default(10000),
    offset: z.coerce.number().int().min(0).default(0),
    orden: z.enum(['fecha_asc', 'fecha_desc']).default('fecha_asc'),
  })
  .refine(rangoValido, errorRango);
export type DeteccionesQuery = z.infer<typeof deteccionesSchema>;

export const eventosSchema = z
  .object({
    area_id: z.string().trim().min(1).max(100).optional(),
    desde,
    hasta,
    limite: z.coerce.number().int().min(1).max(10000).default(1000),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(rangoValido, errorRango);
export type EventosQuery = z.infer<typeof eventosSchema>;

/** Polygon o MultiPolygon GeoJSON en WGS84; PostGIS valida la forma exacta. */
const poligono = z
  .object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.array(z.unknown())).min(1),
  })
  .loose()
  .superRefine((geometria, ctx) => {
    const problema = problemaDePoligono(geometria);
    if (problema) ctx.addIssue({ code: 'custom', message: problema });
  })
  .describe('Geometría GeoJSON (Polygon o MultiPolygon) en EPSG:4326');

export const poligonoBodySchema = z.object({ poligono, desde, hasta }).refine(rangoValido, errorRango);
export type PoligonoBody = z.infer<typeof poligonoBodySchema>;

export const buscarDeteccionesSchema = z
  .object({
    poligono,
    desde,
    hasta,
    fuentes: z.array(fuentes).optional(),
    formato: z.enum(['json', 'csv', 'geojson']).default('json'),
  })
  .refine(rangoValido, errorRango);
export type BuscarDeteccionesBody = z.infer<typeof buscarDeteccionesSchema>;

const anio = z.coerce.number().int().min(2000).max(2100);
const historialBase = {
  fuente: z
    .enum(['HARMONIZED', 'MODIS', 'VIIRS'])
    .default('HARMONIZED')
    .describe('HARMONIZED: índice armonizado · MODIS / VIIRS: conteo bruto de ese sensor, sin armonizar'),
  medida: z
    .enum(['celdas_dia', 'detecciones'])
    .default('celdas_dia')
    .describe('Solo MODIS/VIIRS: qué va en activityCount. celdas_dia evita contar dos veces un fuego visto por dos satélites'),
  desde_anio: anio.optional(),
  hasta_anio: anio.optional(),
};
const aniosValidos = (q: { desde_anio?: number; hasta_anio?: number }) =>
  !q.desde_anio || !q.hasta_anio || q.desde_anio <= q.hasta_anio;
const errorAnios = { message: 'desde_anio debe ser menor o igual a hasta_anio', path: ['desde_anio'] };

export const historialSchema = z
  .object({
    area_id: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default('parque-tunari')
      .describe('parque-tunari (por defecto), municipio-cochabamba, distrito-01 … distrito-15, mun-…'),
    ...historialBase,
  })
  .refine(aniosValidos, errorAnios);
export type HistorialQuery = z.infer<typeof historialSchema>;

export const historialDistritosSchema = z.object(historialBase).refine(aniosValidos, errorAnios);
export type HistorialDistritosQuery = z.infer<typeof historialDistritosSchema>;
