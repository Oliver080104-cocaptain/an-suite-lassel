-- ============================================================
-- MIGRATION 009: Rechnungen Geschäftsfallnummer
-- Im Supabase SQL Editor ausführen.
-- Additiv: bestehende Daten/Tabellen werden NICHT verändert.
-- ============================================================

ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS geschaeftsfallnummer TEXT;

NOTIFY pgrst, 'reload schema';
