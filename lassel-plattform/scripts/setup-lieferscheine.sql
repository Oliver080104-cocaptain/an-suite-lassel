
-- Create lieferscheine table
CREATE TABLE IF NOT EXISTS lieferscheine (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  lieferscheinnummer TEXT UNIQUE NOT NULL,
  angebot_id UUID REFERENCES angebote(id),
  status TEXT DEFAULT 'offen',
  kunde_name TEXT NOT NULL,
  kunde_strasse TEXT,
  kunde_plz TEXT,
  kunde_ort TEXT,
  kunde_land TEXT DEFAULT 'Österreich',
  lieferdatum DATE NOT NULL DEFAULT CURRENT_DATE,
  erstellt_von_id UUID REFERENCES mitarbeiter(id),
  objekt_adresse TEXT,
  ticket_nummer TEXT,
  pdf_url TEXT,
  notizen TEXT
);

-- Add lieferschein_id to lieferschein_positionen if missing
ALTER TABLE lieferschein_positionen
  ADD COLUMN IF NOT EXISTS lieferschein_id UUID REFERENCES lieferscheine(id) ON DELETE CASCADE;

-- Trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lieferscheine_updated_at ON lieferscheine;
CREATE TRIGGER lieferscheine_updated_at
  BEFORE UPDATE ON lieferscheine
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE lieferscheine ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lieferscheine' AND policyname = 'Allow all'
  ) THEN
    EXECUTE 'CREATE POLICY "Allow all" ON lieferscheine FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lieferscheine_angebot ON lieferscheine(angebot_id);
CREATE INDEX IF NOT EXISTS idx_lieferscheine_created ON lieferscheine(created_at DESC);

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
