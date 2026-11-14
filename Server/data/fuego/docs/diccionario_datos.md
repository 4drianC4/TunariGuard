# Diccionario de datos

Generado automáticamente desde la especificación (`exportar_para_backend.py`). Esquema PostgreSQL: `fuego`. Coordenadas: EPSG:4326 salvo la grilla (EPSG:32720).

**Regla de oro:** una fila de `detecciones` es una detección satelital de calor, no un incendio confirmado. Los eventos son agrupaciones algorítmicas de detecciones. Las alertas son señales estadísticas relativas al historial.

## `areas`

Territorios analizables: el parque, el municipio de Cochabamba, sus 15 distritos y los 12 municipios que cruzan el parque. Todas las demás tablas cuelgan de area_id.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Identificador estable. Ejemplos: parque-tunari, municipio-cochabamba, distrito-09, mun-sacaba. |
| `tipo` | text | parque | municipio | distrito | municipio_parque (municipio OSM que cruza el parque) | personalizada (definida con analizar_area.py). |
| `nombre` | text | Nombre de la entidad (en municipio_parque es el nombre del municipio OSM y se usa para asignar las detecciones: no lo cambie; para mostrar use nombre_visible). |
| `nombre_visible` | text | Nombre para mostrar en mapas y listas. En municipio_parque dice "Sector del Tunari en X" porque las cifras cuentan solo las detecciones del Parque Tunari asignadas a ese municipio, no todo el municipio. |
| `alcance_estadistico` | text | area_completa (cuenta todas las detecciones del polígono) | solo_sector_del_parque (municipio_parque: solo las detecciones dentro del Parque Tunari asignadas a ese municipio; la geometría es el municipio completo, pero las cifras son del sector del parque). |
| `codigo` | text | Código de origen (por ejemplo, número de distrito u osm_id). |
| `padre_area_id` | text | Área que contiene a esta (los distritos cuelgan de municipio-cochabamba). |
| `area_km2` | numeric(10,2) | Superficie del polígono en km2 (UTM 20S). |
| `area_en_parque_km2` | numeric(10,2) | Solo para municipio_parque y municipio: superficie dentro del parque. |
| `fuente_limite` | text | Origen del polígono (OpenStreetMap, ciudatoslab, unión de distritos). |
| `es_oficial` | boolean | true solo si la FUENTE del límite es una institución oficial (servicio del GAMC). NO implica que la geometría sea el vector original: ver geometria_original_oficial. |
| `geometria_original_oficial` | boolean | true solo si la geometría es el vector original publicado por la institución. false en todas las áreas de este paquete (las de GAMC son derivadas). |
| `metodo_derivacion` | text | Cómo se obtuvo la geometría: referencia abierta sin derivación, rasterización de una imagen WMS, geometría devuelta por GetFeatureInfo, o definida por el usuario. |
| `redistribucion_autorizada` | text | no_confirmada | referencia_abierta | responsabilidad_del_usuario. Mientras diga no_confirmada, no redistribuir la geometría fuera del proyecto. |
| `metodo_indice` | text | mixto_calibrado (promedio de MODIS y VIIRS convertido; solo el Parque Tunari, donde se calibró y se validó el factor) | viirs_reescalado (el resto de áreas: VIIRS convertido a unidades equivalentes de MODIS con el factor del Tunari; no es una armonización de dos sensores). |
| `origen_factor` | text | calibrado_en_tunari (el factor se calculó con los datos de esta misma área) | transferido_desde_tunari (el factor viene del Tunari y no se comprobó en esta área). |
| `validacion_local` | text | calibrada | no_disponible. En las áreas fuera del Tunari el factor no se pudo validar localmente porque MODIS registra muy pocas detecciones. |
| `comparabilidad_pre_2012` | text | comparable | no_comparable. no_comparable: antes de febrero de 2012 solo existía MODIS, que casi no registra detecciones en esa área, y el índice no es comparable con la era VIIRS (indice_modis_equivalente es NULL). |
| `advertencia` | text | Texto que debe acompañar al límite. |
| `geom_wkt` | text | Geometría en WKT, EPSG:4326. |
| `geom` | geometry(Geometry,4326) (generada) | Geometría PostGIS generada desde geom_wkt. |

