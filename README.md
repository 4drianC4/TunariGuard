# Tunari Guard

Plataforma web para el desafío de NASA Space Apps **"Harmonization of MODIS and VIIRS Hot Spots"**, con enfoque local en los **16 distritos de Cochabamba** (Bolivia). Recibe focos de calor detectados por los sensores MODIS y VIIRS, los ubica en cada distrito y los muestra en tiempo real. Más adelante sumará un asistente con IA que explica los datos y avisa de alertas.

> Una detección térmica **no confirma** un incendio. Todo el sistema conserva la fuente original de cada dato y marca como simulados los datos de demostración.

Este documento es el informe de estado al **13 de noviembre de 2026**.

---

## 1. Resumen ejecutivo

| Área | Estado |
| --- | --- |
| Frontend (Angular 22) | En desarrollo por otra parte del equipo; usa datos simulados en el navegador. |
| Backend: base técnica (Fase 0) | ✅ Lista y verificada |
| Backend: ingesta y distritos (Fase 1) | ✅ Lista y verificada |
| Backend: tiempo real y demo (Fase 2) | ✅ Lista y verificada |
| Backend: alertas + n8n (Fase 3) | ⏳ Pendiente |
| Backend: asistente con IA (Fase 4) | ⏳ Pendiente |
| Backend: sincronización automática con NASA FIRMS (Fase 5) | ⏳ Pendiente |
| Carga de CSV pesados (MinIO) | ✅ Lista y verificada |
| Control de versiones | Rama `server-workflow` en GitHub (sin PR a `main`) |

Qué ya se puede hacer:

1. Subir un CSV de NASA FIRMS (MODIS o VIIRS). El backend lo valida, lo normaliza y lo guarda; si se sube dos veces, no duplica datos. Los archivos pesados se suben a MinIO, desde su consola web o con una URL firmada, y el backend los importa por streaming.
2. Subir los límites de los distritos en GeoJSON. Cada foco se asigna automáticamente a su distrito con PostGIS.
3. Consultar los focos por API con filtros: sensor, fechas, distrito, confianza y área visible del mapa. La respuesta sale en JSON o en GeoJSON.
4. Recibir los focos nuevos **en vivo** por WebSocket, apenas se importan, con filtro por distrito.
5. Reproducir datos históricos como si llegaran en vivo, para la presentación.

---

## 2. Estructura del repositorio

```text
TunariGuard/
├── Client/tunari-guard/   Frontend Angular 22 (Leaflet, ECharts, Tailwind)
├── Server/                Backend NestJS 12 + PostgreSQL/PostGIS
│   ├── README.md          Puesta en marcha y uso del backend
│   └── ARCHITECTURE.md    Decisiones técnicas y contratos detallados
├── Docs/                  Documentación general (archivos todavía vacíos)
└── README.md              Este informe
```

---

## 3. Arquitectura

```text
 NASA FIRMS (MODIS + VIIRS)          CSV del equipo de datos
            │  (Fase 5: automático)           │  (hoy: subida manual)
            └──────────────┬──────────────────┘
                     [ingestion]   valida, normaliza, evita duplicados
                           │
                    [observations] ──► [districts]   PostGIS: ¿en qué distrito cae?
                           │
                  evento "lote importado"
                           │
          ┌────────────────┼──────────────────────┐
     [realtime] ✅      [alerts] ⏳          [assistant] ⏳
   Socket.IO → Angular   reglas → alertas     IA con acceso a los datos
                           │
                    webhook → n8n (opcional): Telegram / WhatsApp
```

**Estilo:** un solo servicio NestJS dividido en módulos por funcionalidad, con la lógica de dominio separada de la infraestructura (*vertical slice* con arquitectura hexagonal ligera). Las reglas de dominio, como leer el CSV, agrupar por pasada o repartir por distrito, son funciones puras sin NestJS ni base de datos, y por eso se prueban fácilmente. Los módulos se comunican por eventos internos, así que alertas y el asistente podrán sumarse sin tocar la ingesta.

**Decisión sobre el chatbot:** irá **dentro del backend** y no en n8n, porque necesita consultar los datos, enviar la respuesta en fragmentos por el mismo canal en tiempo real y mantener la clave de la IA en el servidor. n8n queda como opción para reenviar alertas fuera de la app.

### Tecnologías del backend

