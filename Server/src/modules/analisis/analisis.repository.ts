import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type {
  AlertasQuery,
  CalendarioQuery,
  DeteccionesQuery,
  EventosQuery,
  PuntosCalientesQuery,
  RecurrenciaQuery,
  SerieQuery,
} from './analisis.schemas.js';

export type Fila = Record<string, unknown>;

/** fecha_hora_utc con la Z explícita (la columna es timestamp sin zona, en UTC). */
const DETECCION_JSON = Prisma.sql`
  to_jsonb(d) - 'geom'
  || jsonb_build_object('fecha_hora_utc', to_char(d.fecha_hora_utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))`;

/**
 * Lecturas sobre el esquema `fuego` (paquete de datos del equipo). No se modela en Prisma: se
 * consulta con SQL parametrizado y se reutilizan sus vistas y funciones, como pide el paquete.
 * `to_jsonb` hace que PostgreSQL entregue fechas como texto y numeric como número.
 */
@Injectable()
export class AnalisisRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Áreas ────────────────────────────────────────────────────────────────

  async existeArea(areaId: string): Promise<boolean> {
    const rows = await this.query<{ existe: boolean }>(
      Prisma.sql`SELECT EXISTS (SELECT 1 FROM fuego.areas WHERE area_id = ${areaId}) AS existe`,
    );
    return rows[0]?.existe ?? false;
  }

  listarAreas(tipo: string | undefined, conGeometria: boolean): Promise<Fila[]> {
    const geometria = conGeometria
      ? Prisma.sql`|| jsonb_build_object('geometria', ST_AsGeoJSON(a.geom, 6)::jsonb)`
      : Prisma.empty;
    return this.filas(Prisma.sql`
      SELECT to_jsonb(a) - 'geom' - 'geom_wkt'
             || jsonb_build_object('detecciones', COALESCE(v.detecciones, 0)) ${geometria} AS fila
      FROM fuego.areas a
      LEFT JOIN fuego.v_detecciones_por_area v USING (area_id)
      WHERE ${tipo ?? null}::text IS NULL OR a.tipo = ${tipo ?? null}
      ORDER BY CASE a.tipo WHEN 'parque' THEN 0 WHEN 'municipio' THEN 1 WHEN 'distrito' THEN 2
                           WHEN 'municipio_parque' THEN 3 ELSE 4 END, a.area_id`);
  }

  async area(areaId: string): Promise<Fila | undefined> {
    const [fila] = await this.filas(Prisma.sql`
      SELECT to_jsonb(a) - 'geom' - 'geom_wkt'
             || jsonb_build_object('detecciones', COALESCE(v.detecciones, 0),
                                   'geometria', ST_AsGeoJSON(a.geom, 6)::jsonb) AS fila
      FROM fuego.areas a
      LEFT JOIN fuego.v_detecciones_por_area v USING (area_id)
      WHERE a.area_id = ${areaId}`);
    return fila;
  }

  // ── Series y alertas ─────────────────────────────────────────────────────

  calendario(areaId: string, q: CalendarioQuery): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT jsonb_build_object('anio', anio, 'mes_num', mes_num, 'indice', indice,
                                'era', era, 'calidad_indice', calidad_indice) AS fila
      FROM fuego.v_calendario_mes_anio
      WHERE area_id = ${areaId}
        AND (${q.desde_anio ?? null}::int IS NULL OR anio >= ${q.desde_anio ?? null}::int)
        AND (${q.hasta_anio ?? null}::int IS NULL OR anio <= ${q.hasta_anio ?? null}::int)
      ORDER BY anio, mes_num`);
  }

  serie(areaId: string, q: SerieQuery): Promise<Fila[]> {
    const desde = q.desde ?? null;
    const hasta = q.hasta ?? null;
    if (q.escala === 'mensual') {
      return this.filas(Prisma.sql`
        SELECT jsonb_build_object(
          'periodo', to_char(mes, 'YYYY-MM'), 'mes', mes, 'indice', indice_modis_equivalente,
          'inferior', limite_inferior_p05, 'superior', limite_superior_p95,
          'inferior_estructural', limite_inferior_estructural, 'superior_estructural', limite_superior_estructural,
          'era', era, 'calidad_indice', calidad_indice) AS fila
        FROM fuego.serie_mensual
        WHERE area_id = ${areaId}
          AND (${desde}::date IS NULL OR mes >= ${desde}::date)
          AND (${hasta}::date IS NULL OR mes <= ${hasta}::date)
        ORDER BY mes`);
    }
    return this.filas(Prisma.sql`
      SELECT to_jsonb(s) - 'area_id' - 'escala' AS fila
      FROM fuego.serie_agregada s
      WHERE area_id = ${areaId} AND escala = ${q.escala}
        AND (${desde}::date IS NULL OR mes_inicio >= ${desde}::date)
        AND (${hasta}::date IS NULL OR mes_inicio <= ${hasta}::date)
      ORDER BY mes_inicio`);
  }

  serieArmonizadaArea(areaId: string, desde?: string, hasta?: string): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(s) AS fila
      FROM fuego.serie_armonizada_area(${areaId}, ${desde ?? null}::date, ${hasta ?? null}::date) s
      ORDER BY s.mes`);
  }

  alertas(areaId: string, q: AlertasQuery): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(a) AS fila
      FROM fuego.alertas_area(${areaId}, ${q.desde ?? null}::date, ${q.hasta ?? null}::date,
                              ${q.nivel ?? null}::text, ${q.variante}::text, ${q.solo_destacadas}::boolean,
                              ${q.limite}::int, ${q.offset}::int) a`);
  }

  alertaMesEnCurso(areaId: string, historial: boolean): Promise<Fila[]> {
    const origen = historial ? Prisma.sql`fuego.alerta_mes_en_curso` : Prisma.sql`fuego.v_alerta_mes_en_curso`;
    return this.filas(Prisma.sql`
      SELECT to_jsonb(a) AS fila FROM ${origen} a
      WHERE a.area_id = ${areaId}
      ORDER BY a.fecha_corte DESC, a.factor_de_enlace`);
  }

  tendencias(areaId: string): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(t) AS fila FROM fuego.tendencias t WHERE t.area_id = ${areaId} ORDER BY t.serie`);
  }

  // ── Espacial ─────────────────────────────────────────────────────────────

  recurrencia(areaId: string, q: RecurrenciaQuery): Promise<Fila[]> {
    const geometria = q.formato === 'geojson'
      ? Prisma.sql`|| jsonb_build_object('geometria', ST_AsGeoJSON(c.geom, 6)::jsonb)`
      : Prisma.empty;
    return this.filas(Prisma.sql`
      SELECT to_jsonb(r) ${geometria} AS fila
      FROM fuego.recurrencia_celda r JOIN fuego.celdas_1km c USING (cell_id)
      WHERE r.area_id = ${areaId}
        AND (NOT ${q.excluir_fuentes_persistentes}::boolean OR NOT r.fuente_persistente_probable)
      ORDER BY r.ranking`);
  }

  puntosCalientes(areaId: string, q: PuntosCalientesQuery): Promise<Fila[]> {
    const geometria = q.formato === 'geojson'
      ? Prisma.sql`|| jsonb_build_object('geometria', ST_AsGeoJSON(c.geom, 6)::jsonb)`
      : Prisma.empty;
    return this.filas(Prisma.sql`
      SELECT to_jsonb(p) ${geometria} AS fila
      FROM fuego.puntos_calientes_gi p JOIN fuego.celdas_1km c USING (cell_id)
      WHERE p.area_id = ${areaId} AND (NOT ${q.solo_calientes}::boolean OR p.punto_caliente)
      ORDER BY p.z_gi_estrella DESC`);
  }

  conglomerados(areaId: string): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(g) AS fila FROM fuego.conglomerados_gi g
      WHERE g.area_id = ${areaId} ORDER BY g.conglomerado`);
  }

  // ── Detecciones ──────────────────────────────────────────────────────────

  detecciones(q: DeteccionesQuery): Promise<Fila[]> {
    const orden = q.orden === 'fecha_desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    return this.filas(Prisma.sql`
      SELECT ${DETECCION_JSON} AS fila
      FROM fuego.detecciones d
      WHERE ${filtroDetecciones(q)}
      ORDER BY d.fecha_hora_utc ${orden}, d.id_deteccion
      LIMIT ${q.limite} OFFSET ${q.offset}`);
  }

  async contarDetecciones(q: DeteccionesQuery): Promise<number> {
    const rows = await this.query<{ total: number }>(Prisma.sql`
      SELECT count(*)::int AS total FROM fuego.detecciones d WHERE ${filtroDetecciones(q)}`);
    return rows[0]?.total ?? 0;
  }

  buscarDetecciones(poligono: unknown, desde?: string, hasta?: string, fuentes?: string[]): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT ${DETECCION_JSON} AS fila
      FROM fuego.buscar_detecciones(${geometria(poligono)}, ${desde ?? null}::date, ${hasta ?? null}::date,
                                    ${fuentes ?? null}::text[]) d`);
  }

  conteoMensualEnPoligono(poligono: unknown, desde?: string, hasta?: string): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(c) AS fila
      FROM fuego.conteo_mensual_en_poligono(${geometria(poligono)}, ${desde ?? null}::date, ${hasta ?? null}::date) c`);
  }

  serieArmonizadaPoligono(poligono: unknown, desde?: string, hasta?: string): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(s) AS fila
      FROM fuego.serie_armonizada_poligono(${geometria(poligono)}, ${desde ?? null}::date, ${hasta ?? null}::date) s
      ORDER BY s.mes`);
  }

  eventos(q: EventosQuery): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(e) AS fila FROM fuego.eventos e
      WHERE (${q.area_id ?? null}::text IS NULL OR e.area_id = ${q.area_id ?? null})
        AND (${q.desde ?? null}::date IS NULL OR e.fecha_fin >= ${q.desde ?? null}::date)
        AND (${q.hasta ?? null}::date IS NULL OR e.fecha_inicio <= ${q.hasta ?? null}::date)
      ORDER BY e.fecha_inicio, e.evento_id
      LIMIT ${q.limite} OFFSET ${q.offset}`);
  }

  // ── Metadatos ────────────────────────────────────────────────────────────

  fuentes(): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(f) AS fila FROM fuego.fuentes_satelitales f ORDER BY f.familia, f.inicio_indice NULLS LAST, f.fuente`);
  }

  casosDocumentados(): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(c) AS fila FROM fuego.casos_documentados c ORDER BY c.fecha_documentada`);
  }

  parametros(): Promise<Fila[]> {
    return this.filas(Prisma.sql`SELECT to_jsonb(p) AS fila FROM fuego.parametros p ORDER BY p.clave`);
  }

  versionesEsquema(): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(v) AS fila FROM fuego.schema_version v ORDER BY v.aplicada_en DESC`);
  }

  ultimaIngesta(): Promise<Fila[]> {
    return this.filas(Prisma.sql`
      SELECT to_jsonb(i) AS fila FROM fuego.ingestas i ORDER BY i.fecha_carga DESC LIMIT 1`);
  }

  // ── Infraestructura ──────────────────────────────────────────────────────

  private async filas(sql: Prisma.Sql): Promise<Fila[]> {
    return (await this.query<{ fila: Fila }>(sql)).map((row) => row.fila);
  }

  private async query<T>(sql: Prisma.Sql): Promise<T[]> {
    try {
      return await this.prisma.$queryRaw<T[]>(sql);
    } catch (error) {
      throw traducirError(error);
    }
  }
}

