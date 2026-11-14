-- Carga INCREMENTAL de novedades: detecciones posteriores a la cobertura del análisis (parametros.cobertura_hasta).
-- Las genera `python actualizar_detecciones.py` (o su receta en docs/RECETA_ACTUALIZACION.md) en datos_prueba/detecciones_2026.csv.
-- Ejecutar con psql DESDE la carpeta del paquete:  psql -d BASE -v ON_ERROR_STOP=1 -f sql/05_cargar_novedades.sql
-- Idempotente: se puede ejecutar cada pocas horas. Reemplaza las filas NRT del mismo rango de fechas (no por id_deteccion: parte de las NRT no
-- coincide con su versión estándar) y NUNCA toca fechas anteriores o iguales a cobertura_hasta, que ya pasaron por el análisis completo.
\set ON_ERROR_STOP on
BEGIN;
SET search_path = fuego, public;
CREATE TEMP TABLE novedades (LIKE detecciones) ON COMMIT DROP;
\copy novedades (id_deteccion, fecha_hora_utc, fecha_hora_bo, fecha_bo, fuente, sensor, plataforma, lat, lon, confianza_original, confianza_clase, frp_mw, dia_noche, tipo, cell_id, distrito, distrito_area_id, municipio_parque, en_parque_tunari, en_municipio_cochabamba, zona_municipio, distancia_al_parque_km, fuente_persistente_probable, distrito_gamc, comuna_gamc, zona_cota2750_gamc, periurbano_gamc, periurbano_detalle_gamc, origen_dato, tipo_conocido, evento_id_tunari, evento_id_cbba) FROM 'datos_prueba/detecciones_2026.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
SELECT count(*) AS filas_en_el_archivo, min(fecha_bo) AS desde, max(fecha_bo) AS hasta FROM novedades;
DELETE FROM detecciones d USING (SELECT min(fecha_bo) AS a, max(fecha_bo) AS b FROM novedades) r
 WHERE d.origen_dato = 'NRT' AND d.fecha_bo BETWEEN r.a AND r.b
   AND d.fecha_bo > (SELECT valor::date FROM parametros WHERE clave = 'cobertura_hasta');
INSERT INTO detecciones (id_deteccion, fecha_hora_utc, fecha_hora_bo, fecha_bo, fuente, sensor, plataforma, lat, lon, confianza_original, confianza_clase, frp_mw, dia_noche, tipo, cell_id, distrito, distrito_area_id, municipio_parque, en_parque_tunari, en_municipio_cochabamba, zona_municipio, distancia_al_parque_km, fuente_persistente_probable, distrito_gamc, comuna_gamc, zona_cota2750_gamc, periurbano_gamc, periurbano_detalle_gamc, origen_dato, tipo_conocido, evento_id_tunari, evento_id_cbba)
SELECT id_deteccion, fecha_hora_utc, fecha_hora_bo, fecha_bo, fuente, sensor, plataforma, lat, lon, confianza_original, confianza_clase, frp_mw, dia_noche, tipo, cell_id, distrito, distrito_area_id, municipio_parque, en_parque_tunari, en_municipio_cochabamba, zona_municipio, distancia_al_parque_km, fuente_persistente_probable, distrito_gamc, comuna_gamc, zona_cota2750_gamc, periurbano_gamc, periurbano_detalle_gamc, origen_dato, tipo_conocido, evento_id_tunari, evento_id_cbba FROM novedades n
 WHERE n.fecha_bo > (SELECT valor::date FROM parametros WHERE clave = 'cobertura_hasta')
ON CONFLICT (id_deteccion) DO NOTHING;
SELECT count(*) AS detecciones_despues_de_la_cobertura FROM detecciones WHERE fecha_bo > (SELECT valor::date FROM parametros WHERE clave = 'cobertura_hasta');
COMMIT;
