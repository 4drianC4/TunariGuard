-- Carga de datos con \copy (ejecutar con psql desde la carpeta entrega_backend/).
-- TODO en UNA transacción: si cualquier paso o validación falla, no queda nada a medias (se revierte).
-- Es idempotente: vacía las tablas de datos y las vuelve a llenar. Pensado para desarrollo y pruebas; en producción conviene
-- cargar en tablas de staging, validar y reemplazar (ver README_BACKEND.md).
\set ON_ERROR_STOP on
BEGIN;
SET search_path = fuego, public;

TRUNCATE parametros, factores_satelites, alerta_mes_en_curso, casos_documentados, tendencias, conglomerados_gi, puntos_calientes_gi, recurrencia_celda, alertas_mensuales, serie_agregada, serie_mensual, detecciones_area, detecciones, eventos, celdas_1km, fuentes_satelitales, areas RESTART IDENTITY CASCADE;

\copy areas (area_id, tipo, nombre, nombre_visible, alcance_estadistico, codigo, padre_area_id, area_km2, area_en_parque_km2, fuente_limite, es_oficial, geometria_original_oficial, metodo_derivacion, redistribucion_autorizada, metodo_indice, origen_factor, validacion_local, comparabilidad_pre_2012, advertencia, geom_wkt) FROM 'datos/areas.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy fuentes_satelitales (fuente, familia, plataforma, resolucion_nominal_m, primer_anio, ultimo_anio, grupo_union, entra_al_indice, usa_en_alertas, activo, inicio_indice, fin_indice, factor_a_modis, factor_ic95_bajo, factor_ic95_alto, factor_origen, nota) FROM 'datos/fuentes_satelitales.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy celdas_1km (cell_id, grid_col, grid_row, lon_centro, lat_centro, geom_wkt) FROM 'datos/celdas_1km.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy eventos (evento_id, area_id, fecha_inicio, fecha_fin, detecciones, celdas_1km, frp_suma_mw, frp_max_mw, duracion_dias, diagonal_bbox_km, es_multisensor, fuentes) FROM 'datos/eventos.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy detecciones (id_deteccion, fecha_hora_utc, fecha_hora_bo, fecha_bo, fuente, sensor, plataforma, lat, lon, confianza_original, confianza_clase, frp_mw, dia_noche, tipo, cell_id, distrito, distrito_area_id, municipio_parque, en_parque_tunari, en_municipio_cochabamba, zona_municipio, distancia_al_parque_km, fuente_persistente_probable, distrito_gamc, comuna_gamc, zona_cota2750_gamc, periurbano_gamc, periurbano_detalle_gamc, origen_dato, tipo_conocido, evento_id_tunari, evento_id_cbba) FROM 'datos/detecciones.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy detecciones_area (area_id, id_deteccion, evento_id, fuente_persistente_probable) FROM 'datos/detecciones_area.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy serie_mensual (area_id, mes, anio, mes_num, era, modis_celdas_dia, viirs_snpp_celdas_dia, factor_viirs_por_modis, indice_modis_equivalente, indice_para_alertas, conteo_base_alertas, limite_inferior_p05, limite_superior_p95, limite_inferior_estructural, limite_superior_estructural, calidad_indice) FROM 'datos/serie_mensual.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy serie_agregada (area_id, escala, periodo, mes_inicio, meses_incluidos, indice, inferior, superior, inferior_estructural, superior_estructural) FROM 'datos/serie_agregada.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy alertas_mensuales (area_id, variante, mes, anio, mes_num, era, celdas_dia_base, indice_modis_equivalente, n_baseline_mismo_mes, mediana_historica_mes, veces_mediana_historica, percentil_historico, z_score, z_score_supera_2, esperado_modelo, probabilidad_exceso, equivalente_anios_indicativo, actividad_minima_ok, nivel_alerta, categoria_alerta, lectura_modelo, base_alertas) FROM 'datos/alertas_mensuales.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy recurrencia_celda (area_id, cell_id, ranking, detecciones_total, dias_con_deteccion, primer_anio, ultimo_anio, anios_con_fuego_2001_2025, anios_con_fuego_viirs_2013_2025, anios_temporada_viirs_2013_2025, pct_anios_2001_2025, pct_anios_viirs_2013_2025, clase_recurrencia_viirs, mes_pico, unidad_principal, fuente_persistente_probable) FROM 'datos/recurrencia_celda.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy puntos_calientes_gi (area_id, cell_id, celdas_dia_viirs_2013_2025, z_gi_estrella, p_ajustado_bh, punto_caliente, punto_frio, conglomerado) FROM 'datos/puntos_calientes_gi.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy conglomerados_gi (area_id, conglomerado, celdas_1km, celdas_dia_viirs, z_maximo, lon_centro, lat_centro, unidad_principal) FROM 'datos/conglomerados_gi.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy tendencias (area_id, serie, anios, n, tau_kendall, p_valor, pendiente_sen_por_anio, ic90_inferior, ic90_superior, mediana_de_la_serie) FROM 'datos/tendencias.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy casos_documentados (fecha_documentada, lugar_reportado, descripcion, url_fuente, detecciones_firms_2dias, percentil_en_temporada, destaca_sobre_temporada_p75, percentil_mismo_mes_anio, destaca_mismo_mes_anio_p75, limitacion) FROM 'datos/casos_documentados.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy alerta_mes_en_curso (area_id, fecha_corte, mes, dias_transcurridos, dias_del_mes, satelite_base, factor_de_enlace, celdas_dia_observadas, esperado_modelo, mediana_historica_tramo, percentil_historico, anios_de_historial, probabilidad_exceso, nivel_alerta, lectura) FROM 'datos/alerta_mes_en_curso.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy factores_satelites (zona, de, a, periodo, meses, celdas_dia_origen, celdas_dia_destino, factor_gm_proyecto, ic95_bajo, ic95_alto, factor_ols_origen, factor_inverso, razon_de_sumas, spearman_mensual) FROM 'datos/factores_satelites.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy parametros (clave, valor, descripcion) FROM 'datos/parametros.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

INSERT INTO ingestas (fecha_carga, descripcion, cobertura_hasta, filas_detecciones)
SELECT now(), 'Carga del paquete de entrega', (SELECT valor::date FROM parametros WHERE clave = 'cobertura_hasta'), count(*) FROM detecciones;

-- Validación dentro de la transacción: si falla, se revierte toda la carga.
\i sql/04_validar_carga.sql

COMMIT;
ANALYZE;