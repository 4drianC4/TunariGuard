-- Esquema generado por exportar_para_backend.py (no editar a mano: editar SPEC y regenerar).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS fuego;
SET search_path = fuego, public;

CREATE TABLE areas (
  area_id text NOT NULL,
  tipo text,
  nombre text,
  nombre_visible text,
  alcance_estadistico text,
  codigo text,
  padre_area_id text,
  area_km2 numeric(10,2),
  area_en_parque_km2 numeric(10,2),
  fuente_limite text,
  es_oficial boolean,
  geometria_original_oficial boolean,
  metodo_derivacion text,
  redistribucion_autorizada text,
  metodo_indice text,
  origen_factor text,
  validacion_local text,
  comparabilidad_pre_2012 text,
  advertencia text,
  geom_wkt text,
  geom geometry(Geometry,4326) GENERATED ALWAYS AS (ST_GeomFromText(geom_wkt, 4326)) STORED,
  PRIMARY KEY (area_id),
  FOREIGN KEY (padre_area_id) REFERENCES areas(area_id),
  CHECK (tipo IN ('parque','municipio','distrito','municipio_parque','personalizada')),
  CHECK (ST_IsValid(geom)),
  CHECK (alcance_estadistico IS NULL OR alcance_estadistico IN ('area_completa','solo_sector_del_parque')),
  CHECK (metodo_indice IS NULL OR metodo_indice IN ('mixto_calibrado','viirs_reescalado')),
  CHECK (origen_factor IS NULL OR origen_factor IN ('calibrado_en_tunari','transferido_desde_tunari')),
  CHECK (validacion_local IS NULL OR validacion_local IN ('calibrada','no_disponible')),
  CHECK (comparabilidad_pre_2012 IS NULL OR comparabilidad_pre_2012 IN ('comparable','no_comparable'))
);
COMMENT ON TABLE areas IS 'Territorios analizables: el parque, el municipio de Cochabamba, sus 15 distritos y los 12 municipios que cruzan el parque. Todas las demás tablas cuelgan de area_id.';
COMMENT ON COLUMN areas.area_id IS 'Identificador estable. Ejemplos: parque-tunari, municipio-cochabamba, distrito-09, mun-sacaba.';
COMMENT ON COLUMN areas.tipo IS 'parque | municipio | distrito | municipio_parque (municipio OSM que cruza el parque) | personalizada (definida con analizar_area.py).';
COMMENT ON COLUMN areas.nombre IS 'Nombre de la entidad (en municipio_parque es el nombre del municipio OSM y se usa para asignar las detecciones: no lo cambie; para mostrar use nombre_visible).';
COMMENT ON COLUMN areas.nombre_visible IS 'Nombre para mostrar en mapas y listas. En municipio_parque dice "Sector del Tunari en X" porque las cifras cuentan solo las detecciones del Parque Tunari asignadas a ese municipio, no todo el municipio.';
COMMENT ON COLUMN areas.alcance_estadistico IS 'area_completa (cuenta todas las detecciones del polígono) | solo_sector_del_parque (municipio_parque: solo las detecciones dentro del Parque Tunari asignadas a ese municipio; la geometría es el municipio completo, pero las cifras son del sector del parque).';
COMMENT ON COLUMN areas.codigo IS 'Código de origen (por ejemplo, número de distrito u osm_id).';
COMMENT ON COLUMN areas.padre_area_id IS 'Área que contiene a esta (los distritos cuelgan de municipio-cochabamba).';
COMMENT ON COLUMN areas.area_km2 IS 'Superficie del polígono en km2 (UTM 20S).';
COMMENT ON COLUMN areas.area_en_parque_km2 IS 'Solo para municipio_parque y municipio: superficie dentro del parque.';
COMMENT ON COLUMN areas.fuente_limite IS 'Origen del polígono (OpenStreetMap, ciudatoslab, unión de distritos).';
COMMENT ON COLUMN areas.es_oficial IS 'true solo si la FUENTE del límite es una institución oficial (servicio del GAMC). NO implica que la geometría sea el vector original: ver geometria_original_oficial.';
COMMENT ON COLUMN areas.geometria_original_oficial IS 'true solo si la geometría es el vector original publicado por la institución. false en todas las áreas de este paquete (las de GAMC son derivadas).';
COMMENT ON COLUMN areas.metodo_derivacion IS 'Cómo se obtuvo la geometría: referencia abierta sin derivación, rasterización de una imagen WMS, geometría devuelta por GetFeatureInfo, o definida por el usuario.';
COMMENT ON COLUMN areas.redistribucion_autorizada IS 'no_confirmada | referencia_abierta | responsabilidad_del_usuario. Mientras diga no_confirmada, no redistribuir la geometría fuera del proyecto.';
COMMENT ON COLUMN areas.metodo_indice IS 'mixto_calibrado (promedio de MODIS y VIIRS convertido; solo el Parque Tunari, donde se calibró y se validó el factor) | viirs_reescalado (el resto de áreas: VIIRS convertido a unidades equivalentes de MODIS con el factor del Tunari; no es una armonización de dos sensores).';
COMMENT ON COLUMN areas.origen_factor IS 'calibrado_en_tunari (el factor se calculó con los datos de esta misma área) | transferido_desde_tunari (el factor viene del Tunari y no se comprobó en esta área).';
COMMENT ON COLUMN areas.validacion_local IS 'calibrada | no_disponible. En las áreas fuera del Tunari el factor no se pudo validar localmente porque MODIS registra muy pocas detecciones.';
COMMENT ON COLUMN areas.comparabilidad_pre_2012 IS 'comparable | no_comparable. no_comparable: antes de febrero de 2012 solo existía MODIS, que casi no registra detecciones en esa área, y el índice no es comparable con la era VIIRS (indice_modis_equivalente es NULL).';
COMMENT ON COLUMN areas.advertencia IS 'Texto que debe acompañar al límite.';
COMMENT ON COLUMN areas.geom_wkt IS 'Geometría en WKT, EPSG:4326.';
COMMENT ON COLUMN areas.geom IS 'Geometría PostGIS generada desde geom_wkt.';
CREATE INDEX idx_areas_geom ON areas USING GIST (geom);
CREATE INDEX idx_areas_tipo ON areas (tipo);

