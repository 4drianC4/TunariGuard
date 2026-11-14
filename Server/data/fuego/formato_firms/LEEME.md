# Nuestros datos en el formato original de NASA FIRMS

Para que el servidor de TunariGuard (`POST /api/v1/ingestion/csv`) los cargue **tal cual**, sin cambiar su esquema.

| Archivo | Filas | Satélites | Periodo |
|---|---|---|---|
| `firms_modis_cochabamba.csv` | 1.614 | Terra, Aqua | 2001-08 a 2026-10 |
| `firms_viirs_cochabamba.csv` | 10.309 | Suomi-NPP (`N`), NOAA-20 (`N20`), NOAA-21 (`N21`) | 2012-04 a 2026-10 |

Columnas idénticas a las de los CSV de FIRMS (MODIS: `brightness`, `bright_t31`; VIIRS: `bright_ti4`, `bright_ti5`) más `type`.

## Cómo cargarlos
```bash
curl -F file=@firms_modis_cochabamba.csv -F dataset="FIRMS MODIS Cochabamba 2001-2026" http://localhost:3000/api/v1/ingestion/csv
curl -F file=@firms_viirs_cochabamba.csv -F dataset="FIRMS VIIRS Cochabamba 2012-2026" http://localhost:3000/api/v1/ingestion/csv
```
Son datos **reales** (`origin` = `REAL`, el valor por defecto). Es seguro repetir la carga: no duplica.

## Qué contienen y qué no
- **Solo el rectángulo que cubre el Parque Nacional Tunari y el municipio de Cochabamba** (con 0,02° de margen). No es toda Bolivia.
- **Solo el filtro principal del análisis:** tipo de detección 0 (vegetación) y confianza distinta de «baja». Los demás tipos y las confianzas bajas no están.
- **Hay 699 filas NRT** (provisionales; su `version` termina en `NRT`, por ejemplo `2.0NRT`). NASA las reprocesa semanas o meses después. Cuando se cargue el dato estándar de esas mismas fechas, una parte **no coincidirá** con su versión NRT y se contaría dos veces: reemplace por **rango de fechas** las filas cuya `version` contiene `NRT`.
- NOAA-21 (`N21`) solo existe desde 2026 en estos archivos y **no entra a nuestro índice armonizado** (ver `datos/fuentes_satelitales.csv`, columna `entra_al_indice`, del esquema `fuego`).
- Esto es el **dato crudo**: no trae nuestra armonización (celdas de 1 km, factores entre satélites, series ni alertas), que está en las tablas del paquete SQL.
