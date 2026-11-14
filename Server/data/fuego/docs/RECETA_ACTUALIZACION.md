# Receta: mantener `detecciones` al día (para implementarla sin Python)

Hay dos formas de actualizar la tabla `detecciones` con datos recientes de FIRMS:

- **A. Usar nuestro comando** (necesita Python en el servidor): `python actualizar_detecciones.py` baja, estandariza y deja `datos_prueba/detecciones_2026.csv`; luego `psql -d BASE -v ON_ERROR_STOP=1 -f sql/05_cargar_novedades.sql`.
- **B. Implementarlo en tu propio lenguaje** siguiendo esta receta. Al final, la carga la hace el mismo `sql/05_cargar_novedades.sql`, o la misma regla de reemplazo.

Frecuencia recomendada: **cada ~3 horas**. Los datos llegan a FIRMS 1 a 3 horas después de que el satélite pasa. No hace falta clave.

## 1. De dónde bajar

Cuatro archivos regionales de Sudamérica, públicos, sin clave. Hay versión de las últimas **24 h, 48 h y 7 d** (cambia `{v}`). Se recomienda **48 h** (el solape no duplica filas):

| Satélite | URL |
|---|---|
| MODIS (Terra y Aqua) | `https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_South_America_{v}.csv` |
| VIIRS Suomi-NPP | `https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_{v}.csv` |
| VIIRS NOAA-20 | `https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_{v}.csv` |
| VIIRS NOAA-21 | `https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_{v}.csv` |

- **Suomi-NPP ya llega vacío** (dejó de entregar datos el 1 de noviembre de 2026): no es un error, es el fin de la misión.
- Columnas VIIRS: `latitude, longitude, bright_ti4, scan, track, acq_date, acq_time, satellite, confidence, version, bright_ti5, frp, daynight`. MODIS cambia `bright_ti4/ti5` por `brightness/bright_t31`.
- **Estos archivos no traen la columna `type`** ni `instrument`.
- Para fechas de más de 7 días atrás hay que usar la API de FIRMS con una MAP_KEY gratuita (`/api/area/csv/{MAP_KEY}/{FUENTE}/{oeste,sur,este,norte}/{días}/{fecha}`); no está cubierto por esta receta.

## 2. Cómo convertir cada fila a una fila de `detecciones`

| Columna de `detecciones` | Regla |
|---|---|
| `fecha_hora_utc` | `acq_date` + `acq_time` (formato HHMM, rellenar con ceros a 4 dígitos), en UTC |
| `fecha_hora_bo` | `fecha_hora_utc` menos 4 horas |
| `fecha_bo` | la fecha de `fecha_hora_bo` |
| `fuente` | según `satellite`: `T` → `MODIS-Terra`, `A` → `MODIS-Aqua`, `N` → `VIIRS-Suomi-NPP`, `N20` → `VIIRS-NOAA-20`, `N21` → `VIIRS-NOAA-21` |
| `sensor` / `plataforma` | `MODIS` o `VIIRS` / `Terra`, `Aqua`, `Suomi-NPP`, `NOAA-20`, `NOAA-21` |
| `lat`, `lon` | `latitude`, `longitude` |
| `confianza_original` | `confidence` tal cual |
| `confianza_clase` | VIIRS: `low` → `baja`, `nominal` → `nominal`, `high` → `alta`. MODIS (numérica): 0–29 `baja`, 30–79 `nominal`, 80–100 `alta`. **Descarta las `baja`** |
| `frp_mw`, `dia_noche` | `frp`, `daynight` |
| `tipo` | no viene: **asumir 0** |
| `origen_dato` / `tipo_conocido` | `NRT` / `false` |
| `id_deteccion` | primeros 16 caracteres hexadecimales del SHA-1 de `fuente|AAAA-MM-DDTHH:MM|lat|lon`, con la hora en **UTC** y `lat`, `lon` con **5 decimales** |
| `cell_id` | pasar el punto a UTM 20S (EPSG:32720). `col = floor((x - origen_x) / 1000)`, `fila = floor((y - origen_y) / 1000)`, `cell_id = '32720_' + col + '_' + fila`. El origen está en `parametros` (`origen_grilla_x_m`, `origen_grilla_y_m`). La celda **debe existir** en `celdas_1km` (ya trae toda la grilla del parque y el municipio) |
| `en_parque_tunari`, `en_municipio_cochabamba` | el punto está dentro de la geometría de `parque-tunari` / `municipio-cochabamba` de la tabla `areas` |
| `distrito`, `distrito_area_id` | el distrito (`distrito-01` … `distrito-15`) cuya geometría contiene el punto; `distrito` = `'Distrito N'` |
| `municipio_parque` | solo si está en el parque: nombre del municipio (`tipo = 'municipio_parque'` en `areas`) que contiene el punto |
| `zona_municipio` | solo si está en el municipio: `Dentro del Parque Tunari`, `Franja periurbana (≤ 2 km del parque)` o `Resto del municipio` |
| `distancia_al_parque_km` | 0 si está en el parque; si no, la distancia al polígono del parque en km |
| `fuente_persistente_probable` | `true` si ya hay detecciones marcadas con `true` en esa misma celda; si no, `false` |
| Vacías | `evento_id_tunari`, `evento_id_cbba`, `distrito_gamc`, `comuna_gamc`, `zona_cota2750_gamc`, `periurbano_gamc`, `periurbano_detalle_gamc`: las llena el análisis por lotes |

**Conserva solo** las detecciones dentro del parque o del municipio (el resto de Bolivia no se carga) y **solo las posteriores a `parametros.cobertura_hasta`**.

## 3. Cómo cargarlas (idempotente)

`sql/05_cargar_novedades.sql` hace, en **una transacción**:
1. Lee `datos_prueba/detecciones_2026.csv` en una tabla temporal.
2. **Borra** las filas con `origen_dato = 'NRT'` de la tabla cuyas fechas caen en el rango del archivo (y son posteriores a `cobertura_hasta`).
3. **Inserta** el archivo (`ON CONFLICT (id_deteccion) DO NOTHING`).

Por eso se puede ejecutar cada pocas horas sin duplicar. **Nunca toca** fechas anteriores o iguales a `cobertura_hasta`: esas ya pasaron por el análisis completo.

Si la implementas por tu cuenta, respeta la misma regla: **reemplazo por rango de fechas, no por `id_deteccion`**, porque parte de las filas NRT no coincide con su versión estándar.

## 4. Cuidados

- Las filas NRT son **provisionales**: NASA las reprocesa semanas o meses después y puede cambiarlas o quitarlas. Muéstralas con la advertencia correspondiente (`origen_dato = NRT`).
- **No hay tipo de detección** en lo NRT (se asumió 0).
- **Un mismo fuego puede aparecer dos veces** si lo ven dos satélites (pasan por el mismo lugar con menos de una hora de diferencia): cuenta **celdas-día**, no filas.
- **NOAA-21 es solo detección**: no entra al índice (ver `datos/fuentes_satelitales.csv`, columna `entra_al_indice`).
- Vigila los avisos: una fuente cuya última detección tiene más de ~30 horas puede haber dejado de actualizarse. Compruébalo antes de dar «sin actividad» como respuesta: **ausencia de datos no es ausencia de fuego**.
- Estas novedades **no entran** en la serie mensual, el índice ni las alertas mensuales hasta que se vuelva a ejecutar el análisis por lotes. Para el mes en curso existe la tabla `alerta_mes_en_curso` (se genera con `python actualizar_detecciones.py --alerta` y se carga con `sql/06_cargar_alerta_mes_en_curso.sql`).
