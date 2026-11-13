# Arquitectura del backend

## Enfoque

El backend será un monolito modular con Vertical Slice y una separación hexagonal ligera. NestJS organiza la aplicación; Prisma y PostGIS resuelven persistencia y consultas espaciales; los adaptadores de NASA FIRMS y CSV suministran observaciones.

Vertical Slice agrupa cada caso de uso con sus entradas y coordinación. Hexagonal protege las reglas que deben poder ejecutarse y probarse sin HTTP, NASA o base de datos. No se crearán interfaces ni capas adicionales para cada operación sencilla.

## Estructura prevista

```text
Server/
  prisma/
    migrations/
  src/
    infrastructure/
      config/
      database/
    modules/
      ingestion/
        domain/
        features/
          import-csv/
          sync-firms/
        adapters/
          csv/
          firms/
          persistence/
      observations/
      districts/
      harmonization/
      analytics/
```

Al inicializar NestJS se agregarán `src/main.ts`, `src/app.module.ts` y la configuración del proyecto. El esquema y las migraciones reales de Prisma se crearán después de fijar su versión. Las carpetas vacías son reservas de estructura, no funcionalidades implementadas.

## Responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| `ingestion` | Coordinar importaciones CSV y sincronizaciones FIRMS; interpretar formatos, validar entradas y registrar el resultado de cada lote. |
| `observations` | Registrar y consultar observaciones normalizadas, preservar procedencia y evitar duplicados de importación. |
| `districts` | Administrar los límites de los 16 distritos y resolver la asignación territorial mediante PostGIS. |
| `harmonization` | Ejecutar métodos versionados de asociación y agregación conservando las observaciones originales. |
| `analytics` | Entregar indicadores, calendario histórico y anomalías con referencia histórica y metadatos del método. |

## Organización interna

- `features/<caso-de-uso>/`: DTOs, entradas HTTP o comandos y servicio que coordina una funcionalidad.
- `domain/`: reglas y contratos independientes de NestJS y Prisma cuando exista una frontera que proteger.
- `adapters/`: implementaciones de las interfaces para fuentes externas y persistencia.
- `infrastructure/config/`: lectura y validación de configuración del proceso.
- `infrastructure/database/`: creación y ciclo de vida de la conexión y cliente Prisma; las consultas de negocio pertenecen a sus módulos.

La composición se realizará en los módulos NestJS. Un módulo sencillo podrá usar controlador, DTOs, servicio y repositorio sin replicar todas estas carpetas. Los nombres de archivos se concretarán al implementar cada caso de uso.

## Reglas de dependencias

1. Los controladores y comandos delegan en casos de uso; no consultan Prisma directamente.
2. Las reglas de dominio no importan NestJS, Prisma ni clientes de NASA.
3. Los casos de uso que necesiten aislamiento dependen de puertos; los adaptadores implementan esos puertos.
4. Los módulos colaboran mediante capacidades públicas exportadas explícitamente. No acceden a repositorios internos de otros módulos ni forman dependencias circulares.
5. Por ejemplo, ingesta utiliza la capacidad pública de observaciones para registrar un lote; armonización consulta observaciones mediante una capacidad pública y conserva sus propios resultados.
6. Las consultas PostGIS permanecen en adaptadores de persistencia del módulo correspondiente, usando parámetros y unidades explícitas.
7. Evitamos repositorios genéricos, clases base y buses de eventos hasta que exista una necesidad concreta.

## Flujo de datos

1. Un adaptador lee NASA FIRMS o CSV y registra producto, plataforma, versión y procedencia.
2. Ingesta valida y transforma la entrada a observaciones normalizadas, conservando el registro original.
3. Observaciones registra el lote de forma idempotente y mantiene el vínculo con su importación.
4. Distritos determina la pertenencia territorial mediante polígonos versionados.
5. Armonización procesa observaciones existentes con parámetros y método versionados, sin volver a descargar datos.
6. Analítica genera agregados consultables por distrito, sensor y periodo.
7. La API sirve resultados desde la base de datos al frontend. La sincronización con NASA se ejecuta por separado de las consultas de visualización.

