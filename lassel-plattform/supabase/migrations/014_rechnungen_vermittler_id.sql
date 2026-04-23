-- ============================================================
-- MIGRATION 014: rechnungen.vermittler_id Spalte sicherstellen
-- Im Supabase SQL Editor ausführen.
--
-- Prod-DB hatte die Spalte nicht, obwohl sie in schema.sql (Zeile 198)
-- definiert ist. Analog zu Migration 004 für angebote.
-- Symptom: PATCH /rechnungen 400 "Could not find the 'vermittler_id'
-- column of 'rechnungen' in the schema cache".
--
-- Additiv/idempotent: keine bestehenden Daten werden verändert.
-- ============================================================

ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS vermittler_id UUID REFERENCES vermittler(id);

-- PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
