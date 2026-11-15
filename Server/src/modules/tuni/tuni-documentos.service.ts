import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { normalizar } from './tuni-datos.service.js';
import type { CitaTuni } from './tuni-respuesta.js';

const carpeta = new URL('../../../data/fuego/docs/', import.meta.url);
const advertencias = z.array(z.object({ codigo: z.string(), donde: z.string(), texto: z.string() }));
const maximoPasajes = 6;

const metadatos: Record<string, { temas?: string; alcance?: string }> = {
  'celda-dia': { temas: 'celda-día conteo duplicados cuadrícula detecciones grilla 1 km' },
  fuentes_satelitales: { temas: 'celda-día deduplicar agrupar Terra Aqua MODIS VIIRS satélite catálogo' },
  celdas_1km: { temas: 'celda-día cuadrícula grilla tamaño resolución 1 km' },
  serie_mensual: { temas: 'índice armonizado equivalencia MODIS VIIRS factor calidad mensual' },
  factores_satelites: { temas: 'armonizar calibración conversion equivalencia índice MODIS VIIRS factores' },
  alerta_mes_en_curso: {
    temas: 'corte mensual NOAA-20 Suomi-NPP referencia histórica comparación tramo mes en curso',
    alcance: 'Metodología del corte mensual. El satélite y la fecha de un corte concreto se consultan en la base.',
  },
  alertas_mensuales: {
    temas: 'alerta señal estadística probabilidad exceso severidad umbral historial',
    alcance: 'Serie histórica de alertas mensuales.',
  },
  dos_satelites_mismo_fuego: { temas: 'celda-día deduplicar doble conteo NOAA-20 Suomi-NPP satélites' },
  indice_relativo: { temas: 'índice armonizado celda-día hectáreas MODIS-equivalente' },
  calidad_indice: { temas: 'calibración armonizar MODIS VIIRS índice factor nulo comparable' },
  satelite_decide_alertas: {
    temas: 'Suomi-NPP NOAA-20 enlace referencia histórica alertas',
    alcance: 'Advertencia sobre las alertas históricas del paquete. Para un corte concreto prevalece el campo satelite_base de la base.',
  },
  cobertura_datos: {
    temas: 'NRT provisional estándar reprocesado cobertura',
    alcance: 'Fechas descritas en el paquete original. La cobertura actual se consulta en la base.',
  },
  escala_mensual_indicativa: { temas: 'error incertidumbre comparación mensual trimestral anual' },
  deteccion_no_es_incendio: { temas: 'detección foco térmico calor fuego incendio confirmado' },
  alerta_candidata: { temas: 'nivel alerta estadística verificación incendio' },
};
const aliasDeCampo: Record<string, string> = {
  grupo_union: 'celda-día agrupar deduplicar duplicados Terra Aqua MODIS VIIRS mismo día misma celda',
  factor_a_modis: 'armonizar convertir equivalencia índice factor MODIS VIIRS',
  satelite_base: 'corte mensual NOAA-20 Suomi-NPP referencia histórica por qué compara',
  factor_de_enlace: 'corte mensual NOAA-20 Suomi-NPP referencia enlace equivalencia',
  fecha_corte: 'corte fecha datos hasta actualización',
  celdas_dia_observadas: 'celda-día definición conteo grilla 1 km corte actividad acumulada',
};

const comunes = new Set(
  'a al algo ante como con cual cuales cuando cuantas cuantos de del dime donde el en entre es esa ese explica fue hay la las le lo los mas me misma mismo o para pero por que se si significa sobre son su sus un una uno y'.split(' '),
);
const genericas = new Set('actividad caso calcular dato detectar hacer hoy nivel solo termico usar valor ver'.split(' '));
const variantes: Record<string, string> = {
  agrupan: 'agrupar', agrupacion: 'agrupar', agrupa: 'agrupar', unir: 'agrupar', union: 'agrupar',
  alertas: 'alerta', armonizan: 'armonizar', armonizacion: 'armonizar', armonizado: 'armonizar',
  celdas: 'celda', dias: 'dia', detecciones: 'deteccion', detectan: 'detectar', describe: 'explica',
  duplicados: 'duplicado', duplicadas: 'duplicado', duplicar: 'duplicado', deduplicar: 'duplicado', deduplicacion: 'duplicado',
  cuadrado: 'grilla', cuadricula: 'grilla', calor: 'termico', termicas: 'termico', termica: 'termico',
  satelites: 'satelite', focos: 'foco', fuentes: 'fuente',
  calcularon: 'calcular', calcula: 'calcular', usada: 'usar', uso: 'usar',
  comparacion: 'comparar', compara: 'comparar', comparan: 'comparar',
  historicas: 'historico', historica: 'historico', historicos: 'historico', historial: 'historico',
  provisionales: 'provisional', escenarios: 'escenario', series: 'serie', mensual: 'mes', mensuales: 'mes',
  pixeles: 'pixel', incendios: 'incendio', datos: 'dato', registros: 'registro',
};