Clave primaria: `area_id`.

## `fuentes_satelitales`

CATÁLOGO DE SATÉLITES y selector del índice armonizado. Una fila por satélite. Para agregar un satélite o cambiar cuáles alimentan el índice NO se cambia el esquema ni el código: se agrega o actualiza una fila (ver README, «Catálogo de satélites»). La función serie_armonizada_poligono lee estas columnas.

| Columna | Tipo | Descripción |
|---|---|---|
| `fuente` | text | Clave: MODIS-Terra, MODIS-Aqua, VIIRS-Suomi-NPP, VIIRS-NOAA-20, VIIRS-NOAA-21. Es el valor de detecciones.fuente. |
| `familia` | text | MODIS | VIIRS. El índice es el promedio de las familias activas en el mes. |
| `plataforma` | text | Satélite. |
| `resolucion_nominal_m` | integer | Resolución nominal del píxel en metros. |
| `primer_anio` | integer | Primer año con datos en la base (vacío si no hay datos cargados). |
| `ultimo_anio` | integer | Último año con datos en la base (vacío si no hay datos cargados). |
| `grupo_union` | text | Fuentes con el mismo grupo se UNEN (una celda-día cuenta una vez aunque la vean las dos). Terra y Aqua comparten el grupo MODIS; cada VIIRS tiene el suyo. |
| `entra_al_indice` | boolean | true si participa en el índice armonizado entre inicio_indice y fin_indice. Es el interruptor: cambiarlo cambia el índice de la función serie_armonizada_poligono. |
| `usa_en_alertas` | boolean | true si las alertas ENTREGADAS se calcularon con este satélite (hoy solo Suomi-NPP). Es informativo: el modelo de alertas se recalcula con el código del análisis. |
| `activo` | boolean | true si el satélite sigue entregando datos. |
| `inicio_indice` | date | Primer mes completo con el que el satélite puede entrar al índice. |
| `fin_indice` | date | Último mes que puede entrar al índice (vacío = sin fin). |
| `factor_a_modis` | double precision | Cuántas celdas-día de este satélite equivalen a 1 celda-día MODIS (MODIS = 1). El índice divide el conteo entre este factor. Calibrado en el Tunari: en otros territorios es aproximado. |
| `factor_ic95_bajo` | double precision | Límite inferior del intervalo del 95 % del factor (muestreo). |
| `factor_ic95_alto` | double precision | Límite superior del intervalo del 95 % del factor. |
| `factor_origen` | text | De dónde sale el factor (zona, periodo, estimador). |
| `nota` | text | Observación. |

Clave primaria: `fuente`.

## `celdas_1km`

Grilla común de 1 km (UTM 20S, EPSG:32720, origen fijo). El mismo cell_id sirve para todas las áreas.

| Columna | Tipo | Descripción |
|---|---|---|
| `cell_id` | text | Identificador 32720_col_fila. |
| `grid_col` | integer | Columna de la grilla: floor((x_utm - origen_x) / 1000). |
| `grid_row` | integer | Fila de la grilla: floor((y_utm - origen_y) / 1000). |
| `lon_centro` | numeric(9,5) | Longitud del centro de la celda. |
| `lat_centro` | numeric(8,5) | Latitud del centro de la celda. |
| `geom_wkt` | text | Polígono de la celda en WKT, EPSG:4326. |
| `geom` | geometry(Polygon,4326) (generada) | Geometría PostGIS generada desde geom_wkt. |

Clave primaria: `cell_id`.

## `eventos`

Eventos candidatos: grupos de detecciones cercanas (hasta 1,5 km y 2 días, con tope de 3 km de diámetro). NO son incendios confirmados.

