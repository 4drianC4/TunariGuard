# Tunari Guard — Backend

API y servidor de tiempo real de Tunari Guard. Recibe los focos de calor que detectan los satélites MODIS y VIIRS de la NASA y los ubica en el **Parque Nacional Tunari** y en los **15 distritos del municipio de Cochabamba**. Se los entrega al frontend de dos formas:

- **API REST** (`http://localhost:3000/api/v1`): el frontend pregunta y el servidor responde. Sirve para cargar el mapa, los filtros, el calendario, las series, las alertas y las descargas.
- **Tiempo real** (Socket.IO en `http://localhost:3000/realtime`): el servidor avisa sin que nadie pregunte. Apenas se importan focos nuevos, los empuja a todas las pantallas conectadas, así el mapa se actualiza solo.

> Una detección satelital de calor **no es un incendio confirmado**. Puede ser una quema, un incendio, calor industrial u otra fuente. La interfaz debe decirlo.

## Índice

1. [Requisitos](#1-requisitos)
2. [Puesta en marcha](#2-puesta-en-marcha)
3. [Comprobar que funciona](#3-comprobar-que-funciona)
4. [Qué hace la API](#4-qué-hace-la-api)
5. [Qué hace el tiempo real](#5-qué-hace-el-tiempo-real)
6. [Probar el tiempo real](#6-probar-el-tiempo-real)
7. [Conectar el frontend](#7-conectar-el-frontend)
8. [Datos del equipo (esquema `fuego`)](#8-datos-del-equipo-esquema-fuego)
9. [CSV pesados (MinIO)](#9-csv-pesados-minio)
10. [Scripts](#10-scripts)
11. [Variables de entorno](#11-variables-de-entorno)
12. [Solución de problemas](#12-solución-de-problemas)
13. [Tecnologías y estructura](#13-tecnologías-y-estructura)

---

## 1. Requisitos

| Necesitas | Para qué |
| --- | --- |
| **Node.js 24** | Ejecutar el backend (`node -v` debe decir `v24…`) |
| **Docker Desktop** (o Docker Engine) **abierto** | Corre PostgreSQL + PostGIS y MinIO; no hay que instalarlos aparte |
| Git | Descargar el proyecto |

No hace falta instalar PostgreSQL ni `psql`: todo corre dentro de Docker. Si ya tienes PostgreSQL instalado en Windows no pasa nada, porque nuestra base usa el puerto **5433**.

Todos los comandos se ejecutan **desde la carpeta `Server/`**.

---

## 2. Puesta en marcha

### Primera vez

```bash
cd Server
cp .env.example .env     # Windows (cmd): copy .env.example .env
npm install              # instala dependencias y genera el cliente Prisma
npm run db:up            # levanta PostgreSQL/PostGIS y MinIO en Docker y espera a que estén listos
npm run prisma:deploy    # crea nuestras tablas (observations, districts, import_batches)
npm run fuego:setup      # carga el análisis del equipo de datos (tarda ~1 minuto)
npm run start:dev        # arranca la API y el tiempo real en http://localhost:3000
```

Qué hace cada paso:

1. **`.env`**: configuración local (puertos, contraseñas de desarrollo). Los valores de `.env.example` sirven tal cual.
2. **`npm install`**: descarga las librerías.
3. **`db:up`**: crea los contenedores `tunari-guard-db` (base de datos) y `tunari-guard-minio` (almacenamiento de archivos).
4. **`prisma:deploy`**: aplica las migraciones de `prisma/migrations/`. Nunca borres esa carpeta.
5. **`fuego:setup`**: ejecuta los SQL del paquete de datos (`data/fuego/`). Ver [sección 8](#8-datos-del-equipo-esquema-fuego).
6. **`start:dev`**: arranca el servidor y lo reinicia solo cuando cambias el código. La primera vez copia los 15 distritos del paquete a nuestra tabla de distritos.

Opcional, para tener la historia completa en el mapa en vivo (11.923 detecciones de 2001 a 2026), con el servidor ya corriendo:

```bash
curl -F file=@data/fuego/formato_firms/firms_modis_cochabamba.csv -F dataset="FIRMS MODIS Cochabamba 2001-2026" http://localhost:3000/api/v1/ingestion/csv
curl -F file=@data/fuego/formato_firms/firms_viirs_cochabamba.csv -F dataset="FIRMS VIIRS Cochabamba 2012-2026" http://localhost:3000/api/v1/ingestion/csv
```

También se pueden subir desde Swagger (`POST /ingestion/csv`). Repetir la carga no duplica nada.

### El día a día

```bash
npm run db:up        # si Docker se reinició
npm run start:dev
```

### Después de un `git pull`

```bash
npm install              # por si cambiaron dependencias
npm run prisma:deploy    # por si hay migraciones nuevas (si no hay, no hace nada)
npm run db:up            # recrea los contenedores si cambió docker-compose.yml
```

Si `npm run fuego:setup` dice que el contenedor no ve el paquete, recréalo una vez con `docker compose up -d --force-recreate db`. Los datos se conservan.

El cliente de Prisma (`src/generated/`) no está en Git: se genera desde `prisma/schema.prisma`. `npm install`, `npm run build` y `npm run start:dev` lo regeneran solos. Si ves errores como `'detectionType' does not exist in type 'ObservationWhereInput'`, tu cliente quedó viejo; ejecuta `npm run prisma:generate`.

---

## 3. Comprobar que funciona

| Abre | Debes ver |
| --- | --- |
| http://localhost:3000/api/v1/health | `"status":"ok"` con `database` (versión de PostGIS) y `storage` (bucket de MinIO) en `up` |
| http://localhost:3000/api/docs | **Swagger**: todos los endpoints documentados, y se pueden probar desde el navegador con *Try it out* |
| http://localhost:3000/api/docs-json | La especificación OpenAPI, para generar tipos en el frontend |
| http://localhost:9001 | La consola de MinIO (usuario `tunari`, contraseña `tunari_dev_secret`) |

Y en una terminal:

```bash
npm run realtime:watch   # debe decir "conectado" y "escuchando salas: all"
```

Si algo falla, ve a [Solución de problemas](#12-solución-de-problemas).

---

## 4. Qué hace la API

Todas las rutas empiezan con `http://localhost:3000/api/v1`. Las respuestas son JSON. La documentación interactiva y siempre actualizada está en **Swagger** (`/api/docs`).

El backend maneja **dos conjuntos de datos** que se complementan:

| | Datos en vivo (`observations`) | Análisis del equipo (esquema `fuego`) |
| --- | --- | --- |
| Qué es | Cada detección tal como la reporta NASA FIRMS, importada por nosotros | Análisis ya calculado por el equipo de datos: índice armonizado MODIS/VIIRS, alertas, recurrencia |
| Para qué | Mapa en tiempo real, filtros, reproducción histórica | Calendario, series, alertas estadísticas, descargas y búsquedas por polígono |
| Cómo crece | Importando CSV (y en el futuro, sincronizando con FIRMS) | Con los SQL del paquete (`npm run fuego:*`) |
| Endpoints | `/observations`, `/districts`, `/ingestion`, `/replay` | `/areas`, `/detecciones`, `/metadatos`, etc. |

Son vistas solapadas de las mismas fuentes: **no sumes cifras de una con la otra**.

### 4.1 Estado

| Endpoint | Qué hace |
| --- | --- |
| `GET /health` | Dice si la base de datos y MinIO responden |

### 4.2 Importación de datos (`/ingestion`)

| Endpoint | Qué hace |
| --- | --- |
| `POST /ingestion/csv` | Recibe un CSV de NASA FIRMS (MODIS o VIIRS) en un formulario (`file`, opcionales `dataset`, `origin`, `sensor`). Lo valida, lo normaliza, lo guarda, asigna cada foco a su distrito y **lo anuncia en tiempo real** |
| `POST /ingestion/uploads` | Devuelve una URL para subir un CSV pesado directo a MinIO ([sección 9](#9-csv-pesados-minio)) |
| `GET /ingestion/uploads` | Lista los archivos subidos a MinIO |
| `POST /ingestion/uploads/import` | Importa un CSV que ya está en MinIO (`objectKey`), leyéndolo por partes |
| `GET /ingestion/batches` | Historial de importaciones: archivo, fecha, filas nuevas, duplicadas y rechazadas |
| `GET /ingestion/batches/{id}` | Una importación con el detalle de las filas rechazadas (línea y motivo) |

Qué garantiza la importación:
- **No duplica.** Cada detección tiene una huella (sensor, satélite, instante, coordenadas). Reimportar el mismo archivo da 0 filas nuevas.
- **No se detiene por filas malas.** Las rechaza indicando la línea y el motivo.
- **Distingue datos de prueba.** Con `origin=SIMULATED` los focos llegan marcados como simulados y nunca se confunden con reales.
- **Datos provisionales.** Los datos NRT de FIRMS se publican rápido pero son provisionales. Cuando llega el dato estándar del mismo periodo, las filas NRT se reemplazan (ver `nrt` en la respuesta).
- **Si algo falla a mitad**, se deshace toda la importación.

### 4.3 Detecciones en vivo (`/observations`)

| Endpoint | Qué hace |
| --- | --- |
| `GET /observations` | Lista detecciones con filtros. Con `format=geojson` devuelve un FeatureCollection listo para Leaflet |
| `GET /observations/{id}` | Una detección con la fila original del CSV |

Filtros de `GET /observations`:

| Parámetro | Ejemplo | Qué filtra |
| --- | --- | --- |
| `sensor` / `platform` | `VIIRS` / `NOAA20` | Sensor o satélite |
| `from` / `to` | `2024-08-01` | Rango de fechas (UTC) |
| `district` | `distrito-09` | Distrito |
| `assignment` | `OUTSIDE` | `ASSIGNED`, `OUTSIDE` (fuera de los distritos), `AMBIGUOUS` (en un borde compartido), `PENDING` |
| `minConfidence` | `NOMINAL` | Confianza mínima: `LOW`, `NOMINAL`, `HIGH` |
| `origin` | `REAL` | `REAL` o `SIMULATED` |
| `bbox` | `-66.3,-17.5,-66.0,-17.3` | Solo lo visible en el mapa (minLon,minLat,maxLon,maxLat) |
| `detectionType` | `all` | Por defecto `vegetation` (solo incendios de vegetación probables); `all` incluye volcanes y fuentes industriales |
| `limit` / `cursor` | `500` | Paginación: hasta 1000 por página; para la siguiente página, pasa el `nextCursor` de la respuesta |

### 4.4 Distritos (`/districts`)

| Endpoint | Qué hace |
| --- | --- |
| `GET /districts` | Distritos con su cantidad de focos y área en km². Con `format=geojson` incluye los polígonos |
| `POST /districts/import` | Carga límites propios desde un GeoJSON (por ejemplo, la cartografía oficial cuando la tengamos) |
| `POST /districts/import-fuego` | Usa los 15 distritos del paquete de datos (`distrito-01` … `distrito-15`). Se hace solo al arrancar si no hay distritos |

Cada foco se asigna al distrito cuyo polígono lo contiene. El borde cuenta como dentro. Nunca se asigna al distrito "más cercano" por aproximación: si queda fuera es `OUTSIDE`, y si cae en dos distritos es `AMBIGUOUS`. Al cambiar los distritos, se recalculan todas las asignaciones y se avisa por tiempo real.

### 4.5 Reproducción histórica (`/replay`)

Para la demo cuando no entran datos nuevos: toma detecciones ya guardadas y las emite por tiempo real **como si estuvieran llegando ahora**, una pasada de satélite cada pocos segundos. No escribe nada en la base.

| Endpoint | Qué hace |
| --- | --- |
| `POST /replay/start` | Inicia la reproducción. Body JSON: `from`, `to`, `sensor`, `district`, `batchId`, `intervalMs` (500–60000, por defecto 3000), `passWindowMinutes` (por defecto 20), `loop` |
| `POST /replay/stop` | La detiene |
| `GET /replay/status` | Paso actual, total y si está corriendo |

Hay una sola reproducción para todo el servidor: todos los que miran ven lo mismo. Iniciar otra reemplaza la anterior. Reproduce hasta 20.000 detecciones.

### 4.6 Análisis del equipo de datos (esquema `fuego`)

Implementa el contrato que entregó el equipo de datos ([`data/fuego/docs/openapi.yaml`](data/fuego/docs/openapi.yaml)). Los nombres de los campos salen en `snake_case`, como en ese contrato.

| Endpoint | Qué devuelve |
| --- | --- |
| `GET /areas` | Las 31 áreas: parque, municipio, 15 distritos, 12 sectores del Tunari por municipio y 2 zonas del GAMC. Con `formato=geojson` incluye polígonos; `tipo=distrito` filtra |
| `GET /areas/{area_id}` | Una área con su polígono (ej. `parque-tunari`, `distrito-09`, `mun-sacaba`) |
| `GET /areas/{area_id}/calendario` | Calendario térmico mes × año (para un heatmap). `desde_anio`, `hasta_anio` |
| `GET /areas/{area_id}/serie` | Serie del índice con bandas de incertidumbre. `escala=mensual\|trimestral\|anual` |
| `GET /areas/{area_id}/serie-armonizada` | Índice mensual según el catálogo de satélites, con `aviso` y `fuentes_usadas` |
| `GET /areas/{area_id}/alertas` | Meses inusualmente altos: nivel, probabilidad y una lectura en palabras. `solo_destacadas=true` |
| `GET /areas/{area_id}/alerta-mes-en-curso` | Cómo va el mes actual frente al mismo tramo de años anteriores |
| `GET /areas/{area_id}/recurrencia` | En cuántos años hubo fuego en cada celda de 1 km (GeoJSON) |
| `GET /areas/{area_id}/puntos-calientes` | Celdas con concentración significativa de fuego y sus grupos |
| `GET /areas/{area_id}/tendencias` | Pruebas de tendencia a largo plazo |
| `GET /detecciones` | Detecciones analizadas con filtros (`area_id`, `desde`, `hasta`, `fuente`, `confianza_minima`, `bbox`, `orden`). **`formato=csv` las descarga** y `geojson` las prepara para el mapa. El total viene en la cabecera `X-Total-Count` y la siguiente página en `X-Next-Offset` |
| `POST /detecciones/buscar` | Detecciones dentro de un polígono que el usuario dibuja en el mapa |
| `POST /conteos/mensual` | Conteo mensual bruto por satélite dentro de un polígono |
| `POST /poligono/serie-armonizada` | Índice armonizado de un polígono dibujado |
| `GET /eventos` | Grupos de detecciones cercanas en tiempo y espacio |
| `GET /fuentes` | Catálogo de satélites y cuáles entran al índice |
| `GET /casos-documentados` | Siete incendios publicados en prensa, usados para validar |
| `GET /metadatos` | Parámetros, fecha de cobertura y las **advertencias obligatorias** que deben mostrarse junto a cada cifra |

### 4.7 Errores

| Código | Cuándo |
| --- | --- |
| `400` | Parámetros inválidos. `message` dice qué campo y por qué (ej. `bbox debe ser minLon,minLat,maxLon,maxLat en WGS84`) |
| `404` | No existe (ej. un `area_id` desconocido) |
| `503` | Falta cargar el esquema `fuego`: el mensaje indica `npm run fuego:setup` |

---

## 5. Qué hace el tiempo real

### La idea

Sin tiempo real, el frontend tendría que preguntar cada pocos segundos si hay algo nuevo. Con Socket.IO, **el navegador abre una conexión que queda abierta** y el servidor la usa para avisar en el momento en que algo cambia:

```text
  Importación de un CSV                 Reproducción histórica (demo)
  (POST /ingestion/csv o MinIO)         (POST /replay/start)
            │                                     │
            ▼                                     ▼
   se guardan los focos nuevos           lee focos ya guardados,
   y se asignan a su distrito            una pasada de satélite por vez
            │                                     │
            └──────────────┬──────────────────────┘
                           ▼
          Servidor Socket.IO  ·  namespace /realtime
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   sala "all"     sala "district:distrito-09"   …
  (todo el mapa)   (solo ese distrito)
        │                  │
        ▼                  ▼
   navegadores conectados: el mapa agrega los puntos sin recargar
```

- **Dirección:** `http://localhost:3000/realtime`. Es el mismo puerto que la API, en el namespace `/realtime`.
- **Salas por distrito:** al conectarse, cada cliente recibe todo (sala `all`). Si solo le interesan algunos distritos, se suscribe a ellos y deja de recibir el resto.
- **Solo novedades:** se anuncian únicamente los focos **nuevos**. Reimportar un archivo no repite puntos en el mapa.
- **Estado al conectarse:** quien se conecta tarde recibe enseguida el último `sync:status` (última importación) y el último `replay:status`. Así puede mostrar el estado sin esperar al próximo evento.
- **Mismo CORS que la API:** solo se aceptan los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:4200`).

### Eventos que envía el servidor

| Evento | Cuándo llega | Qué trae |
| --- | --- | --- |
| `hotspots:new` | Al importarse focos nuevos, y en cada paso de la reproducción | `collection`: FeatureCollection GeoJSON de puntos, listo para agregar al mapa. `mode`: `live` (recién importado) o `replay` (demo). `simulated`: `true` si es demo o datos de prueba, y hay que mostrarlo. `simulatedTimeUtc`: en replay, el momento histórico reproducido. `dataset`, `batchId`, `emittedAtUtc` |
| `sync:status` | Al terminar cada importación y al conectarse | `lastBatch`: nombre del dataset, filas nuevas, duplicadas y rechazadas, y `announced`. Si `announced` es `false` fue una importación masiva: hay que recargar con `GET /observations` |
| `replay:status` | En cada paso de la reproducción, al detenerse y al conectarse | `running`, `step`, `totalSteps`, `intervalMs`, `loop`, `observationCount`, `simulatedTimeUtc` |
| `districts:updated` | Cuando cambian los límites de los distritos | `imported`, `reassigned`. Hay que recargar `GET /districts` y `GET /observations` |

Cada punto de `hotspots:new` tiene estas propiedades, las mismas que `GET /observations`:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-66.21, -17.43] },
  "properties": {
    "id": "6f1c…", "sensor": "VIIRS", "platform": "NOAA20",
    "acquiredAtUtc": "2026-11-14T14:30:00.000Z",
    "confidenceLevel": "HIGH", "frpMw": 9.5, "brightnessKelvin": 340,
    "dayNight": "DAY", "detectionType": 0, "source": "SIMULATED",
    "dataset": "Prueba en vivo", "districtAssignment": "ASSIGNED",
    "district": { "code": "distrito-09", "name": "Distrito 9", "provisional": true }
  }
}
```

### Mensajes que puede enviar el cliente

| Mensaje | Body | Respuesta (ack) |
| --- | --- | --- |
| `subscribe` | `{ "districts": ["distrito-09", "distrito-13"] }` para filtrar, o `{}` para volver a recibir todo | `{ "rooms": ["district:distrito-09", …] }`, o `{ "error": "…" }` si el body es inválido |

Los tipos exactos de cada evento están en [`src/modules/realtime/realtime.contract.ts`](src/modules/realtime/realtime.contract.ts). Copiarlos al frontend mantiene ambos lados alineados.

### Reglas para no saturar al navegador

- Un lote grande se divide en varios `hotspots:new` de hasta 500 puntos cada uno.
- Si una importación trae **más de 5000 focos nuevos**, no se envían por socket: llega solo `sync:status` con `announced: false` y el frontend recarga por REST. Así pasa al cargar históricos completos.

---

## 6. Probar el tiempo real

No hace falta el frontend. Usa dos terminales, ambas en `Server/`:

**Terminal 1:** el servidor.

```bash
npm run start:dev
```

**Terminal 2:** un oyente que imprime cada evento como lo recibiría el navegador.

```bash
npm run realtime:watch                          # todos los distritos
npm run realtime:watch -- distrito-09 distrito-13   # solo esos distritos
```

**Hazlo reaccionar** desde una tercera terminal o desde Swagger:

```bash
# A) Reproducción histórica: una pasada cada 2 s
curl -X POST http://localhost:3000/api/v1/replay/start -H 'content-type: application/json' -d '{"from":"2024-08-01","to":"2024-09-30","intervalMs":2000}'
curl -X POST http://localhost:3000/api/v1/replay/stop

# B) Importación en vivo, con datos de prueba marcados como simulados
curl -F file=@mi_archivo.csv -F origin=SIMULATED http://localhost:3000/api/v1/ingestion/csv
```

En Windows (PowerShell), si `curl` da problemas con las comillas, usa Swagger (`/api/docs` → `POST /replay/start` → *Try it out*).

Lo que verás en el oyente:

```text
[10:01:43] conectado a http://localhost:3000/realtime
[10:01:43] escuchando salas: all  (Ctrl+C para salir)
[10:01:46] 🔥 hotspots:new  2 focos · replay · SIMULADO · pasada 2024-08-20T17:51:00.000Z
           distrito-13: 2
[10:01:46] ⏯  replay:status paso 3/22 · 61 observaciones · cada 800 ms
[10:01:59] 📥 sync:status  "Prueba en vivo" · 2 nuevas, 0 duplicadas, 0 rechazadas
[10:01:59] 🔥 hotspots:new  2 focos · live · SIMULADO
           distrito-02: 1 · distrito-09: 1
```

La reproducción necesita detecciones guardadas en ese periodo. Si no ves pasadas, importa primero los CSV de `data/fuego/formato_firms/` (ver [Primera vez](#primera-vez)).

---

## 7. Conectar el frontend

### REST

```ts
const API = 'http://localhost:3000/api/v1';

// Puntos para el mapa (GeoJSON)
const mapa = await fetch(`${API}/observations?format=geojson&limit=1000`).then((r) => r.json());

// Calendario térmico del Parque Tunari
const calendario = await fetch(`${API}/areas/parque-tunari/calendario`).then((r) => r.json());

// Advertencias que deben acompañar las cifras
const { advertencias } = await fetch(`${API}/metadatos`).then((r) => r.json());
```

### Tiempo real

Instala `socket.io-client` en Angular:

```bash
npm i socket.io-client
```

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/realtime');

socket.on('connect', async () => {
  // Opcional: solo algunos distritos. Sin esto llega todo.
  const ack = await socket.emitWithAck('subscribe', { districts: ['distrito-09'] });
  if (ack.error) console.error(ack.error);
});

socket.on('hotspots:new', (msg) => {
  // msg.collection es un FeatureCollection: agrégalo a la capa del mapa.
  // Si msg.simulated es true, muestra la etiqueta "simulado".
});

socket.on('sync:status', ({ lastBatch }) => {
  // Última importación. Si lastBatch.announced === false, recarga GET /observations.
});

socket.on('replay:status', (status) => { /* barra de progreso de la demo */ });
socket.on('districts:updated', () => { /* recarga GET /districts y GET /observations */ });
```

**Patrón recomendado:** al abrir la página, carga el estado inicial por REST (`GET /observations?format=geojson`) y después suma lo que llega por `hotspots:new`. Si el socket se reconecta, vuelve a pedir el estado inicial. Socket.IO reconecta solo, y el `subscribe` está dentro de `connect` para que se repita en cada reconexión.

**Reglas de presentación** que pide el equipo de datos:
- Una detección no es un incendio.
- Muestra las advertencias de `GET /metadatos` junto a las cifras, y `calidad_indice` cuando muestres el índice.
- Un índice nulo se pinta en gris, nunca como cero.
- Para nombrar áreas usa `nombre_visible`.

Si el frontend no corre en `http://localhost:4200`, agrega su dirección a `CORS_ORIGINS` en `.env` y reinicia el backend. Si no, el navegador bloquea tanto la API como el socket.

---

## 8. Datos del equipo (esquema `fuego`)

El equipo de datos entregó un paquete en [`data/fuego/`](data/fuego/LEEME.md): un esquema de PostgreSQL aparte, `fuego`, con el análisis ya calculado (SQL + 17 CSV). Incluye:
- 6157 detecciones analizadas y 31 áreas;
- el índice armonizado MODIS/VIIRS por mes;
- alertas estadísticas;
- recurrencia por celda de 1 km y puntos calientes.

No toca nuestras tablas y **no se recalcula nada aquí**: el backend solo lo lee.

```bash
npm run fuego:setup             # 01 esquema + 02 funciones + 03 carga (+ 04 validación), en una transacción
npm run fuego:setup -- --reset  # borra el esquema fuego y lo crea de nuevo
npm run fuego:novedades         # 05: detecciones nuevas; reemplaza las NRT del mismo rango de fechas
npm run fuego:alerta-mes        # 06: actualiza la alerta del mes en curso
npm run fuego:status            # cuántas filas hay y hasta qué fecha llegan los datos
```

- Los SQL se ejecutan **tal cual vienen**, con el `psql` del contenedor: `data/fuego` está montado en `/fuego`.
- Si algo falla, la transacción se revierte y la base queda como estaba.
- Los 15 distritos del paquete se copian a nuestra tabla `districts` con los mismos códigos (`distrito-01` …). Así coinciden las salas de tiempo real, los filtros y el análisis.

---

## 9. CSV pesados (MinIO)

Los archivos grandes no se envían al backend. Se suben a MinIO (un almacenamiento de archivos que corre en Docker) y el backend los lee desde ahí por partes, sin cargarlos enteros en memoria. Como referencia, 300.000 filas se importan en unos 20 s.

**Opción A: consola web.** Abre http://localhost:9001 (usuario `tunari`, contraseña `tunari_dev_secret`), arrastra el CSV al bucket `tunari-guard-uploads` e impórtalo con su nombre:

```bash
curl -X POST http://localhost:3000/api/v1/ingestion/uploads/import -H 'content-type: application/json' \
     -d '{"objectKey":"fire_archive_M-C61.csv","dataset":"FIRMS MODIS C6.1 archivo"}'
```

**Opción B: URL firmada**, lo que usaría una pantalla de carga en Angular:

```bash
# 1. Pedir la URL de subida
curl -X POST http://localhost:3000/api/v1/ingestion/uploads -H 'content-type: application/json' -d '{"fileName":"fire_nrt_J1V-C2.csv"}'
#    → { "objectKey": "csv/2026-11-13/1a2b3c4d-fire_nrt_J1V-C2.csv", "uploadUrl": "http://localhost:9000/...", "method": "PUT", "headers": {...} }

# 2. Subir el archivo directo a MinIO (el Content-Type debe ser exactamente el indicado)
curl -X PUT -H 'Content-Type: text/csv' -T fire_nrt_J1V-C2.csv "<uploadUrl>"

# 3. Importarlo
curl -X POST http://localhost:3000/api/v1/ingestion/uploads/import -H 'content-type: application/json' \
     -d '{"objectKey":"csv/2026-11-13/1a2b3c4d-fire_nrt_J1V-C2.csv","dataset":"FIRMS VIIRS NOAA-20 NRT"}'
```

En el navegador, el paso 2 es `fetch(uploadUrl, { method: 'PUT', headers, body: file })`.

Si quien sube el archivo está en otra computadora de la red, pon `S3_PUBLIC_ENDPOINT=http://<IP-de-esta-máquina>:9000` en `.env`.

---

## 10. Scripts

| Script | Uso |
| --- | --- |
| `start:dev` | Servidor con recarga automática (API + tiempo real) |
| `build` / `start:prod` | Compilar y ejecutar la versión de producción (`dist/`) |
| `realtime:watch` | Oyente de consola del tiempo real (`-- distrito-09` para filtrar) |
| `db:up` / `db:down` | Levantar o detener PostgreSQL y MinIO |
| `db:doctor` | Diagnosticar problemas de conexión a la base |
| `prisma:deploy` | Aplicar las migraciones |
| `prisma:migrate` | Crear una migración nueva (solo quien cambia `schema.prisma`) |
| `prisma:studio` | Explorar las tablas en el navegador |
| `fuego:setup` / `fuego:novedades` / `fuego:alerta-mes` / `fuego:status` | Paquete de datos del equipo |
| `test` | Tests unitarios (Vitest) |
| `lint` | Revisión de código (oxlint) |

---

## 11. Variables de entorno

Viven en `.env`, que no se sube a Git. Se validan al arrancar: si falta una obligatoria, el servidor no inicia y dice cuál falta. Los valores de `.env.example` sirven para desarrollo.

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `PORT` | No (3000) | Puerto de la API y del tiempo real |
| `CORS_ORIGINS` | No | Direcciones del frontend que pueden usar la API y el socket, separadas por coma. Vacío = ninguna |
| `DATABASE_URL` | Sí | Conexión a PostgreSQL (puerto 5433) |
| `DB_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | No | Configuración del contenedor de la base. Deben coincidir con `DATABASE_URL` |
| `S3_ENDPOINT` | Sí | Dirección de MinIO para el backend |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Sí | Credenciales de MinIO; también son el usuario de su consola |
| `S3_PUBLIC_ENDPOINT` | No | Dirección de MinIO vista desde otras computadoras |
| `S3_BUCKET` / `S3_REGION` | No | Bucket de los CSV (se crea solo) y región |
| `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` | No (9000 / 9001) | Puertos de MinIO |
| `FIRMS_MAP_KEY`, `LLM_API_KEY`, `N8N_ALERT_WEBHOOK_URL` | No | Para las fases siguientes (sincronización FIRMS, asistente IA, alertas externas) |

---

## 12. Solución de problemas

### La base de datos

Si aparece *password authentication failed for user "tunari"* o "contraseña incorrecta", ejecuta:

```bash
npm run db:doctor
```

Revisa `.env`, el contenedor y a qué servidor llega la conexión, y dice qué corregir.

| Síntoma | Causa | Solución |
| --- | --- | --- |
| Contraseña rechazada, sobre todo en Windows | Un PostgreSQL instalado en el equipo ocupa el puerto 5432 | Usa el puerto 5433: copia `DB_PORT` y `DATABASE_URL` de `.env.example` a tu `.env` y ejecuta `docker compose up -d --force-recreate db` |
| Contraseña rechazada con el puerto correcto | Se cambió la contraseña después de crear la base | `docker compose down -v` (borra los datos locales), luego `npm run db:up`, `npm run prisma:deploy` y `npm run fuego:setup` |
| `ECONNREFUSED` | Docker cerrado o contenedor detenido | Abre Docker Desktop y ejecuta `npm run db:up` |
| Las tablas no existen | No se aplicaron las migraciones, o se borró `prisma/migrations` | `git pull` y `npm run prisma:deploy` |
| `503` en `/areas` o `/detecciones` | Falta el esquema `fuego` | `npm run fuego:setup` |
| `no configuration file provided` o npm no encuentra `package.json` | El comando se ejecutó fuera de `Server/` | `cd Server` |
| `'detectionType' does not exist in type 'ObservationWhereInput'` (u otro campo nuevo) al compilar | El cliente de Prisma generado es anterior al último `schema.prisma` | `npm run prisma:generate` (ya lo hace `start:dev` al arrancar) |

### El tiempo real

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `realtime:watch` dice "no se pudo conectar" | El servidor no está corriendo, o usa otro puerto | `npm run start:dev`; si usas otro puerto: `API_URL=http://localhost:PUERTO npm run realtime:watch` |
| El navegador muestra un error de CORS | El frontend corre en una dirección que no está en `CORS_ORIGINS` (ojo: `localhost` y `127.0.0.1` cuentan como distintas) | Agrégala en `.env` y reinicia el backend |
| Me conecto pero no llega nada | Nadie importó ni inició una reproducción, o estás suscrito a otros distritos | Inicia un replay; revisa la sala que imprime `realtime:watch` |
| La reproducción no emite pasadas | No hay detecciones guardadas en ese periodo | Importa los CSV de `data/fuego/formato_firms/` o cambia `from`/`to` |
| Importé un CSV grande y no llegaron puntos | Más de 5000 focos nuevos: por diseño solo llega `sync:status` | El frontend debe recargar `GET /observations` |

---

## 13. Tecnologías y estructura

| Responsabilidad | Tecnología |
| --- | --- |
| Aplicación | NestJS 12 + TypeScript (ESM) sobre Node.js 24 |
| Base de datos y operaciones espaciales | PostgreSQL 17 + PostGIS 3.5 (Docker) |
| Acceso a datos | Prisma 7 (tablas propias) y SQL parametrizado (esquema `fuego`) |
| Tiempo real | Socket.IO con `@nestjs/websockets` |
| Archivos pesados | MinIO (fork comunitario `pgsty/minio`) vía SDK S3 |
| Validación y contrato | Zod + OpenAPI/Swagger |
| Tests | Vitest |

```text
Server/
  data/fuego/                 paquete de datos del equipo (SQL, CSV, contrato OpenAPI)
  prisma/                     schema.prisma y migraciones (no borrar)
  scripts/                    db-doctor, fuego (SQL del paquete), realtime-watch
  src/
    main.ts                   arranque: prefijo /api/v1, CORS, Swagger, Socket.IO
    infrastructure/           configuración, base de datos, MinIO, adaptador de WebSocket
    shared/                   eventos internos entre módulos
    modules/
      health/                 GET /health
      ingestion/              importación de CSV (formulario y MinIO)
      observations/           detecciones en vivo
      districts/              distritos y asignación territorial
      realtime/               gateway Socket.IO y publicación de eventos
      replay/                 reproducción histórica
      analisis/               lectura del esquema fuego
```

El diseño interno, los contratos completos y las fases están en [ARCHITECTURE.md](./ARCHITECTURE.md).

**Pendiente:**
- alertas operativas con n8n (fase 3);
- asistente con IA (fase 4);
- sincronización automática con NASA FIRMS (fase 5);
- cartografía oficial de los distritos (hoy se usan límites de referencia abierta, marcados `provisional`).
