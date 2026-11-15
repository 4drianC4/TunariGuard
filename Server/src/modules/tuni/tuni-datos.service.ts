import { t, msg, currentLanguage, areaLabel } from '../../shared/i18n/language.js';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { deteccionesSchema, historialSchema } from '../analisis/analisis.schemas.js';
import { AnalisisService } from '../analisis/analisis.service.js';
import { HistorialService } from '../analisis/historial.service.js';
import { listAlertsSchema } from '../alerts/alerts.schemas.js';
import { AlertsService } from '../alerts/alerts.service.js';
import type { FuenteTuni, RespuestaTuni } from './tuni-respuesta.js';
import type { ContextoDetecciones, SateliteTuni } from './tuni.schemas.js';
import { nombreDelMes, type PeriodoIncendios } from './tuni-fechas.js';

const defaultArea = 'parque-tunari';
const nombrePorDefecto = 'Parque Nacional Tunari';
const deteccionAviso = 'Una detección térmica requiere verificación para confirmar un incendio.';
const locale = () => currentLanguage() === 'en' ? 'en-US' : 'es-BO';
const formats = {
  es: {
    number: new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }),
    date: new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }),
    month: new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  },
  en: {
    number: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
    date: new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }),
    month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  },
};
const formatNumber = (value: number) => formats[currentLanguage()].number.format(value);
const fechaLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' });
const isoDay = z.iso.date();
const isoMonth = /^(20\d\d|2100)-(0[1-9]|1[0-2])$/;