interface Bloque {
  texto: string;
  terminos: Set<string>;
}

interface Seccion {
  id: string;
  titulo: string;
  alcance?: string;
  temas: Set<string>;
  bloques: Bloque[];
}

export interface EvidenciaDocumental {
  citas: CitaTuni[];
  temasSinEvidencia: string[];
}

@Injectable()
export class TuniDocumentosService {
  private secciones?: Promise<Seccion[]>;

  async definicionCeldaDia(): Promise<CitaTuni[]> {
    const secciones = await this.obtenerSecciones();
    const definicion = secciones.find(({ id }) => id === 'celda-dia');
    const grilla = secciones.find(({ id }) => id === 'celdas_1km');
    const descripcionGrilla = grilla?.bloques[0]?.texto;
    if (!definicion || !grilla || !descripcionGrilla) return [];
    return [
      citar(definicion, definicion.bloques.map(({ texto }) => texto)),
      citar(grilla, [descripcionGrilla]),
    ];
  }

  async referenciaCorteMensual(): Promise<CitaTuni | undefined> {
    const seccion = (await this.obtenerSecciones()).find(({ id }) => id === 'alerta_mes_en_curso');
    if (!seccion) return undefined;
    const textos = seccion.bloques.filter(({ texto }) => /^(satelite_base|factor_de_enlace) · /.test(texto));
    if (textos.length === 2) return citar(seccion, textos.map(({ texto }) => texto));
    return undefined;
  }

  async buscar(temas: readonly string[]): Promise<EvidenciaDocumental> {
    const secciones = await this.obtenerSecciones();
    const porTema = temas.map((tema) => ({ tema, pasajes: recuperar(secciones, palabras(tema)) }));
    const citas = new Map<string, CitaTuni>();
    // Primero cubre cada tema y después agrega sus pasajes complementarios.
    for (let posicion = 0; posicion < 3; posicion++) {
      for (const { pasajes } of porTema) {
        const pasaje = pasajes[posicion];
        if (!pasaje) continue;
        const anterior = citas.get(pasaje.id);
        if (anterior) {
          const bloques = new Set([...anterior.texto.split('\n\n'), ...pasaje.texto.split('\n\n')]);
          citas.set(pasaje.id, { ...anterior, texto: [...bloques].join('\n\n') });
        } else if (citas.size < maximoPasajes) {
          citas.set(pasaje.id, pasaje);
        }
      }
    }
    return {
      citas: [...citas.values()],
      temasSinEvidencia: porTema.filter(({ pasajes }) => !pasajes.length).map(({ tema }) => tema),
    };
  }

  private obtenerSecciones(): Promise<Seccion[]> {
    this.secciones ??= this.cargar().catch((error: unknown) => {
      this.secciones = undefined;
      throw error;
    });
    return this.secciones;
  }

