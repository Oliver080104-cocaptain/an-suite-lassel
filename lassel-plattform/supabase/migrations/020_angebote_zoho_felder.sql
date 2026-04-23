-- ============================================================
-- MIGRATION 020: angebote — alle Zoho-Webhook-Mapping-Felder sicherstellen
-- Im Supabase SQL Editor ausführen.
--
-- Kontext: Der /api/webhooks/offer Route mappt jetzt ALLE Felder
-- vom Zoho-n8n-Payload auf die angebote-Tabelle (HV-Daten, E-Mails,
-- Ansprechpartner, HI-Daten usw.). Diese Spalten waren teilweise nur
-- im schema.sql aber nie durch eine Migration auf Prod gekommen, oder
-- gar nicht vorhanden.
--
-- Additiv/idempotent: `ADD COLUMN IF NOT EXISTS`, keine Datenänderung.
-- ============================================================

ALTER TABLE angebote
  -- Kontakt-Mails (werden beim Angebot-Versand vorausgefüllt)
  ADD COLUMN IF NOT EXISTS kunde_email TEXT,
  ADD COLUMN IF NOT EXISTS email_angebot TEXT,
  ADD COLUMN IF NOT EXISTS email_rechnung TEXT,

  -- Ansprechpartner (Ticket_erstellt_von in Zoho)
  ADD COLUMN IF NOT EXISTS ansprechpartner TEXT,

  -- Objekt-Adresse-Zusatz (PLZ + Ort der Baustelle, separat von Empfänger-PLZ)
  ADD COLUMN IF NOT EXISTS objekt_plz TEXT,
  ADD COLUMN IF NOT EXISTS objekt_ort TEXT,

  -- Hausinhabung + HI-Block
  ADD COLUMN IF NOT EXISTS hausinhabung TEXT,
  ADD COLUMN IF NOT EXISTS hausverwaltung_name TEXT,
  ADD COLUMN IF NOT EXISTS rechnung_an_hi BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS uid_von_hi TEXT,

  -- Geschäftsfall + Ersteller (freier Text statt mitarbeiter-FK)
  ADD COLUMN IF NOT EXISTS geschaeftsfallnummer TEXT,
  ADD COLUMN IF NOT EXISTS erstellt_von TEXT,

  -- Skizzen + Fußzeile (für PDF)
  ADD COLUMN IF NOT EXISTS skizzen_link TEXT,
  ADD COLUMN IF NOT EXISTS fusszeile TEXT;

-- PostgREST Schema-Cache reload damit die Spalten sofort verfügbar sind
NOTIFY pgrst, 'reload schema';
