# Paquete de datos para Tunari Guard (solo CSV y SQL)

## Para Adri, en un minuto

**Léelo primero: `docs/COMPATIBILIDAD_CON_TUNARIGUARD.md`.** Dice qué coincide y qué NO con tus tablas, campo por campo.

**Qué es:** un esquema aparte, `fuego` (PostgreSQL 16 + PostGIS 3.4), con todo ya calculado: detecciones del parque y del municipio de Cochabamba, series e índice por área, alertas históricas y la alerta del mes en curso. **No pisa tus tablas** (`observations`, `districts`, `import_batches`): este paquete **no es idéntico** a ellas, y por eso hay dos caminos. Versión del esquema: **2026.11.13-6**.

**Los dos caminos:**
- **A. Detecciones crudas en el formato de FIRMS** (`formato_firms/`, 2 CSV, 11.923 filas): coinciden con lo que tu importador `POST /api/v1/ingestion/csv` ya lee, **sin cambiar tu esquema para cargarlos**. Ojo: la columna `type` solo quedará dentro de `raw` hasta que agregues `detection_type`. Si repites la carga, esas filas se omiten como duplicadas (no se vuelven a insertar). Opcional: sirven para llenar tu `observations` con la historia.
- **B. Esquema `fuego`** (SQL + 17 CSV): análisis ya calculado. **No coincide** con tus tablas; es aparte.

**Qué tienes que hacer:**
1. Cargarlo en una base de desarrollo (3 comandos, abajo).
2. Hacer endpoints de lectura sobre `fuego`: el contrato está en `docs/openapi.yaml` y cada endpoint se resuelve con una consulta SQL. Empieza por `/areas`, `/areas/{id}/calendario`, `/areas/{id}/alertas`, `/areas/{id}/alerta-mes-en-curso` y `/detecciones`.
3. Mostrar junto a cada cifra las advertencias de `docs/advertencias.json`, y la columna `calidad_indice` cuando muestres el índice.
4. En tu importador: cuando llegue el dato estándar de FIRMS, reemplazar las filas provisionales (NRT) **de ese rango de fechas** (no por id), y guardar el tipo de detección filtrando el tipo 0.
5. Mapear tus distritos a `distrito-01` … `distrito-15` (son **15**).

**Qué NO tienes que hacer:** recalcular la armonización, el índice o las alertas (llegan hechos); tocar el factor 2,87; ni **modelar las tablas `fuego` en Prisma** al principio: pueden consultarse con SQL parametrizado, y el esquema `fuego` se instala igual con los 3 comandos de abajo. Tu ingesta en tiempo real sigue siendo tuya. Para mostrar un área usa `areas.nombre_visible`, no `nombre`.

**Ojo con dos cosas:** (1) una detección **no es un incendio confirmado**; (2) `observations` (tuya) y `fuego.detecciones` (nuestra) son **representaciones solapadas de las mismas fuentes**: `fuego.detecciones` (6.157 filas) es el subconjunto territorial analizado de las 11.923 del camino A (rectángulo de descarga). No sumes cifras de una con la otra.

> **Cárgalo todo, prioriza `detecciones`:** el script carga los 17 CSV juntos (hay claves entre tablas), pero en la API empieza por `fuego.detecciones`; el resto lo consultas después.
---

## Cómo cargarlo
Necesitas PostgreSQL 16 con PostGIS 3.4 y un usuario que pueda ejecutar `CREATE EXTENSION postgis` (el script `01` lo hace; si ya la tienes instalada, no pasa nada). Desde **esta carpeta**, en este orden:

```
psql -d TU_BASE -v ON_ERROR_STOP=1 -f sql/01_esquema.sql
psql -d TU_BASE -v ON_ERROR_STOP=1 -f sql/02_vistas_y_funciones.sql
psql -d TU_BASE -v ON_ERROR_STOP=1 -f sql/03_cargar_datos.sql
```

