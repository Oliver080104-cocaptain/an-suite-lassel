-- ============================================================
-- MIGRATION 021: rechnungen — kunde_email + email_rechnung
-- Im Supabase SQL Editor ausführen.
--
-- Symptom: Beim Erzeugen einer Rechnung aus einem Angebot
-- ("Rechnung erstellen") schlägt der Insert mit
--   "Could not find the 'kunde_email' column of 'rechnungen'
--    in the schema cache"
-- fehl. Die Spalten sind in schema.sql vorgesehen und werden
-- vom Code geschrieben (angebote/[id]/page.tsx → handleCreateInvoice
-- und rechnungen/[id]/page.tsx → buildRechnungData), waren aber
-- nie durch eine Migration auf Prod gekommen.
--
-- Additiv/idempotent: ADD COLUMN IF NOT EXISTS, keine Datenänderung.
-- ============================================================

ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS kunde_email TEXT,
  ADD COLUMN IF NOT EXISTS email_rechnung TEXT;

-- PostgREST Schema-Cache reload damit die Anon-Client-Requests
-- die neuen Spalten sofort kennen.
NOTIFY pgrst, 'reload schema';
