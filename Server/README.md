# Tunari Guard — Backend

Backend para la hackatón. El alcance territorial comprende los **16 distritos de Cochabamba**; Tunari podrá incorporarse como una capa geográfica adicional.

## Estado actual

Fases 0 a 2 listas: importación idempotente de CSV FIRMS (MODIS y VIIRS), carga de distritos en GeoJSON, asignación territorial con PostGIS, consulta de observaciones con filtros, paginación y GeoJSON, y tiempo real con Socket.IO más un modo de reproducción histórica para la demo. Faltan alertas, asistente y sincronización FIRMS; consulta las fases y los endpoints en [ARCHITECTURE.md](./ARCHITECTURE.md#api).

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
| Configuración | `@nestjs/config` + Zod |
| Contrato HTTP | OpenAPI / Swagger |
| Tiempo real (fase 2) | Socket.IO con `@nestjs/websockets` |
| Tests | Vitest |
| Entorno local | Docker Compose |

## Puesta en marcha

Requisitos: Node.js 24 y Docker con el daemon en ejecución.

```bash
cp .env.example .env     # ajustar si el puerto 5432 está ocupado
npm install              # también genera el cliente Prisma
npm run db:up            # levanta PostGIS y espera a que esté sano
npm run prisma:deploy    # aplica las migraciones (habilita PostGIS)
npm run start:dev
```

| URL | Contenido |
| --- | --- |
| `http://localhost:3000/api/v1/health` | Estado de la API y versión de PostGIS |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/api/docs-json` | Especificación OpenAPI para el frontend |

## Scripts

| Script | Uso |
| --- | --- |
| `start:dev` | Servidor con recarga automática |
| `build` / `start:prod` | Compilar y ejecutar `dist/` |
| `test` | Tests unitarios con Vitest |
| `lint` | oxlint con reglas que usan los tipos |
| `db:up` / `db:down` | Levantar o detener PostGIS |
| `prisma:migrate` | Crear una migración nueva en desarrollo |
| `prisma:deploy` | Aplicar las migraciones existentes |
| `prisma:studio` | Explorar la base de datos |

## Variables de entorno

Se validan al arrancar (`src/infrastructure/config/env.schema.ts`); si falta una obligatoria, la aplicación no inicia.

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión PostgreSQL |
| `PORT` | No (3000) | Puerto HTTP |
| `CORS_ORIGINS` | No | Orígenes del frontend, separados por coma |
| `FIRMS_MAP_KEY` | Fase 5 | Credencial NASA FIRMS |
| `LLM_API_KEY` | Fase 4 | Clave del proveedor de IA |
| `N8N_ALERT_WEBHOOK_URL` | Opcional | Reenvío de alertas a n8n |

Las credenciales viven solo en `.env`, que está fuera de Git.

## Insumos pendientes

- Cartografía oficial de los 16 distritos, con fuente y versión.
- Datasets de MODIS y VIIRS y periodo de análisis, y cómo los entrega el equipo de datos (CSV, escritura directa o endpoint de ingesta).
- Proveedor de IA y su clave.
- Si habrá alertas fuera de la app (Telegram/WhatsApp vía n8n).

El frontend está en `../Client/`. Los contratos REST y de eventos se acordarán con Angular al implementar cada fase.