`03` carga todo en **una sola transacción** (si algo falla, no queda nada a medias) y ejecuta `04` como validación. Hay que ejecutarlo desde esta carpeta porque usa rutas relativas (`datos/...`, `sql/04_validar_carga.sql`). Es solo para desarrollo y pruebas: borra y vuelve a llenar las tablas.

Para cargar las novedades (cuando haya archivo nuevo): `psql -d TU_BASE -v ON_ERROR_STOP=1 -f sql/05_cargar_novedades.sql` (desde esta carpeta). Cómo generarlas sin Python: `docs/RECETA_ACTUALIZACION.md`.

Para volver a empezar: `DROP SCHEMA fuego CASCADE;` y repetir los tres pasos.

---

## Qué hace cada SQL (carpeta `sql/`)

| Archivo | Qué hace |
|---|---|
| `01_esquema.sql` | **Crea la estructura.** Activa PostGIS, crea el esquema `fuego` y las 19 tablas con sus claves, relaciones, índices espaciales y comentarios en cada columna. Las geometrías (`geom`) se generan solas desde el texto WKT o desde lat/lon. Es lo primero que se ejecuta |
| `02_vistas_y_funciones.sql` | **Crea las consultas listas para usar** (ver abajo). No contiene datos |
| `03_cargar_datos.sql` | **Carga los 17 CSV** en el orden correcto de las dependencias, dentro de una transacción. Vacía las tablas antes de cargar y al final llama a `04`. Si todo va bien, hace `COMMIT` |
| `04_validar_carga.sql` | **Comprueba que la carga es correcta.** Se ejecuta dentro de `03`: cuenta las filas de cada tabla, revisa que las geometrías sean válidas, que las probabilidades estén entre 0 y 1, que los niveles de alerta respeten sus umbrales, que no haya eventos huérfanos, que el catálogo de satélites sea coherente y que `serie_armonizada_area` coincida con `serie_mensual` en todas las áreas. Cualquier fallo revierte toda la carga |
| `06_cargar_alerta_mes_en_curso.sql` | **Actualiza la alerta del mes en curso** desde `datos_prueba/alerta_mes_en_curso.csv` (upsert idempotente; conserva el historial por fecha de corte) |
| `05_cargar_novedades.sql` | **Carga incremental de detecciones nuevas** (después de la carga normal): lee `datos_prueba/detecciones_2026.csv`, **reemplaza las filas NRT del mismo rango de fechas** y nunca toca fechas anteriores a la cobertura. Es idempotente: se puede ejecutar cada pocas horas |

### Vistas y funciones que crea `02`

| Nombre | Para qué sirve |
|---|---|
| `v_calendario_mes_anio` | Datos del calendario térmico (mes × año) de cualquier área |
| `v_alertas_destacadas` | Meses con alerta (elevada, alta o muy alta) |
| `v_detecciones_por_area` | Cuántas detecciones tiene cada área |
| `pertenece_a_area(detección, área)` | Dice si una detección pertenece a un área. Una sola lógica para todos los tipos de área |
| `detecciones_por_area(...)` | Detecciones de un área, con filtros de fechas y satélite, y paginación |
| `contar_detecciones_por_area(...)` | El total de la consulta anterior (para la cabecera de paginación) |
| `alertas_area(...)` | Alertas de un área, con filtros |
| `buscar_detecciones(polígono, ...)` | Detecciones dentro de un polígono dibujado por el usuario |
| `conteo_mensual_en_poligono(polígono, ...)` | Conteo mensual **bruto** por satélite dentro de un polígono |
| `serie_armonizada_poligono(polígono, ...)` | Índice armonizado mensual de un polígono dibujado. Lee el catálogo de satélites. Devuelve `pct_area_con_datos` y `sin_cobertura` (fuera de lo cargado el índice es `NULL`, **no significa cero incendios**) |
| `serie_armonizada_area(área, ...)` | Lo mismo para un área registrada, con la pertenencia oficial; coincide con `serie_mensual` |

---

## Qué tiene cada CSV (carpeta `datos/`)

### Las que necesitas para `detecciones` (el script las carga en este orden)