## Criterios geográficos y científicos

- El alcance municipal incluye los 16 distritos. Tunari es una posible capa adicional y no sustituye esa división territorial.
- Se requiere cartografía oficial con su procedencia y versión. Mientras no exista, los polígonos se importan con `provisional = true` y la API lo informa.
- Política de límites (implementada): se usa `ST_Covers`, de modo que un punto sobre el borde pertenece al polígono. Si lo cubre un solo distrito queda `ASSIGNED`; si lo cubren varios (borde compartido o polígonos superpuestos), `AMBIGUOUS` y sin distrito; si no lo cubre ninguno, `OUTSIDE`. Sin distritos cargados, las observaciones quedan `PENDING`. Importar distritos recalcula todas las asignaciones.
- Los puntos externos o sin asignación se identifican explícitamente; no se atribuyen al distrito más cercano automáticamente.
- Deduplicación de importaciones (implementada): huella `sensor|plataforma|instante UTC|lat|lon` con 5 decimales (~1 m). No une MODIS con VIIRS; eso corresponde a armonización.
- Confianza: se conserva el valor original y se agrega la clase publicada por FIRMS (MODIS 0–29 baja, 30–79 nominal, 80–100 alta; VIIRS l/n/h). No se convierte a un número 0–1 común.
- MODIS y VIIRS son sensores; la plataforma satelital también se conserva.
- Una detección térmica no confirma un incendio y un grupo candidato no demuestra que sus observaciones correspondan al mismo evento.
- Normalizar columnas, deduplicar importaciones y armonizar sensores son operaciones distintas.
- Los datos originales, confianza original, unidades, tiempos UTC, producto y calidad de procesamiento deben mantenerse trazables.
- Una grilla aproximada de 1 km con agregación diaria es una hipótesis inicial para evaluar, no un método validado ni una garantía de comparabilidad histórica.
- Las distancias en metros requieren una proyección apropiada o cálculos geográficos explícitos; no se interpretarán grados como metros.
- Ausencia de observaciones, falta de cobertura y fallos de ingesta no deben confundirse.
- El análisis de anomalías requiere periodos comparables y debe informar cuando los datos son insuficientes.
- Los datos simulados se etiquetan como tales y no se mezclan con resultados reales sin identificación.

## API

### Implementada (fases 0 a 2)

| Endpoint | Propósito |
| --- | --- |
| `GET /api/v1/health` | Estado de la API y versión de PostGIS. |
| `POST /api/v1/ingestion/csv` | Importa un CSV FIRMS (multipart: `file`, `dataset`, `origin`, `sensor`). Idempotente. |
| `GET /api/v1/ingestion/batches` | Procedencia: lotes importados con conteos de nuevas, duplicadas y rechazadas. |
| `GET /api/v1/ingestion/batches/:id` | Un lote con sus errores de fila. |
| `GET /api/v1/observations` | Detecciones con filtros (`sensor`, `platform`, `from`, `to`, `district`, `assignment`, `minConfidence`, `origin`, `batchId`, `bbox`), paginación por cursor (`limit` ≤ 1000, `cursor` → `nextCursor`) y `format=geojson`. |
| `GET /api/v1/observations/:id` | Una detección con su fila original. |
| `GET /api/v1/districts` | Distritos con conteo y área; `format=geojson` incluye geometrías. |
| `POST /api/v1/districts/import` | Importa un FeatureCollection GeoJSON WGS84 (multipart: `file`, `source`, `version`, `provisional`, `codeProperty`, `nameProperty`). |
| `POST /api/v1/replay/start` | Inicia la reproducción histórica (JSON: `from`, `to`, `sensor`, `district`, `batchId`, `intervalMs`, `passWindowMinutes`, `loop`). |
| `POST /api/v1/replay/stop` / `GET /api/v1/replay/status` | Detiene o consulta la reproducción. |

