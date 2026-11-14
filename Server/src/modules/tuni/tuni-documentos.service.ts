import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { normalizar } from './tuni-datos.service.js';

const carpeta = new URL('../../../data/fuego/docs/', import.meta.url);
const advertencias = z.array(z.object({ codigo: z.string(), donde: z.string(), texto: z.string() }));
const temas: Record<string, string> = {
  deteccion_no_es_incendio: 'foco térmico foco de calor incendio confirmado quema',
  indice_relativo: 'índice armonizado hectáreas unidad actividad térmica MODIS-equivalente',
  escala_mensual_indicativa: 'error indicativo comparación mensual incertidumbre',
  alerta_candidata: 'qué significa una alerta estadística nivel normal alerta de incendio',
  dos_satelites_mismo_fuego: 'deduplicación doble conteo satélites MODIS VIIRS',
  calidad_indice: 'cómo se armonizan MODIS y VIIRS factor de conversión equivalente índice calibración Tunari',
  serie_poligono_dibujado: 'polígono área dibujada cobertura sin datos',
  limites_no_oficiales: 'límites distritos cartografía',
  fuente_persistente: 'fuente persistente calor industrial fijo',
  cobertura_datos: 'qué es NRT provisional estándar reprocesamiento',
  sin_validacion_campo: 'validación de campo casos documentados',
};

interface Fragmento {
  titulo: string;
  tema: string;
  texto: string;
}

@Injectable()
export class TuniDocumentosService {
  private fragmentos?: Promise<Fragmento[]>;

  async buscar(tema: string): Promise<Fragmento | undefined> {
    this.fragmentos ??= this.cargar();
    const buscar = palabras(tema);
    const candidatos = (await this.fragmentos).map((fragmento) => {
      const titulos = palabras(fragmento.tema);
      const texto = palabras(fragmento.texto);
      let puntos = 0;
      for (const palabra of buscar) {
        puntos += titulos.has(palabra) ? 3 : texto.has(palabra) ? 1 : 0;
      }
      return { fragmento, puntos };
    });
    candidatos.sort((a, b) => b.puntos - a.puntos);
    return candidatos[0]?.puntos ? candidatos[0].fragmento : undefined;
  }

  private async cargar(): Promise<Fragmento[]> {
    const [diccionario, avisos, guia] = await Promise.all([
      readFile(new URL('diccionario_datos.md', carpeta), 'utf8'),
      readFile(new URL('advertencias.json', carpeta), 'utf8'),
      readFile(new URL('../LEEME.md', carpeta), 'utf8'),
    ]);
    const fichas = advertencias.parse(JSON.parse(avisos)).map(({ codigo, donde, texto }) => ({
      titulo: `Advertencias del paquete de datos · ${donde}`,
      tema: temas[codigo] ?? codigo.replaceAll('_', ' '),
      texto,
    }));
    for (const bloque of diccionario.split(/^## /m).slice(1)) {
      const [encabezado, ...lineas] = bloque.trim().split(/\r?\n/);
      const titulo = encabezado!.replaceAll('`', '').replaceAll('_', ' ');
      const descripcion = lineas.find((linea) => linea.trim() && !linea.startsWith('|'));
      if (descripcion) fichas.push({ titulo: `Diccionario de datos · ${titulo}`, tema: titulo, texto: descripcion });
    }
    const unidad = guia.match(/\(una celda con detección en un día\)/)?.[0];
    if (unidad) fichas.push({
      titulo: 'Paquete de datos · Conteo de detecciones',
      tema: 'celda-día celdas-día',
      texto: `Una celda-día equivale a ${unidad.slice(1, -1)}. Si varios satélites detectan calor en la misma celda el mismo día, cuenta una sola vez al usar esa unidad.`,
    });
    return fichas;
  }
}

const palabrasComunes = new Set('el la las los que es de del un una se en y por para con como sus cual son al lo a'.split(' '));
function palabras(texto: string): Set<string> {
  return new Set(normalizar(texto).split(' ').filter((palabra) => palabra.length > 1 && !palabrasComunes.has(palabra)));
}