CREATE TABLE fuentes_satelitales (
  fuente text NOT NULL,
  familia text,
  plataforma text,
  resolucion_nominal_m integer,
  primer_anio integer,
  ultimo_anio integer,
  grupo_union text,
  entra_al_indice boolean,
  usa_en_alertas boolean,
  activo boolean,
  inicio_indice date,
  fin_indice date,
  factor_a_modis double precision,
  factor_ic95_bajo double precision,
  factor_ic95_alto double precision,
  factor_origen text,
  nota text,
  PRIMARY KEY (fuente),
  CHECK (NOT entra_al_indice OR (COALESCE(factor_a_modis, 0) > 0 AND inicio_indice IS NOT NULL)),
  CHECK (familia IN ('MODIS','VIIRS'))
);
COMMENT ON TABLE fuentes_satelitales IS 'CATÁLOGO DE SATÉLITES y selector del índice armonizado. Una fila por satélite. Para agregar un satélite o cambiar cuáles alimentan el índice NO se cambia el esquema ni el código: se agrega o actualiza una fila (ver README, «Catálogo de satélites»). La función serie_armonizada_poligono lee estas columnas.';
COMMENT ON COLUMN fuentes_satelitales.fuente IS 'Clave: MODIS-Terra, MODIS-Aqua, VIIRS-Suomi-NPP, VIIRS-NOAA-20, VIIRS-NOAA-21. Es el valor de detecciones.fuente.';
COMMENT ON COLUMN fuentes_satelitales.familia IS 'MODIS | VIIRS. El índice es el promedio de las familias activas en el mes.';
COMMENT ON COLUMN fuentes_satelitales.plataforma IS 'Satélite.';
COMMENT ON COLUMN fuentes_satelitales.resolucion_nominal_m IS 'Resolución nominal del píxel en metros.';
COMMENT ON COLUMN fuentes_satelitales.primer_anio IS 'Primer año con datos en la base (vacío si no hay datos cargados).';
COMMENT ON COLUMN fuentes_satelitales.ultimo_anio IS 'Último año con datos en la base (vacío si no hay datos cargados).';
COMMENT ON COLUMN fuentes_satelitales.grupo_union IS 'Fuentes con el mismo grupo se UNEN (una celda-día cuenta una vez aunque la vean las dos). Terra y Aqua comparten el grupo MODIS; cada VIIRS tiene el suyo.';
COMMENT ON COLUMN fuentes_satelitales.entra_al_indice IS 'true si participa en el índice armonizado entre inicio_indice y fin_indice. Es el interruptor: cambiarlo cambia el índice de la función serie_armonizada_poligono.';
COMMENT ON COLUMN fuentes_satelitales.usa_en_alertas IS 'true si las alertas ENTREGADAS se calcularon con este satélite (hoy solo Suomi-NPP). Es informativo: el modelo de alertas se recalcula con el código del análisis.';
COMMENT ON COLUMN fuentes_satelitales.activo IS 'true si el satélite sigue entregando datos.';
COMMENT ON COLUMN fuentes_satelitales.inicio_indice IS 'Primer mes completo con el que el satélite puede entrar al índice.';
COMMENT ON COLUMN fuentes_satelitales.fin_indice IS 'Último mes que puede entrar al índice (vacío = sin fin).';
COMMENT ON COLUMN fuentes_satelitales.factor_a_modis IS 'Cuántas celdas-día de este satélite equivalen a 1 celda-día MODIS (MODIS = 1). El índice divide el conteo entre este factor. Calibrado en el Tunari: en otros territorios es aproximado.';
COMMENT ON COLUMN fuentes_satelitales.factor_ic95_bajo IS 'Límite inferior del intervalo del 95 % del factor (muestreo).';
COMMENT ON COLUMN fuentes_satelitales.factor_ic95_alto IS 'Límite superior del intervalo del 95 % del factor.';
COMMENT ON COLUMN fuentes_satelitales.factor_origen IS 'De dónde sale el factor (zona, periodo, estimador).';
COMMENT ON COLUMN fuentes_satelitales.nota IS 'Observación.';

CREATE TABLE celdas_1km (
  cell_id text NOT NULL,
  grid_col integer,
  grid_row integer,
  lon_centro numeric(9,5),
  lat_centro numeric(8,5),
  geom_wkt text,
  geom geometry(Polygon,4326) GENERATED ALWAYS AS (ST_GeomFromText(geom_wkt, 4326)) STORED,
  PRIMARY KEY (cell_id),
  CHECK (ST_IsValid(geom))
);
COMMENT ON TABLE celdas_1km IS 'Grilla común de 1 km (UTM 20S, EPSG:32720, origen fijo). El mismo cell_id sirve para todas las áreas.';
COMMENT ON COLUMN celdas_1km.cell_id IS 'Identificador 32720_col_fila.';
COMMENT ON COLUMN celdas_1km.grid_col IS 'Columna de la grilla: floor((x_utm - origen_x) / 1000).';
COMMENT ON COLUMN celdas_1km.grid_row IS 'Fila de la grilla: floor((y_utm - origen_y) / 1000).';
COMMENT ON COLUMN celdas_1km.lon_centro IS 'Longitud del centro de la celda.';
COMMENT ON COLUMN celdas_1km.lat_centro IS 'Latitud del centro de la celda.';
COMMENT ON COLUMN celdas_1km.geom_wkt IS 'Polígono de la celda en WKT, EPSG:4326.';
COMMENT ON COLUMN celdas_1km.geom IS 'Geometría PostGIS generada desde geom_wkt.';
CREATE INDEX idx_celdas_geom ON celdas_1km USING GIST (geom);