La respuesta de observaciones sigue el modelo `SatelliteObservation` del frontend (`position {lat,lng}`, `acquiredAtUtc`, `brightnessKelvin`, `frpMw`, `source`, `dataset`) y agrega `confidenceLevel`, `district`, `districtAssignment` y `batchId`. La de distritos sigue `District` (`id` = código, `name`, `hotspotCount`, `areaKm2`).

Validación: esquemas Zod con `StandardSchemaValidationPipe`, que `@nestjs/swagger` 12 documenta automáticamente. En formularios multipart se valida con `SchemaPipe` para que Swagger conserve el campo del archivo.

### Prevista

| Endpoint | Propósito |
| --- | --- |
| `GET /api/v1/hotspots` | Agrupaciones candidatas y trazabilidad. |
| `GET /api/v1/calendar` | Actividad agregada por periodo y distrito. |
| `GET /api/v1/metrics` | Indicadores del dashboard. |
| `GET /api/v1/anomalies` | Resultados con referencia histórica y limitaciones. |

Al desarrollarlos se acordarán con Angular los DTOs, errores y límites de consulta.

## Tiempo real, alertas y asistente

El frontend se actualiza sin recargar. La API REST sirve la carga inicial y los filtros; un canal Socket.IO (`@nestjs/websockets`) envía únicamente los cambios.

FIRMS publica datos casi en tiempo real (normalmente con unas 3 h de retraso desde el paso del satélite). "Tiempo real" significa que el front se entera apenas el backend recibe datos nuevos, no que la detección sea instantánea.

### Flujo

```text
FIRMS (MODIS + VIIRS) ── cron 15–30 min ─┐
CSV del equipo de datos ─────────────────┤
                                  [ingestion] → [observations] → [districts]
                                                       │
                                               [harmonization]
                                                       │
                                                   [alerts]
                          ┌────────────────────────────┼───────────────────────┐
                     [realtime]                  [assistant]          webhook → n8n (opcional)
                Socket.IO → Angular        la IA redacta y responde      Telegram / WhatsApp
```

### Módulos adicionales

| Módulo | Responsabilidad |
| --- | --- |
| `scheduler` | Ejecutar `sync-firms` periódicamente (`@nestjs/schedule`). Incluye un modo que reproduce datos históricos como si llegaran en vivo; esos datos se marcan como simulados. |
| `alerts` | Evaluar reglas configurables (foco nuevo en un distrito, confianza alta, FRP alto, detección por ambos sensores, cercanía al Tunari), persistir `FireAlert` y su estado y notificar a n8n por webhook si está configurado. |
| `realtime` | Gateway Socket.IO con salas por distrito; reenvía los eventos de dominio al cliente. |
| `assistant` | Chat con un modelo de lenguaje que consulta datos mediante funciones (*tool calling*), envía la respuesta en fragmentos y controla el consumo de tokens. |

Los módulos se comunican mediante `@nestjs/event-emitter` dentro del proceso (por ejemplo `observations.ingested` → alertas y tiempo real). Es una sola instancia: sin Redis, colas ni microservicios. Si hiciera falta escalar, se agrega el adaptador Redis de Socket.IO.

### Contrato de eventos Socket.IO

Namespace `/realtime` en el mismo puerto de la API. Los tipos exactos están en `src/modules/realtime/realtime.contract.ts`; conviene copiarlos al frontend.

| Evento | Dirección | Estado | Contenido |
| --- | --- | --- | --- |
| `subscribe` | cliente → servidor | Implementado | `{ districts?: string[] }` con ack `{ rooms }` o `{ error }`. Sin distritos = todo. |
| `hotspots:new` | servidor → cliente | Implementado | `{ mode, simulated, batchId, dataset, emittedAtUtc, simulatedTimeUtc, collection }`; `mode` es `live` o `replay`; `collection` es un FeatureCollection con las mismas propiedades que `GET /observations?format=geojson`. Hasta 500 features por mensaje. |
| `sync:status` | servidor → cliente | Implementado | `{ lastBatch }` con conteos del último lote. Se reenvía al conectarse. |
| `replay:status` | servidor → cliente | Implementado | Progreso de la reproducción (`running`, `step`, `totalSteps`, `simulatedTimeUtc`…). Se reenvía al conectarse. |
| `districts:updated` | servidor → cliente | Implementado | Cambiaron los límites o las asignaciones: recargar distritos y observaciones por REST. |
| `alert:new` / `alert:updated` | servidor → cliente | Fase 3 | `FireAlert`, igual al modelo del frontend. |
| `metrics:updated` | servidor → cliente | Fase 3 | KPIs del dashboard. |
| `chat:message` | cliente → servidor | Fase 4 | `{ sessionId, text }` |
| `chat:token` / `chat:done` | servidor → cliente | Fase 4 | Fragmentos de la respuesta y cierre. |
| `chat:proactive` | servidor → cliente | Fase 4 | La mascota Tuni anuncia una alerta por iniciativa propia. |

