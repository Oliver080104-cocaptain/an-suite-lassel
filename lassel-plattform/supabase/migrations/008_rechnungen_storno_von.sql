-- ============================================================
-- MIGRATION 008: Storno-Referenz als freier Text
-- Im Supabase SQL Editor ausführen.
-- ============================================================

-- Frei eingebbare Storno-Referenz (z.B. "RE-2026-00001")
-- ergänzt die existierende `storno_von_rechnung_id` UUID-Referenz.
ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS storno_von TEXT;

NOTIFY pgrst, 'reload schema';