| Columna | Tipo | Descripción |
|---|---|---|
| `evento_id` | text | TUNARI-00001 (parque) o CBBA-00001 (municipio). |
| `area_id` | text | Área en la que se calculó el catálogo. |
| `fecha_inicio` | date | Primer día con detecciones (hora de Bolivia). |
| `fecha_fin` | date | Último día con detecciones. |
| `detecciones` | integer | Número de detecciones del evento. |
| `celdas_1km` | integer | Celdas de 1 km distintas. |
| `frp_suma_mw` | double precision | Suma de la potencia radiativa (MW). |
| `frp_max_mw` | double precision | Máxima potencia radiativa (MW). |
| `duracion_dias` | integer | Días inclusivos. |
| `diagonal_bbox_km` | double precision | Diagonal de la caja que contiene al evento (solo catálogo del parque). |
| `es_multisensor` | boolean | true si lo vieron MODIS y VIIRS. |
| `fuentes` | text | Fuentes que lo detectaron, separadas por |. |

Clave primaria: `evento_id`.

## `detecciones`

Detecciones FIRMS ya filtradas (tipo 0 y confianza distinta de baja) dentro del parque o del municipio de Cochabamba. UNA FILA ES UNA DETECCIÓN, NO UN INCENDIO.

| Columna | Tipo | Descripción |
|---|---|---|
| `id_deteccion` | text | Hash estable de fuente + minuto UTC + lat + lon. Sirve como clave para no duplicar al cargar datos nuevos. |
| `fecha_hora_utc` | timestamp | Fecha y hora UTC de la adquisición. |
| `fecha_hora_bo` | timestamp | Fecha y hora de Bolivia (UTC-4). |
| `fecha_bo` | date | Fecha de Bolivia (usar para agrupar por día/mes). |
| `fuente` | text | Satélite de origen. |
| `sensor` | text | MODIS | VIIRS. |
| `plataforma` | text | Terra, Aqua, Suomi-NPP, NOAA-20 o NOAA-21. |
| `lat` | double precision | Latitud (EPSG:4326). |
| `lon` | double precision | Longitud (EPSG:4326). |
| `confianza_original` | text | Confianza tal como viene de FIRMS (MODIS 0-100; VIIRS l/n/h). |
| `confianza_clase` | text | baja | nominal | alta (comparable entre sensores). |
| `frp_mw` | double precision | Potencia radiativa del fuego (MW). |
| `dia_noche` | text | D (día) | N (noche). |
| `tipo` | smallint | Tipo de FIRMS: 0 = presunto fuego de vegetación. |
| `cell_id` | text | Celda de 1 km. |
| `distrito` | text | Nombre del distrito (solo dentro del municipio de Cochabamba). |
| `distrito_area_id` | text | area_id del distrito. |
| `municipio_parque` | text | Municipio OSM al que pertenece (solo calculado para detecciones dentro del parque). |
| `en_parque_tunari` | boolean | true si cae dentro del polígono del parque. |
| `en_municipio_cochabamba` | boolean | true si cae dentro del municipio de Cochabamba (unión de distritos). |
| `zona_municipio` | text | Dentro del Parque Tunari | Franja periurbana (hasta 2 km del parque) | Resto del municipio. |
| `distancia_al_parque_km` | numeric(6,2) | Distancia al límite del parque (0 si está dentro). |
| `fuente_persistente_probable` | boolean | true si cae en una celda con detecciones en al menos 8 de 13 años (posible fuente fija de calor, no incendio; hay que verificarlo). |
| `distrito_gamc` | text | Distrito según el servicio WMS OFICIAL del GAMC (D1…D15). Solo calculado para las detecciones del parque y del municipio; vacío en las demás. |
| `comuna_gamc` | text | Comuna según el servicio oficial del GAMC (por ejemplo TUNARI, ITOCTA). |
| `zona_cota2750_gamc` | boolean | true si cae dentro de la zona de la capa oficial «Cota 2750» (solo calculado para parque y municipio). |
| `periurbano_gamc` | text | Categoría de la capa oficial «Periurbanos»: Periurbanos en crecimiento | Periurbanos consolidados; vacío si está fuera (solo calculado para parque y municipio). |
| `periurbano_detalle_gamc` | text | Descripción de cobertura del elemento periurbano (campo «detalle» del servicio). |
| `origen_dato` | text | estandar (procesamiento estándar de NASA, con el tipo real) | NRT (casi tiempo real, provisional: NASA lo reprocesa y debe sustituirse por el estándar). |
| `tipo_conocido` | boolean | false si el tipo de detección no venía en el archivo (NRT público): se asumió tipo 0. true en los datos estándar. |
| `evento_id_tunari` | text | Evento candidato del catálogo del parque. |
| `evento_id_cbba` | text | Evento candidato del catálogo del municipio. |
| `geom` | geometry(Point,4326) (generada) | Punto PostGIS generado desde lon/lat. |

