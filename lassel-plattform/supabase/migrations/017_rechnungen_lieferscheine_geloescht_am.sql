-- ============================================================
-- MIGRATION 017: geloescht_am für rechnungen + lieferscheine
-- Im Supabase SQL Editor ausführen.
--
-- Symptom: Gelöschte Rechnungen/Lieferscheine waren vorher Hard-Deletes,
-- während Angebote Soft-Delete nutzen. Effekt:
--   - Papierkorb bekam rechnungen/lieferscheine nie zu sehen
--   - "Verknüpfte Dokumente" im Angebot zeigte weiterhin Einträge
--     zu Docs die anderswo gelöscht wurden
--
-- Fix: Soft-Delete-Pattern (geloescht_am TIMESTAMPTZ) für alle drei
-- Dokument-Typen vereinheitlichen. App-seitig wird jetzt UPDATE statt
-- DELETE gemacht; Queries filtern auf geloescht_am IS NULL.
--
-- Additiv/idempotent.
-- ============================================================

ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS geloescht_am TIMESTAMPTZ;

ALTER TABLE lieferscheine
  ADD COLUMN IF NOT EXISTS geloescht_am TIMESTAMPTZ;

-- Partielle Indexe analog zu angebote, beschleunigen die "nur aktive"-Queries.
CREATE INDEX IF NOT EXISTS idx_rechnungen_geloescht
  ON rechnungen(geloescht_am) WHERE geloescht_am IS NULL;
CREATE INDEX IF NOT EXISTS idx_lieferscheine_geloescht
  ON lieferscheine(geloescht_am) WHERE geloescht_am IS NULL;

-- PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
