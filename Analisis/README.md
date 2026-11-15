# Análisis de datos de Tunari Guard

Armonización satelital de detecciones de calor **NASA FIRMS (MODIS + VIIRS)** para el monitoreo de incendios en el **Parque Nacional Tunari** y el **municipio de Cochabamba** (15 distritos), con series de tiempo, alertas estadísticas y una proyección simulada.

> **Una detección satelital de calor no es un incendio confirmado.** Los índices están en *celdas-día MODIS-equivalentes*: no son hectáreas ni número de incendios. Los límites de parque, municipios y distritos son de referencia abierta, **no oficiales**.

**Datos hasta el 31 de octubre de 2026.** Las detecciones provisionales (NRT) de agosto a octubre de 2026 pueden cambiar cuando NASA publique el producto estándar.

---

## 1. Qué hay en esta carpeta

```
Analisis/
├── README.md              este archivo
├── requirements.txt       librerías de Python de los notebooks
├── notebooks/             12 notebooks ya ejecutados (se leen; ver el aviso de la sección 7)
└── resultados/
    ├── series/            67 CSV: serie armonizada, alertas, eventos, mapas de calor, validaciones
    ├── pronostico/        17 archivos: modelos de series de tiempo y el modelo elegido
    ├── geografia/         9 archivos: polígonos de referencia y capas calculadas (GeoJSON)
    └── clima/             2 JSON de ERA5 (lluvia y temperatura diaria)
```

Los datos que consume el backend **no están aquí**: están en `Server/data/fuego/` (el paquete de tablas) y `Server/data/demo/` (la proyección simulada). La sección 5 los explica.

---

## 2. Qué se hizo y qué resultó

**Datos.** Detecciones de NASA FIRMS de 2001 a 2026: MODIS (Terra y Aqua, ~1 km) y VIIRS (Suomi-NPP, NOAA-20 y NOAA-21, ~375 m), con tipo 0 (vegetación) y confianza distinta de baja. En el rectángulo que cubre el parque y el municipio hay **11.923 detecciones** (1.614 de MODIS y 10.309 de VIIRS). Dentro de los polígonos son **6.157**: 5.646 en el parque, 680 en el municipio y 169 en ambos.

**Armonización.** VIIRS ve más fuegos pequeños que MODIS, así que sus conteos no se pueden sumar tal cual. Se trabaja con **celdas-día** (una celda de 1 km con detección en un día, contada una vez; día de Bolivia = UTC − 4 h) y se convierte VIIRS a escala MODIS con un factor de **2,8715** (media geométrica, ajustada con 2013–2025; IC 95 %: 2,64–3,30). Al reconstruir MODIS desde VIIRS en 2022–2025, el error fue de **40,5 % mensual, 27,0 % trimestral y 16,3 % anual**: por eso los resultados se presentan por trimestre o año. Suomi-NPP dejó de entregar datos a inicios de noviembre de 2026 (fecha aproximada); NOAA-20 la continúa con un factor de enlace ≈ 1,0 (rango 0,94–1,10), **medido pero todavía no aplicado**.

**Actividad del Tunari (303 meses, agosto de 2001 a octubre de 2026).** Hay una temporada marcada de **julio a octubre**, con pico en agosto. Los años más fuertes fueron **2016 (95,1)** y **2020 (94,4)**; el más flojo de 2013 a 2025, 2018 (15,0). **No hay tendencia demostrable** (Mann–Kendall, ninguna serie con p < 0,25): no se puede decir que el fuego aumente ni disminuya.

**Alertas mensuales.** Cada mes se compara con los meses del mismo nombre de años anteriores, con una regresión binomial negativa estacional. Niveles: *elevada* (p ≤ 0,10, vigilancia), *alta* (p ≤ 0,05) y *muy alta* (p ≤ 0,01), estas dos últimas «candidatas a verificación». En el parque, de 303 meses: **2 muy altas, 9 altas, 5 elevadas**, 167 normales y 120 sin historial suficiente (`sin_baseline`: es «sin valor», no cero). Frente a un z-score clásico, el modelo queda mejor calibrado (9,4 % / 7,3 % / 1,0 % de los meses en cada umbral, contra 16,7 % / 12,5 % / 8,3 %).

**Dónde.** Hay **16 conglomerados significativos** de celdas calientes en el parque (Gi*, radio 2,5 km): el mayor, de 147 celdas, en **Sacaba**, y el segundo, de 110, en **Villa Tunari**. Por municipio del parque lideran Morochata (1.105 detecciones) y Sacaba (1.067). En los distritos de Cochabamba destacan el **Distrito 9 (217)** y el **Distrito 13 (201, todo dentro del parque)**.

**Eventos.** Las detecciones cercanas en tiempo y espacio se agrupan en unos **2.700 eventos candidatos** (`tunari_eventos.csv`). Son agrupaciones algorítmicas, no partes oficiales.