Clave primaria: `id_deteccion`.

## `detecciones_area`

Pertenencia de detecciones a las áreas PERSONALIZADAS (creadas con analizar_area.py). Para el parque, el municipio y los distritos se usan las banderas de la tabla detecciones.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área personalizada. |
| `id_deteccion` | text | Detección dentro del área. |
| `evento_id` | text | Evento candidato del catálogo de esa área. |
| `fuente_persistente_probable` | boolean | Posible fuente fija de calor según el análisis de esa área. |

Clave primaria: `area_id, id_deteccion`.

## `serie_mensual`

Serie mensual armonizada por área (celdas-día por sensor e índice MODIS-equivalente). El calendario mes x año sale de aquí (vista v_calendario_mes_anio).

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área. |
| `mes` | date | Primer día del mes (hora de Bolivia). |
| `anio` | integer | Año. |
| `mes_num` | integer | Mes 1-12. |
| `era` | text | MODIS_solo (antes de feb. 2012) | MODIS+VIIRS-SNPP. |
| `modis_celdas_dia` | double precision | Celdas-día MODIS (Terra + Aqua). |
| `viirs_snpp_celdas_dia` | double precision | Celdas-día VIIRS Suomi-NPP. |
| `factor_viirs_por_modis` | double precision | Factor de armonización usado (media geométrica). |
| `indice_modis_equivalente` | double precision | Índice armonizado en celdas-día MODIS-equivalentes. Es relativo: no son hectáreas ni número de incendios. NULL cuando calidad_indice = no_comparable. |
| `indice_para_alertas` | double precision | Índice de la base de alertas (VIIRS S-NPP a escala MODIS desde 2012; MODIS antes). |
| `conteo_base_alertas` | double precision | Celdas-día enteras de la base de alertas. |
| `limite_inferior_p05` | double precision | Banda de muestreo 5 % (solo parque). |
| `limite_superior_p95` | double precision | Banda de muestreo 95 % (solo parque). |
| `limite_inferior_estructural` | double precision | Rango inferior: en el parque, factor entre 2,7 y 3,4 y muestreo; en el resto de áreas, VIIRS / 3,37. Es un rango de sensibilidad al factor, NO un intervalo de confianza ni de incertidumbre. |
| `limite_superior_estructural` | double precision | Rango superior (rango de sensibilidad al factor, no un intervalo de confianza): en el parque, factor entre 2,7 y 3,4 y muestreo; en el resto de áreas, VIIRS / 2,09. |
| `calidad_indice` | text | calibrado_localmente_en_tunari (solo el Parque Tunari, donde se calibró y se validó el factor; aun así el error mensual es de ~40 %) | aproximado_factor_transferido (VIIRS reescalado con el factor del Tunari, sin validación local) | no_comparable (antes de febrero de 2012 en áreas distintas del Tunari: MODIS casi no registra detecciones ahí y el índice no es comparable con la era VIIRS; indice_modis_equivalente es NULL). |

Clave primaria: `area_id, mes`.

## `serie_agregada`

Índice armonizado por trimestre y por año con sus bandas de incertidumbre (solo parque). La escala mensual es solo indicativa; usar esta tabla para comparar.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área. |
| `escala` | text | trimestral | anual. |
| `periodo` | text | 2020 o 2020-T3. |
| `mes_inicio` | date | Primer mes del periodo. |
| `meses_incluidos` | integer | Meses con datos en el periodo. |
| `indice` | double precision | Suma del índice en el periodo. |
| `inferior` | double precision | Banda de muestreo 5 %. |
| `superior` | double precision | Banda de muestreo 95 %. |
| `inferior_estructural` | double precision | Banda combinada inferior (incluye la incertidumbre del factor). |
| `superior_estructural` | double precision | Banda combinada superior. |

Clave primaria: `area_id, escala, periodo`.

## `alertas_mensuales`

