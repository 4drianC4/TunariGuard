-- Contenido descriptivo multilingüe con trazabilidad de origen.
-- No modifica observations, alert measurements, coordinates or raw provider payloads.

CREATE TABLE IF NOT EXISTS localized_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(160) NOT NULL,
  field_key VARCHAR(100) NOT NULL,
  language VARCHAR(2) NOT NULL CHECK (language IN ('es', 'en')),
  content TEXT NOT NULL,
  source_language VARCHAR(2) NOT NULL CHECK (source_language IN ('es', 'en')),
  translation_status VARCHAR(20) NOT NULL DEFAULT 'original'
    CHECK (translation_status IN ('original', 'human', 'machine', 'pending')),
  source_provider VARCHAR(120),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, field_key, language)
);

CREATE INDEX IF NOT EXISTS localized_contents_lookup_idx
  ON localized_contents (entity_type, entity_id, language);

COMMENT ON TABLE localized_contents IS
  'Localized descriptive text only. Scientific measurements and raw satellite records remain unchanged.';
