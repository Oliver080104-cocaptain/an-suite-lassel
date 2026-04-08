-- ============================================================
-- MIGRATION 006: Angebote + Lieferscheine Zusatzfelder
-- Im Supabase SQL Editor ausführen.
-- Additiv: bestehende Daten/Tabellen werden NICHT verändert.
-- ============================================================

-- Angebote: bisher UI-only Felder in DB persistieren
ALTER TABLE angebote
  ADD COLUMN IF NOT EXISTS geschaeftsfallnummer TEXT,
  ADD COLUMN IF NOT EXISTS ansprechpartner TEXT;

-- Lieferscheine: fehlende Empfänger- + Verwaltungsfelder
ALTER TABLE lieferscheine
  ADD COLUMN IF NOT EXISTS kunde_uid TEXT,
  ADD COLUMN IF NOT EXISTS ansprechpartner TEXT,
  ADD COLUMN IF NOT EXISTS geschaeftsfallnummer TEXT;

-- Schema-Cache aktualisieren
NOTIFY pgrst, 'reload schema';