**Contraste con 7 incendios documentados.** En los 7 hay alguna detección cercana, pero eso lo cumple el 93 % de los días de temporada, así que no demuestra nada. En 5 de 7 el mes destaca frente a la temporada y en 4 de 7 frente a su propio mes. No hay verificación de campo.

**Clima (ERA5).** Con el balance hídrico de 3 meses, el modelo de anomalías mejora un 14 % (CRPS). Los meses en alerta tendieron a tener menos lluvia de lo normal. No se integró al sistema porque depende de una fuente externa.

**Proyección.** Se compararon SARIMA, SARIMAX, Prophet, LSTM y otros. El elegido es la **regresión binomial negativa estacional**: el de menor error mensual entre los que se pueden usar sin conocer el futuro.

| Modelo | WAPE mensual | MAE mensual | WAPE anual | ¿Uso real? |
|---|---|---|---|---|
| **Binomial negativa estacional** | **53,0 %** | **2,41** | **41,2 %** | Sí |
| Prophet sin clima | 57,1 % | 2,60 | 44,0 % | Sí |
| SARIMA | 60,4 % | 2,74 | 45,4 % | Sí |
| LSTM sin clima | 63,8 % | 2,90 | 54,3 % | Sí |
| SARIMAX con clima real futuro | 56,6 % | 2,57 | 32,3 % | No (usa el clima del mes que pronostica) |

La banda del 90 % contuvo el 91,5 % de los meses (horizontes de hasta 14 meses). Para **2027** el modelo espera unas **47 celdas-día** (rango 24–77) y, acumulado 2027–2031, unas **234** (172–305). A 2–5 años la banda es optimista (cubrió entre 50 % y 83 % de los años) y el error anual va de 30 % a 51 %. El modelo tiende a quedarse corto en las temporadas extremas (sesgo −19 %) y **no predice incendios, fechas ni ubicaciones**: es un escenario típico.

---

## 3. Los notebooks (`notebooks/`)

| Notebook | Qué hace |
|---|---|
| `01_estandarizar_firms_bolivia` | Une MODIS y VIIRS en una tabla maestra con un esquema común |
| `02_series_de_tiempo_bolivia` | Series de tiempo de las detecciones en Bolivia |
| `03_recorte_tunari_y_variable_armonizacion` | Recorte del Tunari y grilla UTM de 1 km; elección de la variable de armonización |
| `04_grilla_1km_y_eventos_tunari` | Eventos candidatos sin encadenamiento ilimitado |
| `05_calibracion_y_serie_armonizada_tunari` | Calibración MODIS/VIIRS y serie armonizada |
| `06_anomalias_y_alertas_tunari` | Anomalías y alertas estadísticas |
| `07_distritos_y_calendario_tunari` | Calendario de recurrencia y distritos |
| `08_municipio_cochabamba_y_distritos` | Municipio de Cochabamba y sus 15 distritos |
| `09_pronostico_series_de_tiempo_tunari` | Pronóstico: referencias, binomial negativa, ETS/SARIMA y tendencia anual |
| `10_sarima_sarimax_prophet_lstm_tunari` | Pruebas de estacionariedad, SARIMA, SARIMAX con clima, Prophet y LSTM |
| `11_pronostico_binomial_negativa_tunari` | El modelo elegido: métricas, calibración, diagnóstico y proyección hasta 2031 |
| `Tunari_Armonizacion_Completo` | Notebook único: el recorrido completo y una tabla de qué se verificó |

---

## 4. Los resultados (`resultados/`)

**`series/` (67 CSV)**
- *Serie armonizada del Tunari (12):* `tunari_serie_mensual_armonizada` (303 meses), `…trimestral…`, `…anual…`, los factores de conversión y su comparación.
- *Alertas (8):* nivel de alerta mensual del parque, municipios y Cochabamba, meses destacados y estado del mes en curso.
- *Dónde (7):* recurrencia por celda de 1 km, puntos calientes y conglomerados.
- *Eventos (6):* catálogo de eventos candidatos y su sensibilidad a los criterios de distancia y tiempo.
- *Por distrito, municipio y zona (13):* resúmenes, series mensuales y calendarios.
- *Validación y robustez (16):* error de la armonización, calibración de las alertas, tendencia, clima, métodos alternativos y los 7 incendios documentados.
- *Conteos base (5):* detecciones por satélite por día, mes y año, y sensibilidad al filtro de confianza.

**`pronostico/` (17).** Notebook 09: pronósticos y comparación de modelos. Notebook 10: modelos avanzados, estacionariedad y clima mensual. Notebook 11 (`bn_*`): métricas, parámetros, pronóstico mensual y anual y validación del modelo elegido. `metricas_desempeno_series_tunari.csv` junta el MAE, el RMSE y el MAPE de todos los modelos.

