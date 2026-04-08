-- ============================================================
-- MIGRATION 004: vermittler_id Spalte sicherstellen + PostgREST cache reload
-- Im Supabase SQL Editor ausführen
-- ============================================================

-- vermittler_id Spalte hinzufügen falls fehlt
ALTER TABLE angebote
  ADD COLUMN IF NOT EXISTS vermittler_id UUID REFERENCES vermittler(id);

-- PostgREST Schema-Cache neu laden (falls Spalte vorhanden aber im Cache stale)
NOTIFY pgrst, 'reload schema';
