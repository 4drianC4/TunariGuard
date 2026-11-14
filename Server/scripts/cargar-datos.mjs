#!/usr/bin/env node
/**
 * Carga los CSV del repositorio en la base local a través de la API (el servidor debe estar
 * corriendo). Es seguro repetirlo: el importador no duplica.
 *
 *   npm run datos:cargar   detecciones históricas reales (data/fuego/formato_firms, 11.923 filas)
 *   npm run datos:demo     detecciones SIMULADAS de 2027 para la demo (data/demo) + comando de replay
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
  ],
  demo: [{ file: 'demo/SIMULADO_firms_viirs_2027.csv', dataset: 'SIMULADO 2027', origin: 'SIMULATED' }],
};

const cual = process.argv[2] ?? 'historico';
const archivos = CONJUNTOS[cual];
if (!archivos) fallar(`Conjunto desconocido: ${cual}. Usa historico o demo.`);

await comprobarServidor();
await avisarSiNoHayDistritos();

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
  console.log('\nPara verlo en tiempo real (con npm run realtime:watch abierto en otra terminal):');
  // Sin batchId: 2027 solo tiene datos simulados, y así el comando sirve aunque se repita la carga.
  console.log(
    `  curl -X POST ${API}/replay/start -H "content-type: application/json" ` +
      `-d '{"from":"2027-08-12","to":"2027-08-16","intervalMs":2000}'`,
  );
  console.log('  (o en Swagger: POST /replay/start con ese cuerpo). Otros tramos: 20–23 sep y 17–20 feb de 2027.');
} else {
  console.log('\nListo. Repetirlo no duplica nada.');
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

function fallar(mensaje) {
  console.error(`✘ ${mensaje}`);
  process.exit(1);
}