| CSV | Filas | Qué contiene |
|---|---|---|
| `areas.csv` | 31 | Territorios con su geometría: parque, municipio de Cochabamba, 15 distritos, 12 municipios que cruzan el parque y 2 zonas del GAMC (Cota 2750 y periurbanos). Trae la fuente del límite, si es oficial, cómo se obtuvo la geometría y una advertencia. **Ninguna geometría es el vector original de una institución** |
| `fuentes_satelitales.csv` | 5 | **Catálogo de satélites** (Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21). Cada satélite es una fila con sus fechas, su factor de conversión a la escala MODIS y un interruptor (`entra_al_indice`) que decide si cuenta en el índice. Agregar un satélite = agregar una fila |
| `celdas_1km.csv` | 3.791 | Grilla de 1 km × 1 km (UTM 20S) sobre **todo** el parque y el municipio, con la geometría de cada celda. Cada detección cae en una celda |
| `eventos.csv` | 2.577 | «Eventos candidatos»: grupos de detecciones cercanas en el tiempo y el espacio, con su duración, tamaño y potencia total |
| **`detecciones.csv`** | **6.157** | **La tabla principal.** Una fila por detección de calor, de **todos** los satélites: fecha y hora (UTC y Bolivia), coordenadas, satélite, confianza, potencia (FRP), día/noche, celda, distrito, si está en el parque o en el municipio, si es fuente persistente, y su clasificación oficial del GAMC. Hasta el 31 de octubre de 2026 (2026 hasta julio/agosto es estándar y después NRT provisional) |
| `detecciones_area.csv` | 393 | A qué zonas oficiales del GAMC (Cota 2750 y periurbanos) pertenece cada detección |

### Para después (análisis ya calculado, no necesarias para `detecciones`)

| CSV | Filas | Qué contiene |
|---|---|---|
| `serie_mensual.csv` | 9.519 | Índice armonizado de actividad por área y mes. De aquí sale el calendario mes × año |
| `serie_agregada.csv` | 128 | Lo mismo por trimestre y año, con bandas de incertidumbre (solo parque) |
| `alertas_mensuales.csv` | 5.207 | Alertas: qué meses fueron inusualmente altos, con su probabilidad, nivel y una lectura en palabras |
| `recurrencia_celda.csv` | 2.014 | En cuántos años hubo fuego en cada celda (los «sectores» recurrentes) |
| `puntos_calientes_gi.csv` | 4.138 | Celdas con concentración significativa de fuego (estadístico Getis-Ord Gi*) |
| `conglomerados_gi.csv` | 20 | Grupos de esas celdas |
| `tendencias.csv` | 5 | Pruebas de tendencia a largo plazo (no se detectó una tendencia significativa) |
| `casos_documentados.csv` | 7 | Siete incendios publicados en prensa, usados como comprobación (sin coordenadas) |
| `alerta_mes_en_curso.csv` | 48 | **Alerta del mes en curso**: lo acumulado en los primeros días del mes frente al mismo tramo de años anteriores (no pronostica). Se actualiza con `sql/06_cargar_alerta_mes_en_curso.sql` |
| `factores_satelites.csv` | 16 | Factores de conversión entre todos los pares de satélites, con su intervalo de confianza (referencia) |
| `parametros.csv` | 30 | Parámetros del análisis: fecha de cobertura de los datos, factores, umbrales de alerta, versión del esquema |

### Datos de 2026 (`datos_prueba/detecciones_2026.csv`, no se carga por defecto)

**Novedades** posteriores a la cobertura (hoy 9 detecciones NRT del 1 al 11 de noviembre de 2026) en el **mismo formato** que `detecciones.csv`, para probar la actualización incremental. 2026 hasta el 31 de octubre ya está dentro de `detecciones.csv`. Cárgalas después de la carga normal, desde esta carpeta:

```
psql -d TU_BASE -v ON_ERROR_STOP=1 -f sql/05_cargar_novedades.sql      # método recomendado: transaccional e idempotente
```

---

## Lo que tienes que saber de `detecciones`