  private async cargar(): Promise<Seccion[]> {
    const [diccionario, avisos, guia] = await Promise.all([
      readFile(new URL('diccionario_datos.md', carpeta), 'utf8'),
      readFile(new URL('advertencias.json', carpeta), 'utf8'),
      readFile(new URL('../LEEME.md', carpeta), 'utf8'),
    ]);
    const fichas = advertencias.parse(JSON.parse(avisos)).map(({ codigo, donde, texto }) =>
      crearSeccion(codigo, 'Advertencias · ' + donde, [texto]),
    );
    for (const seccion of diccionario.split(/^## /m).slice(1)) {
      const [encabezado, ...lineas] = seccion.trim().split(/\r?\n/);
      const id = limpiarMarkdown(encabezado!);
      fichas.push(crearSeccion(id, 'Diccionario de datos · ' + id.replaceAll('_', ' '), bloquesMarkdown(lineas)));
    }
    const detecciones = guia.split(/^## /m).find((seccion) => seccion.startsWith('Lo que tienes que saber de'));
    if (detecciones) {
      const [, ...lineas] = detecciones.split(/\r?\n/);
      const bloques = bloquesMarkdown(lineas);
      fichas.push(crearSeccion('guia-detecciones', 'Paquete de datos · Detecciones', bloques));
      const definicion = bloques.find((bloque) => bloque.includes('una celda con detección en un día'));
      if (definicion) fichas.push(crearSeccion('celda-dia', 'Paquete de datos · Conteo de detecciones', [definicion]));
    }
    return fichas;
  }
}

function crearSeccion(id: string, titulo: string, textos: string[]): Seccion {
  const { temas = '', alcance } = metadatos[id] ?? {};
  return {
    id, titulo, alcance, temas: palabras(id.replaceAll('_', ' ') + ' ' + titulo + ' ' + temas),
    bloques: textos.map((texto) => {
      const campo = /^([\w_]+) · /.exec(texto)?.[1];
      return { texto, terminos: palabras(texto + ' ' + (campo ? aliasDeCampo[campo] ?? '' : '')) };
    }),
  };
}

function bloquesMarkdown(lineas: string[]): string[] {
  const bloques: string[] = [];
  let parrafo: string[] = [];
  const guardarParrafo = () => {
    if (parrafo.length) bloques.push(parrafo.join(' '));
    parrafo = [];
  };
  for (const linea of lineas.map((texto) => texto.trim())) {
    if (!linea || /^[|#-]/.test(linea)) guardarParrafo();
    if (!linea) continue;
    if (linea.startsWith('|')) {
      const fila = /^\|\s*([^|]+)\|\s*([^|]+)\|\s*(.*?)\s*\|$/.exec(linea);
      if (fila && fila[1]?.trim() !== 'Columna' && !/^[-:\s]+$/.test(fila[1]!)) {
        bloques.push(fila.slice(1).map(limpiarMarkdown).join(' · '));
      }
    } else if (linea.startsWith('- ')) {
      bloques.push(limpiarMarkdown(linea.slice(2)));
    } else {
      parrafo.push(limpiarMarkdown(linea));
    }
  }
  guardarParrafo();
  return bloques;
}

function limpiarMarkdown(texto: string): string {
  return texto.replace(/\*\*|`/g, '').trim();
}

function palabras(texto: string): Set<string> {
  const normalizado = normalizar(texto)
    .replace(/\bceldas? dias?\b/g, 'celdadia')
    .replace(/\bnoaa (20|21)\b/g, 'noaa$1')
    .replace(/\bsuomi npp\b/g, 'suominpp');
  return new Set(normalizado.split(' ').filter((palabra) => palabra.length > 1)
    .map((palabra) => Object.hasOwn(variantes, palabra) ? variantes[palabra]! : palabra)
    .filter((palabra) => !comunes.has(palabra) && !/^\d+$/.test(palabra)));
}

function recuperar(secciones: Seccion[], consulta: Set<string>): CitaTuni[] {
  const claves = [...consulta].filter((termino) => !genericas.has(termino));
  if (!claves.length) return [];
  const candidatos = secciones.flatMap((seccion) => {
    const coincidencias = claves.filter((termino) => seccion.bloques.some(({ terminos }) => terminos.has(termino)));
    const fuerte = coincidencias.some((termino) => seccion.temas.has(termino) && !['mes', 'alerta', 'satelite'].includes(termino));
    if (coincidencias.length < Math.min(2, claves.length) && !fuerte) return [];
    if (!coincidencias.length || (coincidencias.length === 1 && ['mes', 'alerta', 'satelite'].includes(coincidencias[0]!))) return [];

    const puntos = coincidencias.reduce((total, termino) => total + (seccion.temas.has(termino) ? 3 : 2), 0);
    const bloques = seccion.bloques.map((bloque, indice) => ({
      score: claves.filter((termino) => bloque.terminos.has(termino)).length,
      indice,
      texto: bloque.texto,
    }));
    const textos = bloques.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
      .slice(0, 4).sort((a, b) => a.indice - b.indice).map(({ texto }) => texto);
    return [{ puntos, seccion, textos }];
  });
  candidatos.sort((a, b) => b.puntos - a.puntos);
  return candidatos.filter(({ puntos }) => puntos >= Math.max(2, (candidatos[0]?.puntos ?? 0) * 0.45))
    .slice(0, 3).map(({ seccion, textos }) => citar(seccion, textos));
}

function citar({ id, titulo, alcance }: Seccion, textos: string[]): CitaTuni {
  return { id, titulo, alcance, texto: textos.join('\n\n') };
}
