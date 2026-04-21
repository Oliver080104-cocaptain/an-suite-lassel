-- ============================================================
-- MIGRATION 010: RLS-Policies für *_positionen Tabellen reparieren
-- Im Supabase SQL Editor ausführen.
--
-- Hintergrund: Bei Lieferschein- bzw. Rechnungs-Erzeugung aus einem
-- Angebot schlug der INSERT in lieferschein_positionen / rechnung_positionen
-- mit "new row violates row-level security policy" fehl, weil RLS
-- aktiviert war, aber die "Allow all"-Policy in Produktion fehlte.
-- Diese Migration legt die Policies idempotent neu an.
-- ============================================================

-- lieferschein_positionen
ALTER TABLE lieferschein_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON lieferschein_positionen;
CREATE POLICY "Allow all" ON lieferschein_positionen FOR ALL USING (true) WITH CHECK (true);

-- rechnung_positionen
ALTER TABLE rechnung_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON rechnung_positionen;
CREATE POLICY "Allow all" ON rechnung_positionen FOR ALL USING (true) WITH CHECK (true);

-- Vorsorglich auch für angebot_positionen + lieferscheine + rechnungen
ALTER TABLE angebot_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON angebot_positionen;
CREATE POLICY "Allow all" ON angebot_positionen FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE lieferscheine ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON lieferscheine;
CREATE POLICY "Allow all" ON lieferscheine FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE rechnungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON rechnungen;
CREATE POLICY "Allow all" ON rechnungen FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
