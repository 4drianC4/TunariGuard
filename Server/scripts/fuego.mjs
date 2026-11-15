#!/usr/bin/env node
/**
 * Instala y actualiza el esquema `fuego` (paquete de datos del equipo, en data/fuego/) ejecutando
 * sus SQL TAL CUAL, en el orden que indica su LEEME. Funciona en Windows, macOS y Linux:
 *
 *   npm run fuego:setup            01 esquema (si falta) + 02 vistas/funciones + 03 carga (incluye 04 validación)
 *   npm run fuego:setup -- --reset borra el esquema fuego y lo crea desde cero
 *   npm run fuego:novedades        05: detecciones nuevas (reemplaza NRT por rango de fechas)
 *   npm run fuego:alerta-mes       06: alerta del mes en curso
 *   npm run fuego:status           conteos y cobertura
 *
 * Por defecto usa el psql del contenedor tunari-guard-db (data/fuego está montado en /fuego), así
 * no hace falta instalar psql. Si el contenedor no existe, usa el psql local con DATABASE_URL.
 */
import { spawnSync } from 'node:child_process';
import { t, msg } from './messages.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CONTAINER = 'tunari-guard-db';
const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fuego');

if (existsSync('.env')) process.loadEnvFile('.env');
const [command = 'setup', ...flags] = process.argv.slice(2);

const runner = pickRunner();

switch (command) {
  case 'setup': {
    if (flags.includes('--reset')) {
      step(t('Borrando el esquema fuego'));
      sql('DROP SCHEMA IF EXISTS fuego CASCADE');
    }
    if (schemaInstalled()) {
      console.log(t('· El esquema fuego ya existe: se omite 01_esquema.sql (usa --reset para recrearlo).'));
    } else {
      step(t('01_esquema.sql — estructura'));
      file('sql/01_esquema.sql');
    }
    step(t('02_vistas_y_funciones.sql — vistas y funciones'));
    file('sql/02_vistas_y_funciones.sql');
    step(t('03_cargar_datos.sql — 17 CSV en una transacción + 04 validación (tarda ~1 min)'));
    file('sql/03_cargar_datos.sql');
    status();
    break;
  }
  case 'novedades':
    requireSchema();
    step('05_cargar_novedades.sql — datos_prueba/detecciones_2026.csv');
    file('sql/05_cargar_novedades.sql');
    break;
  case 'alerta-mes':
    requireSchema();
    step('06_cargar_alerta_mes_en_curso.sql — datos_prueba/alerta_mes_en_curso.csv');
    file('sql/06_cargar_alerta_mes_en_curso.sql');
    break;
  case 'status':
    requireSchema();
    status();
    break;
  default:
    console.error(msg`Comando desconocido: ${command}. Usa setup | novedades | alerta-mes | status`);
    process.exit(1);
}

function pickRunner() {
  const inContainer = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], { encoding: 'utf8' });
  if (inContainer.status === 0 && inContainer.stdout.trim() === 'true') {
    const mounted = spawnSync('docker', ['exec', CONTAINER, 'test', '-f', '/fuego/sql/01_esquema.sql']);
    if (mounted.status !== 0) {
      fail(
        t('El contenedor no ve el paquete en /fuego. Recréalo para montar data/fuego:'),
        '  docker compose up -d --force-recreate db',
      );
    }
    const user = process.env.POSTGRES_USER ?? 'tunari';
    const db = process.env.POSTGRES_DB ?? 'tunari_guard';
    return {
      label: msg`contenedor ${CONTAINER}`,
      psql: (args) => ['docker', ['exec', '-i', '-w', '/fuego', CONTAINER, 'psql', '-U', user, '-d', db, ...args]],
    };
  }
  if (!process.env.DATABASE_URL) fail(t('No hay contenedor ni DATABASE_URL. Ejecuta npm run db:up'));
  // psql no entiende el parámetro ?schema= que usa Prisma.
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('schema');
  return { label: t('psql local'), psql: (args) => ['psql', [url.toString(), ...args]], cwd: PACKAGE_DIR };
}

function psql(args, { capture = false } = {}) {
  const [bin, argv] = runner.psql(['-v', 'ON_ERROR_STOP=1', '-q', ...args]);
  const result = spawnSync(bin, argv, {
    cwd: runner.cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) fail(msg`No se pudo ejecutar ${bin}: ${result.error.message}`);
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr);
    fail(t('El SQL falló; la transacción se revirtió y la base quedó como estaba.'));
  }
  return result.stdout ?? '';
}

function file(path) {
  return psql(['-f', path]);
}

function sql(statement) {
  return psql(['-c', statement]);
}

function scalar(statement) {
  return psql(['-tAc', statement], { capture: true }).trim();
}

function schemaInstalled() {
  return scalar("SELECT to_regclass('fuego.detecciones') IS NOT NULL") === 't';
}

function requireSchema() {
  if (!schemaInstalled()) fail(t('El esquema fuego no está instalado. Ejecuta primero: npm run fuego:setup'));
}

function status() {
  step(t('Estado del esquema fuego'));
  psql([
    '-c',
    `SELECT (SELECT count(*) FROM fuego.detecciones) AS detecciones,
            (SELECT count(*) FROM fuego.detecciones WHERE origen_dato = 'NRT') AS nrt,
            (SELECT count(*) FROM fuego.areas) AS areas,
            (SELECT count(*) FROM fuego.serie_mensual) AS serie_mensual,
            (SELECT count(*) FROM fuego.alertas_mensuales) AS alertas,
            (SELECT valor FROM fuego.parametros WHERE clave = 'cobertura_hasta') AS cobertura_hasta,
            (SELECT max(fecha_bo) FROM fuego.detecciones) AS ultima_deteccion,
            (SELECT max(fecha_carga) FROM fuego.ingestas) AS ultima_carga`,
  ]);
}

function step(message) {
  console.log(`\n▶ ${message}  [${runner.label}]`);
}

function fail(...lines) {
  console.error(`\n✘ ${lines.join('\n')}`);
  process.exit(1);
}

