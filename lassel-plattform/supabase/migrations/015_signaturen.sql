-- ============================================================
-- MIGRATION 015: signaturen Tabelle
-- Im Supabase SQL Editor ausführen.
--
-- Eigene Tabelle für E-Mail-Signaturen, unabhängig von mitarbeiter.
-- Wird im EmailVorschauModal (Angebot/Rechnung versenden) geladen;
-- User kann direkt im Modal neue Signaturen anlegen.
--
-- Additiv/idempotent: keine bestehenden Daten werden verändert.
-- ============================================================

CREATE TABLE IF NOT EXISTS signaturen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  aktiv BOOLEAN DEFAULT true
);

ALTER TABLE signaturen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON signaturen;
CREATE POLICY "Allow all" ON signaturen FOR ALL USING (true) WITH CHECK (true);

-- PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