| Responsabilidad | Tecnología |
| --- | --- |
| Aplicación | NestJS 12 + TypeScript (ESM) sobre Node.js 24 |
| Base de datos espacial | PostgreSQL 17 + PostGIS 3.5 (Docker Compose) |
| Archivos pesados | MinIO (fork `pgsty/minio`) con SDK S3 |
| Acceso a datos | Prisma 7.10 con `@prisma/adapter-pg` |
| Validación | Zod 4 (esquemas compartidos por HTTP, WebSocket y Swagger) |
| Documentación de la API | OpenAPI / Swagger en `/api/docs` |
| Tiempo real | Socket.IO (`@nestjs/websockets`) |
| Eventos internos | `@nestjs/event-emitter` |
| Calidad | Vitest, oxlint con reglas que usan los tipos de TypeScript |

---

## 4. Lo implementado, fase por fase

### Fase 0: base técnica ✅

- Proyecto NestJS ejecutable; la configuración se valida al arrancar y, si falta `DATABASE_URL`, la app no inicia.
- PostgreSQL + PostGIS en Docker (`npm run db:up`), con migraciones versionadas.
- `GET /api/v1/health`: comprueba la conexión y que PostGIS esté instalado.
- Swagger con todos los endpoints, filtros y formularios documentados automáticamente.
- CORS configurable para el frontend (`CORS_ORIGINS`), aplicado también a WebSocket.

### Fase 1: datos ✅

**Importación de CSV FIRMS** (`POST /api/v1/ingestion/csv`)
- Lee los formatos MODIS C6.1 y VIIRS 375 m, tanto NRT como de archivo histórico.
- Normaliza:
  - el satélite (`Terra`/`T` → `TERRA`, `N`/`N20`/`1` → `SNPP`/`NOAA20`, etc.);
  - la hora UTC (`acq_time` sin ceros a la izquierda);
  - el día o la noche;
  - la confianza.
- Rechaza las filas inválidas indicando la línea y el motivo, sin detener el resto del archivo.
- **No duplica:** cada detección tiene una huella (sensor, satélite, instante y coordenadas). Reimportar el mismo archivo da 0 filas nuevas.
- Guarda la fila original de cada detección, para trazabilidad.
- Los datos de demostración se marcan como `SIMULATED` y nunca se confunden con datos reales.

**Distritos** (`POST /api/v1/districts/import`, `GET /api/v1/districts`)
- Recibe un FeatureCollection GeoJSON en WGS84. Los nombres de los campos son configurables.
- Rechaza coordenadas proyectadas (UTM) y pide convertirlas a EPSG:4326.
- Corrige geometrías inválidas y calcula el área en km².
- Si los límites no son oficiales, se marcan como `provisional`.

**Asignación territorial con PostGIS**

| Situación | Resultado |
| --- | --- |
| El punto cae dentro de un solo distrito (el borde cuenta como dentro) | `ASSIGNED` |
| El punto no cae en ningún distrito | `OUTSIDE` |
| El punto cae en más de un distrito (borde compartido o superposición) | `AMBIGUOUS` |
| Todavía no hay distritos cargados | `PENDING` |

Nunca se asigna un foco al "distrito más cercano" por aproximación. Al cargar distritos nuevos, se recalculan todas las asignaciones.

**Consulta** (`GET /api/v1/observations`)
- Filtros: `sensor`, `platform`, `from`, `to`, `district`, `assignment`, `minConfidence`, `origin`, `batchId` y `bbox` (área visible del mapa).
- Paginación por cursor (hasta 1000 por página) y `format=geojson` para Leaflet.
- La respuesta tiene la misma forma que el modelo `SatelliteObservation` del frontend.

**CSV pesados vía MinIO** (`POST /api/v1/ingestion/uploads`, `POST /api/v1/ingestion/uploads/import`)
- MinIO corre en Docker junto a PostGIS. La consola web está en `http://localhost:9001`, donde el equipo de datos arrastra sus archivos.
- El archivo se sube directo a MinIO con una URL firmada, sin pasar por el backend. Luego se importa indicando su clave.
- El backend lo lee por streaming y lo inserta en bloques de 2000 filas; no lo carga entero en memoria. Prueba: 300 000 filas (25 MB) en unos 20 s.
- Si la importación falla a mitad, se deshace completa.
- Con más de 5000 focos nuevos no se inundan los sockets: se avisa con `sync:status` (`announced: false`) y el front recarga.
- Usa el SDK S3 estándar: se puede cambiar a AWS S3 o Cloudflare R2 solo con variables de entorno.

**Procedencia** (`GET /api/v1/ingestion/batches`): qué archivo se importó, cuándo y cuántas filas resultaron nuevas, duplicadas o rechazadas.

### Fase 2: tiempo real ✅

**Canal Socket.IO** en `http://localhost:3000/realtime`:

| Evento | Qué hace |
| --- | --- |
| `hotspots:new` | Llega cuando se importan focos nuevos. Trae un FeatureCollection listo para el mapa. |
| `subscribe` | El cliente elige distritos (`{ districts: ['D1'] }`) o recibe todo. |
| `sync:status` | Resultado de la última importación; se reenvía a quien se conecta tarde. |
| `districts:updated` | Cambiaron los límites: el front debe recargar. |
| `replay:status` | Progreso de la reproducción de demo. |

