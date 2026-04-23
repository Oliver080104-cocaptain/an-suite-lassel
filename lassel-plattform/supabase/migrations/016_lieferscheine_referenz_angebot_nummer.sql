-- ============================================================
-- MIGRATION 016: lieferscheine.referenz_angebot_nummer Spalte
-- Im Supabase SQL Editor ausführen.
--
-- Symptom: PATCH /lieferscheine 400 "Could not find the
-- 'referenz_angebot_nummer' column of 'lieferscheine' in the
-- schema cache". Code schreibt die Spalte (analog zu rechnungen
-- Migration 005), aber sie wurde nie angelegt.
--
-- Additiv/idempotent: keine bestehenden Daten werden verändert.
-- ============================================================

ALTER TABLE lieferscheine
  ADD COLUMN IF NOT EXISTS referenz_angebot_nummer TEXT;

-- PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
