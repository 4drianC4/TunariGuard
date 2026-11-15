import { currentLanguage, msg, t } from '../../shared/i18n/language.js';
import { readFile } from 'node:fs/promises';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalisisRepository, type Fila } from './analisis.repository.js';
import type {
  AlertasQuery,
  BuscarDeteccionesBody,
  CalendarioQuery,
  DeteccionesQuery,
  EventosQuery,
  PoligonoBody,
  PuntosCalientesQuery,
  RecurrenciaQuery,
  SerieQuery,
} from './analisis.schemas.js';
import { aCsv, aFeatureCollection, deteccionesAFeatureCollection } from './domain/formatos.js';

/** Textos que deben acompañar las cifras (docs/advertencias.json del paquete). */
const ADVERTENCIAS = new URL('../../../data/fuego/docs/advertencias.json', import.meta.url);

export type Formato = 'json' | 'csv' | 'geojson';

export interface Respuesta {
  cuerpo: unknown;
  tipo?: string;
  cabeceras?: Record<string, string>;
}

@Injectable()
export class AnalisisService {
  private advertencias?: Promise<{ codigo: string; donde: string; texto: string }[]>;

  constructor(private readonly repository: AnalisisRepository) {}

  async listarAreas(tipo: string | undefined, formato: 'json' | 'geojson') {
    const filas = await this.repository.listarAreas(tipo, formato === 'geojson');
    return formato === 'geojson' ? aFeatureCollection(filas) : filas;
  }

  areasResumen() {
    return this.repository.areasResumen({});
  }

  async fechaCorteSeries() {
    const parametros = await this.repository.parametros();
    return parametros.find((fila) => fila['clave'] === 'cobertura_hasta')?.['valor'];
  }

  mesesConDeteccionesProvisionales = this.porArea((id, primero: string, segundo: string) =>
    this.repository.mesesConDeteccionesProvisionales(id, primero, segundo),
  );

  async area(areaId: string) {
    const fila = await this.repository.area(areaId);
    if (!fila) throw noExisteArea(areaId);
    return fila;
  }

  calendario = this.porArea((id, q: CalendarioQuery) => this.repository.calendario(id, q));
  serie = this.porArea((id, q: SerieQuery) => this.repository.serie(id, q));
  alertas = this.porArea((id, q: AlertasQuery) => this.repository.alertas(id, q));
  alertaMesEnCurso = this.porArea((id, historial: boolean) => this.repository.alertaMesEnCurso(id, historial));
  tendencias = this.porArea((id) => this.repository.tendencias(id));
  serieArmonizada = this.porArea((id, desde?: string, hasta?: string) =>
    this.repository.serieArmonizadaArea(id, desde, hasta),
  );

  recurrencia = this.porArea(async (id, q: RecurrenciaQuery) => {
    const filas = await this.repository.recurrencia(id, q);
    return q.formato === 'geojson' ? aFeatureCollection(filas) : filas;
  });

  puntosCalientes = this.porArea(async (id, q: PuntosCalientesQuery) => {
    const [celdas, conglomerados] = await Promise.all([
      this.repository.puntosCalientes(id, q),
      this.repository.conglomerados(id),
    ]);
    return { celdas: q.formato === 'geojson' ? aFeatureCollection(celdas) : celdas, conglomerados };
  });

  async detecciones(q: DeteccionesQuery): Promise<Respuesta> {
    if (q.area_id && !(await this.repository.existeArea(q.area_id))) throw noExisteArea(q.area_id);
    const [filas, total] = await Promise.all([this.repository.detecciones(q), this.repository.contarDetecciones(q)]);
    const siguiente = q.offset + filas.length;
    const cabeceras: Record<string, string> = { 'X-Total-Count': String(total) };
    if (siguiente < total) cabeceras['X-Next-Offset'] = String(siguiente);
    const respuesta = formatear(filas, q.formato, currentLanguage() === 'en' ? 'detections' : 'detecciones');
    return { ...respuesta, cabeceras: { ...respuesta.cabeceras, ...cabeceras } };
  }

  async buscarDetecciones(body: BuscarDeteccionesBody): Promise<Respuesta> {
    const filas = await this.repository.buscarDetecciones(body.poligono, body.desde, body.hasta, body.fuentes);
    const respuesta = formatear(filas, body.formato, currentLanguage() === 'en' ? 'polygon-detections' : 'detecciones-poligono');
    return { ...respuesta, cabeceras: { ...respuesta.cabeceras, 'X-Total-Count': String(filas.length) } };
  }

  conteoMensual(body: PoligonoBody) {
    return this.repository.conteoMensualEnPoligono(body.poligono, body.desde, body.hasta);
  }

  serieArmonizadaPoligono(body: PoligonoBody) {
    return this.repository.serieArmonizadaPoligono(body.poligono, body.desde, body.hasta);
  }

  eventos(q: EventosQuery) {
    return this.repository.eventos(q);
  }

  fuentes() {
    return this.repository.fuentes();
  }

  casosDocumentados() {
    return this.repository.casosDocumentados();
  }

  async metadatos() {
    const [parametros, versiones, [ultimaIngesta], advertencias] = await Promise.all([
      this.repository.parametros(),
      this.repository.versionesEsquema(),
      this.repository.ultimaIngesta(),
      this.leerAdvertencias(),
    ]);
    return {
      parametros: Object.fromEntries(parametros.map((p) => [p['clave'], p['valor']])),
      parametrosDetalle: parametros,
      versionEsquema: versiones[0]?.['version'] ?? null,
      ultimaIngesta: ultimaIngesta ?? null,
      advertencias: advertencias.map(({ codigo, donde, texto }) => ({ codigo, donde: t(donde), texto: t(texto) })),
    };
  }

  /** Lee advertencias.json una vez; si falta, la API sigue respondiendo con una lista vacía. */
  private leerAdvertencias() {
    this.advertencias ??= readFile(ADVERTENCIAS, 'utf8')
      .then((texto) => JSON.parse(texto) as { codigo: string; donde: string; texto: string }[])
      .catch(() => []);
    return this.advertencias;
  }

  /** Envuelve una consulta por área: responde 404 si el área no existe en vez de una lista vacía. */
  private porArea<A extends unknown[], R>(consulta: (areaId: string, ...args: A) => Promise<R>) {
    return async (areaId: string, ...args: A): Promise<R> => {
      if (!(await this.repository.existeArea(areaId))) throw noExisteArea(areaId);
      return consulta(areaId, ...args);
    };
  }
}

function formatear(filas: Fila[], formato: Formato, nombreArchivo: string): Respuesta {
  if (formato === 'csv') {
    return {
      cuerpo: aCsv(filas),
      tipo: 'text/csv; charset=utf-8',
      cabeceras: { 'Content-Disposition': `attachment; filename="${nombreArchivo}.csv"` },
    };
  }
  if (formato === 'geojson') return { cuerpo: deteccionesAFeatureCollection(filas), tipo: 'application/geo+json' };
  return { cuerpo: filas };
}

function noExisteArea(areaId: string) {
  return new NotFoundException(msg`No existe el área ${areaId}. Consulta GET /api/v1/areas`);
}