Alertas estadísticas por mes y área: probabilidad de que el mes sea tan alto o más según un modelo de conteos (binomial negativa estacional ajustada solo con años anteriores). NO confirman incendios.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área. |
| `variante` | text | base | sin_fuentes_persistentes (solo municipio-cochabamba). |
| `mes` | date | Primer día del mes. |
| `anio` | integer | Año. |
| `mes_num` | integer | Mes 1-12. |
| `era` | text | Era del índice. |
| `celdas_dia_base` | integer | Celdas-día observadas en la base de alertas. |
| `indice_modis_equivalente` | double precision | Índice de la base de alertas. |
| `n_baseline_mismo_mes` | integer | Años previos disponibles del mismo mes y era. |
| `mediana_historica_mes` | double precision | Mediana histórica del mismo mes. |
| `veces_mediana_historica` | double precision | Cuántas veces la mediana histórica es el mes (la comparación simple del reto). |
| `percentil_historico` | double precision | Posición del mes entre los mismos meses de años anteriores (0-1). |
| `z_score` | double precision | Z-score clásico (el que menciona el reto): (valor - media del mes) / desviación estándar, con piso de 1. Se muestra, pero no decide el nivel. |
| `z_score_supera_2` | boolean | true si z_score > 2. |
| `esperado_modelo` | double precision | Celdas-día esperadas por el modelo para ese mes. |
| `probabilidad_exceso` | double precision | Probabilidad aproximada de un mes tan alto o más (según el modelo). |
| `equivalente_anios_indicativo` | double precision | 1 / probabilidad, con tope de 100. SOLO INDICATIVO: sale de un modelo con ~13 años de datos y no es una frecuencia observada. No presentar como 'una vez cada N años'. |
| `actividad_minima_ok` | boolean | true si la base de alertas llega al mínimo de celdas-día: 6 de VIIRS desde febrero de 2012 o 2 de MODIS antes (parametros alerta_actividad_minima_viirs y _modis). El mínimo está en conteos y no depende del factor MODIS-VIIRS; 6 de VIIRS equivalen a 2 MODIS-equivalentes con el factor vigente 2,87. |
| `nivel_alerta` | text | normal | elevada | alta | muy_alta | sin_baseline | mes_incompleto. |
| `categoria_alerta` | text | vigilancia (elevada) | candidata_a_verificacion (alta, muy_alta) | vacío. |
| `lectura_modelo` | text | Lectura en palabras para mostrar al usuario. |
| `base_alertas` | text | VIIRS-SNPP (escala MODIS) | MODIS. |

Clave primaria: `area_id, variante, mes`.

## `recurrencia_celda`

Recurrencia espacial: en cuántos años distintos hubo al menos una detección en cada celda de 1 km (base principal: VIIRS S-NPP 2013-2025).

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área (parque-tunari o municipio-cochabamba). |
| `cell_id` | text | Celda de 1 km. |
| `ranking` | integer | Posición por años con fuego (1 = más recurrente). |
| `detecciones_total` | integer | Detecciones en la celda. |
| `dias_con_deteccion` | integer | Días distintos con detección. |
| `primer_anio` | integer | Primer año con detección. |
| `ultimo_anio` | integer | Último año con detección. |
| `anios_con_fuego_2001_2025` | integer | Años con al menos una detección (cualquier sensor, 25 años). |
| `anios_con_fuego_viirs_2013_2025` | integer | Años con al menos una detección VIIRS S-NPP (de 13). Base principal. |
| `anios_temporada_viirs_2013_2025` | integer | Igual, solo julio-octubre. |
| `pct_anios_2001_2025` | numeric(5,1) | Porcentaje de años (25). |
| `pct_anios_viirs_2013_2025` | numeric(5,1) | Porcentaje de años (13). |
| `clase_recurrencia_viirs` | text | baja | media | alta | muy_alta: clases descriptivas por porcentaje de años, no estadísticas. |
| `mes_pico` | integer | Mes con más detecciones. |
| `unidad_principal` | text | Municipio (parque) o distrito (municipio) dominante. |
| `fuente_persistente_probable` | boolean | Posible fuente fija de calor (no incendio). Solo calculado para el municipio. |

Clave primaria: `area_id, cell_id`.

## `puntos_calientes_gi`