const alerta = z.object({
  mes: isoDay,
  fecha_corte: isoDay,
  nivel_alerta: z.enum(['normal', 'elevada', 'alta', 'muy_alta', 'sin_baseline']),
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
const casoDocumentado = z.object({
  fecha_documentada: isoDay,
  lugar_reportado: z.string(),
  descripcion: z.string(),
});

@Injectable()
export class TuniDatosService {
  constructor(
    private readonly analisis: AnalisisService,
    private readonly historial: HistorialService,
    private readonly alertas: AlertsService,
  ) {}

  /**
   * Alertas operativas guardadas (tabla alerts): las más recientes y el total por severidad.
   * «Parque Tunari» incluye sus sectores por municipio; «municipio de Cochabamba», sus 15 distritos.
   */
  async alertasOperativas(
    area: string | null, severidad: 'Crítica' | 'Alta' | 'Media' | null, soloPendientes: boolean,
  ): Promise<RespuestaTuni> {
    const filtro: Record<string, string> = {};
    let nombre = t('todas las áreas vigiladas');
    if (area !== null) {
      const seleccion = await this.area(area);
      if (!seleccion) return areaDesconocida(area);
      nombre = seleccion.nombre_visible;
      filtro['area_id'] = seleccion.area_id;
    }
    if (severidad) filtro['severidad'] = severidad;
    if (soloPendientes) filtro['estado'] = 'PENDING';

    const query = listAlertsSchema.parse({ ...filtro, limit: '5' });
    const resultado = await this.alertas.list(query);
    const fuente: FuenteTuni = {
      label: t('Abrir alertas'),
      route: '/alertas',
      apiPath: `/alertas?${new URLSearchParams({ ...filtro, limit: '50' })}`,
      query: filtro,
    };

    const descripcion = [soloPendientes ? t('pendientes') : '', severidad ? msg`de severidad ${t(severidad.toLowerCase())}` : '']
      .filter(Boolean).join(' ');
    if (!resultado.total) {
      return sinDatos(msg`No hay alertas operativas${descripcion ? ' ' + descripcion : ''} registradas en ${nombre}.`, fuente);
    }

    const { critical, high, medium } = resultado.counts;
    const desglose = severidad ? '' : msg` (${critical} críticas, ${high} altas y ${medium} medias)`;
    const [reciente] = resultado.items;
    const facts = resultado.items.map((a) => ({
      label: `${a.id} · ${a.severityLabel ?? a.severity} · ${a.statusLabel ?? a.status}`,
      value: `${a.district} · ${a.detected} (Bolivia) · ${a.detectionCount} ${a.detectionCount === 1 ? t('detección') : t('detecciones')}` +
        (a.simulated ? t(' · simulada') : ''),
    }));
    return {
      answer:
        msg`Hay ${formatNumber(resultado.total)} alertas operativas${descripcion ? ' ' + descripcion : ''} en ${nombre}${desglose}. ` +
        msg`La más reciente: ${reciente!.message}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
    };
  }

  async estadoMes(area: string | null, corte: string | null = null): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);
    if (corte !== null && !isoDay.safeParse(corte).success) return sinDatos(t('Indica una fecha de corte válida.'));

    const apiPath = `/areas/${encodeURIComponent(seleccion.area_id)}/alerta-mes-en-curso`;
    const fuente: FuenteTuni = {
      label: corte ? t('Ver alertas del área') : t('Ver alerta estadística'),
      route: '/alertas',
      query: { area: seleccion.area_id },
      apiPath: corte ? `${apiPath}?historial=true` : apiPath,
    };
    const fila = await this.cortePublicado(seleccion.area_id, corte);
    if (!fila) {
      const periodo = corte ? msg` al ${fecha(corte)}` : '';
      return sinDatos(msg`No hay un corte de alerta mensual disponible para ${seleccion.nombre_visible}${periodo}.`, fuente);
    }
    const dato = alerta.parse(fila);
    const nivel = t(dato.nivel_alerta.replace('_', ' '));
    const vigente = dato.mes.slice(0, 7) === fechaLocal.format(new Date()).slice(0, 7);
    const facts = [
      { label: t('Área'), value: seleccion.nombre_visible },
      { label: t('Corte'), value: fecha(dato.fecha_corte) },
      { label: t('Nivel estadístico'), value: nivel },
      { label: t('Actividad acumulada'), value: msg`${formatNumber(dato.celdas_dia_observadas)} celdas-día · ${dato.satelite_base}` },
    ];
    const mediana = dato.mediana_historica_tramo;
    if (mediana !== null) facts.push({ label: t('Mediana del mismo tramo'), value: msg`${formatNumber(mediana)} celdas-día` });
    if (dato.esperado_modelo !== null) facts.push({ label: t('Esperado por el modelo'), value: msg`${formatNumber(dato.esperado_modelo)} celdas-día` });
    if (dato.anios_de_historial !== null) facts.push({ label: t('Referencia histórica'), value: msg`${dato.anios_de_historial} años` });

    const valor = dato.celdas_dia_observadas;
    const lectura = mediana === null ? ''
      : msg` Se observaron ${formatNumber(valor)} celdas-día frente a una mediana de ${formatNumber(mediana)} para el mismo tramo.`;
    return {
      answer: msg`Al ${fecha(dato.fecha_corte)}, el nivel estadístico de ${seleccion.nombre_visible} era ${nivel}.${lectura} El satélite del corte fue ${dato.satelite_base}. ` +
        (corte || vigente ? t('La lectura corresponde al tramo observado del mes.') : t('Este es el último corte disponible y corresponde a un mes anterior.')) +
        ` ${t(deteccionAviso)}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
    };
  }

  async incendiosDocumentados(periodos: PeriodoIncendios[], area: string | null = null): Promise<RespuestaTuni> {
    if (area && (await this.area(area))?.area_id !== defaultArea) {
      return sinDatos(t('El catálogo del Tunari contiene lugares reportados en prensa. Para ese filtro necesitaría un registro con los límites y la ubicación de cada caso.'));
    }
    const incompletos = periodos.filter(({ anio }) => anio === null);
    if (incompletos.length) {
      const meses = new Intl.ListFormat(locale()).format(incompletos.map(({ mes }) => nombreDelMes(mes)));
      return {
        answer: msg`¿De qué año quieres consultar los incendios reportados en ${meses}? En TunariGuard puedo revisar los casos publicados en prensa que están en el catálogo del Tunari.`,
        dataSource: 'unavailable',
        periodosIncendios: periodos,
      };
    }

    const casos = z.array(casoDocumentado).parse(await this.analisis.casosDocumentados());
    const resultados = periodos.map(({ anio, mes: numeroMes }) => {
      const periodo = `${anio}-${String(numeroMes).padStart(2, '0')}`;
      return {
        etiqueta: mes(periodo),
        casos: casos.filter(({ fecha_documentada }) => fecha_documentada.startsWith(periodo + '-')),
      };
    });
    const resumen = resultados.map(({ etiqueta, casos }) => {
      if (!casos.length) return msg`En ${etiqueta} el catálogo no contiene casos reportados.`;
      const lugares = new Intl.ListFormat(locale()).format([...new Set(casos.map(({ lugar_reportado }) => lugar_reportado))]);
      return msg`En ${etiqueta} hay ${casos.length === 1 ? t('un caso reportado') : msg`${casos.length} casos reportados`} en ${lugares}.`;
    });
    return {
      answer: resumen.join(' ') + t(' El catálogo se basa en una selección de reportes de prensa y su cobertura es parcial.'),
      dataSource: 'tunari_guard',
      facts: resultados.flatMap(({ casos }) => casos.map(({ fecha_documentada, lugar_reportado, descripcion }) => ({
        label: `${fecha(fecha_documentada)} · ${lugar_reportado}`,
        value: descripcion,
      }))),
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
    if (!query.success) return sinDatos(t('Indica un rango de fechas válido con la fecha inicial antes de la final.'));
    const contextoDetecciones: ContextoDetecciones = { area: areaId, desde, hasta, satelite };
    const { cuerpo, cabeceras } = await this.analisis.detecciones(query.data);
    const params = new URLSearchParams({ area_id: areaId, orden: 'fecha_desc', limite: '5' });
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    if (satelite) params.set('fuente', satelite);
    const fuente: FuenteTuni = { label: t('Abrir mapa de focos'), route: '/mapa', apiPath: `/detecciones?${params}` };

    const filas = z.array(deteccion).parse(cuerpo);
    if (!filas.length) {
      const filtro = satelite ? ` de ${satelite}` : '';
      const periodo = desde && desde === hasta ? `el ${fecha(desde)}` : t('en el intervalo consultado');
      return {
        ...sinDatos(msg`No encontré detecciones${filtro} cargadas para ${seleccion.nombre_visible} ${periodo}. Esto puede deberse a la cobertura disponible.`),
        contextoDetecciones,
      };
    }

    const facts = filas.map((fila) => ({
      label: `${fecha(fila.fecha_bo)} · ${fila.fecha_hora_bo.slice(11, 16)} (Bolivia)`,
      value: `${fila.fuente} · ${fila.distrito ? fila.distrito + ' · ' : ''}${fila.lat.toFixed(4)}, ${fila.lon.toFixed(4)}` +
        (fila.origen_dato === 'NRT' ? t(' · NRT provisional') : ''),
    }));
    const total = Number(cabeceras?.['X-Total-Count']);
    const muestra = total > filas.length ? msg` Muestro las ${filas.length} más recientes del intervalo consultado.` : '';
    return {
      answer: msg`Estas son las detecciones térmicas más recientes cargadas para ${seleccion.nombre_visible}. ` +
        msg`La última observación disponible para esta consulta es del ${fecha(filas[0]!.fecha_bo)}.${muestra} ${t(deteccionAviso)}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
      contextoDetecciones,
    };
  }

  async verificarAlerta(area: string | null, corte: string | null, satelite: SateliteTuni): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);
    if (corte !== null && !isoDay.safeParse(corte).success) {
      return sinDatos(t('Indica una fecha de corte válida para verificar la alerta.'));
    }
    const { area_id: areaId, nombre_visible: nombre } = seleccion;
    const publicada = await this.cortePublicado(areaId, corte);
    if (!publicada) {
      const periodo = corte ? msg` al ${fecha(corte)}` : '';
      return sinDatos(msg`No hay una alerta mensual publicada para ${nombre}${periodo}.`);
    }

    const alerta = corteAlerta.parse(publicada);
    const periodo = msg`del ${fecha(alerta.mes)} al ${fecha(alerta.fecha_corte)}`;
    const publicado = formatNumber(alerta.celdas_dia_observadas);
    const resumen = msg`La alerta de ${nombre} reporta ${publicado} celdas-día de ${alerta.satelite_base} ${periodo}.`;
    const fuenteBase = alerta.satelite_base.startsWith('VIIRS-') ? alerta.satelite_base : `VIIRS-${alerta.satelite_base}`;
    if (satelite && satelite !== fuenteBase) {
      return sinDatos(msg`${resumen} Para cotejarla hacen falta las detecciones del satélite que usó el corte.`);
    }

    const query = deteccionesSchema.safeParse({
      area_id: areaId, desde: alerta.mes, hasta: alerta.fecha_corte, fuente: fuenteBase, limite: 10_000,
    });
    if (!query.success) return sinDatos(msg`${resumen} No pude determinar el filtro del satélite para consultar el detalle.`);
    const { cuerpo, cabeceras } = await this.analisis.detecciones(query.data);
    const detecciones = z.array(deteccionParaAlerta).parse(cuerpo);
    const celdasDia = new Set(detecciones.flatMap((fila) => fila.cell_id ? [`${fila.fecha_bo}/${fila.cell_id}`] : [])).size;
    const total = Number(cabeceras?.['X-Total-Count'] ?? detecciones.length);
    const facts = [
      { label: t('Celdas-día publicadas'), value: publicado },
      { label: t('Detecciones cargadas en el tramo'), value: formatNumber(total) },
      { label: t('Celdas-día reconstruidas con el detalle disponible'), value: formatNumber(celdasDia) },
    ];
    if (!detecciones.length) {
      return {
        ...sinDatos(msg`${resumen} La consulta a la base devolvió 0 detecciones para ese satélite, área y fechas. Falta el detalle de las detecciones que alimentaron ese corte para verificar la cifra.`),
        facts,
      };
    }
    if (total !== detecciones.length || detecciones.some((fila) => fila.cell_id === null)) {
      return {
        ...sinDatos(msg`${resumen} Para verificarla hacen falta todas las detecciones del tramo y su identificador de celda de 1 km.`),
        facts,
      };
    }
    const comparacion = celdasDia === alerta.celdas_dia_observadas
      ? t('El total coincide con el corte publicado.')
      : t('El total difiere del corte publicado. Para explicar la diferencia hace falta el detalle que se usó para calcular la alerta.');
    return {
      answer: msg`${resumen} El detalle cargado suma ${formatNumber(celdasDia)} celdas-día al contar cada celda una vez por día. ${comparacion}`,
      dataSource: 'tunari_guard',
      facts,
    };
  }

  async compararMeses(area: string | null, periodo: string | null, referencia: string | null): Promise<RespuestaTuni> {
    const seleccion = await this.area(area);
    if (!seleccion) return areaDesconocida(area);
    const areaId = seleccion.area_id;
    const corte = isoDay.safeParse(await this.analisis.fechaCorteSeries());
    if (!corte.success) return sinDatos(t('La serie armonizada no tiene una fecha de cobertura publicada.'));

    const corteMes = corte.data.slice(0, 7);
    const ultimoMes = corte.data === fechaFinMes(corteMes) ? corteMes : mesAnterior(corteMes);
    const primero = periodo ?? ultimoMes;
    const segundo = referencia ?? `${Number(primero.slice(0, 4)) - 1}${primero.slice(4)}`;
    if (!isoMonth.test(primero) || !isoMonth.test(segundo)) {
      return sinDatos(t('Indica dos meses calendario válidos, por ejemplo octubre de 2026 y octubre de 2025.'));
    }
    if (primero === segundo) return sinDatos(t('Indica dos meses distintos para comparar.'));
    const areaParams = new URLSearchParams({ area_id: areaId, fuente: 'HARMONIZED' });
    const fuente: FuenteTuni = { label: t('Abrir historial'), route: '/historial' };
    if (primero > ultimoMes || segundo > ultimoMes) {
      return sinDatos(msg`El último mes completo publicado en la serie armonizada es ${mes(ultimoMes)}. Puedes comparar ese mes con otro mes completo o consultar la alerta para el tramo del mes en curso.`, fuente);
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
      { label: t('Área'), value: seleccion.nombre_visible },
      { label: t('Corte de la serie'), value: fecha(corte.data) },
      { label: t('Unidad'), value: historial.unit },
      {
        label: mes(primero),
        value: a == null ? t('Sin valor comparable') : formatNumber(a) + (provisionales.includes(primero) ? t(' · Con detecciones NRT en el área') : ''),
      },
      {
        label: mes(segundo),
        value: b == null ? t('Sin valor comparable') : formatNumber(b) + (provisionales.includes(segundo) ? t(' · Con detecciones NRT en el área') : ''),
      },
    ];
    if (a == null || b == null) {
      return { ...sinDatos(t('La comparación requiere un valor para ambos meses. La serie no tiene un valor comparable en al menos uno de ellos.'), fuente), facts };
    }
    const diferencia = Math.round((a - b) * 100) / 100;
    facts.push({ label: t('Diferencia'), value: formatNumber(diferencia) });
    if (b > 0) facts.push({ label: t('Variación relativa'), value: `${formatNumber((diferencia / b) * 100)} %` });
    const lectura = diferencia === 0 ? t('se mantuvo igual') : diferencia > 0 ? t('subió') : t('bajó');
    const estacion = primero.slice(5) !== segundo.slice(5) ? t(' Los meses corresponden a tramos distintos del año.') : '';
    const calidad = [primero, segundo].some((p) => porMes.get(p)?.quality === 'aproximado_factor_transferido')
      ? t(' El índice usa un factor transferido del Tunari sin validación local.')
      : '';
    return {
      answer: msg`En ${seleccion.nombre_visible}, el índice de actividad térmica ${lectura} de ${formatNumber(b)} en ${mes(segundo)} ` +
        msg`a ${formatNumber(a)} en ${mes(primero)}, en celdas-día MODIS-equivalentes.${estacion} ` +
        msg`El índice mensual es indicativo.${calidad}`,
      dataSource: 'tunari_guard',
      facts,
      source: fuente,
    };
  }

  private async cortePublicado(area: string, corte: string | null) {
    const filas = await this.analisis.alertaMesEnCurso(area, corte !== null);
    if (corte === null) return filas[0];
    return filas.find((fila) => fila['factor_de_enlace'] === 1 && fila['fecha_corte'] === corte);
  }

  private async area(input: string | null) {
    const nombre = normalizar(input || defaultArea);
    if ([defaultArea, 'tunari', 'parque tunari', 'parque nacional tunari', 'tunari national park', 'tunari park', 'parque'].map(normalizar).includes(nombre)) {
      return { area_id: defaultArea, nombre_visible: areaLabel(nombrePorDefecto) };
    }
    const distrito = /^d(?:istrito|istrict)?\s*0?(\d{1,2})$/.exec(nombre);
    const clave = distrito ? `distrito ${String(distrito[1]).padStart(2, '0')}` :
      ['cochabamba', 'municipality of cochabamba', 'cochabamba municipality'].includes(nombre) ? 'municipio cochabamba' : nombre;
    const areas = z.array(areaSchema).parse(await this.analisis.areasResumen());
    const matches = areas.filter((a) => [a.area_id, a.nombre_visible, a.nombre].some((v) => v && (normalizar(v) === clave || normalizar(areaLabel(v, 'en')) === nombre)));
    if (matches.length === 1) return matches[0];
    const unicoCodigo = matches.find((a) => normalizar(a.area_id) === clave);
    return unicoCodigo;
  }
}

export function normalizar(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fecha(value: string): string {
  return formats[currentLanguage()].date.format(new Date(`${value}T00:00:00Z`));
}

function mes(value: string): string {
  return formats[currentLanguage()].month.format(new Date(`${value}-01T00:00:00Z`));
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
  return sinDatos(msg`No pude identificar el área «${area}». Indica Parque Nacional Tunari, municipio de Cochabamba o un número de distrito.`);
}
