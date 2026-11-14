#!/usr/bin/env node
/**
 * Carga y mantiene los datos del repositorio en la base local a través de la API (el servidor
 * debe estar corriendo). Cargar es seguro de repetir: el importador no duplica.
 *
 *   npm run datos:cargar                          detecciones reales (históricas + novedades de noviembre de 2026)
 *   npm run datos:demo                            proyección SIMULADA nov-2026 a 2031 (data/demo) + comando de replay
 *   npm run datos:reemplazar-simulados -- 2026-11-13           ensayo: cuántas simuladas hasta ese día se borrarían
 *   npm run datos:reemplazar-simulados -- 2026-11-13 --aplicar borra las simuladas hasta ese día (hora de Bolivia)
 *   npm run datos:limpiar-simulados -- --aplicar               borra TODAS las simuladas (p. ej. el SIMULADO 2027 anterior)
 *
 * Variables: API_URL (por defecto http://localhost:3000).
 */
import { openAsBlob } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const API = `${process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`}/api/v1`;

const CONJUNTOS = {
  historico: [
    { file: 'fuego/formato_firms/firms_modis_cochabamba.csv', dataset: 'FIRMS MODIS Cochabamba 2001-2026', origin: 'REAL' },
    { file: 'fuego/formato_firms/firms_viirs_cochabamba.csv', dataset: 'FIRMS VIIRS Cochabamba 2012-2026', origin: 'REAL' },
    {
      file: 'fuego/formato_firms/firms_viirs_novedades_2026-11-01_a_2026-11-11.csv',
      dataset: 'Novedades NRT noviembre 2026',
      origin: 'REAL',
    },
  ],
  demo: [
    {
      file: 'demo/SIMULADO_proyeccion_2026-11-14_a_2031-12-31.csv',
      dataset: 'PROYECCION SIMULADA 2026-11 a 2031-12',
      origin: 'SIMULATED',
    },
  ],
};

const [cual = 'historico', ...resto] = process.argv.slice(2);

await comprobarServidor();

if (cual === 'reemplazar' || cual === 'limpiar') {
  await borrarSimulados(cual);
  process.exit(0);
}

const archivos = CONJUNTOS[cual];
if (!archivos) fallar(`Comando desconocido: ${cual}. Usa historico, demo, reemplazar o limpiar.`);

await avisarSiNoHayDistritos();
if (cual === 'demo') await avisarDemoAnterior();

for (const { file, dataset, origin } of archivos) {
  const form = new FormData();
  form.append('file', await openAsBlob(join(DATA, file), { type: 'text/csv' }), basename(file));
  form.append('dataset', dataset);
  form.append('origin', origin);

  process.stdout.write(`▶ ${basename(file)} (${origin}) … `);
  const res = await fetch(`${API}/ingestion/csv`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fallar(`\n  La API respondió ${res.status}: ${JSON.stringify(body.message ?? body)}`);

  const a = body.districtAssignment ?? {};
  console.log(
    `${body.inserted} nuevas, ${body.duplicates} ya estaban, ${body.rejected} rechazadas` +
      ` · ${a.assigned ?? 0} en distritos, ${a.outside ?? 0} fuera`,
  );
}

if (cual === 'demo') {
  console.log(
    '\nLa proyección empieza el 17-nov-2026: cada detección simulada "llega" cuando se cumple su fecha y hora,\n' +
      'y en ese momento aparece en el mapa (hotspots:new) y genera su alerta (alert:new), marcada como simulada.',
  );
  console.log('\nPara verla ahora mismo, reprodúcela (con npm run realtime:watch abierto en otra terminal):');
  console.log(
    `  curl -X POST ${API}/replay/start -H "content-type: application/json" ` +
      `-d '{"from":"2027-07-06","to":"2027-07-10","intervalMs":2000}'`,
  );
  console.log('  (o en Swagger: POST /replay/start con ese cuerpo). Otros tramos intensos: 8–12 jul 2028, 16–20 ago 2029.');
} else {
  console.log('\nListo. Repetirlo no duplica nada.');
}

/** Reemplazo de simulados por reales (hasta un día) o limpieza completa, vía la API. */
async function borrarSimulados(modo) {
  const aplicar = resto.includes('--aplicar');
  const hasta = modo === 'reemplazar' ? resto.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) : undefined;
  if (modo === 'reemplazar' && !hasta) {
    fallar('Indica el último día con datos reales completos (hora de Bolivia), p. ej.: npm run datos:reemplazar-simulados -- 2026-11-13');
  }
  const res = await fetch(`${API}/ingestion/simulados/borrar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(hasta ? { hasta } : {}), aplicar }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fallar(`La API respondió ${res.status}: ${JSON.stringify(body.message ?? body)}`);

  const alcance = hasta ? `hasta el ${hasta} (hora de Bolivia)` : 'todas';
  if (aplicar) {
    console.log(`✔ Borradas ${body.borrados} detecciones simuladas (${alcance}). Reales intactas: ${body.realesIntactas}.`);
    console.log('  Sus alertas también se borraron y las pantallas abiertas recibieron hotspots:removed y alert:removed.');
  } else {
    console.log(`Ensayo: se borrarían ${body.aBorrar} de ${body.simulados} detecciones simuladas (${alcance}).`);
    console.log(`Reales intactas: ${body.realesIntactas}. Para aplicar, repite el comando con --aplicar.`);
  }
}

async function comprobarServidor() {
  try {
    const res = await fetch(`${API}/health`);
    if (!res.ok) fallar(`El servidor responde pero /health da ${res.status}. Revisa la base con npm run db:doctor.`);
  } catch {
    fallar(`No hay servidor en ${API}. Arráncalo en otra terminal con npm run start:dev y vuelve a intentar.`);
  }
}

/** Sin distritos, las detecciones quedan PENDING (sin distrito asignado). */
async function avisarSiNoHayDistritos() {
  const distritos = await fetch(`${API}/districts`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (Array.isArray(distritos) && distritos.length === 0) {
    console.log(
      '⚠ No hay distritos cargados: las detecciones quedarán sin distrito (PENDING).\n' +
        '  Ejecuta npm run fuego:setup y reinicia el servidor (copia los 15 distritos al arrancar),\n' +
        '  o POST /api/v1/districts/import-fuego. Al cargar distritos después, se reasignan solas.\n',
    );
  }
}

/** El SIMULADO 2027 de la demo anterior también cubre 2027: juntos se sumarían. */
async function avisarDemoAnterior() {
  const lotes = await fetch(`${API}/ingestion/batches?limit=200`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const anterior = Array.isArray(lotes) && lotes.some((l) => l.dataset === 'SIMULADO 2027' && l.inserted > 0);
  if (anterior) {
    fallar(
      'Tu base tiene el "SIMULADO 2027" de la demo anterior, que se solaparía con la proyección.\n' +
        '  Bórralo primero con: npm run datos:limpiar-simulados -- --aplicar   (solo borra datos simulados)',
    );
  }
}

function fallar(mensaje) {
  console.error(`✘ ${mensaje}`);
  process.exit(1);
}
