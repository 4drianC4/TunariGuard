# Qué coincide y qué no con las tablas de TunariGuard

**Respuesta corta:** el paquete `fuego` **no es idéntico** a las tablas del servidor (`observations`, `districts`, `import_batches`). Es un esquema aparte, pensado para el análisis; no hace falta modelarlo en Prisma al principio (puede consultarse con SQL parametrizado). Hay **dos caminos**, y solo el primero coincide campo por campo con lo que el servidor ya sabe cargar.

> Base de esta comparación: `Server/prisma/schema.prisma` y `ingestion/domain/normalize-firms-record.ts` de la copia local del servidor (rama `datos/armonizacion`, derivada de `server-workflow`). Adri debe confirmar contra su versión actual antes de implementar.

## Camino A: detecciones crudas, en el formato que su importador ya lee (coincide)

- Archivos: `formato_firms/firms_modis_cochabamba.csv` (1.614 filas) y `firms_viirs_cochabamba.csv` (10.309 filas). Se cargan con `POST /api/v1/ingestion/csv`, sin cambiar su esquema **para cargarlos**. La columna `type` solo quedará dentro de `raw` hasta que se agregue `detection_type` (cambio 2); para usarla como columna hace falta ese cambio.
- Columnas **idénticas** a las de los CSV de NASA FIRMS que su normalizador espera (MODIS: `brightness`, `bright_t31`; VIIRS: `bright_ti4`, `bright_ti5`; más `latitude`, `longitude`, `scan`, `track`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `version`, `frp`, `daynight`). Traen una columna extra, `type`, que su normalizador ignora (queda dentro de `raw`).
- **Comprobación hecha:** se emuló su normalizador en Python (reglas de `normalize-firms-record.ts`: sensor, alias de satélite, rango de coordenadas, `acq_date`/`acq_time`, confianza por sensor, `daynight`) sobre las 11.923 filas: **0 rechazadas y 0 claves de deduplicación repetidas** (sensor|plataforma|instante UTC|lat|lon a 5 decimales). **Es una emulación, no su código ejecutado**: Adri debe cargar los archivos en una base de prueba **vacía de esas detecciones** y confirmar los conteos (`inserted` = 11.923, `rejected` = 0). Si repite la carga, lo esperable es que se omitan como duplicadas (`duplicates` = 11.923, `inserted` = 0).
- Plataformas: Terra 478, Aqua 1.136, Suomi-NPP 5.861, NOAA-20 4.039, NOAA-21 409. De las 11.923 filas, 699 son NRT (provisionales; `version` termina en `NRT`).
- **Qué NO traen estos archivos:** nada de lo analítico (celdas de 1 km, factores, series, alertas, eventos). Eso solo está en el esquema `fuego` (camino B).

## Camino B: esquema `fuego` (NO coincide; es un esquema aparte)

### Detecciones: `observations` (suyo) frente a `fuego.detecciones` (nuestro)

