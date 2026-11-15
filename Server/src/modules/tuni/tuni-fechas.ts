import { isoDay } from '../../shared/query-schemas.js';
import type { ContextoDetecciones } from './tuni.schemas.js';

const meses = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
const patronAnio = '(?:19|20|21)\\d{2}';
const mesConAnio = new RegExp(`\\b(${meses.join('|')})(?: (?:del? )?(${patronAnio}))?\\b`, 'g');
const corteConFecha = new RegExp(`\\b(\\d{1,2}) (?:de )?(${meses.join('|')}) (?:del? )?(${patronAnio})\\b`);

export interface PeriodoIncendios {
  mes: number;
  anio: number | null;
}

export function mesesDeIncendios(texto: string): PeriodoIncendios[] {
  const anios = texto.match(new RegExp(`\\b${patronAnio}\\b`, 'g')) ?? [];
  const aniosUnicos = [...new Set(anios)];
  const anioComun = aniosUnicos.length === 1 ? Number(aniosUnicos[0]) : null;
  const periodos = [...texto.replace(/\bsetiembre\b/g, 'septiembre').matchAll(mesConAnio)]
    .map(([, mes, anio]) => ({ mes: meses.indexOf(mes!) + 1, anio: anio ? Number(anio) : anioComun }));
  return periodos.filter((periodo, indice) => periodos.findIndex(({ mes, anio }) =>
    mes === periodo.mes && anio === periodo.anio,
  ) === indice);
}

export function nombreDelMes(mes: number): string {
  return meses[mes - 1]!;
}

export function anioDeSeguimiento(texto: string): number | undefined {
  const coincidencia = new RegExp(`^(?:y )?(?:(?:de|del|en|para) )?(?:el )?(?:ano )?(${patronAnio})$`).exec(texto);
  return coincidencia && coincidencia[1] ? Number(coincidencia[1]) : undefined;
}

/** null para el último corte y undefined si una fecha solicitada necesita precisión. */
export function fechaDeCorte(texto: string): string | null | undefined {
  const [iso] = texto.match(/\b\d{4} \d{2} \d{2}\b/) ?? [];
  const fecha = corteConFecha.exec(texto);
  if (iso || fecha) {
    const resultado = iso?.replaceAll(' ', '-') ??
      `${fecha![3]}-${String(meses.indexOf(fecha![2]!) + 1).padStart(2, '0')}-${fecha![1]!.padStart(2, '0')}`;
    return isoDay.safeParse(resultado).success ? resultado : undefined;
  }
  return mesesDeIncendios(texto).length || new RegExp(`\\b${patronAnio}\\b`).test(texto) ||
    /\b(?:ayer|anteayer|pasado|anterior)\b/.test(texto) ? undefined : null;
}
const diasEnPalabras = [
  'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete',
  'veintiocho', 'veintinueve', 'treinta', 'treinta y uno',
];
const nombreMes = `(${meses.join('|')})`;
const numeroDia = `(\\d{1,2}|${diasEnPalabras.join('|')})`;
const diaPrimero = new RegExp(`^${numeroDia}(?: (?:de )?${nombreMes})?(?: (?:de )?(\\d{4}))?$`);
const mesPrimero = new RegExp(`^${nombreMes} ${numeroDia}(?: (?:de )?(\\d{4}))?$`);

/** undefined si no es una fecha breve. null si la fecha requiere aclaración. */
export function diaDeSeguimiento(texto: string, contexto: ContextoDetecciones): string | null | undefined {
  const fecha = texto.replace(/^(?:pero )?(?:y )?(?:solo )?(?:en |para )?(?:el )?(?:dia )?/, '');
  const porDia = diaPrimero.exec(fecha);
  const porMes = mesPrimero.exec(fecha);
  if (!porDia && !porMes) return undefined;

  const dia = porDia?.[1] ?? porMes?.[2] ?? '';
  const mes = porDia?.[2] ?? porMes?.[1];
  const anio = porDia?.[3] ?? porMes?.[3];
  const diaNumerico = /^\d+$/.test(dia) ? Number(dia) : diasEnPalabras.indexOf(dia) + 1;

  const inicio = contexto.desde?.slice(0, 7);
  const fin = contexto.hasta?.slice(0, 7);
  const mesNumerico = mes ? String(meses.indexOf(mes) + 1).padStart(2, '0') : undefined;
  const mismoAnio = inicio && fin && inicio.slice(0, 4) === fin.slice(0, 4) ? inicio.slice(0, 4) : undefined;
  const mesPorDefecto = inicio === fin ? inicio?.slice(5) : undefined;
  const anioConsulta = anio ?? mismoAnio;
  const mesConsulta = mesNumerico ?? mesPorDefecto;
  if (!anioConsulta || !mesConsulta) return null;

  const resultado = `${anioConsulta}-${mesConsulta}-${String(diaNumerico).padStart(2, '0')}`;
  return isoDay.safeParse(resultado).success ? resultado : null;
}
