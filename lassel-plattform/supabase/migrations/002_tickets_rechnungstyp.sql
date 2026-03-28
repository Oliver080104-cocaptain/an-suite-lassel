-- ============================================================
-- MIGRATION 002: tickets Tabelle + rechnungstyp in rechnungen
-- Im Supabase SQL Editor ausführen (nach Migration 001)
-- ============================================================

-- 1. rechnungstyp zu rechnungen hinzufügen
--    Werte: 'rechnung' (Standard), 'sammelrechnung', 'gutschrift'
ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS rechnungstyp TEXT NOT NULL DEFAULT 'rechnung';

CREATE INDEX IF NOT EXISTS idx_rechnungen_typ ON rechnungen(rechnungstyp);

-- 2. TICKETS Tabelle (neu)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Zoho Sync
  zoho_id TEXT UNIQUE,
  ticketnummer TEXT,
  projektstatus TEXT,

  -- Objekt
  kunde_gasse TEXT,
  gasse_zusatz TEXT,
  bezirk TEXT,

  -- Zuständigkeiten
  zustaendige_hausverwaltung TEXT,
  hausinhabung TEXT,
  ansprechperson TEXT,
  zugangsbeschreibung TEXT,

  -- Dienstleistungen
  dienstleistungen TEXT,
  dienstleistung_zusatz TEXT,

  -- Links & Ordner
  skizzen_link TEXT,
  angebot_link TEXT,
  ordnerlink_angebote TEXT,
  ordnerlink_fotos TEXT,
  ordnerlink_lieferscheine TEXT,
  ordnerlink_rechnungen TEXT,
  ordnerlink_fd TEXT,
  workdrive_id TEXT,
  foto_ordner_id TEXT,

  -- Termine
  bes_termin_von TIMESTAMPTZ,
  bes_termin_bis TIMESTAMPTZ,
  startdatum DATE,
  enddatum DATE,

  -- Finanzen
  auftragssumme DECIMAL(10,2),

  -- Volltext Suche (GIN Index für deutsche Suche)
  search_index TEXT,

  -- Meta
  ticket_besitzer TEXT,
  aktiv BOOLEAN DEFAULT true
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_tickets_zoho_id ON tickets(zoho_id);
CREATE INDEX IF NOT EXISTS idx_tickets_projektstatus ON tickets(projektstatus);
CREATE INDEX IF NOT EXISTS idx_tickets_search
  ON tickets USING GIN(to_tsvector('german', COALESCE(search_index, '')));

-- Trigger updated_at
CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON tickets FOR ALL USING (true) WITH CHECK (true);

-- 3. angebote: zoho_ticket_id Index
CREATE INDEX IF NOT EXISTS idx_angebote_zoho_ticket ON angebote(zoho_ticket_id)
  WHERE zoho_ticket_id IS NOT NULL;
