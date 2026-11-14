import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalisisRepository, type Fila } from './analisis.repository.js';
import type { HistorialDistritosQuery, HistorialQuery } from './analisis.schemas.js';
import {
  agruparPorArea,
  registroArmonizado,
  registroDeSensor,
  resumir,
  type FilaArmonizada,
  type FilaSensor,
  type FuenteHistorial,
  type MedidaHistorial,
  type RegistroHistorial,
} from './domain/historial.js';

interface Opciones {
  fuente: FuenteHistorial;
  medida: MedidaHistorial;
  desde_anio?: number;
  hasta_anio?: number;
}

/**
 * Datos para la vista /historial del frontend: registros mensuales con la forma de
 * HistoricalRecord, armonizados (índice del paquete fuego) o por sensor en bruto.
 */
@Injectable()
export class HistorialService {
  constructor(private readonly repository: AnalisisRepository) {}

  async deArea(q: HistorialQuery) {
    const [area] = await this.repository.areasResumen({ ids: [q.area_id] });
    if (!area) throw new NotFoundException(`No existe el área ${q.area_id}. Consulta GET /api/v1/areas`);

    const records = (await this.registros([q.area_id], q)).get(q.area_id) ?? [];
    return {
      area,
      ...(await this.contexto(q, area['metodo_indice'] === 'viirs_reescalado')),
      summary: resumir(records),
      records,
    };
  }

  async deDistritos(q: HistorialDistritosQuery) {
    const areas = await this.repository.areasResumen({ tipo: 'distrito' });
    const porArea = await this.registros(areas.map((a) => String(a['area_id'])), q);
    const districts = areas.map((area) => {
      const areaId = String(area['area_id']);
      const records = porArea.get(areaId) ?? [];
      return {
        area_id: areaId,
        nombre_visible: String(area['nombre_visible']),
        metodo_indice: area['metodo_indice'],
        summary: resumir(records),
        records,
      };
    });
    return {
      ...(await this.contexto(q, true)),
      // Ranking por actividad total, para el vistazo general.
      ranking: [...districts]
        .sort((a, b) => b.summary.total - a.summary.total)
        .map((d) => ({ area_id: d.area_id, nombre_visible: d.nombre_visible, total: d.summary.total })),
      districts,
    };
  }

  private async registros(areaIds: string[], o: Opciones): Promise<Map<string, RegistroHistorial[]>> {
    const resultado = new Map<string, RegistroHistorial[]>();
    if (o.fuente === 'HARMONIZED') {
      const filas = (await this.repository.serieArmonizadaMensual(areaIds, o.desde_anio, o.hasta_anio)) as unknown as FilaArmonizada[];
      for (const [id, grupo] of agruparPorArea(filas)) resultado.set(id, grupo.map(registroArmonizado));
      return resultado;
    }
    const sensor = o.fuente;
    const filas = (await this.repository.serieSensorMensual(areaIds, sensor, o.desde_anio, o.hasta_anio)) as unknown as FilaSensor[];
    for (const [id, grupo] of agruparPorArea(filas)) {
      resultado.set(id, grupo.map((f) => registroDeSensor(f, sensor, o.medida)));
    }
    return resultado;
  }

  /** Unidad y aviso que el frontend debe mostrar junto a las cifras. */
  private async contexto(o: Opciones, viirsReescalado: boolean): Promise<Fila> {
    const base = 'Una detección satelital de calor no es un incendio confirmado.';
    if (o.fuente === 'HARMONIZED') {
      return {
        source: o.fuente,
        unit: 'celdas-día MODIS-equivalentes',
        notice:
          `${base} Índice armonizado relativo: no son hectáreas ni número de incendios.` +
          (viirsReescalado
            ? ' Fuera del Parque Tunari el índice es VIIRS reescalado con el factor del Tunari, sin validación local;' +
              ' antes de febrero de 2012 no hay valor comparable (activityCount null: pintar en gris, nunca como cero).'
            : ''),
      };
    }
    const factor = await this.repository.factorViirsPorModis();
    return {
      source: o.fuente,
      unit: o.medida === 'detecciones' ? `detecciones ${o.fuente}` : `celdas-día ${o.fuente}`,
      notice:
        `${base} Conteo bruto de ${o.fuente}, sin armonizar y con todos sus satélites.` +
        ` MODIS y VIIRS no son comparables directamente: VIIRS (375 m) detecta unas ${factor?.toFixed(2) ?? '2,87'}` +
        ' veces más celdas-día que MODIS (1 km). Para compararlos use la fuente HARMONIZED.' +
        ' Los meses con provisional = true incluyen datos NRT que NASA aún puede corregir.',
    };
  }
}
