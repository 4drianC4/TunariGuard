#!/usr/bin/env node
/**
 * Diagnóstico de la conexión a PostgreSQL (npm run db:doctor). Funciona igual en Windows,
 * macOS y Linux. Revisa .env, el contenedor de Docker y a qué servidor llega DATABASE_URL.
 */
import { execFileSync } from 'node:child_process';
import { t, msg } from './messages.mjs';
import { existsSync } from 'node:fs';
import pg from 'pg';

const CONTAINER = 'tunari-guard-db';
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => console.log(`  ✘ ${msg}`);
const hint = (msg) => console.log(`    → ${msg}`);
let problems = 0;
const fail = (msg, ...hints) => {
  problems++;
  bad(msg);
  hints.forEach(hint);
};

console.log(t('\nDiagnóstico de la base de datos de Tunari Guard\n'));

// 1. .env
console.log(t('1. Archivo .env'));
if (!existsSync('.env')) {
  fail(t('No existe Server/.env'), t('Créalo con: cp .env.example .env   (Windows: copy .env.example .env)'));
  finish();
}
process.loadEnvFile('.env');
const env = process.env;
let url;
try {
  url = new URL(env.DATABASE_URL ?? '');
  ok(msg`DATABASE_URL apunta a ${url.hostname}:${url.port || 5432}, usuario ${decodeURIComponent(url.username)}`);
} catch {
  fail(t('DATABASE_URL falta o no es una URL válida'), t('Copia la línea DATABASE_URL de .env.example'));
  finish();
}

const expected = {
  usuario: [env.POSTGRES_USER ?? 'tunari', decodeURIComponent(url.username)],
  contraseña: [env.POSTGRES_PASSWORD ?? 'tunari_dev', decodeURIComponent(url.password)],
  base: [env.POSTGRES_DB ?? 'tunari_guard', url.pathname.replace(/^\//, '')],
  puerto: [env.DB_PORT ?? '5433', url.port || '5432'],
};
for (const [name, [compose, fromUrl]] of Object.entries(expected)) {
  if (compose !== fromUrl) {
    fail(
      msg`El ${t(name)} de DATABASE_URL (${name === 'contraseña' ? '***' : fromUrl}) no coincide con el de Docker (${name === 'contraseña' ? '***' : compose})`,
      t('Deja iguales POSTGRES_*/DB_PORT y DATABASE_URL en .env'),
    );
  }
}
if (url.hostname === 'localhost') {
  hint(t('Sugerencia: usa 127.0.0.1 en lugar de localhost (en Windows localhost puede resolver a IPv6)'));
}

// 2. Docker
console.log(t('\n2. Contenedor de PostgreSQL'));
let containerOk = false;
try {
  const state = execFileSync('docker', ['inspect', '-f', '{{.State.Health.Status}}|{{json .NetworkSettings.Ports}}', CONTAINER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const [health, ports] = state.split('|');
  const hostPort = JSON.parse(ports)?.['5432/tcp']?.[0]?.HostPort;
  if (health === 'healthy') ok(msg`${CONTAINER} está sano y publicado en el puerto ${hostPort}`);
  else fail(msg`${CONTAINER} está en estado "${health}"`, t('Espera unos segundos o revisa: docker logs tunari-guard-db'));
  if (hostPort && hostPort !== (url.port || '5432')) {
    fail(
      msg`El contenedor publica el puerto ${hostPort} pero DATABASE_URL usa ${url.port || 5432}`,
      t('Recrea el contenedor con el DB_PORT actual: docker compose up -d --force-recreate db'),
    );
  }

  // ¿Las credenciales funcionan dentro del contenedor? Así se separa "contraseña mal" de "otro servidor".
  try {
    execFileSync('docker', ['exec', '-e', `PGPASSWORD=${expected.contraseña[1]}`, CONTAINER, 'psql', '-h', '127.0.0.1', '-U', expected.usuario[1], '-d', expected.base[1], '-tAc', 'select 1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    ok(t('Usuario y contraseña de DATABASE_URL funcionan dentro del contenedor'));
    containerOk = true;
  } catch {
    fail(
      t('El contenedor rechaza el usuario/contraseña de DATABASE_URL'),
      t('POSTGRES_PASSWORD solo se aplica la primera vez que se crea el volumen.'),
      t('Si cambiaste la contraseña después, borra el volumen (se pierden los datos locales):'),
      '  docker compose down -v   y luego   npm run db:up && npm run prisma:deploy',
    );
  }
} catch {
  fail(t('No se encontró el contenedor o Docker no responde'), t('¿Está abierto Docker Desktop? Luego ejecuta: npm run db:up'));
}

// 3. Conexión real desde Node, como la hace el backend
console.log(t('\n3. Conexión desde el backend'));
const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rows } = await client.query(
    `select version() as version,
            (select extversion from pg_extension where extname = 'postgis') as postgis`,
  );
  const { version, postgis } = rows[0];
  ok(msg`Conectado: ${version.split(',')[0]}`);
  if (postgis) ok(msg`PostGIS ${postgis} instalado`);
  else fail(t('PostGIS no está instalado en esa base'), t('Ejecuta: npm run prisma:deploy'));
  // El contenedor es Debian; un PostgreSQL nativo de Windows reporta "Visual C++".
  if (/visual c\+\+|windows|mingw/i.test(version)) {
    fail(t('Estás conectado a un PostgreSQL instalado en el equipo, no al de Docker'), t('Usa DB_PORT=5433 y el mismo puerto en DATABASE_URL'));
  }
} catch (error) {
  const code = error.code;
  if (code === '28P01' || code === '28000') {
    fail(msg`Contraseña o usuario rechazados por el servidor en ${url.hostname}:${url.port || 5432}`);
    if (containerOk) {
      hint(t('Las credenciales funcionan dentro de Docker, así que en ese puerto responde OTRO PostgreSQL'));
      hint(t('(típico en Windows: PostgreSQL instalado como servicio en 5432).'));
      hint(t('Solución: DB_PORT=5433 y DATABASE_URL=...@127.0.0.1:5433/... en .env, y luego'));
      hint('  docker compose up -d --force-recreate db');
      hint(t('Para ver quién ocupa el puerto en Windows: netstat -ano | findstr :5432'));
    }
  } else if (code === '3D000') {
    fail(msg`La base ${expected.base[1]} no existe en ese servidor`, t('Probablemente es otro PostgreSQL; revisa el puerto'));
  } else if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
    fail(msg`Nada escucha en ${url.hostname}:${url.port || 5432}`, t('Levanta la base: npm run db:up'));
  } else {
    fail(msg`Error de conexión: ${error.message}`);
  }
} finally {
  await client.end().catch(() => {});
}

finish();

function finish() {
  console.log(problems ? msg`\n${problems} problema(s) encontrado(s).\n` : t('\nTodo en orden.\n'));
  process.exit(problems ? 1 : 0);
}