| Concepto | `observations` | `fuego.detecciones` | ¿Coincide? |
|---|---|---|---|
| Identificador | `id` uuid | `id_deteccion` (hash de fuente + minuto UTC + lat + lon) | **No.** No son la misma clave. |
| Clave de deduplicación | `dedupe_key` = sensor\|plataforma\|instante\|lat\|lon (5 decimales) | no existe; el hash anterior hace de clave | **No.** Para cruzar, usar (plataforma, instante UTC, lat, lon a 5 decimales). |
| Sensor / satélite | enums `sensor` (MODIS, VIIRS) y `platform` (TERRA, AQUA, SNPP, NOAA20, NOAA21) | texto: `sensor` (MODIS, VIIRS), `plataforma` (Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21) y `fuente` (por ejemplo `VIIRS-Suomi-NPP`) | Mismo contenido, **otro formato** (mayúsculas/enum frente a texto). |
| Coordenadas | `latitude`, `longitude` | `lat`, `lon` | Mismo dato, nombres distintos. |
| Instante | `acquired_at` (UTC) | `fecha_hora_utc` (UTC) **más** `fecha_hora_bo` y `fecha_bo` (Bolivia, UTC−4) | UTC coincide. Nosotros agregamos hora y día de Bolivia: **para contar por día o mes se usa `fecha_bo`**. |
| Confianza | `confidence_raw` y `confidence_level` (LOW, NOMINAL, HIGH) | `confianza_original` y `confianza_clase` (`nominal`, `alta`; nunca `baja`) | Equivalentes, pero **nosotros ya filtramos las de confianza baja** y él las conserva. |
| Potencia, día/noche | `frp_mw`, `day_night` (DAY/NIGHT) | `frp_mw`, `dia_noche` (D/N) | Mismo dato, otro código. |
| Brillo, `scan`, `track`, versión del producto | sí (`brightness_k`, `brightness_aux_k`, `scan`, `track`, `product_version`) | **no** | **No.** `fuego.detecciones` no los trae (sí el camino A). |
| Tipo de detección (FIRMS `type`) | **no existe** (cambio 2 propuesto: columna `detection_type`) | `tipo` (solo 0, vegetación, y `tipo_conocido`) | **No.** |
| Fila original | `raw` (json) | no existe | **No.** |
| Geometría | `geom` Point 4326, **admite nulo** | `geom` Point 4326, **generada** desde `lon`/`lat` (nunca nula) | Existe en ambas; difiere en cómo se obtiene. |
| Fecha de carga | `created_at` | no existe por fila (solo `ingestas.fecha_carga`) | **No.** |
| Origen | `origin`: REAL o SIMULATED | `origen_dato`: `estandar` o `NRT` (provisional) | **Distinto concepto.** Lo suyo distingue real de simulado; lo nuestro, definitivo de provisional. Los dos hacen falta. |
| Distrito | `district_id` + `district_assignment` (asignación con `ST_Covers` sobre sus polígonos) | `distrito`, `distrito_area_id`, `distrito_gamc` (D1…D15) | **No es la misma asignación**: polígonos distintos, así que algún caso de borde puede caer en distritos diferentes. |
| Campos exclusivos de `fuego.detecciones` (no existen en `observations`) | — | `cell_id` (celda de 1 km), `evento_id_tunari` y `evento_id_cbba` (eventos), `fuente_persistente_probable`, `en_parque_tunari`, `en_municipio_cochabamba`, `zona_municipio`, `distancia_al_parque_km`, `municipio_parque`, clasificación oficial del GAMC (`distrito_gamc`, `comuna_gamc`, `zona_cota2750_gamc`, `periurbano_gamc`, `periurbano_detalle_gamc`), `origen_dato` (estándar o NRT) y `tipo_conocido` | Solo existen en `fuego`. |
| Lote de importación | `batch_id` → `import_batches` | no por fila; tabla `ingestas` (fecha de carga, descripción, cobertura hasta, filas) | **No.** Más simple. |

### Distritos: `districts` (suyo) frente a `fuego.areas` (nuestro)

| | `districts` | `fuego.areas` (tipo `distrito`) |
|---|---|---|
| Clave | `code` (único) | `area_id` = `distrito-01` … `distrito-15`; `codigo` = 1…15; en detecciones `distrito_gamc` = D1…D15 |
| Origen del polígono | el GeoJSON que él importe (campo `provisional`) | referencia abierta (ciudatoslab/Hogaria), **no oficial**: `es_oficial = false`, `geometria_original_oficial = false` |

**Pendiente de definir entre los dos:** la correspondencia de códigos entre sus distritos y `distrito-01` … `distrito-15` (son **15**, no 16). Mientras no esté definida, no se pueden cruzar ambos mundos por distrito.

## Diferencias de conteo que son por diseño (no errores)

- Camino A: **11.923** filas, porque cubre el rectángulo que envuelve al parque y al municipio (con 0,02° de margen). `fuego.detecciones`: **6.157** filas, porque solo cuenta lo que cae **dentro** del polígono del parque o del municipio. No deben coincidir.
- Una detección puede aparecer dos veces si la ven dos satélites. `fuego` compara actividad en **celdas-día** (una celda con detección en un día), no en filas.
- `observations` y `fuego.detecciones` son **representaciones solapadas de las mismas fuentes**: `fuego.detecciones` (6.157 filas) es el subconjunto territorial analizado de las 11.923 del camino A (se comprobó: las 6.157 están contenidas en las 11.923; las otras 5.766 están en el rectángulo de descarga pero fuera de los polígonos del análisis). **No sumar cifras de una con la otra**. Para el mapa en vivo, `observations`; para series, calendario y alertas, `fuego`.

## Qué cambios acordados en su importador dejan estas dos piezas alineadas

1. Guardar el tipo de detección (`detection_type`) y filtrar el tipo 0 en las consultas (cambio 2).
2. Cuando llegue el dato estándar, reemplazar las filas provisionales (NRT) **por rango de fechas**, no por clave (cambio 1): parte de las filas NRT no coincide con su versión estándar.
3. Agrupar «por día» con hora de Bolivia (UTC−4) cuando se muestren días o meses.
