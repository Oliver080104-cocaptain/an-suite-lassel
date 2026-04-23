-- ============================================================
-- MIGRATION 019: mitarbeiter.aktiv + sonstige Default-Spalten
-- Im Supabase SQL Editor ausführen.
--
-- Symptom: POST /rest/v1/mitarbeiter 400 beim Anlegen eines neuen
-- Mitarbeiters aus der Analytics-Suite. Code sendet
--   { name, aktiv: true }
-- aber die Prod-DB hat die Spalte aktiv nicht (nur schema.sql
-- hat sie, keine frühere Migration hat sie sichergestellt).
--
-- Additiv/idempotent — bestehende Zeilen werden nicht verändert
-- ausser dass aktiv auf true defaultet.
-- ============================================================

ALTER TABLE mitarbeiter
  ADD COLUMN IF NOT EXISTS aktiv BOOLEAN DEFAULT true;

-- Bestehende Zeilen auf aktiv=true setzen falls NULL (Altdaten)
UPDATE mitarbeiter SET aktiv = true WHERE aktiv IS NULL;

-- Sicherheitshalber auch email/telefon/rolle hinzufügen falls fehlen
ALTER TABLE mitarbeiter
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telefon TEXT,
  ADD COLUMN IF NOT EXISTS rolle TEXT DEFAULT 'techniker';

-- PostgREST Schema-Cache neu laden damit die Anon-Client-Requests
-- die neuen Spalten sofort kennen.
NOTIFY pgrst, 'reload schema';
