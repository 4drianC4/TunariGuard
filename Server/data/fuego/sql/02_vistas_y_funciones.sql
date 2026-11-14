-- Vistas y funciones de apoyo para el backend.
SET search_path = fuego, public;

-- Calendario térmico (mes x año) de cualquier área: lo que pinta el heatmap.
CREATE OR REPLACE VIEW v_calendario_mes_anio AS
SELECT area_id, anio, mes_num, indice_modis_equivalente AS indice, era, calidad_indice
FROM serie_mensual;

-- Alerta del mes en curso más reciente (la que se muestra «hoy»: factor de enlace 1,0).
CREATE OR REPLACE VIEW v_alerta_mes_en_curso AS
SELECT * FROM alerta_mes_en_curso
WHERE factor_de_enlace = 1.0 AND fecha_corte = (SELECT max(fecha_corte) FROM alerta_mes_en_curso);

-- Meses que merecen atención (vigilancia o candidata a verificación).
CREATE OR REPLACE VIEW v_alertas_destacadas AS
SELECT * FROM alertas_mensuales WHERE nivel_alerta IN ('elevada','alta','muy_alta');

-- Conteo de detecciones por área (usa las banderas de pertenencia de la tabla detecciones).
CREATE OR REPLACE VIEW v_detecciones_por_area AS
SELECT 'parque-tunari'::text AS area_id, count(*) AS detecciones FROM detecciones WHERE en_parque_tunari
UNION ALL SELECT 'municipio-cochabamba', count(*) FROM detecciones WHERE en_municipio_cochabamba
UNION ALL SELECT distrito_area_id, count(*) FROM detecciones WHERE distrito_area_id IS NOT NULL GROUP BY distrito_area_id
UNION ALL SELECT 'mun-' || regexp_replace(lower(translate(municipio_parque, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')), '[^a-z0-9]+', '-', 'g'), count(*)
          FROM detecciones WHERE municipio_parque IS NOT NULL GROUP BY municipio_parque
UNION ALL SELECT area_id, count(*) FROM detecciones_area GROUP BY area_id;

-- ¿Pertenece la detección al área? Resuelve TODOS los tipos de área en un solo lugar para que cada desarrollador
-- no interprete esta lógica a su manera: parque y municipio (banderas), distrito (distrito_area_id), municipio del
-- parque (nombre OSM) y áreas personalizadas (tabla detecciones_area).
CREATE OR REPLACE FUNCTION pertenece_a_area(d detecciones, p_area_id text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT (p_area_id = 'parque-tunari' AND d.en_parque_tunari)
        OR (p_area_id = 'municipio-cochabamba' AND d.en_municipio_cochabamba)
        OR (d.distrito_area_id = p_area_id)
        OR EXISTS (SELECT 1 FROM fuego.areas a WHERE a.area_id = p_area_id AND a.tipo = 'municipio_parque' AND d.municipio_parque = a.nombre)
        OR EXISTS (SELECT 1 FROM fuego.detecciones_area da WHERE da.area_id = p_area_id AND da.id_deteccion = d.id_deteccion)
$$;

-- Detecciones de un área con filtros y paginación. Orden estable: fecha UTC (asc o desc) y id_deteccion.
-- Para el total (X-Total-Count) usar contar_detecciones_por_area con los mismos filtros.
CREATE OR REPLACE FUNCTION detecciones_por_area(
    p_area_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_fuentes text[] DEFAULT NULL,
    p_excluir_persistentes boolean DEFAULT false, p_limite integer DEFAULT 10000, p_offset integer DEFAULT 0, p_desc boolean DEFAULT false)
RETURNS SETOF detecciones LANGUAGE sql STABLE AS $$
    SELECT d.* FROM fuego.detecciones d
    WHERE fuego.pertenece_a_area(d, p_area_id)
      AND (p_desde IS NULL OR d.fecha_bo >= p_desde)
      AND (p_hasta IS NULL OR d.fecha_bo <= p_hasta)
      AND (p_fuentes IS NULL OR d.fuente = ANY (p_fuentes))
      AND (NOT p_excluir_persistentes OR NOT d.fuente_persistente_probable)
    ORDER BY CASE WHEN p_desc THEN d.fecha_hora_utc END DESC, CASE WHEN NOT p_desc THEN d.fecha_hora_utc END ASC, d.id_deteccion
    LIMIT LEAST(GREATEST(p_limite, 1), 100000) OFFSET GREATEST(p_offset, 0)
$$;

CREATE OR REPLACE FUNCTION contar_detecciones_por_area(
    p_area_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_fuentes text[] DEFAULT NULL, p_excluir_persistentes boolean DEFAULT false)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT count(*) FROM fuego.detecciones d
    WHERE fuego.pertenece_a_area(d, p_area_id)
      AND (p_desde IS NULL OR d.fecha_bo >= p_desde)
      AND (p_hasta IS NULL OR d.fecha_bo <= p_hasta)
      AND (p_fuentes IS NULL OR d.fuente = ANY (p_fuentes))
      AND (NOT p_excluir_persistentes OR NOT d.fuente_persistente_probable)
$$;

-- Alertas de un área. Todos los filtros son opcionales (NULL = sin filtro).
CREATE OR REPLACE FUNCTION alertas_area(
    p_area_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_nivel text DEFAULT NULL,
    p_variante text DEFAULT 'base', p_solo_destacadas boolean DEFAULT false, p_limite integer DEFAULT 1000, p_offset integer DEFAULT 0)
RETURNS SETOF alertas_mensuales LANGUAGE sql STABLE AS $$
    SELECT a.* FROM fuego.alertas_mensuales a
    WHERE a.area_id = p_area_id
      AND a.variante = COALESCE(p_variante, 'base')
      AND (p_desde IS NULL OR a.mes >= p_desde)
      AND (p_hasta IS NULL OR a.mes <= p_hasta)
      AND (p_nivel IS NULL OR a.nivel_alerta = p_nivel)
      AND (NOT p_solo_destacadas OR a.nivel_alerta IN ('elevada','alta','muy_alta'))
    ORDER BY a.mes
    LIMIT LEAST(GREATEST(p_limite, 1), 10000) OFFSET GREATEST(p_offset, 0)
$$;

-- Detecciones dentro de un polígono dibujado por el usuario (WGS84). Solo cubre las dos áreas cargadas.
CREATE OR REPLACE FUNCTION buscar_detecciones(
    p_geom geometry, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_fuentes text[] DEFAULT NULL)
RETURNS SETOF detecciones LANGUAGE sql STABLE AS $$
    SELECT d.* FROM fuego.detecciones d
    WHERE ST_Intersects(d.geom, ST_SetSRID(p_geom, 4326))
      AND (p_desde IS NULL OR d.fecha_bo >= p_desde)
      AND (p_hasta IS NULL OR d.fecha_bo <= p_hasta)
      AND (p_fuentes IS NULL OR d.fuente = ANY (p_fuentes))
    ORDER BY d.fecha_hora_utc
$$;

-- Conteo mensual dentro de un polígono (para el calendario de un área dibujada). Es un conteo BRUTO por fuente:
-- no está armonizado ni calibrado. Para el índice armonizado de un polígono use serie_armonizada_poligono (con control de cobertura).
CREATE OR REPLACE FUNCTION conteo_mensual_en_poligono(
    p_geom geometry, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (mes date, fuente text, detecciones bigint, celdas_dia bigint) LANGUAGE sql STABLE AS $$
    SELECT date_trunc('month', d.fecha_bo)::date, d.fuente, count(*), count(DISTINCT (d.fecha_bo, d.cell_id))
    FROM fuego.detecciones d
    WHERE ST_Intersects(d.geom, ST_SetSRID(p_geom, 4326))
      AND (p_desde IS NULL OR d.fecha_bo >= p_desde)
      AND (p_hasta IS NULL OR d.fecha_bo <= p_hasta)
    GROUP BY 1, 2 ORDER BY 1, 2
$$;

-- Serie mensual ARMONIZADA de un polígono dibujado por el usuario (contención geométrica: cuenta las detecciones dentro del polígono).
-- Lee el catálogo fuentes_satelitales: por mes usa los satélites con entra_al_indice entre inicio_indice y fin_indice, cuenta celdas-día por
-- grupo_union (Terra y Aqua se unen) y divide entre factor_a_modis. Un polígono dibujado SIEMPRE es metodo_indice = viirs_reescalado (VIIRS / factor,
-- factor transferido del Tunari, sin validación local; sin valor antes de febrero de 2012): el promedio MODIS+VIIRS solo se usa en el Parque Tunari registrado.
-- COBERTURA: solo hay datos del parque y del municipio de Cochabamba. pct_area_con_datos dice qué parte del polígono está cubierta;
-- si es 0, sin_cobertura = true y el índice es NULL (NO es cero incendios). Mostrar siempre aviso. Solo hasta parametros.cobertura_hasta.
CREATE OR REPLACE FUNCTION serie_armonizada_poligono(
    p_geom geometry, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (mes date, era text, indice_modis_equivalente double precision, modis_celdas_dia double precision,
               viirs_equivalente double precision, fuentes_usadas text, aviso text, pct_area_con_datos double precision, sin_cobertura boolean,
               calidad_indice text, metodo_indice text) LANGUAGE sql STABLE AS $$
WITH g AS (SELECT ST_MakeValid(ST_SetSRID(p_geom, 4326)) AS geom),
cobertura AS (  -- fracción del polígono que cae dentro de lo cargado (parque + municipio de Cochabamba)
    SELECT CASE WHEN g.geom IS NULL OR ST_Area(ST_Transform(g.geom, 32720)) = 0 THEN 0::double precision
                ELSE LEAST(1::double precision, ST_Area(ST_Transform(ST_Intersection(g.geom,
                     (SELECT ST_Union(a.geom) FROM fuego.areas a WHERE a.area_id IN ('parque-tunari','municipio-cochabamba'))), 32720))
                     / ST_Area(ST_Transform(g.geom, 32720))) END AS frac
    FROM g
),
cob AS (SELECT valor::date AS fin FROM fuego.parametros WHERE clave = 'cobertura_hasta'),
lim AS (
    SELECT COALESCE(date_trunc('month', p_desde), date_trunc('month', (SELECT min(inicio_indice) FROM fuego.fuentes_satelitales WHERE entra_al_indice)))::date AS d0,
           date_trunc('month', LEAST(COALESCE(p_hasta, (SELECT fin FROM cob)), (SELECT fin FROM cob)))::date AS d1
),
meses AS (SELECT generate_series(d0, d1, interval '1 month')::date AS mes FROM lim),
grupos AS (
    SELECT m.mes, f.grupo_union, f.familia, max(f.factor_a_modis) AS factor
    FROM meses m JOIN fuego.fuentes_satelitales f
      ON f.entra_al_indice AND f.inicio_indice <= m.mes AND (f.fin_indice IS NULL OR m.mes <= f.fin_indice)
    GROUP BY m.mes, f.grupo_union, f.familia
),
conteo AS (
    SELECT date_trunc('month', d.fecha_bo)::date AS mes, f.grupo_union, count(DISTINCT (d.fecha_bo, d.cell_id))::double precision AS celdas_dia
    FROM fuego.detecciones d JOIN fuego.fuentes_satelitales f ON f.fuente = d.fuente
    WHERE ST_Intersects(d.geom, (SELECT geom FROM g))
    GROUP BY 1, 2
),
modo AS (SELECT 'solo_viirs' AS modo),
valores AS (
    SELECT g2.mes, g2.grupo_union, g2.familia, COALESCE(c.celdas_dia, 0) AS celdas_dia, COALESCE(c.celdas_dia, 0) / g2.factor AS equiv
    FROM grupos g2 LEFT JOIN conteo c ON c.mes = g2.mes AND c.grupo_union = g2.grupo_union
),
por_familia AS (
    SELECT mes, familia, avg(equiv) AS equiv, sum(celdas_dia) AS celdas_dia, string_agg(grupo_union, ' + ' ORDER BY grupo_union) AS usados
    FROM valores GROUP BY mes, familia
)
SELECT pf.mes,
       CASE WHEN count(*) FILTER (WHERE pf.familia = 'VIIRS') = 0 THEN 'MODIS_solo' ELSE 'MODIS+VIIRS' END,
       CASE WHEN c.frac = 0 THEN NULL
            WHEN mo.modo = 'solo_viirs' THEN max(pf.equiv) FILTER (WHERE pf.familia = 'VIIRS')
            ELSE avg(pf.equiv) END,
       CASE WHEN c.frac = 0 THEN NULL ELSE sum(pf.celdas_dia) FILTER (WHERE pf.familia = 'MODIS') END,
       CASE WHEN c.frac = 0 THEN NULL ELSE max(pf.equiv) FILTER (WHERE pf.familia = 'VIIRS') END,
       string_agg(pf.usados, ' + ' ORDER BY pf.familia),
       CASE WHEN c.frac = 0 THEN 'SIN COBERTURA: el polígono está fuera de lo cargado (parque y municipio de Cochabamba). No hay datos; esto NO significa cero incendios.'
            WHEN c.frac < 0.999 THEN 'COBERTURA PARCIAL: solo ' || round((100 * c.frac)::numeric, 1) || ' % del polígono tiene datos cargados; el índice solo refleja esa parte. Índice relativo con los factores del catálogo (calibrados en el Tunari): aproximado; no son hectáreas ni número de incendios.'
            ELSE 'Índice relativo con los factores del catálogo (calibrados en el Tunari): en otros territorios o polígonos pequeños es aproximado; no son hectáreas ni número de incendios.' END
       || CASE WHEN mo.modo = 'solo_viirs' THEN ' Índice = VIIRS reescalado con el factor del Tunari (factor transferido, sin validación local; no es una armonización de dos sensores). No hay valor comparable antes de febrero de 2012.' ELSE '' END,
       round((100 * c.frac)::numeric, 1)::double precision,
       (c.frac = 0),
       CASE WHEN c.frac = 0 THEN NULL
            WHEN mo.modo = 'solo_viirs' THEN CASE WHEN count(*) FILTER (WHERE pf.familia = 'VIIRS') > 0 THEN 'aproximado_factor_transferido' ELSE 'no_comparable' END
            ELSE 'calibrado_localmente_en_tunari' END,
       CASE WHEN mo.modo = 'mixto' THEN 'mixto_calibrado' ELSE 'viirs_reescalado' END
FROM por_familia pf CROSS JOIN cobertura c CROSS JOIN modo mo 
GROUP BY pf.mes, c.frac, mo.modo ORDER BY pf.mes
$$;

-- Lo mismo para un área REGISTRADA, pero con la lógica oficial de pertenencia (pertenece_a_area): así coincide con serie_mensual.
-- Importante para municipio_parque: allí cuentan solo las detecciones del PARQUE asignadas a ese municipio, no todo el municipio.
-- La validación de carga comprueba que coincide con serie_mensual en las áreas registradas.
CREATE OR REPLACE FUNCTION serie_armonizada_area(
    p_area_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (mes date, era text, indice_modis_equivalente double precision, modis_celdas_dia double precision,
               viirs_equivalente double precision, fuentes_usadas text, aviso text, pct_area_con_datos double precision, sin_cobertura boolean,
               calidad_indice text, metodo_indice text) LANGUAGE sql STABLE AS $$
WITH g AS (SELECT (SELECT a.geom FROM fuego.areas a WHERE a.area_id = p_area_id) AS geom),
cobertura AS (  -- fracción del polígono que cae dentro de lo cargado (parque + municipio de Cochabamba)
    SELECT CASE WHEN g.geom IS NULL OR ST_Area(ST_Transform(g.geom, 32720)) = 0 THEN 0::double precision
                ELSE LEAST(1::double precision, ST_Area(ST_Transform(ST_Intersection(g.geom,
                     (SELECT ST_Union(a.geom) FROM fuego.areas a WHERE a.area_id IN ('parque-tunari','municipio-cochabamba'))), 32720))
                     / ST_Area(ST_Transform(g.geom, 32720))) END AS frac
    FROM g
),
cob AS (SELECT valor::date AS fin FROM fuego.parametros WHERE clave = 'cobertura_hasta'),
lim AS (
    SELECT COALESCE(date_trunc('month', p_desde), date_trunc('month', (SELECT min(inicio_indice) FROM fuego.fuentes_satelitales WHERE entra_al_indice)))::date AS d0,
           date_trunc('month', LEAST(COALESCE(p_hasta, (SELECT fin FROM cob)), (SELECT fin FROM cob)))::date AS d1
),
meses AS (SELECT generate_series(d0, d1, interval '1 month')::date AS mes FROM lim),
grupos AS (
    SELECT m.mes, f.grupo_union, f.familia, max(f.factor_a_modis) AS factor
    FROM meses m JOIN fuego.fuentes_satelitales f
      ON f.entra_al_indice AND f.inicio_indice <= m.mes AND (f.fin_indice IS NULL OR m.mes <= f.fin_indice)
    GROUP BY m.mes, f.grupo_union, f.familia
),
conteo AS (
    SELECT date_trunc('month', d.fecha_bo)::date AS mes, f.grupo_union, count(DISTINCT (d.fecha_bo, d.cell_id))::double precision AS celdas_dia
    FROM fuego.detecciones d JOIN fuego.fuentes_satelitales f ON f.fuente = d.fuente
    WHERE fuego.pertenece_a_area(d, p_area_id)
    GROUP BY 1, 2
),
modo AS (SELECT CASE WHEN (SELECT a.metodo_indice FROM fuego.areas a WHERE a.area_id = p_area_id) = 'mixto_calibrado' THEN 'mixto' ELSE 'solo_viirs' END AS modo),
valores AS (
    SELECT g2.mes, g2.grupo_union, g2.familia, COALESCE(c.celdas_dia, 0) AS celdas_dia, COALESCE(c.celdas_dia, 0) / g2.factor AS equiv
    FROM grupos g2 LEFT JOIN conteo c ON c.mes = g2.mes AND c.grupo_union = g2.grupo_union
),
por_familia AS (
    SELECT mes, familia, avg(equiv) AS equiv, sum(celdas_dia) AS celdas_dia, string_agg(grupo_union, ' + ' ORDER BY grupo_union) AS usados
    FROM valores GROUP BY mes, familia
)
SELECT pf.mes,
       CASE WHEN count(*) FILTER (WHERE pf.familia = 'VIIRS') = 0 THEN 'MODIS_solo' ELSE 'MODIS+VIIRS' END,
       CASE WHEN c.frac = 0 THEN NULL
            WHEN mo.modo = 'solo_viirs' THEN max(pf.equiv) FILTER (WHERE pf.familia = 'VIIRS')
            ELSE avg(pf.equiv) END,
       CASE WHEN c.frac = 0 THEN NULL ELSE sum(pf.celdas_dia) FILTER (WHERE pf.familia = 'MODIS') END,
       CASE WHEN c.frac = 0 THEN NULL ELSE max(pf.equiv) FILTER (WHERE pf.familia = 'VIIRS') END,
       string_agg(pf.usados, ' + ' ORDER BY pf.familia),
       CASE WHEN c.frac = 0 THEN 'SIN COBERTURA: el polígono está fuera de lo cargado (parque y municipio de Cochabamba). No hay datos; esto NO significa cero incendios.'
            WHEN c.frac < 0.999 THEN 'COBERTURA PARCIAL: solo ' || round((100 * c.frac)::numeric, 1) || ' % del polígono tiene datos cargados; el índice solo refleja esa parte. Índice relativo con los factores del catálogo (calibrados en el Tunari): aproximado; no son hectáreas ni número de incendios.'
            ELSE 'Índice relativo con los factores del catálogo (calibrados en el Tunari): en otros territorios o polígonos pequeños es aproximado; no son hectáreas ni número de incendios.' END
       || CASE WHEN mo.modo = 'solo_viirs' THEN ' Índice = VIIRS reescalado con el factor del Tunari (factor transferido, sin validación local; no es una armonización de dos sensores). No hay valor comparable antes de febrero de 2012.' ELSE '' END,
       round((100 * c.frac)::numeric, 1)::double precision,
       (c.frac = 0),
       CASE WHEN c.frac = 0 THEN NULL
            WHEN mo.modo = 'solo_viirs' THEN CASE WHEN count(*) FILTER (WHERE pf.familia = 'VIIRS') > 0 THEN 'aproximado_factor_transferido' ELSE 'no_comparable' END
            ELSE 'calibrado_localmente_en_tunari' END,
       CASE WHEN mo.modo = 'mixto' THEN 'mixto_calibrado' ELSE 'viirs_reescalado' END
FROM por_familia pf CROSS JOIN cobertura c CROSS JOIN modo mo WHERE EXISTS (SELECT 1 FROM fuego.areas a WHERE a.area_id = p_area_id)
GROUP BY pf.mes, c.frac, mo.modo ORDER BY pf.mes
$$;

