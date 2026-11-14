-- Tipo de detección FIRMS (columna `type`): 0 incendio de vegetación probable, 1 volcán activo,
-- 2 otra fuente estática en tierra, 3 costa afuera. Nulo si el archivo no lo trae (NRT).
ALTER TABLE "observations" ADD COLUMN "detection_type" SMALLINT;

-- Las filas ya importadas conservan el valor original en `raw`: se recupera si era válido.
UPDATE "observations"
SET "detection_type" = ("raw"->>'type')::smallint
WHERE "raw"->>'type' ~ '^[0-3]$';

-- Búsqueda de NRT por plataforma y rango de fechas al llegar el dato estándar.
CREATE INDEX "observations_platform_acquired_at_idx" ON "observations" ("platform", "acquired_at");
