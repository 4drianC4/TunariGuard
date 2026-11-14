-- Carga/actualiza la ALERTA DEL MES EN CURSO desde datos_prueba/alerta_mes_en_curso.csv (la genera `python actualizar_detecciones.py --alerta`).
-- Ejecutar con psql DESDE la carpeta del paquete:  psql -d BASE -v ON_ERROR_STOP=1 -f sql/06_cargar_alerta_mes_en_curso.sql
-- Idempotente (upsert por area_id, fecha_corte, factor_de_enlace): conserva el historial de cortes anteriores.
\set ON_ERROR_STOP on
BEGIN;
SET search_path = fuego, public;
CREATE TEMP TABLE alerta_nueva (LIKE alerta_mes_en_curso) ON COMMIT DROP;
\copy alerta_nueva (area_id, fecha_corte, mes, dias_transcurridos, dias_del_mes, satelite_base, factor_de_enlace, celdas_dia_observadas, esperado_modelo, mediana_historica_tramo, percentil_historico, anios_de_historial, probabilidad_exceso, nivel_alerta, lectura) FROM 'datos_prueba/alerta_mes_en_curso.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
INSERT INTO alerta_mes_en_curso (area_id, fecha_corte, mes, dias_transcurridos, dias_del_mes, satelite_base, factor_de_enlace, celdas_dia_observadas, esperado_modelo, mediana_historica_tramo, percentil_historico, anios_de_historial, probabilidad_exceso, nivel_alerta, lectura)
SELECT area_id, fecha_corte, mes, dias_transcurridos, dias_del_mes, satelite_base, factor_de_enlace, celdas_dia_observadas, esperado_modelo, mediana_historica_tramo, percentil_historico, anios_de_historial, probabilidad_exceso, nivel_alerta, lectura FROM alerta_nueva
ON CONFLICT (area_id, fecha_corte, factor_de_enlace) DO UPDATE SET dias_transcurridos = EXCLUDED.dias_transcurridos, dias_del_mes = EXCLUDED.dias_del_mes, satelite_base = EXCLUDED.satelite_base, factor_de_enlace = EXCLUDED.factor_de_enlace, celdas_dia_observadas = EXCLUDED.celdas_dia_observadas, esperado_modelo = EXCLUDED.esperado_modelo, mediana_historica_tramo = EXCLUDED.mediana_historica_tramo, percentil_historico = EXCLUDED.percentil_historico, anios_de_historial = EXCLUDED.anios_de_historial, probabilidad_exceso = EXCLUDED.probabilidad_exceso, nivel_alerta = EXCLUDED.nivel_alerta, lectura = EXCLUDED.lectura;
SELECT area_id, fecha_corte, dias_transcurridos, celdas_dia_observadas, esperado_modelo, nivel_alerta FROM v_alerta_mes_en_curso ORDER BY area_id LIMIT 5;
COMMIT;