Estadístico espacial Getis-Ord Gi* por celda: ¿la celda y sus vecinas (2,5 km) concentran más actividad de la esperable por azar? Corrección FDR al 5 %.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área. |
| `cell_id` | text | Celda de 1 km. |
| `celdas_dia_viirs_2013_2025` | double precision | Celdas-día VIIRS S-NPP 2013-2025 en la celda (en el municipio se excluyen las fuentes persistentes). |
| `z_gi_estrella` | double precision | Z de Gi*. |
| `p_ajustado_bh` | double precision | p ajustado por Benjamini-Hochberg. |
| `punto_caliente` | boolean | true si z > 0 y p ajustado < 0,05. |
| `punto_frio` | boolean | true si z < 0 y p ajustado < 0,05. |
| `conglomerado` | integer | Número del conglomerado de celdas calientes vecinas (vacío si no es caliente). |

Clave primaria: `area_id, cell_id`.

## `conglomerados_gi`

Resumen de los conglomerados de puntos calientes.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área. |
| `conglomerado` | integer | Número del conglomerado. |
| `celdas_1km` | integer | Celdas que lo forman. |
| `celdas_dia_viirs` | double precision | Celdas-día VIIRS acumuladas. |
| `z_maximo` | double precision | Máximo Z de Gi*. |
| `lon_centro` | numeric(9,5) | Longitud del centro. |
| `lat_centro` | numeric(8,5) | Latitud del centro. |
| `unidad_principal` | text | Municipio (parque) o distrito (municipio) dominante. |

Clave primaria: `area_id, conglomerado`.

## `tendencias`

Pruebas de tendencia (Mann-Kendall y pendiente de Sen) del parque. Resultado: sin tendencia significativa.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área. |
| `serie` | text | Serie analizada. |
| `anios` | text | Rango de años. |
| `n` | integer | Número de puntos. |
| `tau_kendall` | double precision | Tau de Kendall. |
| `p_valor` | double precision | p del test. |
| `pendiente_sen_por_anio` | double precision | Pendiente de Sen por año. |
| `ic90_inferior` | double precision | Límite inferior del IC 90 %. |
| `ic90_superior` | double precision | Límite superior del IC 90 %. |
| `mediana_de_la_serie` | double precision | Mediana de la serie. |

Clave primaria: `area_id, serie`.

## `casos_documentados`

Siete incendios publicados en prensa usados como validación temporal. No traen coordenadas ni perímetros: no hay validación espacial.

| Columna | Tipo | Descripción |
|---|---|---|
| `fecha_documentada` | date | Fecha reportada. |
| `lugar_reportado` | text | Lugar reportado. |
| `descripcion` | text | Descripción. |
| `url_fuente` | text | Enlace a la noticia. |
| `detecciones_firms_2dias` | integer | Detecciones FIRMS en la ventana de +-2 días. |
| `percentil_en_temporada` | double precision | Percentil frente a los días de la temporada jul-oct. |
| `destaca_sobre_temporada_p75` | boolean | true si supera el percentil 75 de la temporada. |
| `percentil_mismo_mes_anio` | double precision | Percentil frente a su propio mes y año. |
| `destaca_mismo_mes_anio_p75` | boolean | true si supera el percentil 75 de su propio mes. |
| `limitacion` | text | Limitación declarada. |

Clave primaria: `fecha_documentada, lugar_reportado`.

## `alerta_mes_en_curso`