Comportamiento implementado:

- **Salas:** al conectarse, el cliente entra a `all`. Con `subscribe { districts: ['D1'] }` pasa a recibir solo los focos de esos distritos; los focos sin distrito (`OUTSIDE`, `AMBIGUOUS`, `PENDING`) solo llegan a `all`.
- **Solo novedades:** después de una importación se anuncian únicamente las observaciones nuevas; reimportar un archivo no repite focos, aunque sí actualiza `sync:status`.
- **Replay:** `POST /api/v1/replay/start` reproduce observaciones guardadas en orden cronológico, agrupadas en pasadas (detecciones a menos de `passWindowMinutes` de la primera del grupo), una pasada cada `intervalMs`. No escribe en la base y todos sus mensajes llevan `mode: 'replay'` y `simulated: true`. Hay una sola reproducción a la vez, compartida por todos los clientes; máximo 20 000 observaciones.
- **Flujo interno:** ingesta emite `ingestion.batch-completed` y distritos emite `districts.updated` (`src/shared/domain-events.ts`); `RealtimePublisher` los traduce en mensajes. Alertas se suscribirá a los mismos eventos.
- **Errores:** las validaciones del socket usan los mismos esquemas Zod; `WsExceptionFilter` responde `{ error }` por ack o con el evento `exception`.

### Asistente con IA

- El chatbot vive en este backend, no en n8n: necesita consultar los datos, enviar la respuesta en fragmentos por el mismo canal y mantener la clave de la IA en el servidor. n8n queda opcional para reenviar alertas fuera de la app.
- Una interfaz `LlmProvider` con un adaptador por proveedor permite cambiar de proveedor sin tocar el resto.
- Funciones disponibles para el modelo: `get_active_hotspots`, `get_district_summary`, `get_recent_alerts`, `get_metrics` y `explain_methodology`.
- Instrucciones fijas: responder solo con datos obtenidos de esas funciones, indicar fuente y hora UTC y aclarar que una detección térmica no confirma un incendio.
- Control de tokens: máximo por respuesta, historial recortado, límite de mensajes por sesión o IP (`@nestjs/throttler`) y *prompt caching* de las instrucciones fijas.
- Sin clave o sin créditos, las alertas usan plantillas y el chat responde que la IA no está disponible; la demo no se cae.

## Fases de implementación

0. **Base** (lista): NestJS, configuración validada con Zod, Prisma + PostGIS en Docker Compose, Swagger y `/api/v1/health`.
1. **Datos** (lista): importar CSV, persistir observaciones, asignar distritos y exponer `GET /observations`.
2. **Tiempo real** (lista): gateway con `hotspots:new` y modo de reproducción histórica.
3. **Alertas:** reglas, `alert:new` y webhook a n8n.
4. **Asistente:** IA con funciones, respuestas en fragmentos y límites.
5. **FIRMS en vivo:** sincronización programada con `FIRMS_MAP_KEY`.

## Verificación prioritaria

El primer recorrido completo será **CSV real → observaciones persistidas → asignación distrital → consulta HTTP**. Las pruebas relevantes cubrirán reimportación sin duplicados, interpretación de fechas y coordenadas, pertenencia geográfica y trazabilidad. Los métodos de armonización se verificarán con ejemplos controlados y comparaciones de parámetros antes de presentar sus resultados como históricos comparables.