- **Solo parque y municipio de Cochabamba.** Fuera de esas áreas no hay datos.
- **`origen_dato`:** `estandar` (definitivo) o `NRT` (casi tiempo real, **provisional**). Los NRT no traen el tipo de detección (se asumió tipo 0; `tipo_conocido = false`). Cuando NASA publique el dato estándar (las filas NRT de 2026 son provisionales), **borra las filas NRT de un rango de fechas y carga las estándar de ese rango**. No reemplaces por `id_deteccion`: parte de las filas NRT no coincide con su versión estándar.
- **En las novedades (`datos_prueba`) siete columnas vienen vacías** (`evento_id_tunari`, `evento_id_cbba`, `distrito_gamc`, `comuna_gamc`, `zona_cota2750_gamc`, `periurbano_gamc`, `periurbano_detalle_gamc`): dependen de un análisis que se corre después. Las filas de 2026 hasta el 31 de octubre sí las traen llenas.
- **Calidad del índice:** solo el Parque Tunari está calibrado (`calidad_indice = calibrado_localmente_en_tunari`). En todas las demás áreas el índice es VIIRS reescalado con el factor del Tunari, sin validación local (`aproximado_factor_transferido`), y **antes de febrero de 2012 no hay valor** (`no_comparable`, NULL: mostrarlo en gris, nunca como cero). Detalle en `docs/advertencias.json` y en los comentarios de cada columna del esquema (`COMMENT ON COLUMN`).
- **Un mismo fuego puede aparecer dos veces** si lo ven dos satélites (pasan por el mismo lugar con menos de una hora de diferencia). Para comparar actividad usa **celdas-día** (una celda con detección en un día), no el número de filas.
- **Suomi-NPP dejó de entregar datos a inicios de noviembre de 2026** (FIRMS indica cobertura hasta el 2 de noviembre). NOAA-21 está en el catálogo pero **desactivado**: tiene una discontinuidad sin resolver y solo sirve como detección para el mapa (hay 223 detecciones suyas de 2026).
- Los factores entre satélites están calibrados en el Tunari: en otros territorios son transferidos y no se pudieron validar.
- Las columnas `geom` se calculan solas; no están en los CSV (los CSV traen `geom_wkt` o lat/lon).
- Las cifras del índice y las alertas llegan hasta el 31 de octubre de 2026 (`parametros.cobertura_hasta`).
- **Series mensuales: una fila ausente NO es un cero.** En `serie_mensual` el parque y los `mun-*` empiezan en agosto de 2001 y el resto de áreas en enero de 2001; en cambio las funciones `serie_armonizada_area` y `serie_armonizada_poligono` arrancan en noviembre de 2000 (inicio del catálogo de satélites), así que para el parque devuelven 9 meses más que la tabla. Para series temporales o comparaciones entre áreas usa un **rango común explícito** (por ejemplo desde 2013). Un calendario común con estado por mes queda para una versión futura.

- **Nombres en el mapa:** use `areas.nombre_visible` (no `nombre`). En los 12 `mun-*` la geometría es el municipio completo, pero las cifras son solo del sector del Tunari dentro de ese municipio (`alcance_estadistico = solo_sector_del_parque`): se muestran como «Sector del Tunari en Sacaba», etc.

## Archivos de este paquete

- `sql/`: 01 esquema, 02 vistas y funciones, 03 carga (llama a 04, validación), 05 novedades, 06 alerta del mes en curso.
- `datos/`: los 17 CSV.
- `datos_prueba/`: novedades de ejemplo para probar 05 y 06.
- `formato_firms/`: camino A (2 CSV en formato FIRMS + su LEEME).
- `docs/openapi.yaml`: contrato de la API propuesta. `docs/advertencias.json`: textos que deben acompañar las cifras. `docs/RECETA_ACTUALIZACION.md`: cómo generar novedades sin Python. `docs/COMPATIBILIDAD_CON_TUNARIGUARD.md`: qué coincide y qué no con tus tablas. `docs/diccionario_datos.md`: todas las columnas de todas las tablas.