CREATE TABLE eventos (
  evento_id text NOT NULL,
  area_id text,
  fecha_inicio date,
  fecha_fin date,
  detecciones integer,
  celdas_1km integer,
  frp_suma_mw double precision,
  frp_max_mw double precision,
  duracion_dias integer,
  diagonal_bbox_km double precision,
  es_multisensor boolean,
  fuentes text,
  PRIMARY KEY (evento_id),
  FOREIGN KEY (area_id) REFERENCES areas(area_id)
);
COMMENT ON TABLE eventos IS 'Eventos candidatos: grupos de detecciones cercanas (hasta 1,5 km y 2 días, con tope de 3 km de diámetro). NO son incendios confirmados.';
COMMENT ON COLUMN eventos.evento_id IS 'TUNARI-00001 (parque) o CBBA-00001 (municipio).';
COMMENT ON COLUMN eventos.area_id IS 'Área en la que se calculó el catálogo.';
COMMENT ON COLUMN eventos.fecha_inicio IS 'Primer día con detecciones (hora de Bolivia).';
COMMENT ON COLUMN eventos.fecha_fin IS 'Último día con detecciones.';
COMMENT ON COLUMN eventos.detecciones IS 'Número de detecciones del evento.';
COMMENT ON COLUMN eventos.celdas_1km IS 'Celdas de 1 km distintas.';
COMMENT ON COLUMN eventos.frp_suma_mw IS 'Suma de la potencia radiativa (MW).';
COMMENT ON COLUMN eventos.frp_max_mw IS 'Máxima potencia radiativa (MW).';
COMMENT ON COLUMN eventos.duracion_dias IS 'Días inclusivos.';
COMMENT ON COLUMN eventos.diagonal_bbox_km IS 'Diagonal de la caja que contiene al evento (solo catálogo del parque).';
COMMENT ON COLUMN eventos.es_multisensor IS 'true si lo vieron MODIS y VIIRS.';
COMMENT ON COLUMN eventos.fuentes IS 'Fuentes que lo detectaron, separadas por |.';
CREATE INDEX idx_eventos_area_fecha ON eventos (area_id, fecha_inicio);