ALERTA DEL MES EN CURSO: compara lo acumulado en los primeros d días del mes con el mismo tramo de los años anteriores (mismo modelo que las alertas mensuales). NO pronostica el resto del mes. Cada corrida agrega filas con su fecha_corte (se conserva el historial). Para pintar «hoy» use la vista v_alerta_mes_en_curso.

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | text | Área (parque, municipio y distritos con detecciones). |
| `fecha_corte` | date | Último día completo (hora de Bolivia) incluido en el cálculo. |
| `mes` | date | Primer día del mes evaluado. |
| `dias_transcurridos` | integer | Días del mes incluidos (1 a fecha_corte). |
| `dias_del_mes` | integer | Días totales del mes. |
| `satelite_base` | text | Satélite del mes en curso: NOAA-20 (reemplazo de Suomi-NPP). La referencia histórica es siempre Suomi-NPP 2012-2025. |
| `factor_de_enlace` | double precision | Factor con el que se llevó NOAA-20 a la escala de Suomi-NPP: 1,0 (el que se muestra) y 0,94 / 1,10 (sensibilidad). |
| `celdas_dia_observadas` | integer | Celdas-día VIIRS de 1 km acumuladas en el tramo. |
| `esperado_modelo` | double precision | Celdas-día esperadas para ese tramo según el modelo (binomial negativa estacional). |
| `mediana_historica_tramo` | double precision | Mediana de ese mismo tramo en años anteriores. |
| `percentil_historico` | double precision | Posición de lo observado entre los años anteriores (0 a 1). |
| `anios_de_historial` | integer | Años anteriores usados (mínimo 5 para emitir nivel). |
| `probabilidad_exceso` | double precision | Probabilidad de ver un tramo igual o más alto según el modelo (aproximada). |
| `nivel_alerta` | text | normal | elevada (p <= 0,10) | alta (p <= 0,05) | muy_alta (p <= 0,01) | sin_baseline. Señal estadística: requiere verificación y no confirma un incendio. |
| `lectura` | text | Lectura en palabras para mostrar. |

Clave primaria: `area_id, fecha_corte, factor_de_enlace`.

## `factores_satelites`

Factores de armonización entre todos los pares de satélites (Terra, Aqua, Suomi-NPP, NOAA-20), calculados en celdas-día de 1 km. Es referencia: no alimenta las alertas entregadas (que usan Suomi-NPP).

| Columna | Tipo | Descripción |
|---|---|---|
| `zona` | text | Tunari | Bolivia completa. |
| `de` | text | Satélite o grupo de origen. |
| `a` | text | Satélite o grupo de destino: destino = factor x origen. |
| `periodo` | text | Meses comunes usados. |
| `meses` | integer | Número de meses. |
| `celdas_dia_origen` | integer | Celdas-día del origen en el periodo. |
| `celdas_dia_destino` | integer | Celdas-día del destino en el periodo. |
| `factor_gm_proyecto` | numeric(8,3) | Factor por media geométrica (RMA por el origen), el estimador operativo del proyecto. |
| `ic95_bajo` | numeric(8,3) | Límite inferior del intervalo del 95 % (remuestreo de años; es incertidumbre de muestreo, distinta de la banda por elección de estimador). |
| `ic95_alto` | numeric(8,3) | Límite superior del intervalo del 95 %. |
| `factor_ols_origen` | numeric(8,3) | Factor por mínimos cuadrados por el origen (menor error al predecir el destino). |
| `factor_inverso` | numeric(8,3) | Factor por regresión inversa. |
| `razon_de_sumas` | numeric(8,3) | Razón de totales (iguala los totales). |
| `spearman_mensual` | numeric(5,3) | Correlación de Spearman mensual entre ambas series. |

Clave primaria: `zona, de, a`.

## `parametros`

Parámetros y metadatos del análisis (clave/valor).

| Columna | Tipo | Descripción |
|---|---|---|
| `clave` | text | Nombre del parámetro. |
| `valor` | text | Valor. |
| `descripcion` | text | Qué significa. |

Clave primaria: `clave`.

## `schema_version`

Versión del esquema instalado. Los scripts de carga se niegan a cargar si no coincide con la del paquete (ver cargar.sh --recrear).

| Columna | Tipo | Descripción |
|---|---|---|
| `version` | text | Versión del esquema (ESQUEMA_VERSION). |
| `aplicada_en` | timestamp | Cuándo se instaló. |
| `descripcion` | text | Nota. |

Clave primaria: `version`.

## `ingestas`

Registro de cargas de datos (para auditar y actualizar). Se llena al cargar.

| Columna | Tipo | Descripción |
|---|---|---|
| `ingesta_id` | serial | Identificador. |
| `fecha_carga` | timestamp | Cuándo se cargó. |
| `descripcion` | text | Qué se cargó. |
| `cobertura_hasta` | date | Última fecha con datos. |
| `filas_detecciones` | integer | Filas cargadas en detecciones. |

Clave primaria: `ingesta_id`.
