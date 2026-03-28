-- ============================================================
-- MIGRATION 003: lieferschein_positionen + textvorlagen
-- Im Supabase SQL Editor ausführen (nach Migration 002)
-- ============================================================

-- 1. LIEFERSCHEIN POSITIONEN
CREATE TABLE IF NOT EXISTS lieferschein_positionen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  lieferschein_id UUID REFERENCES lieferscheine(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  beschreibung TEXT NOT NULL,
  menge DECIMAL(10,3) DEFAULT 1,
  einheit TEXT DEFAULT 'Stk',
  notizen TEXT
);

CREATE INDEX IF NOT EXISTS idx_ls_positionen_lieferschein
  ON lieferschein_positionen(lieferschein_id);

ALTER TABLE lieferschein_positionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON lieferschein_positionen FOR ALL USING (true) WITH CHECK (true);

-- 2. TEXTVORLAGEN (für Description Templates aus Base44)
CREATE TABLE IF NOT EXISTS textvorlagen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  titel TEXT NOT NULL,
  inhalt TEXT NOT NULL,
  kategorie TEXT DEFAULT 'allgemein',
  -- Wo wird die Vorlage genutzt: angebot, rechnung, email, parkraumsperre
  verwendung TEXT DEFAULT 'angebot',
  aktiv BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_textvorlagen_kategorie ON textvorlagen(kategorie);
CREATE INDEX IF NOT EXISTS idx_textvorlagen_verwendung ON textvorlagen(verwendung);

CREATE TRIGGER textvorlagen_updated_at
  BEFORE UPDATE ON textvorlagen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE textvorlagen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON textvorlagen FOR ALL USING (true) WITH CHECK (true);

-- 3. TEILZAHLUNGEN (PartialPayment)
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
CREATE POLICY "Allow all" ON teilzahlungen FOR ALL USING (true) WITH CHECK (true);