function filtroDetecciones(q: DeteccionesQuery): Prisma.Sql {
  const area = q.area_id ?? null;
  const desde = q.desde ?? null;
  const hasta = q.hasta ?? null;
  const fuentes = q.fuente ?? null;
  // En fuego.detecciones ya no hay confianza baja: "nominal" equivale a no filtrar.
  const soloAlta = q.confianza_minima === 'alta';
  const caja = q.bbox
    ? Prisma.sql`d.geom && ST_MakeEnvelope(${q.bbox[0]}, ${q.bbox[1]}, ${q.bbox[2]}, ${q.bbox[3]}, 4326)`
    : Prisma.sql`TRUE`;
  return Prisma.sql`
    (${area}::text IS NULL OR fuego.pertenece_a_area(d, ${area}::text))
    AND (${desde}::date IS NULL OR d.fecha_bo >= ${desde}::date)
    AND (${hasta}::date IS NULL OR d.fecha_bo <= ${hasta}::date)
    AND (${fuentes}::text[] IS NULL OR d.fuente = ANY (${fuentes}::text[]))
    AND (NOT ${soloAlta}::boolean OR d.confianza_clase = 'alta')
    AND (NOT ${q.excluir_fuentes_persistentes}::boolean OR NOT d.fuente_persistente_probable)
    AND ${caja}`;
}

function geometria(poligono: unknown): Prisma.Sql {
  return Prisma.sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(poligono)}), 4326)`;
}

/** Errores de PostgreSQL que tienen una respuesta clara para el cliente. */
function traducirError(error: unknown): unknown {
  const texto = mensajeCompleto(error);
  if (/(schema|relation|function) "?fuego/i.test(texto) && /does not exist/i.test(texto)) {
    return new ServiceUnavailableException(
      'El esquema fuego no está cargado en la base. Ejecuta en Server/: npm run fuego:setup',
    );
  }
  if (/geojson|geometry|invalid|parse error/i.test(texto) && /ST_GeomFromGeoJSON|geojson|geometr/i.test(texto)) {
    return new BadRequestException(`El polígono no es un GeoJSON válido: ${texto.slice(0, 200)}`);
  }
  return error;
}

function mensajeCompleto(error: unknown): string {
  const partes: string[] = [];
  for (let actual = error, n = 0; actual && n < 5; n++) {
    if (actual instanceof Error) partes.push(actual.message);
    actual = (actual as { cause?: unknown }).cause;
  }
  return partes.join(' | ');
}
