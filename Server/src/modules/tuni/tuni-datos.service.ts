import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { deteccionesSchema, historialSchema } from '../analisis/analisis.schemas.js';
import { AnalisisService } from '../analisis/analisis.service.js';
import { HistorialService } from '../analisis/historial.service.js';
import type { FuenteTuni, RespuestaTuni } from './tuni-respuesta.js';
import type { SateliteTuni } from './tuni.schemas.js';

const defaultArea = 'parque-tunari';
const nombrePorDefecto = 'Parque Nacional Tunari';
const deteccionAviso = 'Una detección térmica requiere verificación para confirmar un incendio.';
const numero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
const fechaLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' });
const fechaLarga = new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' });
const mesLargo = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const isoDay = z.iso.date();
const isoMonth = /^(20\d\d|2100)-(0[1-9]|1[0-2])$/;

const alerta = z.object({
  mes: isoDay,
  fecha_corte: isoDay,
  nivel_alerta: z.enum(['normal', 'elevada', 'alta', 'muy_alta']),
  satelite_base: z.string(),
  celdas_dia_observadas: z.number(),
  mediana_historica_tramo: z.number().nullable(),
  esperado_modelo: z.number().nullable(),
  anios_de_historial: z.number().nullable(),
});
const corteAlerta = alerta.pick({
  mes: true, fecha_corte: true, satelite_base: true, celdas_dia_observadas: true,
}).extend({ factor_de_enlace: z.number() });
const deteccionParaAlerta = z.object({ fecha_bo: isoDay, cell_id: z.string().min(1).nullable() });
const deteccion = z.object({
  fecha_bo: isoDay,
  fecha_hora_bo: z.string(),
  fuente: z.string(),
  distrito: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  origen_dato: z.string(),
});
const areaSchema = z.object({ area_id: z.string(), nombre_visible: z.string(), nombre: z.string().optional() });

@Injectable()
export class TuniDatosService {
  constructor(
    private readonly analisis: AnalisisService,
    private readonly historial: HistorialService,
  ) {}

