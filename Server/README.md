# Tunari Guard — Backend

Backend para la hackatón. El alcance territorial comprende los **16 distritos de Cochabamba**; Tunari podrá incorporarse como una capa geográfica adicional.

## Estado actual

Fases 0 a 2 listas: importación idempotente de CSV FIRMS (MODIS y VIIRS), también de archivos pesados subidos a MinIO, carga de distritos en GeoJSON, asignación territorial con PostGIS, consulta de observaciones con filtros, paginación y GeoJSON, y tiempo real con Socket.IO más un modo de reproducción histórica para la demo. Faltan alertas, asistente y sincronización FIRMS; consulta las fases y los endpoints en [ARCHITECTURE.md](./ARCHITECTURE.md#api).

## Probar el recorrido

```bash
# 1. Límites distritales (FeatureCollection en WGS84; propiedades code y name)
curl -F file=@distritos.geojson -F source="GAM Cochabamba" -F version=2024 \
     -F provisional=true http://localhost:3000/api/v1/districts/import

# 2. CSV descargado de https://firms.modaps.eosdis.nasa.gov/download/
curl -F file=@fire_nrt_J1V-C2.csv -F dataset="FIRMS VIIRS NOAA-20 NRT" \
     http://localhost:3000/api/v1/ingestion/csv

# 3. Consultar para el mapa
curl "http://localhost:3000/api/v1/observations?format=geojson&minConfidence=NOMINAL&limit=500"
```

## CSV pesados (MinIO)

Los archivos grandes no se envían al backend: se suben a MinIO y el backend los importa desde allí por streaming.

**Opción A: consola web.** Abre `http://localhost:9001` (usuario `S3_ACCESS_KEY`, contraseña `S3_SECRET_KEY` de `.env`) y arrastra el CSV al bucket `tunari-guard-uploads`. Luego importa con la ruta que muestra la consola:

```bash
curl -X POST http://localhost:3000/api/v1/ingestion/uploads/import \
     -H 'content-type: application/json' \
     -d '{"objectKey":"fire_archive_M-C61.csv","dataset":"FIRMS MODIS C6.1 archivo"}'
```

**Opción B: URL firmada** (lo que usaría una pantalla de carga en Angular):

```bash
# 1. Pedir la URL de subida
curl -X POST http://localhost:3000/api/v1/ingestion/uploads \
     -H 'content-type: application/json' -d '{"fileName":"fire_nrt_J1V-C2.csv"}'
# → { "objectKey": "csv/2026-11-13/1a2b3c4d-fire_nrt_J1V-C2.csv", "uploadUrl": "http://localhost:9000/...",
#     "method": "PUT", "headers": { "Content-Type": "text/csv" }, "expiresAt": "..." }

# 2. Subir directo a MinIO (el Content-Type debe ser exactamente el indicado)
curl -X PUT -H 'Content-Type: text/csv' -T fire_nrt_J1V-C2.csv "<uploadUrl>"

# 3. Importar
curl -X POST http://localhost:3000/api/v1/ingestion/uploads/import \
     -H 'content-type: application/json' \
     -d '{"objectKey":"csv/2026-11-13/1a2b3c4d-fire_nrt_J1V-C2.csv","dataset":"FIRMS VIIRS NOAA-20 NRT"}'
```

En el navegador, el paso 2 es `fetch(uploadUrl, { method: 'PUT', headers, body: file })`; MinIO ya acepta CORS desde `localhost:4200`. `GET /api/v1/ingestion/uploads` lista lo que hay en el bucket.

La importación responde al terminar (unos 20 s por cada 300 000 filas). Si entran más de 5000 focos nuevos no se empujan por socket: `sync:status` llega con `announced: false` y el frontend debe recargar `GET /observations`.

Si quien sube está en otra computadora de la red, define `S3_PUBLIC_ENDPOINT=http://<IP-de-esta-máquina>:9000` en `.env`: las URLs firmadas usan ese host.

## Tiempo real (Socket.IO)

El servidor publica en el namespace `/realtime` del mismo puerto. Los tipos de cada evento están en [`src/modules/realtime/realtime.contract.ts`](src/modules/realtime/realtime.contract.ts) y el contrato completo en [ARCHITECTURE.md](./ARCHITECTURE.md#contrato-de-eventos-socketio).

Cliente mínimo para Angular (`npm i socket.io-client`):

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/realtime');

// Por defecto llegan todos los distritos; para filtrar:
const ack = await socket.emitWithAck('subscribe', { districts: ['D1', 'D2'] });

socket.on('hotspots:new', (msg) => {
  // msg.collection es un FeatureCollection listo para el mapa.
  // msg.simulated === true → mostrar la etiqueta "simulado" (replay o datos de demo).
});
socket.on('sync:status', ({ lastBatch }) => { /* última importación */ });
socket.on('replay:status', (status) => { /* progreso de la demo */ });
socket.on('districts:updated', () => { /* recargar GET /districts y /observations */ });
```

Patrón recomendado: cargar el estado inicial con `GET /observations?format=geojson` y sumar lo que llega por `hotspots:new`.

### Demo sin datos nuevos

```bash
curl -X POST http://localhost:3000/api/v1/replay/start \
     -H 'content-type: application/json' \
     -d '{"from":"2024-08-01","to":"2024-09-30","intervalMs":2000,"loop":true}'
```

Reproduce las observaciones guardadas de ese periodo, una pasada satelital cada 2 s, sin tocar la base. `POST /api/v1/replay/stop` la detiene.

Reimportar el mismo CSV no duplica filas. Los datos de demostración deben enviarse con `origin=SIMULATED`. Si el GeoJSON usa otros nombres de propiedad, indícalos con `codeProperty` y `nameProperty`.

## Tecnologías

| Responsabilidad | Tecnología |
| --- | --- |
| Aplicación | NestJS 12 + TypeScript (ESM) sobre Node.js 24 |
| Persistencia | Prisma 7 con `@prisma/adapter-pg` |
| Base de datos y operaciones espaciales | PostgreSQL 17 + PostGIS 3.5 |
| Archivos pesados | MinIO (fork `pgsty/minio`) vía SDK S3 (`@aws-sdk/client-s3`) |
| Configuración | `@nestjs/config` + Zod |
| Contrato HTTP | OpenAPI / Swagger |
| Tiempo real (fase 2) | Socket.IO con `@nestjs/websockets` |
| Tests | Vitest |
| Entorno local | Docker Compose |

## Puesta en marcha

Requisitos: Node.js 24 y Docker con el daemon en ejecución.

```bash
cp .env.example .env     # Windows (cmd): copy .env.example .env
npm install              # también genera el cliente Prisma
npm run db:up            # levanta PostGIS y MinIO y espera a que estén sanos
npm run prisma:deploy    # aplica las migraciones (habilita PostGIS)
npm run start:dev
```

| URL | Contenido |
| --- | --- |
| `http://localhost:3000/api/v1/health` | Estado de la API, PostGIS y MinIO |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/api/docs-json` | Especificación OpenAPI para el frontend |
| `http://localhost:9001` | Consola de MinIO (subir y ver archivos) |

## Scripts

| Script | Uso |
| --- | --- |
| `start:dev` | Servidor con recarga automática |
| `build` / `start:prod` | Compilar y ejecutar `dist/` |
| `test` | Tests unitarios con Vitest |
| `lint` | oxlint con reglas que usan los tipos |
| `db:up` / `db:down` | Levantar o detener PostGIS y MinIO |
| `db:doctor` | Diagnosticar la conexión a la base (puerto, contraseña, contenedor) |
| `prisma:migrate` | Crear una migración nueva en desarrollo |
| `prisma:deploy` | Aplicar las migraciones existentes |
| `prisma:studio` | Explorar la base de datos |

## Problemas de conexión a la base de datos

Si al arrancar aparece *password authentication failed for user "tunari"* o "contraseña incorrecta", ejecuta:

```bash
npm run db:doctor
```

El script revisa `.env`, el contenedor y a qué servidor llega `DATABASE_URL`, y dice qué corregir. Causas habituales:

| Síntoma | Causa | Solución |
| --- | --- | --- |
| Contraseña rechazada en el puerto 5432, sobre todo en Windows | Hay un PostgreSQL instalado en el equipo que ocupa 5432; la app se conecta a ese y no al de Docker | Usar el puerto 5433, que ya viene por defecto: copia `DB_PORT` y `DATABASE_URL` de `.env.example` a tu `.env` y ejecuta `docker compose up -d --force-recreate db` |
| Contraseña rechazada aunque el puerto es correcto | Se cambió `POSTGRES_PASSWORD` después de crear el volumen; Postgres solo la aplica la primera vez | `docker compose down -v` (borra los datos locales), luego `npm run db:up` y `npm run prisma:deploy` |
| `ECONNREFUSED` / nada responde | Docker Desktop cerrado o contenedor detenido | Abrir Docker Desktop y ejecutar `npm run db:up` |
| No existe el archivo `.env` | No se copió la plantilla | `cp .env.example .env` (Windows: `copy .env.example .env`) |

En Windows, usa `127.0.0.1` en lugar de `localhost` dentro de `DATABASE_URL`, que es como viene en `.env.example`. Para ver qué programa ocupa el puerto 5432: `netstat -ano | findstr :5432`.

## Variables de entorno

Se validan al arrancar (`src/infrastructure/config/env.schema.ts`); si falta una obligatoria, la aplicación no inicia.

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión PostgreSQL |
| `PORT` | No (3000) | Puerto HTTP |
| `CORS_ORIGINS` | No | Orígenes del frontend, separados por coma |
| `S3_ENDPOINT` | Sí | API S3 que usa el backend (`http://localhost:9000`) |
| `S3_PUBLIC_ENDPOINT` | No | Host con el que se firman las URLs de subida, si difiere |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Sí | Credenciales; en desarrollo también son el usuario de la consola MinIO |
| `S3_BUCKET` | No (`tunari-guard-uploads`) | Bucket de los CSV; se crea al arrancar |
| `S3_REGION` | No (`us-east-1`) | Región S3 (MinIO la ignora) |
| `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` | No (9000 / 9001) | Puertos publicados por Docker |
| `FIRMS_MAP_KEY` | Fase 5 | Credencial NASA FIRMS |
| `LLM_API_KEY` | Fase 4 | Clave del proveedor de IA |
| `N8N_ALERT_WEBHOOK_URL` | Opcional | Reenvío de alertas a n8n |

Las credenciales viven solo en `.env`, que está fuera de Git.

## Insumos pendientes

- Cartografía oficial de los 16 distritos, con fuente y versión.
- Datasets de MODIS y VIIRS y periodo de análisis (el equipo de datos los sube a MinIO).
- Proveedor de IA y su clave.
- Si habrá alertas fuera de la app (Telegram/WhatsApp vía n8n).

El frontend está en `../Client/`. Los contratos REST y de eventos se acordarán con Angular al implementar cada fase.