**`geografia/` (9).** Polígonos de referencia (parque, municipios, municipio de Cochabamba y 15 distritos), recurrencia por celda, puntos calientes, metadatos de la grilla y las fuentes de cada capa.

**`clima/` (2).** Lluvia y temperatura diaria de ERA5 (vía Open-Meteo): una versión corta y otra de 2000 a 2026.

---

## 5. Los datos del backend (`Server/data/`)

**`Server/data/fuego/datos/`: 17 tablas CSV** que carga el backend (`npm run fuego:setup`):

| Tabla | Filas | Contenido |
|---|---|---|
| `areas` | 31 | Áreas vigiladas: parque, municipio, distritos, municipios y zonas |
| `detecciones` | 6.157 | Detecciones dentro del parque o del municipio, con satélite, fecha, hora, área y celda |
| `detecciones_area` | 393 | Enlace entre áreas y detecciones, con el evento y la marca de fuente persistente |
| `serie_mensual` | 9.519 | Índice armonizado mensual por área |
| `serie_agregada` | 128 | Índice trimestral y anual con intervalos de incertidumbre |
| `alertas_mensuales` | 5.207 | Alerta mensual por área, 2001–oct 2026 |
| `alerta_mes_en_curso` | 48 | Estado del mes en curso, con 3 escenarios de enlace NOAA-20 |
| `eventos` | 2.577 | Eventos candidatos por área |
| `celdas_1km` | 3.791 | Grilla de 1 km (UTM 20S) con su geometría |
| `recurrencia_celda` | 2.014 | Cuántas veces y en qué años detectó fuego cada celda |
| `puntos_calientes_gi` | 4.138 | Estadístico Gi* por celda |
| `conglomerados_gi` | 20 | Conglomerados significativos |
| `factores_satelites` | 16 | Factores de conversión entre satélites, con su intervalo |
| `fuentes_satelitales` | 5 | Satélites, años, resolución y si entran al índice |
| `tendencias` | 5 | Pruebas de tendencia (Mann–Kendall y pendiente de Sen) |
| `casos_documentados` | 7 | Incendios documentados y su contraste con los datos |
| `parametros` | 30 | Parámetros del análisis (factor, umbrales, cobertura) |

`Server/data/fuego/formato_firms/` trae las mismas detecciones en el formato original de NASA (MODIS y VIIRS, más las novedades NRT de noviembre).

**`Server/data/demo/`: la proyección simulada.** Son 4.153 detecciones **inventadas** (14-nov-2026 a 2031) y `serie_proyeccion_mensual.csv` con lo esperado por el modelo y lo generado cada mes. Se generan con el índice esperado de la binomial negativa × la relación histórica entre detecciones VIIRS y celdas-día de cada mes (2019–2025), sorteando el conteo con la distribución del modelo. Las coordenadas se desplazan unos 80 m y los satélites quedan como NOAA-20 y NOAA-21. Se cargan siempre con `origin=SIMULATED` y no deben entrar al análisis histórico.

---

## 6. Limitaciones

- El error anual medido ronda el 41 %: la cifra central no debe mostrarse sin su banda de incertidumbre.
- El índice mensual es solo indicativo (error cercano al 40 %); lo trimestral y lo anual son más confiables, y existen solo para el Tunari.
- El modelo no usa clima futuro ni memoria del mes anterior: los años proyectados repiten un patrón típico, y las diferencias entre ellos vienen del sorteo, no de una tendencia.
- Desde noviembre de 2026 los datos nuevos son de NOAA-20 (Suomi-NPP terminó); el factor de enlace está medido pero no aplicado.
- La validación tiene una fuga leve: el factor 2,8715 se ajustó con 2013–2025 (afecta por igual a todos los modelos).
- Las alertas son una señal estadística «candidata a verificación»: no hay validación de campo ni umbrales institucionales.

## 7. Cómo leer esta carpeta

Los notebooks están **ya ejecutados**: se leen con sus gráficos y resultados guardados. **No se pueden volver a ejecutar desde este repositorio**: leen datos crudos de NASA, archivos intermedios y scripts de apoyo del equipo de datos que no se incluyen aquí.

## 8. Fuentes, atribuciones y licencia

- **NASA FIRMS** (Fire Information for Resource Management System): detecciones MODIS y VIIRS.
- **OpenStreetMap** (© colaboradores de OpenStreetMap, ODbL): polígonos del parque y de los municipios. Los distritos vienen de una capa abierta (Hogaria / ciudatoslab).
- **ERA5** (Copernicus), consultado vía **Open-Meteo**: clima.
- **GAMC (Cochabamba):** las áreas `zona-cota-2750` y `periurbanos-gamc` de `areas.csv` se derivaron de imágenes de los servicios de mapas del GAMC (no son una descarga oficial de geometrías; exactitud no evaluada). Están marcadas `redistribucion_autorizada = no_confirmada`: **no se ha confirmado con el GAMC que se puedan redistribuir**.
- **Licencia:** pendiente de definir.
