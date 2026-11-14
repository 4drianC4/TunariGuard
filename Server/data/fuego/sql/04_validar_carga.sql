-- Comprueba que la carga está completa y coherente. Falla (EXCEPTION) ante cualquier incumplimiento.
-- Los conteos se generan desde el mismo diccionario que conteos_esperados.json.
SET search_path = fuego, public;
DO $$
DECLARE n bigint; mx date; cob date;
BEGIN
  SELECT count(*) INTO n FROM areas; IF n <> 31 THEN RAISE EXCEPTION 'areas: esperaba 31 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM fuentes_satelitales; IF n <> 5 THEN RAISE EXCEPTION 'fuentes_satelitales: esperaba 5 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM celdas_1km; IF n <> 3791 THEN RAISE EXCEPTION 'celdas_1km: esperaba 3791 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM eventos; IF n <> 2577 THEN RAISE EXCEPTION 'eventos: esperaba 2577 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM detecciones; IF n <> 6157 THEN RAISE EXCEPTION 'detecciones: esperaba 6157 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM detecciones_area; IF n <> 393 THEN RAISE EXCEPTION 'detecciones_area: esperaba 393 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM serie_mensual; IF n <> 9519 THEN RAISE EXCEPTION 'serie_mensual: esperaba 9519 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM serie_agregada; IF n <> 128 THEN RAISE EXCEPTION 'serie_agregada: esperaba 128 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM alertas_mensuales; IF n <> 5207 THEN RAISE EXCEPTION 'alertas_mensuales: esperaba 5207 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM recurrencia_celda; IF n <> 2014 THEN RAISE EXCEPTION 'recurrencia_celda: esperaba 2014 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM puntos_calientes_gi; IF n <> 4138 THEN RAISE EXCEPTION 'puntos_calientes_gi: esperaba 4138 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM conglomerados_gi; IF n <> 20 THEN RAISE EXCEPTION 'conglomerados_gi: esperaba 20 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM tendencias; IF n <> 5 THEN RAISE EXCEPTION 'tendencias: esperaba 5 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM casos_documentados; IF n <> 7 THEN RAISE EXCEPTION 'casos_documentados: esperaba 7 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM alerta_mes_en_curso; IF n <> 48 THEN RAISE EXCEPTION 'alerta_mes_en_curso: esperaba 48 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM factores_satelites; IF n <> 16 THEN RAISE EXCEPTION 'factores_satelites: esperaba 16 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM parametros; IF n <> 30 THEN RAISE EXCEPTION 'parametros: esperaba 30 filas y hay %', n; END IF;
  -- geometrías
  SELECT count(*) INTO n FROM areas WHERE geom IS NULL OR NOT ST_IsValid(geom); IF n > 0 THEN RAISE EXCEPTION 'hay % áreas con geometría nula o inválida', n; END IF;
  SELECT count(*) INTO n FROM celdas_1km WHERE geom IS NULL OR NOT ST_IsValid(geom); IF n > 0 THEN RAISE EXCEPTION 'hay % celdas con geometría nula o inválida', n; END IF;
  SELECT count(*) INTO n FROM detecciones WHERE geom IS NULL; IF n > 0 THEN RAISE EXCEPTION 'hay detecciones sin geometría'; END IF;
  -- catálogo de satélites
  SELECT count(*) INTO n FROM fuentes_satelitales f WHERE f.entra_al_indice AND NOT EXISTS (SELECT 1 FROM detecciones d WHERE d.fuente = f.fuente); IF n > 0 THEN RAISE EXCEPTION 'hay % satélites en el índice sin detecciones cargadas', n; END IF;
  SELECT count(*) INTO n FROM (SELECT grupo_union FROM fuentes_satelitales GROUP BY grupo_union HAVING count(DISTINCT familia) > 1 OR count(DISTINCT factor_a_modis) > 1) x; IF n > 0 THEN RAISE EXCEPTION 'un grupo_union mezcla familias o factores distintos'; END IF;
  -- el índice armonizado de CADA área registrada debe coincidir con serie_mensual (mismos meses y mismos valores)
  SELECT count(*) INTO n FROM areas a WHERE EXISTS (SELECT 1 FROM serie_mensual s WHERE s.area_id = a.area_id) AND (SELECT count(*) FROM serie_mensual s JOIN serie_armonizada_area(a.area_id) f ON f.mes = s.mes WHERE s.area_id = a.area_id AND ((s.indice_modis_equivalente IS NULL AND f.indice_modis_equivalente IS NULL) OR abs(s.indice_modis_equivalente - f.indice_modis_equivalente) <= 0.000001) AND s.calidad_indice IS NOT DISTINCT FROM f.calidad_indice) <> (SELECT count(*) FROM serie_mensual s WHERE s.area_id = a.area_id);
  IF n > 0 THEN RAISE EXCEPTION 'serie_armonizada_area no coincide con serie_mensual en % áreas', n; END IF;
  -- cobertura temporal
  SELECT max(fecha_bo) INTO mx FROM detecciones; SELECT valor::date INTO cob FROM parametros WHERE clave = 'cobertura_hasta';
  IF mx > cob + 1 THEN RAISE EXCEPTION 'hay detecciones posteriores a la cobertura declarada (% > %)', mx, cob; END IF;
  -- alertas
  SELECT count(*) INTO n FROM alertas_mensuales WHERE probabilidad_exceso IS NOT NULL AND probabilidad_exceso NOT BETWEEN 0 AND 1; IF n > 0 THEN RAISE EXCEPTION 'hay % probabilidades fuera de [0,1]', n; END IF;
  SELECT count(*) INTO n FROM alertas_mensuales WHERE nivel_alerta = 'muy_alta' AND probabilidad_exceso > 0.01; IF n > 0 THEN RAISE EXCEPTION 'muy_alta con p > 0,01'; END IF;
  SELECT count(*) INTO n FROM alertas_mensuales WHERE nivel_alerta = 'alta' AND probabilidad_exceso > 0.05; IF n > 0 THEN RAISE EXCEPTION 'alta con p > 0,05'; END IF;
  SELECT count(*) INTO n FROM alertas_mensuales WHERE nivel_alerta = 'elevada' AND probabilidad_exceso > 0.10; IF n > 0 THEN RAISE EXCEPTION 'elevada con p > 0,10'; END IF;
  -- eventos y áreas
  SELECT count(*) INTO n FROM eventos e WHERE NOT EXISTS (SELECT 1 FROM detecciones d WHERE e.evento_id IN (d.evento_id_tunari, d.evento_id_cbba)) AND NOT EXISTS (SELECT 1 FROM detecciones_area da WHERE da.evento_id = e.evento_id);
  IF n > 0 THEN RAISE EXCEPTION 'hay % eventos sin detecciones', n; END IF;
  SELECT count(*) INTO n FROM areas a WHERE a.tipo IN ('parque','municipio','distrito','municipio_parque') AND NOT EXISTS (SELECT 1 FROM serie_mensual s WHERE s.area_id = a.area_id); IF n > 0 THEN RAISE EXCEPTION 'hay % áreas sin serie mensual', n; END IF;
  -- consistencia de la lógica de pertenencia
  SELECT count(*) INTO n FROM v_detecciones_por_area v WHERE v.area_id IN ('parque-tunari','municipio-cochabamba','distrito-09') AND v.detecciones <> contar_detecciones_por_area(v.area_id); IF n > 0 THEN RAISE EXCEPTION 'contar_detecciones_por_area no coincide con la vista'; END IF;
  RAISE NOTICE 'Carga verificada: % tablas con las filas esperadas y todos los controles de calidad superados', 17;
END $$;

-- Ejemplos de consultas del visor
SELECT area_id, detecciones FROM v_detecciones_por_area ORDER BY detecciones DESC LIMIT 5;
SELECT anio, mes_num, round(indice::numeric, 1) AS indice FROM v_calendario_mes_anio WHERE area_id = 'parque-tunari' AND anio = 2020 ORDER BY mes_num;
SELECT mes, nivel_alerta, round(probabilidad_exceso::numeric, 3) AS p, lectura_modelo FROM alertas_area('parque-tunari', NULL, NULL, NULL, 'base', true) ORDER BY mes DESC LIMIT 5;
SELECT contar_detecciones_por_area('distrito-09') AS detecciones_distrito_09, (SELECT count(*) FROM detecciones_por_area('distrito-09', '2020-01-01', '2020-12-31', NULL, false, 50, 0)) AS en_2020;
SELECT count(*) AS en_poligono FROM buscar_detecciones(ST_GeomFromText('POLYGON((-66.30 -17.40, -66.00 -17.40, -66.00 -17.20, -66.30 -17.20, -66.30 -17.40))', 4326), '2020-01-01', '2020-12-31');