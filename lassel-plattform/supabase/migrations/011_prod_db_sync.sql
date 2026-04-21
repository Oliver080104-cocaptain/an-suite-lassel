-- ============================================================
-- MIGRATION 011: Prod-DB Synchronisation
-- Im Supabase SQL Editor ausführen.
--
-- Diese Migration konsolidiert alle Schema-Lücken, die in Produktion
-- zu 400/401/404-Errors führen:
--   - RLS-Policies für alle *_positionen und Dokumenten-Tabellen
--   - vermittler.aktiv (GET /vermittler?aktiv=eq.true → 400)
--   - rechnungen.geschaeftsfallnummer (PATCH → 400)
--   - teilzahlungen Tabelle (GET → 404)
--
-- Alles additiv/idempotent: keine bestehenden Daten werden verändert.
-- ============================================================

-- 1) RLS-Policies (gleich wie Migration 010; idempotent)
ALTER TABLE lieferschein_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON lieferschein_positionen;
CREATE POLICY "Allow all" ON lieferschein_positionen FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE rechnung_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON rechnung_positionen;
CREATE POLICY "Allow all" ON rechnung_positionen FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE angebot_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON angebot_positionen;
CREATE POLICY "Allow all" ON angebot_positionen FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE lieferscheine ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON lieferscheine;
CREATE POLICY "Allow all" ON lieferscheine FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE rechnungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON rechnungen;
CREATE POLICY "Allow all" ON rechnungen FOR ALL USING (true) WITH CHECK (true);

-- 2) vermittler.aktiv sicherstellen
ALTER TABLE vermittler
  ADD COLUMN IF NOT EXISTS aktiv BOOLEAN DEFAULT true;
UPDATE vermittler SET aktiv = true WHERE aktiv IS NULL;

-- 3) rechnungen.geschaeftsfallnummer sicherstellen
ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS geschaeftsfallnummer TEXT;

-- 4) teilzahlungen Tabelle (fehlt in Produktion)
CREATE TABLE IF NOT EXISTS teilzahlungen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rechnung_id UUID REFERENCES rechnungen(id) ON DELETE CASCADE,
  betrag DECIMAL(10,2) NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  zahlungsart TEXT DEFAULT 'überweisung',
  referenz TEXT,
  notizen TEXT
);

CREATE INDEX IF NOT EXISTS idx_teilzahlungen_rechnung
  ON teilzahlungen(rechnung_id);

ALTER TABLE teilzahlungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON teilzahlungen;
CREATE POLICY "Allow all" ON teilzahlungen FOR ALL USING (true) WITH CHECK (true);

-- PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
