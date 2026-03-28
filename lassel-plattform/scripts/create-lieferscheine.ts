/**
 * Erstellt die lieferscheine-Tabelle direkt via PostgreSQL-Verbindung.
 * Probiert verschiedene Verbindungsmethoden.
 * npx tsx --env-file=.env.local scripts/create-lieferscheine.ts
 */
import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

const PROJECT_REF = 'ntknhomlvvododhtrret'
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!

// SQL from schema.sql for lieferscheine + fix for lieferschein_positionen
const CREATE_SQL = `
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
`

async function tryConnect(config: any, label: string): Promise<Client | null> {
  const client = new Client({ ...config, connectionTimeoutMillis: 8000, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log(`✅ Verbunden via ${label}`)
    return client
  } catch (err: any) {
    console.log(`❌ ${label}: ${err.message}`)
    return null
  }
}

async function main() {
  console.log('=== Lieferscheine Tabellen-Setup ===\n')

  // Try different connection methods
  const connections = [
    // Direct connection (port 5432) with JWT as password
    { host: `db.${PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', password: SRK, database: 'postgres' },
    // Transaction pooler with JWT
    { host: `${PROJECT_REF}.supabase.co`, port: 6543, user: 'postgres', password: SRK, database: 'postgres' },
    // Session pooler
    { host: `${PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', password: SRK, database: 'postgres' },
    // AWS pooler format
    { host: `aws-0-eu-central-1.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_REF}`, password: SRK, database: 'postgres' },
    { host: `aws-0-eu-west-1.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_REF}`, password: SRK, database: 'postgres' },
  ]

  let client: Client | null = null
  for (const config of connections) {
    client = await tryConnect(config, `${config.host}:${config.port}`)
    if (client) break
  }

  if (!client) {
    console.log('\n⚠️  Keine direkte DB-Verbindung möglich.')
    console.log('Bitte im Supabase SQL Editor (https://app.supabase.com/project/' + PROJECT_REF + '/editor) ausführen:\n')
    console.log(CREATE_SQL)

    // Write SQL to a file for easy copy-paste
    const sqlFile = path.join(process.cwd(), 'scripts', 'setup-lieferscheine.sql')
    fs.writeFileSync(sqlFile, CREATE_SQL)
    console.log(`\n→ SQL auch gespeichert in: scripts/setup-lieferscheine.sql`)
    process.exit(1)
  }

  try {
    console.log('\nFühre SQL aus...')
    await client.query(CREATE_SQL)
    console.log('✅ Tabellen erstellt und Schema-Cache reloaded!')

    // Verify
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('lieferscheine', 'lieferschein_positionen')
      ORDER BY table_name;
    `)
    console.log('Tabellen:', res.rows.map((r: any) => r.table_name).join(', '))

    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lieferschein_positionen'
      ORDER BY ordinal_position;
    `)
    console.log('lieferschein_positionen Spalten:', cols.rows.map((r: any) => r.column_name).join(', '))
  } finally {
    await client.end()
  }
}

main().catch(console.error)
