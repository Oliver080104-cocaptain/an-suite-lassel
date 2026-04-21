-- ============================================================
-- MIGRATION 012: Rechnungen arbeitstage (Array)
-- Speichert den Leistungszeitraum als Array von einzelnen Tagen
-- (ISO-Strings "YYYY-MM-DD"), damit nicht-zusammenhängende Tage
-- erhalten bleiben.
-- Additiv — leistungszeitraum_von/_bis bleiben als min/max erhalten.
-- ============================================================

ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS arbeitstage JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