**Modo demo (replay):** `POST /api/v1/replay/start` reproduce los datos ya guardados en orden cronológico, una pasada satelital cada pocos segundos, opcionalmente en bucle. No modifica la base y cada mensaje lleva `simulated: true`.

El contrato completo para el frontend está en [`Server/src/modules/realtime/realtime.contract.ts`](Server/src/modules/realtime/realtime.contract.ts), con un cliente de ejemplo para Angular en [`Server/README.md`](Server/README.md#tiempo-real-socketio).

---

## 5. Cómo se verificó

| Verificación | Resultado |
| --- | --- |
| Tests unitarios (Vitest) | 19 en verde: lectura del CSV FIRMS, GeoJSON de distritos, configuración, reparto por distrito y agrupación por pasadas |
| Compilación TypeScript estricta y lint | Sin errores ni advertencias |
| Recorrido completo contra PostGIS real | CSV → observaciones → distritos → consulta HTTP, revisado a mano con datos de prueba |
| Reimportación | Mismo archivo: 0 nuevas, 4 duplicadas |
| Casos límite geográficos | Punto en borde compartido → `AMBIGUOUS`; punto fuera → `OUTSIDE` |
| Tiempo real con tres clientes Socket.IO | El filtro por distrito, los clientes tardíos, la reimportación sin repetir focos y el replay se comportan como se esperaba |
| Errores de entrada | Los datos inválidos devuelven 400 con un mensaje claro, tanto por HTTP como por WebSocket |

**No cubierto todavía:** no hay tests automáticos contra la base de datos ni contra Socket.IO; esas partes se probaron a mano.

---

## 6. Puesta en marcha rápida

Requisitos: Node.js 24 y Docker en ejecución.

```bash
cd Server
cp .env.example .env
npm install
npm run db:up          # PostGIS y MinIO en Docker
npm run prisma:deploy  # crea las tablas
npm run start:dev      # http://localhost:3000/api/docs
```

Los detalles, los scripts y los ejemplos con `curl` están en [`Server/README.md`](Server/README.md).

---

## 7. Decisiones sobre los datos

- **Normalizar no es armonizar:** hoy se unifican columnas y formatos de cada sensor. La unión de detecciones MODIS y VIIRS que corresponden al mismo evento es parte de la armonización, todavía pendiente.
- **Confianza:** se guarda el valor original y la clase oficial de FIRMS (MODIS 0–29 baja, 30–79 nominal, 80–100 alta; VIIRS l/n/h). No se inventa una escala numérica común.
- **Tiempos:** todo se guarda en UTC.
- **"Tiempo real":** FIRMS publica con unas 3 h de retraso desde que pasa el satélite. El sistema avisa apenas recibe el dato, pero la detección en sí no es instantánea.

---

## 8. Pendientes

### Próximas fases

| Fase | Contenido |
| --- | --- |
| 3. Alertas | Reglas configurables (foco nuevo en un distrito, confianza alta, FRP alto, detectado por ambos sensores, cercanía al Tunari), eventos `alert:new` / `alert:updated` y webhook a n8n. |
| 4. Asistente IA | Chat por WebSocket con respuestas en fragmentos. El modelo consulta los datos mediante funciones (focos activos, resumen por distrito, alertas, métricas). Incluye límites de tokens y respaldo sin IA. |
| 5. FIRMS en vivo | Sincronización programada con la API de NASA FIRMS (`FIRMS_MAP_KEY`). |
| Después | Armonización MODIS/VIIRS, calendario histórico, métricas y anomalías. |

### Insumos que necesita el equipo

- [ ] **Cartografía oficial de los 16 distritos** (GeoJSON o shapefile), con fuente y versión.
- [ ] **Datos reales de MODIS y VIIRS** y el periodo de análisis.
- [ ] **Proveedor de IA y clave** para el asistente.
- [ ] **¿Alertas fuera de la app?** Si se quieren por Telegram o WhatsApp, entra n8n.
- [ ] **Clave `MAP_KEY` de NASA FIRMS** para la Fase 5.

### Tareas técnicas

- [ ] Abrir el PR de `server-workflow` hacia `main`.
- [ ] Pantalla de carga de CSV en Angular (URL firmada → PUT a MinIO → importar).
- [ ] Conectar el frontend: reemplazar los datos simulados por `GET /observations` y el socket `/realtime`.
- [ ] Agregar tests de integración contra PostGIS y Socket.IO.
- [ ] Completar los documentos de `Docs/`, hoy vacíos.