CREATE TABLE detecciones (
  id_deteccion text NOT NULL,
  fecha_hora_utc timestamp,
  fecha_hora_bo timestamp,
  fecha_bo date,
  fuente text,
  sensor text,
  plataforma text,
  lat double precision,
  lon double precision,
  confianza_original text,
  confianza_clase text,
  frp_mw double precision,
  dia_noche text,
  tipo smallint,
  cell_id text,
  distrito text,
  distrito_area_id text,
  municipio_parque text,
  en_parque_tunari boolean,
  en_municipio_cochabamba boolean,
  zona_municipio text,
  distancia_al_parque_km numeric(6,2),
  fuente_persistente_probable boolean,
  distrito_gamc text,
  comuna_gamc text,
  zona_cota2750_gamc boolean,
  periurbano_gamc text,
  periurbano_detalle_gamc text,
  origen_dato text,
  tipo_conocido boolean,
  evento_id_tunari text,
  evento_id_cbba text,
  geom geometry(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
  PRIMARY KEY (id_deteccion),
  FOREIGN KEY (fuente) REFERENCES fuentes_satelitales(fuente),
  FOREIGN KEY (cell_id) REFERENCES celdas_1km(cell_id),
  FOREIGN KEY (distrito_area_id) REFERENCES areas(area_id),
  FOREIGN KEY (evento_id_tunari) REFERENCES eventos(evento_id),
  FOREIGN KEY (evento_id_cbba) REFERENCES eventos(evento_id),
  CHECK (origen_dato IN ('estandar','NRT'))
);
COMMENT ON TABLE detecciones IS 'Detecciones FIRMS ya filtradas (tipo 0 y confianza distinta de baja) dentro del parque o del municipio de Cochabamba. UNA FILA ES UNA DETECCIÓN, NO UN INCENDIO.';
COMMENT ON COLUMN detecciones.id_deteccion IS 'Hash estable de fuente + minuto UTC + lat + lon. Sirve como clave para no duplicar al cargar datos nuevos.';
COMMENT ON COLUMN detecciones.fecha_hora_utc IS 'Fecha y hora UTC de la adquisición.';
COMMENT ON COLUMN detecciones.fecha_hora_bo IS 'Fecha y hora de Bolivia (UTC-4).';
COMMENT ON COLUMN detecciones.fecha_bo IS 'Fecha de Bolivia (usar para agrupar por día/mes).';
COMMENT ON COLUMN detecciones.fuente IS 'Satélite de origen.';
COMMENT ON COLUMN detecciones.sensor IS 'MODIS | VIIRS.';
COMMENT ON COLUMN detecciones.plataforma IS 'Terra, Aqua, Suomi-NPP, NOAA-20 o NOAA-21.';
COMMENT ON COLUMN detecciones.lat IS 'Latitud (EPSG:4326).';
COMMENT ON COLUMN detecciones.lon IS 'Longitud (EPSG:4326).';
COMMENT ON COLUMN detecciones.confianza_original IS 'Confianza tal como viene de FIRMS (MODIS 0-100; VIIRS l/n/h).';
COMMENT ON COLUMN detecciones.confianza_clase IS 'baja | nominal | alta (comparable entre sensores).';
COMMENT ON COLUMN detecciones.frp_mw IS 'Potencia radiativa del fuego (MW).';
COMMENT ON COLUMN detecciones.dia_noche IS 'D (día) | N (noche).';
COMMENT ON COLUMN detecciones.tipo IS 'Tipo de FIRMS: 0 = presunto fuego de vegetación.';
COMMENT ON COLUMN detecciones.cell_id IS 'Celda de 1 km.';
COMMENT ON COLUMN detecciones.distrito IS 'Nombre del distrito (solo dentro del municipio de Cochabamba).';
COMMENT ON COLUMN detecciones.distrito_area_id IS 'area_id del distrito.';
COMMENT ON COLUMN detecciones.municipio_parque IS 'Municipio OSM al que pertenece (solo calculado para detecciones dentro del parque).';
COMMENT ON COLUMN detecciones.en_parque_tunari IS 'true si cae dentro del polígono del parque.';
COMMENT ON COLUMN detecciones.en_municipio_cochabamba IS 'true si cae dentro del municipio de Cochabamba (unión de distritos).';
COMMENT ON COLUMN detecciones.zona_municipio IS 'Dentro del Parque Tunari | Franja periurbana (hasta 2 km del parque) | Resto del municipio.';
COMMENT ON COLUMN detecciones.distancia_al_parque_km IS 'Distancia al límite del parque (0 si está dentro).';
COMMENT ON COLUMN detecciones.fuente_persistente_probable IS 'true si cae en una celda con detecciones en al menos 8 de 13 años (posible fuente fija de calor, no incendio; hay que verificarlo).';
COMMENT ON COLUMN detecciones.distrito_gamc IS 'Distrito según el servicio WMS OFICIAL del GAMC (D1…D15). Solo calculado para las detecciones del parque y del municipio; vacío en las demás.';
COMMENT ON COLUMN detecciones.comuna_gamc IS 'Comuna según el servicio oficial del GAMC (por ejemplo TUNARI, ITOCTA).';
COMMENT ON COLUMN detecciones.zona_cota2750_gamc IS 'true si cae dentro de la zona de la capa oficial «Cota 2750» (solo calculado para parque y municipio).';
COMMENT ON COLUMN detecciones.periurbano_gamc IS 'Categoría de la capa oficial «Periurbanos»: Periurbanos en crecimiento | Periurbanos consolidados; vacío si está fuera (solo calculado para parque y municipio).';
COMMENT ON COLUMN detecciones.periurbano_detalle_gamc IS 'Descripción de cobertura del elemento periurbano (campo «detalle» del servicio).';
COMMENT ON COLUMN detecciones.origen_dato IS 'estandar (procesamiento estándar de NASA, con el tipo real) | NRT (casi tiempo real, provisional: NASA lo reprocesa y debe sustituirse por el estándar).';
COMMENT ON COLUMN detecciones.tipo_conocido IS 'false si el tipo de detección no venía en el archivo (NRT público): se asumió tipo 0. true en los datos estándar.';
COMMENT ON COLUMN detecciones.evento_id_tunari IS 'Evento candidato del catálogo del parque.';
COMMENT ON COLUMN detecciones.evento_id_cbba IS 'Evento candidato del catálogo del municipio.';
COMMENT ON COLUMN detecciones.geom IS 'Punto PostGIS generado desde lon/lat.';
CREATE INDEX idx_det_geom ON detecciones USING GIST (geom);
CREATE INDEX idx_det_fecha ON detecciones (fecha_bo);
CREATE INDEX idx_det_cell ON detecciones (cell_id);
CREATE INDEX idx_det_distrito ON detecciones (distrito_area_id);

CREATE TABLE detecciones_area (
  area_id text NOT NULL,
  id_deteccion text NOT NULL,
  evento_id text,
  fuente_persistente_probable boolean,
  PRIMARY KEY (area_id, id_deteccion),
  FOREIGN KEY (area_id) REFERENCES areas(area_id),
  FOREIGN KEY (id_deteccion) REFERENCES detecciones(id_deteccion),
  FOREIGN KEY (evento_id) REFERENCES eventos(evento_id)
);
COMMENT ON TABLE detecciones_area IS 'Pertenencia de detecciones a las áreas PERSONALIZADAS (creadas con analizar_area.py). Para el parque, el municipio y los distritos se usan las banderas de la tabla detecciones.';
COMMENT ON COLUMN detecciones_area.area_id IS 'Área personalizada.';
COMMENT ON COLUMN detecciones_area.id_deteccion IS 'Detección dentro del área.';
COMMENT ON COLUMN detecciones_area.evento_id IS 'Evento candidato del catálogo de esa área.';
COMMENT ON COLUMN detecciones_area.fuente_persistente_probable IS 'Posible fuente fija de calor según el análisis de esa área.';
CREATE INDEX idx_detarea_det ON detecciones_area (id_deteccion);

CREATE TABLE serie_mensual (
  area_id text NOT NULL,
  mes date NOT NULL,
  anio integer,
  mes_num integer,
  era text,
  modis_celdas_dia double precision,
  viirs_snpp_celdas_dia double precision,
  factor_viirs_por_modis double precision,
  indice_modis_equivalente double precision,
  indice_para_alertas double precision,
  conteo_base_alertas double precision,
  limite_inferior_p05 double precision,
  limite_superior_p95 double precision,
  limite_inferior_estructural double precision,
  limite_superior_estructural double precision,
  calidad_indice text,
  PRIMARY KEY (area_id, mes),
  FOREIGN KEY (area_id) REFERENCES areas(area_id),
  CHECK (calidad_indice IS NULL OR calidad_indice IN ('calibrado_localmente_en_tunari','aproximado_factor_transferido','no_comparable'))
);
COMMENT ON TABLE serie_mensual IS 'Serie mensual armonizada por área (celdas-día por sensor e índice MODIS-equivalente). El calendario mes x año sale de aquí (vista v_calendario_mes_anio).';
COMMENT ON COLUMN serie_mensual.area_id IS 'Área.';
COMMENT ON COLUMN serie_mensual.mes IS 'Primer día del mes (hora de Bolivia).';
COMMENT ON COLUMN serie_mensual.anio IS 'Año.';
COMMENT ON COLUMN serie_mensual.mes_num IS 'Mes 1-12.';
COMMENT ON COLUMN serie_mensual.era IS 'MODIS_solo (antes de feb. 2012) | MODIS+VIIRS-SNPP.';
COMMENT ON COLUMN serie_mensual.modis_celdas_dia IS 'Celdas-día MODIS (Terra + Aqua).';
COMMENT ON COLUMN serie_mensual.viirs_snpp_celdas_dia IS 'Celdas-día VIIRS Suomi-NPP.';
COMMENT ON COLUMN serie_mensual.factor_viirs_por_modis IS 'Factor de armonización usado (media geométrica).';
COMMENT ON COLUMN serie_mensual.indice_modis_equivalente IS 'Índice armonizado en celdas-día MODIS-equivalentes. Es relativo: no son hectáreas ni número de incendios. NULL cuando calidad_indice = no_comparable.';
COMMENT ON COLUMN serie_mensual.indice_para_alertas IS 'Índice de la base de alertas (VIIRS S-NPP a escala MODIS desde 2012; MODIS antes).';
COMMENT ON COLUMN serie_mensual.conteo_base_alertas IS 'Celdas-día enteras de la base de alertas.';
COMMENT ON COLUMN serie_mensual.limite_inferior_p05 IS 'Banda de muestreo 5 % (solo parque).';
COMMENT ON COLUMN serie_mensual.limite_superior_p95 IS 'Banda de muestreo 95 % (solo parque).';
COMMENT ON COLUMN serie_mensual.limite_inferior_estructural IS 'Rango inferior: en el parque, factor entre 2,7 y 3,4 y muestreo; en el resto de áreas, VIIRS / 3,37. Es un rango de sensibilidad al factor, NO un intervalo de confianza ni de incertidumbre.';
COMMENT ON COLUMN serie_mensual.limite_superior_estructural IS 'Rango superior (rango de sensibilidad al factor, no un intervalo de confianza): en el parque, factor entre 2,7 y 3,4 y muestreo; en el resto de áreas, VIIRS / 2,09.';
COMMENT ON COLUMN serie_mensual.calidad_indice IS 'calibrado_localmente_en_tunari (solo el Parque Tunari, donde se calibró y se validó el factor; aun así el error mensual es de ~40 %) | aproximado_factor_transferido (VIIRS reescalado con el factor del Tunari, sin validación local) | no_comparable (antes de febrero de 2012 en áreas distintas del Tunari: MODIS casi no registra detecciones ahí y el índice no es comparable con la era VIIRS; indice_modis_equivalente es NULL).';

CREATE TABLE serie_agregada (
  area_id text NOT NULL,
  escala text NOT NULL,
  periodo text NOT NULL,
  mes_inicio date,
  meses_incluidos integer,
  indice double precision,
  inferior double precision,
  superior double precision,
  inferior_estructural double precision,
  superior_estructural double precision,
  PRIMARY KEY (area_id, escala, periodo),
  FOREIGN KEY (area_id) REFERENCES areas(area_id)
);
COMMENT ON TABLE serie_agregada IS 'Índice armonizado por trimestre y por año con sus bandas de incertidumbre (solo parque). La escala mensual es solo indicativa; usar esta tabla para comparar.';
COMMENT ON COLUMN serie_agregada.area_id IS 'Área.';
COMMENT ON COLUMN serie_agregada.escala IS 'trimestral | anual.';
COMMENT ON COLUMN serie_agregada.periodo IS '2020 o 2020-T3.';
COMMENT ON COLUMN serie_agregada.mes_inicio IS 'Primer mes del periodo.';
COMMENT ON COLUMN serie_agregada.meses_incluidos IS 'Meses con datos en el periodo.';
COMMENT ON COLUMN serie_agregada.indice IS 'Suma del índice en el periodo.';
COMMENT ON COLUMN serie_agregada.inferior IS 'Banda de muestreo 5 %.';
COMMENT ON COLUMN serie_agregada.superior IS 'Banda de muestreo 95 %.';
COMMENT ON COLUMN serie_agregada.inferior_estructural IS 'Banda combinada inferior (incluye la incertidumbre del factor).';
COMMENT ON COLUMN serie_agregada.superior_estructural IS 'Banda combinada superior.';

CREATE TABLE alertas_mensuales (
  area_id text NOT NULL,
  variante text NOT NULL,
  mes date NOT NULL,
  anio integer,
  mes_num integer,
  era text,
  celdas_dia_base integer,
  indice_modis_equivalente double precision,
  n_baseline_mismo_mes integer,
  mediana_historica_mes double precision,
  veces_mediana_historica double precision,
  percentil_historico double precision,
  z_score double precision,
  z_score_supera_2 boolean,
  esperado_modelo double precision,
  probabilidad_exceso double precision,
  equivalente_anios_indicativo double precision,
  actividad_minima_ok boolean,
  nivel_alerta text,
  categoria_alerta text,
  lectura_modelo text,
  base_alertas text,
  PRIMARY KEY (area_id, variante, mes),
  FOREIGN KEY (area_id) REFERENCES areas(area_id),
  CHECK (nivel_alerta IN ('normal','elevada','alta','muy_alta','sin_baseline','mes_incompleto'))
);
COMMENT ON TABLE alertas_mensuales IS 'Alertas estadísticas por mes y área: probabilidad de que el mes sea tan alto o más según un modelo de conteos (binomial negativa estacional ajustada solo con años anteriores). NO confirman incendios.';
COMMENT ON COLUMN alertas_mensuales.area_id IS 'Área.';
COMMENT ON COLUMN alertas_mensuales.variante IS 'base | sin_fuentes_persistentes (solo municipio-cochabamba).';
COMMENT ON COLUMN alertas_mensuales.mes IS 'Primer día del mes.';
COMMENT ON COLUMN alertas_mensuales.anio IS 'Año.';
COMMENT ON COLUMN alertas_mensuales.mes_num IS 'Mes 1-12.';
COMMENT ON COLUMN alertas_mensuales.era IS 'Era del índice.';
COMMENT ON COLUMN alertas_mensuales.celdas_dia_base IS 'Celdas-día observadas en la base de alertas.';
COMMENT ON COLUMN alertas_mensuales.indice_modis_equivalente IS 'Índice de la base de alertas.';
COMMENT ON COLUMN alertas_mensuales.n_baseline_mismo_mes IS 'Años previos disponibles del mismo mes y era.';
COMMENT ON COLUMN alertas_mensuales.mediana_historica_mes IS 'Mediana histórica del mismo mes.';
COMMENT ON COLUMN alertas_mensuales.veces_mediana_historica IS 'Cuántas veces la mediana histórica es el mes (la comparación simple del reto).';
COMMENT ON COLUMN alertas_mensuales.percentil_historico IS 'Posición del mes entre los mismos meses de años anteriores (0-1).';
COMMENT ON COLUMN alertas_mensuales.z_score IS 'Z-score clásico (el que menciona el reto): (valor - media del mes) / desviación estándar, con piso de 1. Se muestra, pero no decide el nivel.';
COMMENT ON COLUMN alertas_mensuales.z_score_supera_2 IS 'true si z_score > 2.';
COMMENT ON COLUMN alertas_mensuales.esperado_modelo IS 'Celdas-día esperadas por el modelo para ese mes.';
COMMENT ON COLUMN alertas_mensuales.probabilidad_exceso IS 'Probabilidad aproximada de un mes tan alto o más (según el modelo).';
COMMENT ON COLUMN alertas_mensuales.equivalente_anios_indicativo IS '1 / probabilidad, con tope de 100. SOLO INDICATIVO: sale de un modelo con ~13 años de datos y no es una frecuencia observada. No presentar como ''una vez cada N años''.';
COMMENT ON COLUMN alertas_mensuales.actividad_minima_ok IS 'true si la base de alertas llega al mínimo de celdas-día: 6 de VIIRS desde febrero de 2012 o 2 de MODIS antes (parametros alerta_actividad_minima_viirs y _modis). El mínimo está en conteos y no depende del factor MODIS-VIIRS; 6 de VIIRS equivalen a 2 MODIS-equivalentes con el factor vigente 2,87.';
COMMENT ON COLUMN alertas_mensuales.nivel_alerta IS 'normal | elevada | alta | muy_alta | sin_baseline | mes_incompleto.';
COMMENT ON COLUMN alertas_mensuales.categoria_alerta IS 'vigilancia (elevada) | candidata_a_verificacion (alta, muy_alta) | vacío.';
COMMENT ON COLUMN alertas_mensuales.lectura_modelo IS 'Lectura en palabras para mostrar al usuario.';
COMMENT ON COLUMN alertas_mensuales.base_alertas IS 'VIIRS-SNPP (escala MODIS) | MODIS.';
CREATE INDEX idx_alertas_nivel ON alertas_mensuales (nivel_alerta, mes);

CREATE TABLE recurrencia_celda (
  area_id text NOT NULL,
  cell_id text NOT NULL,
  ranking integer,
  detecciones_total integer,
  dias_con_deteccion integer,
  primer_anio integer,
  ultimo_anio integer,
  anios_con_fuego_2001_2025 integer,
  anios_con_fuego_viirs_2013_2025 integer,
  anios_temporada_viirs_2013_2025 integer,
  pct_anios_2001_2025 numeric(5,1),
  pct_anios_viirs_2013_2025 numeric(5,1),
  clase_recurrencia_viirs text,
  mes_pico integer,
  unidad_principal text,
  fuente_persistente_probable boolean,
  PRIMARY KEY (area_id, cell_id),
  FOREIGN KEY (area_id) REFERENCES areas(area_id),
  FOREIGN KEY (cell_id) REFERENCES celdas_1km(cell_id)
);
COMMENT ON TABLE recurrencia_celda IS 'Recurrencia espacial: en cuántos años distintos hubo al menos una detección en cada celda de 1 km (base principal: VIIRS S-NPP 2013-2025).';
COMMENT ON COLUMN recurrencia_celda.area_id IS 'Área (parque-tunari o municipio-cochabamba).';
COMMENT ON COLUMN recurrencia_celda.cell_id IS 'Celda de 1 km.';
COMMENT ON COLUMN recurrencia_celda.ranking IS 'Posición por años con fuego (1 = más recurrente).';
COMMENT ON COLUMN recurrencia_celda.detecciones_total IS 'Detecciones en la celda.';
COMMENT ON COLUMN recurrencia_celda.dias_con_deteccion IS 'Días distintos con detección.';
COMMENT ON COLUMN recurrencia_celda.primer_anio IS 'Primer año con detección.';
COMMENT ON COLUMN recurrencia_celda.ultimo_anio IS 'Último año con detección.';
COMMENT ON COLUMN recurrencia_celda.anios_con_fuego_2001_2025 IS 'Años con al menos una detección (cualquier sensor, 25 años).';
COMMENT ON COLUMN recurrencia_celda.anios_con_fuego_viirs_2013_2025 IS 'Años con al menos una detección VIIRS S-NPP (de 13). Base principal.';
COMMENT ON COLUMN recurrencia_celda.anios_temporada_viirs_2013_2025 IS 'Igual, solo julio-octubre.';
COMMENT ON COLUMN recurrencia_celda.pct_anios_2001_2025 IS 'Porcentaje de años (25).';
COMMENT ON COLUMN recurrencia_celda.pct_anios_viirs_2013_2025 IS 'Porcentaje de años (13).';
COMMENT ON COLUMN recurrencia_celda.clase_recurrencia_viirs IS 'baja | media | alta | muy_alta: clases descriptivas por porcentaje de años, no estadísticas.';
COMMENT ON COLUMN recurrencia_celda.mes_pico IS 'Mes con más detecciones.';
COMMENT ON COLUMN recurrencia_celda.unidad_principal IS 'Municipio (parque) o distrito (municipio) dominante.';
COMMENT ON COLUMN recurrencia_celda.fuente_persistente_probable IS 'Posible fuente fija de calor (no incendio). Solo calculado para el municipio.';

CREATE TABLE puntos_calientes_gi (
  area_id text NOT NULL,
  cell_id text NOT NULL,
  celdas_dia_viirs_2013_2025 double precision,
  z_gi_estrella double precision,
  p_ajustado_bh double precision,
  punto_caliente boolean,
  punto_frio boolean,
  conglomerado integer,
  PRIMARY KEY (area_id, cell_id),
  FOREIGN KEY (area_id) REFERENCES areas(area_id),
  FOREIGN KEY (cell_id) REFERENCES celdas_1km(cell_id)
);
COMMENT ON TABLE puntos_calientes_gi IS 'Estadístico espacial Getis-Ord Gi* por celda: ¿la celda y sus vecinas (2,5 km) concentran más actividad de la esperable por azar? Corrección FDR al 5 %.';
COMMENT ON COLUMN puntos_calientes_gi.area_id IS 'Área.';
COMMENT ON COLUMN puntos_calientes_gi.cell_id IS 'Celda de 1 km.';
COMMENT ON COLUMN puntos_calientes_gi.celdas_dia_viirs_2013_2025 IS 'Celdas-día VIIRS S-NPP 2013-2025 en la celda (en el municipio se excluyen las fuentes persistentes).';
COMMENT ON COLUMN puntos_calientes_gi.z_gi_estrella IS 'Z de Gi*.';
COMMENT ON COLUMN puntos_calientes_gi.p_ajustado_bh IS 'p ajustado por Benjamini-Hochberg.';
COMMENT ON COLUMN puntos_calientes_gi.punto_caliente IS 'true si z > 0 y p ajustado < 0,05.';
COMMENT ON COLUMN puntos_calientes_gi.punto_frio IS 'true si z < 0 y p ajustado < 0,05.';
COMMENT ON COLUMN puntos_calientes_gi.conglomerado IS 'Número del conglomerado de celdas calientes vecinas (vacío si no es caliente).';

CREATE TABLE conglomerados_gi (
  area_id text NOT NULL,
  conglomerado integer NOT NULL,
  celdas_1km integer,
  celdas_dia_viirs double precision,
  z_maximo double precision,
  lon_centro numeric(9,5),
  lat_centro numeric(8,5),
  unidad_principal text,
  PRIMARY KEY (area_id, conglomerado),
  FOREIGN KEY (area_id) REFERENCES areas(area_id)
);
COMMENT ON TABLE conglomerados_gi IS 'Resumen de los conglomerados de puntos calientes.';
COMMENT ON COLUMN conglomerados_gi.area_id IS 'Área.';
COMMENT ON COLUMN conglomerados_gi.conglomerado IS 'Número del conglomerado.';
COMMENT ON COLUMN conglomerados_gi.celdas_1km IS 'Celdas que lo forman.';
COMMENT ON COLUMN conglomerados_gi.celdas_dia_viirs IS 'Celdas-día VIIRS acumuladas.';
COMMENT ON COLUMN conglomerados_gi.z_maximo IS 'Máximo Z de Gi*.';
COMMENT ON COLUMN conglomerados_gi.lon_centro IS 'Longitud del centro.';
COMMENT ON COLUMN conglomerados_gi.lat_centro IS 'Latitud del centro.';
COMMENT ON COLUMN conglomerados_gi.unidad_principal IS 'Municipio (parque) o distrito (municipio) dominante.';

CREATE TABLE tendencias (
  area_id text NOT NULL,
  serie text NOT NULL,
  anios text,
  n integer,
  tau_kendall double precision,
  p_valor double precision,
  pendiente_sen_por_anio double precision,
  ic90_inferior double precision,
  ic90_superior double precision,
  mediana_de_la_serie double precision,
  PRIMARY KEY (area_id, serie),
  FOREIGN KEY (area_id) REFERENCES areas(area_id)
);
COMMENT ON TABLE tendencias IS 'Pruebas de tendencia (Mann-Kendall y pendiente de Sen) del parque. Resultado: sin tendencia significativa.';
COMMENT ON COLUMN tendencias.area_id IS 'Área.';
COMMENT ON COLUMN tendencias.serie IS 'Serie analizada.';
COMMENT ON COLUMN tendencias.anios IS 'Rango de años.';
COMMENT ON COLUMN tendencias.n IS 'Número de puntos.';
COMMENT ON COLUMN tendencias.tau_kendall IS 'Tau de Kendall.';
COMMENT ON COLUMN tendencias.p_valor IS 'p del test.';
COMMENT ON COLUMN tendencias.pendiente_sen_por_anio IS 'Pendiente de Sen por año.';
COMMENT ON COLUMN tendencias.ic90_inferior IS 'Límite inferior del IC 90 %.';
COMMENT ON COLUMN tendencias.ic90_superior IS 'Límite superior del IC 90 %.';
COMMENT ON COLUMN tendencias.mediana_de_la_serie IS 'Mediana de la serie.';

CREATE TABLE casos_documentados (
  fecha_documentada date NOT NULL,
  lugar_reportado text NOT NULL,
  descripcion text,
  url_fuente text,
  detecciones_firms_2dias integer,
  percentil_en_temporada double precision,
  destaca_sobre_temporada_p75 boolean,
  percentil_mismo_mes_anio double precision,
  destaca_mismo_mes_anio_p75 boolean,
  limitacion text,
  PRIMARY KEY (fecha_documentada, lugar_reportado)
);
COMMENT ON TABLE casos_documentados IS 'Siete incendios publicados en prensa usados como validación temporal. No traen coordenadas ni perímetros: no hay validación espacial.';
COMMENT ON COLUMN casos_documentados.fecha_documentada IS 'Fecha reportada.';
COMMENT ON COLUMN casos_documentados.lugar_reportado IS 'Lugar reportado.';
COMMENT ON COLUMN casos_documentados.descripcion IS 'Descripción.';
COMMENT ON COLUMN casos_documentados.url_fuente IS 'Enlace a la noticia.';
COMMENT ON COLUMN casos_documentados.detecciones_firms_2dias IS 'Detecciones FIRMS en la ventana de +-2 días.';
COMMENT ON COLUMN casos_documentados.percentil_en_temporada IS 'Percentil frente a los días de la temporada jul-oct.';
COMMENT ON COLUMN casos_documentados.destaca_sobre_temporada_p75 IS 'true si supera el percentil 75 de la temporada.';
COMMENT ON COLUMN casos_documentados.percentil_mismo_mes_anio IS 'Percentil frente a su propio mes y año.';
COMMENT ON COLUMN casos_documentados.destaca_mismo_mes_anio_p75 IS 'true si supera el percentil 75 de su propio mes.';
COMMENT ON COLUMN casos_documentados.limitacion IS 'Limitación declarada.';

CREATE TABLE alerta_mes_en_curso (
  area_id text NOT NULL,
  fecha_corte date NOT NULL,
  mes date,
  dias_transcurridos integer,
  dias_del_mes integer,
  satelite_base text,
  factor_de_enlace double precision NOT NULL,
  celdas_dia_observadas integer,
  esperado_modelo double precision,
  mediana_historica_tramo double precision,
  percentil_historico double precision,
  anios_de_historial integer,
  probabilidad_exceso double precision,
  nivel_alerta text,
  lectura text,
  PRIMARY KEY (area_id, fecha_corte, factor_de_enlace),
  FOREIGN KEY (area_id) REFERENCES areas(area_id),
  CHECK (nivel_alerta IN ('normal','elevada','alta','muy_alta','sin_baseline')),
  CHECK (probabilidad_exceso IS NULL OR probabilidad_exceso BETWEEN 0 AND 1)
);
COMMENT ON TABLE alerta_mes_en_curso IS 'ALERTA DEL MES EN CURSO: compara lo acumulado en los primeros d días del mes con el mismo tramo de los años anteriores (mismo modelo que las alertas mensuales). NO pronostica el resto del mes. Cada corrida agrega filas con su fecha_corte (se conserva el historial). Para pintar «hoy» use la vista v_alerta_mes_en_curso.';
COMMENT ON COLUMN alerta_mes_en_curso.area_id IS 'Área (parque, municipio y distritos con detecciones).';
COMMENT ON COLUMN alerta_mes_en_curso.fecha_corte IS 'Último día completo (hora de Bolivia) incluido en el cálculo.';
COMMENT ON COLUMN alerta_mes_en_curso.mes IS 'Primer día del mes evaluado.';
COMMENT ON COLUMN alerta_mes_en_curso.dias_transcurridos IS 'Días del mes incluidos (1 a fecha_corte).';
COMMENT ON COLUMN alerta_mes_en_curso.dias_del_mes IS 'Días totales del mes.';
COMMENT ON COLUMN alerta_mes_en_curso.satelite_base IS 'Satélite del mes en curso: NOAA-20 (reemplazo de Suomi-NPP). La referencia histórica es siempre Suomi-NPP 2012-2025.';
COMMENT ON COLUMN alerta_mes_en_curso.factor_de_enlace IS 'Factor con el que se llevó NOAA-20 a la escala de Suomi-NPP: 1,0 (el que se muestra) y 0,94 / 1,10 (sensibilidad).';
COMMENT ON COLUMN alerta_mes_en_curso.celdas_dia_observadas IS 'Celdas-día VIIRS de 1 km acumuladas en el tramo.';
COMMENT ON COLUMN alerta_mes_en_curso.esperado_modelo IS 'Celdas-día esperadas para ese tramo según el modelo (binomial negativa estacional).';
COMMENT ON COLUMN alerta_mes_en_curso.mediana_historica_tramo IS 'Mediana de ese mismo tramo en años anteriores.';
COMMENT ON COLUMN alerta_mes_en_curso.percentil_historico IS 'Posición de lo observado entre los años anteriores (0 a 1).';
COMMENT ON COLUMN alerta_mes_en_curso.anios_de_historial IS 'Años anteriores usados (mínimo 5 para emitir nivel).';
COMMENT ON COLUMN alerta_mes_en_curso.probabilidad_exceso IS 'Probabilidad de ver un tramo igual o más alto según el modelo (aproximada).';
COMMENT ON COLUMN alerta_mes_en_curso.nivel_alerta IS 'normal | elevada (p <= 0,10) | alta (p <= 0,05) | muy_alta (p <= 0,01) | sin_baseline. Señal estadística: requiere verificación y no confirma un incendio.';
COMMENT ON COLUMN alerta_mes_en_curso.lectura IS 'Lectura en palabras para mostrar.';

CREATE TABLE factores_satelites (
  zona text NOT NULL,
  de text NOT NULL,
  a text NOT NULL,
  periodo text,
  meses integer,
  celdas_dia_origen integer,
  celdas_dia_destino integer,
  factor_gm_proyecto numeric(8,3),
  ic95_bajo numeric(8,3),
  ic95_alto numeric(8,3),
  factor_ols_origen numeric(8,3),
  factor_inverso numeric(8,3),
  razon_de_sumas numeric(8,3),
  spearman_mensual numeric(5,3),
  PRIMARY KEY (zona, de, a)
);
COMMENT ON TABLE factores_satelites IS 'Factores de armonización entre todos los pares de satélites (Terra, Aqua, Suomi-NPP, NOAA-20), calculados en celdas-día de 1 km. Es referencia: no alimenta las alertas entregadas (que usan Suomi-NPP).';
COMMENT ON COLUMN factores_satelites.zona IS 'Tunari | Bolivia completa.';
COMMENT ON COLUMN factores_satelites.de IS 'Satélite o grupo de origen.';
COMMENT ON COLUMN factores_satelites.a IS 'Satélite o grupo de destino: destino = factor x origen.';
COMMENT ON COLUMN factores_satelites.periodo IS 'Meses comunes usados.';
COMMENT ON COLUMN factores_satelites.meses IS 'Número de meses.';
COMMENT ON COLUMN factores_satelites.celdas_dia_origen IS 'Celdas-día del origen en el periodo.';
COMMENT ON COLUMN factores_satelites.celdas_dia_destino IS 'Celdas-día del destino en el periodo.';
COMMENT ON COLUMN factores_satelites.factor_gm_proyecto IS 'Factor por media geométrica (RMA por el origen), el estimador operativo del proyecto.';
COMMENT ON COLUMN factores_satelites.ic95_bajo IS 'Límite inferior del intervalo del 95 % (remuestreo de años; es incertidumbre de muestreo, distinta de la banda por elección de estimador).';
COMMENT ON COLUMN factores_satelites.ic95_alto IS 'Límite superior del intervalo del 95 %.';
COMMENT ON COLUMN factores_satelites.factor_ols_origen IS 'Factor por mínimos cuadrados por el origen (menor error al predecir el destino).';
COMMENT ON COLUMN factores_satelites.factor_inverso IS 'Factor por regresión inversa.';
COMMENT ON COLUMN factores_satelites.razon_de_sumas IS 'Razón de totales (iguala los totales).';
COMMENT ON COLUMN factores_satelites.spearman_mensual IS 'Correlación de Spearman mensual entre ambas series.';

CREATE TABLE parametros (
  clave text NOT NULL,
  valor text,
  descripcion text,
  PRIMARY KEY (clave)
);
COMMENT ON TABLE parametros IS 'Parámetros y metadatos del análisis (clave/valor).';
COMMENT ON COLUMN parametros.clave IS 'Nombre del parámetro.';
COMMENT ON COLUMN parametros.valor IS 'Valor.';
COMMENT ON COLUMN parametros.descripcion IS 'Qué significa.';

CREATE TABLE schema_version (
  version text NOT NULL,
  aplicada_en timestamp,
  descripcion text,
  PRIMARY KEY (version)
);
COMMENT ON TABLE schema_version IS 'Versión del esquema instalado. Los scripts de carga se niegan a cargar si no coincide con la del paquete (ver cargar.sh --recrear).';
COMMENT ON COLUMN schema_version.version IS 'Versión del esquema (ESQUEMA_VERSION).';
COMMENT ON COLUMN schema_version.aplicada_en IS 'Cuándo se instaló.';
COMMENT ON COLUMN schema_version.descripcion IS 'Nota.';

CREATE TABLE ingestas (
  ingesta_id serial,
  fecha_carga timestamp,
  descripcion text,
  cobertura_hasta date,
  filas_detecciones integer,
  PRIMARY KEY (ingesta_id)
);
COMMENT ON TABLE ingestas IS 'Registro de cargas de datos (para auditar y actualizar). Se llena al cargar.';
COMMENT ON COLUMN ingestas.ingesta_id IS 'Identificador.';
COMMENT ON COLUMN ingestas.fecha_carga IS 'Cuándo se cargó.';
COMMENT ON COLUMN ingestas.descripcion IS 'Qué se cargó.';
COMMENT ON COLUMN ingestas.cobertura_hasta IS 'Última fecha con datos.';
COMMENT ON COLUMN ingestas.filas_detecciones IS 'Filas cargadas en detecciones.';

INSERT INTO schema_version (version, aplicada_en, descripcion) VALUES ('2026.11.13-6', now(), 'Esquema generado por exportar_para_backend.py');