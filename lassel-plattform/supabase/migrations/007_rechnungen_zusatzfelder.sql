-- ============================================================
-- MIGRATION 007: Rechnungen Zusatzfelder (Base44 Abgleich)
-- Im Supabase SQL Editor ausführen.
-- Additiv: bestehende Daten/Tabellen werden NICHT verändert.
-- ============================================================

ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS ansprechpartner TEXT,
  ADD COLUMN IF NOT EXISTS objekt_strasse TEXT,
  ADD COLUMN IF NOT EXISTS objekt_plz TEXT,
  ADD COLUMN IF NOT EXISTS objekt_ort TEXT,
  ADD COLUMN IF NOT EXISTS objekt_ansprechpartner TEXT,
  ADD COLUMN IF NOT EXISTS skonto_aktiv BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS skonto_prozent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS skonto_tage INTEGER;

NOTIFY pgrst, 'reload schema';