  async estadoMes(area: string | null): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);

    const apiPath = `/areas/${encodeURIComponent(seleccion.area_id)}/alerta-mes-en-curso`;
    const fuente: FuenteTuni = {
      label: 'Ver alerta estadística',
      route: '/alertas',
      query: { area: seleccion.area_id },
      apiPath,
    };
    const [fila] = await this.analisis.alertaMesEnCurso(seleccion.area_id, false);
    if (!fila) return sinDatos(`No hay un corte de alerta mensual disponible para ${seleccion.nombre_visible}.`, fuente);
    const dato = alerta.parse(fila);
    const nivel = dato.nivel_alerta.replace('_', ' ');
    const vigente = dato.mes.slice(0, 7) === fechaLocal.format(new Date()).slice(0, 7);
    const facts = [
      { label: 'Área', value: seleccion.nombre_visible },
      { label: 'Corte', value: fecha(dato.fecha_corte) },
      { label: 'Nivel estadístico', value: nivel },
      { label: 'Actividad acumulada', value: `${numero.format(dato.celdas_dia_observadas)} celdas-día · ${dato.satelite_base}` },
    ];
    const mediana = dato.mediana_historica_tramo;
    if (mediana !== null) facts.push({ label: 'Mediana del mismo tramo', value: `${numero.format(mediana)} celdas-día` });
    if (dato.esperado_modelo !== null) facts.push({ label: 'Esperado por el modelo', value: `${numero.format(dato.esperado_modelo)} celdas-día` });
    if (dato.anios_de_historial !== null) facts.push({ label: 'Referencia histórica', value: `${dato.anios_de_historial} años` });

    const valor = dato.celdas_dia_observadas;
    const lectura = mediana === null ? ''
      : ` Se observaron ${numero.format(valor)} celdas-día frente a una mediana de ${numero.format(mediana)} para el mismo tramo.`;
    return {
      answer: `Al ${fecha(dato.fecha_corte)}, el nivel estadístico de ${seleccion.nombre_visible} era ${nivel}.${lectura} ` +
        (vigente ? 'La lectura corresponde al tramo observado del mes.' : 'Este es el último corte disponible y corresponde a un mes anterior.') +
        ` ${deteccionAviso}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
    };
  }

  async ultimasDetecciones(
    area: string | null, desde: string | null, hasta: string | null, satelite: SateliteTuni = null,
  ): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);
    const areaId = seleccion.area_id;
    const query = deteccionesSchema.safeParse({
      area_id: areaId, desde: desde ?? undefined, hasta: hasta ?? undefined,
      fuente: satelite ?? undefined, limite: 5, orden: 'fecha_desc',
    });
    if (!query.success) return sinDatos('Indica un rango de fechas válido con la fecha inicial antes de la final.');
    const { cuerpo, cabeceras } = await this.analisis.detecciones(query.data);
    const params = new URLSearchParams({ area_id: areaId, orden: 'fecha_desc', limite: '5' });
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    if (satelite) params.set('fuente', satelite);
    const fuente: FuenteTuni = { label: 'Abrir mapa de focos', route: '/mapa', apiPath: `/detecciones?${params}` };

    const filas = z.array(deteccion).parse(cuerpo);
    if (!filas.length) {
      const filtro = satelite ? ` de ${satelite}` : '';
      return sinDatos(`No encontré detecciones${filtro} cargadas para ${seleccion.nombre_visible} en el intervalo consultado. Esto puede deberse a la cobertura disponible.`);
    }

    const facts = filas.map((fila) => ({
      label: `${fecha(fila.fecha_bo)} · ${fila.fecha_hora_bo.slice(11, 16)} (Bolivia)`,
      value: `${fila.fuente} · ${fila.distrito ? fila.distrito + ' · ' : ''}${fila.lat.toFixed(4)}, ${fila.lon.toFixed(4)}` +
        (fila.origen_dato === 'NRT' ? ' · NRT provisional' : ''),
    }));
    const total = Number(cabeceras?.['X-Total-Count']);
    const muestra = total > filas.length ? ` Muestro las ${filas.length} más recientes del intervalo consultado.` : '';
    return {
      answer: `Estas son las detecciones térmicas más recientes cargadas para ${seleccion.nombre_visible}. ` +
        `La última observación disponible para esta consulta es del ${fecha(filas[0]!.fecha_bo)}.${muestra} ${deteccionAviso}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
    };
  }

  async verificarAlerta(area: string | null, corte: string | null, satelite: SateliteTuni): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);
    if (corte !== null && !isoDay.safeParse(corte).success) {
      return sinDatos('Indica una fecha de corte válida para verificar la alerta.');
    }
    const { area_id: areaId, nombre_visible: nombre } = seleccion;
    const filas = await this.analisis.alertaMesEnCurso(areaId, corte !== null);
    const publicada = filas.find((fila) => fila['factor_de_enlace'] === 1 && (corte === null || fila['fecha_corte'] === corte));
    if (!publicada) {
      const periodo = corte ? ` al ${fecha(corte)}` : '';
      return sinDatos(`No hay una alerta mensual publicada para ${nombre}${periodo}.`);
    }

    const alerta = corteAlerta.parse(publicada);
    const periodo = `del ${fecha(alerta.mes)} al ${fecha(alerta.fecha_corte)}`;
    const publicado = numero.format(alerta.celdas_dia_observadas);
    const resumen = `La alerta de ${nombre} reporta ${publicado} celdas-día de ${alerta.satelite_base} ${periodo}.`;
    const fuenteBase = alerta.satelite_base.startsWith('VIIRS-') ? alerta.satelite_base : `VIIRS-${alerta.satelite_base}`;
    if (satelite && satelite !== fuenteBase) {
      return sinDatos(`${resumen} Para cotejarla hacen falta las detecciones del satélite que usó el corte.`);
    }

    const query = deteccionesSchema.safeParse({
      area_id: areaId, desde: alerta.mes, hasta: alerta.fecha_corte, fuente: fuenteBase, limite: 10_000,
    });
    if (!query.success) return sinDatos(`${resumen} No pude determinar el filtro del satélite para consultar el detalle.`);
    const { cuerpo, cabeceras } = await this.analisis.detecciones(query.data);
    const detecciones = z.array(deteccionParaAlerta).parse(cuerpo);
    const celdasDia = new Set(detecciones.flatMap((fila) => fila.cell_id ? [`${fila.fecha_bo}/${fila.cell_id}`] : [])).size;
    const total = Number(cabeceras?.['X-Total-Count'] ?? detecciones.length);
    const facts = [
      { label: 'Celdas-día publicadas', value: publicado },
      { label: 'Detecciones cargadas en el tramo', value: numero.format(total) },
      { label: 'Celdas-día reconstruidas con el detalle disponible', value: numero.format(celdasDia) },
    ];
    if (!detecciones.length) {
      return {
        ...sinDatos(`${resumen} La consulta a la base devolvió 0 detecciones para ese satélite, área y fechas. Falta el detalle de las detecciones que alimentaron ese corte para verificar la cifra.`),
        facts,
      };
    }
    if (total !== detecciones.length || detecciones.some((fila) => fila.cell_id === null)) {
      return {
        ...sinDatos(`${resumen} Para verificarla hacen falta todas las detecciones del tramo y su identificador de celda de 1 km.`),
        facts,
      };
    }
    const comparacion = celdasDia === alerta.celdas_dia_observadas
      ? 'El total coincide con el corte publicado.'
      : 'El total difiere del corte publicado. Para explicar la diferencia hace falta el detalle que se usó para calcular la alerta.';
    return {
      answer: `${resumen} El detalle cargado suma ${numero.format(celdasDia)} celdas-día al contar cada celda una vez por día. ${comparacion}`,
      dataSource: 'tunari_guard',
      facts,
    };
  }

  async compararMeses(area: string | null, periodo: string | null, referencia: string | null): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);
    const areaId = seleccion.area_id;
    const corte = isoDay.safeParse(await this.analisis.fechaCorteSeries());
    if (!corte.success) return sinDatos('La serie armonizada no tiene una fecha de cobertura publicada.');

    const corteMes = corte.data.slice(0, 7);
    const ultimoMes = corte.data === fechaFinMes(corteMes) ? corteMes : mesAnterior(corteMes);
    const primero = periodo ?? ultimoMes;
    const segundo = referencia ?? `${Number(primero.slice(0, 4)) - 1}${primero.slice(4)}`;
    if (!isoMonth.test(primero) || !isoMonth.test(segundo)) {
      return sinDatos('Indica dos meses calendario válidos, por ejemplo octubre de 2026 y octubre de 2025.');
    }
    if (primero === segundo) return sinDatos('Indica dos meses distintos para comparar.');
    const areaParams = new URLSearchParams({ area_id: areaId, fuente: 'HARMONIZED' });
    const fuente: FuenteTuni = { label: 'Abrir historial', route: '/historial' };
    if (primero > ultimoMes || segundo > ultimoMes) {
      return sinDatos(`El último mes completo publicado en la serie armonizada es ${mes(ultimoMes)}. Puedes comparar ese mes con otro mes completo o consultar la alerta para el tramo del mes en curso.`, fuente);
    }

    const anios = [Number(primero.slice(0, 4)), Number(segundo.slice(0, 4))];
    const desde = Math.min(...anios);
    const hasta = Math.max(...anios);
    areaParams.set('desde_anio', String(desde));
    areaParams.set('hasta_anio', String(hasta));
    fuente.apiPath = `/historial?${areaParams}`;
    const [historial, provisionales] = await Promise.all([
      this.historial.deArea(historialSchema.parse({ area_id: areaId, desde_anio: desde, hasta_anio: hasta })),
      this.analisis.mesesConDeteccionesProvisionales(areaId, `${primero}-01`, `${segundo}-01`),
    ]);
    const porMes = new Map(historial.records.map((fila) => [`${fila.year}-${String(fila.month).padStart(2, '0')}`, fila]));
    const a = porMes.get(primero)?.activityCount;
    const b = porMes.get(segundo)?.activityCount;
    const facts = [
      { label: 'Área', value: seleccion.nombre_visible },
      { label: 'Corte de la serie', value: fecha(corte.data) },
      { label: 'Unidad', value: historial.unit },
      {
        label: mes(primero),
        value: a == null ? 'Sin valor comparable' : numero.format(a) + (provisionales.includes(primero) ? ' · Con detecciones NRT en el área' : ''),
      },
      {
        label: mes(segundo),
        value: b == null ? 'Sin valor comparable' : numero.format(b) + (provisionales.includes(segundo) ? ' · Con detecciones NRT en el área' : ''),
      },
    ];
    if (a == null || b == null) {
      return { ...sinDatos('La comparación requiere un valor para ambos meses. La serie no tiene un valor comparable en al menos uno de ellos.', fuente), facts };
    }
    const diferencia = Math.round((a - b) * 100) / 100;
    facts.push({ label: 'Diferencia', value: numero.format(diferencia) });
    if (b > 0) facts.push({ label: 'Variación relativa', value: `${numero.format((diferencia / b) * 100)} %` });
    const lectura = diferencia === 0 ? 'se mantuvo igual' : diferencia > 0 ? 'subió' : 'bajó';
    const estacion = primero.slice(5) !== segundo.slice(5) ? ' Los meses corresponden a tramos distintos del año.' : '';
    const calidad = [primero, segundo].some((p) => porMes.get(p)?.quality === 'aproximado_factor_transferido')
      ? ' El índice usa un factor transferido del Tunari sin validación local.'
      : '';
    return {
      answer: `En ${seleccion.nombre_visible}, el índice de actividad térmica ${lectura} de ${numero.format(b)} en ${mes(segundo)} ` +
        `a ${numero.format(a)} en ${mes(primero)}, en celdas-día MODIS-equivalentes.${estacion} ` +
        `El índice mensual es indicativo.${calidad}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
    };
  }

  private async area(input: string | null) {
    const nombre = normalizar(input || defaultArea);
    if ([defaultArea, 'tunari', 'parque tunari', 'parque nacional tunari', 'parque'].map(normalizar).includes(nombre)) {
      return { area_id: defaultArea, nombre_visible: nombrePorDefecto };
    }
    const distrito = /^d(?:istrito)?\s*0?(\d{1,2})$/.exec(nombre);
    const clave = distrito ? `distrito ${String(distrito[1]).padStart(2, '0')}` :
      nombre === 'cochabamba' ? 'municipio cochabamba' : nombre;
    const areas = z.array(areaSchema).parse(await this.analisis.areasResumen());
    const matches = areas.filter((a) => [a.area_id, a.nombre_visible, a.nombre].some((v) => v && normalizar(v) === clave));
    if (matches.length === 1) return matches[0];
    const unicoCodigo = matches.find((a) => normalizar(a.area_id) === clave);
    return unicoCodigo;
  }
}

export function normalizar(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fecha(value: string): string {
  return fechaLarga.format(new Date(`${value}T00:00:00Z`));
}

function mes(value: string): string {
  return mesLargo.format(new Date(`${value}-01T00:00:00Z`));
}

function fechaFinMes(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}

function mesAnterior(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 2, 1)).toISOString().slice(0, 7);
}

function sinDatos(answer: string, source?: FuenteTuni): RespuestaTuni {
  return { answer, dataSource: 'unavailable', source };
}

function areaDesconocida(area: string | null): RespuestaTuni {
  return sinDatos(`No pude identificar el área «${area}». Indica Parque Nacional Tunari, municipio de Cochabamba o un número de distrito.`);
}
