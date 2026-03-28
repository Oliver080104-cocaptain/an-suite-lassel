-- ============================================================
-- LASSEL GMBH ANGEBOTSSUITE - SUPABASE SCHEMA
-- ============================================================

-- ENUMS
CREATE TYPE angebot_status AS ENUM (
  'entwurf', 'offen', 'versendet', 'final',
  'angenommen', 'abgelehnt', 'archiviert'
);

CREATE TYPE dokument_typ AS ENUM (
  'angebot', 'rechnung', 'lieferschein'
);

-- ============================================================
-- MITARBEITER
-- ============================================================
CREATE TABLE mitarbeiter (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  email TEXT,
  telefon TEXT,
  rolle TEXT DEFAULT 'techniker',
  aktiv BOOLEAN DEFAULT true
);

-- ============================================================
-- VERMITTLER
-- ============================================================
CREATE TABLE vermittler (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  email TEXT,
  telefon TEXT,
  provision_prozent DECIMAL(5,2) DEFAULT 0,
  aktiv BOOLEAN DEFAULT true
);

-- ============================================================
-- HAUSVERWALTUNGEN (Kunden)
-- ============================================================
CREATE TABLE hausverwaltungen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  strasse TEXT,
  plz TEXT,
  ort TEXT,
  land TEXT DEFAULT 'Österreich',
  uid_nummer TEXT,
  email TEXT,
  telefon TEXT,
  zoho_id TEXT,
  notizen TEXT
);

-- ============================================================
-- PRODUKTE
-- ============================================================
CREATE TABLE produkte (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  beschreibung TEXT,
  einheit TEXT DEFAULT 'Stück',
  einzelpreis DECIMAL(10,2) NOT NULL DEFAULT 0,
  mwst_satz DECIMAL(5,2) DEFAULT 20,
  kategorie TEXT,
  aktiv BOOLEAN DEFAULT true
);

-- ============================================================
-- ANGEBOTE
-- ============================================================
CREATE TABLE angebote (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  angebotsnummer TEXT UNIQUE NOT NULL,
  status angebot_status DEFAULT 'entwurf',

  -- Rechnungsempfänger
  kunde_name TEXT NOT NULL,
  kunde_strasse TEXT,
  kunde_plz TEXT,
  kunde_ort TEXT,
  kunde_land TEXT DEFAULT 'Österreich',
  kunde_uid TEXT,
  hausverwaltung_id UUID REFERENCES hausverwaltungen(id),

  -- Angebotsdaten
  angebotsdatum DATE NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis DATE,
  erstellt_von_id UUID REFERENCES mitarbeiter(id),
  vermittler_id UUID REFERENCES vermittler(id),

  -- Objekt / Ticket
  objekt_adresse TEXT,
  objekt_bezeichnung TEXT,
  ticket_nummer TEXT,
  zoho_ticket_id TEXT,

  -- Sonderoptionen
  reverse_charge BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual',
  n8n_webhook_url TEXT,

  -- Beträge (berechnet)
  netto_gesamt DECIMAL(10,2) DEFAULT 0,
  mwst_gesamt DECIMAL(10,2) DEFAULT 0,
  brutto_gesamt DECIMAL(10,2) DEFAULT 0,

  -- PDF & Zoho
  pdf_url TEXT,
  zoho_angebot_id TEXT,

  -- Sonstiges
  notizen TEXT,
  interne_notizen TEXT,

  -- Papierkorb
  geloescht_am TIMESTAMPTZ
);

-- ============================================================
-- ANGEBOT POSITIONEN
-- ============================================================
CREATE TABLE angebot_positionen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  angebot_id UUID REFERENCES angebote(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  produkt_id UUID REFERENCES produkte(id),
  beschreibung TEXT NOT NULL,
  menge DECIMAL(10,3) DEFAULT 1,
  einheit TEXT DEFAULT 'Stk',
  einzelpreis DECIMAL(10,2) NOT NULL,
  mwst_satz DECIMAL(5,2) DEFAULT 20,
  rabatt_prozent DECIMAL(5,2) DEFAULT 0,
  gesamtpreis DECIMAL(10,2) NOT NULL
);

-- ============================================================
-- LIEFERSCHEINE
-- ============================================================
CREATE TABLE lieferscheine (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  lieferscheinnummer TEXT UNIQUE NOT NULL,
  angebot_id UUID REFERENCES angebote(id),
  status TEXT DEFAULT 'offen',

  -- Empfänger
  kunde_name TEXT NOT NULL,
  kunde_strasse TEXT,
  kunde_plz TEXT,
  kunde_ort TEXT,
  kunde_land TEXT DEFAULT 'Österreich',

  -- Daten
  lieferdatum DATE NOT NULL DEFAULT CURRENT_DATE,
  erstellt_von_id UUID REFERENCES mitarbeiter(id),

  -- Objekt
  objekt_adresse TEXT,
  ticket_nummer TEXT,

  pdf_url TEXT,
  notizen TEXT
);

-- ============================================================
-- RECHNUNGEN
-- ============================================================
CREATE TABLE rechnungen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  rechnungsnummer TEXT UNIQUE NOT NULL,
  angebot_id UUID REFERENCES angebote(id),
  status TEXT DEFAULT 'offen',

  -- Empfänger
  kunde_name TEXT NOT NULL,
  kunde_strasse TEXT,
  kunde_plz TEXT,
  kunde_ort TEXT,
  kunde_land TEXT DEFAULT 'Österreich',
  kunde_uid TEXT,

  -- Daten
  rechnungsdatum DATE NOT NULL DEFAULT CURRENT_DATE,
  faellig_bis DATE,
  erstellt_von_id UUID REFERENCES mitarbeiter(id),
  vermittler_id UUID REFERENCES vermittler(id),

  -- Objekt
  objekt_adresse TEXT,
  ticket_nummer TEXT,

  -- Sonderoptionen
  reverse_charge BOOLEAN DEFAULT false,

  -- Beträge
  netto_gesamt DECIMAL(10,2) DEFAULT 0,
  mwst_gesamt DECIMAL(10,2) DEFAULT 0,
  brutto_gesamt DECIMAL(10,2) DEFAULT 0,

  -- Zahlung
  bezahlt_am DATE,
  zahlungsreferenz TEXT,

  pdf_url TEXT,
  zoho_rechnung_id TEXT,
  notizen TEXT
);

-- ============================================================
-- RECHNUNG POSITIONEN
-- ============================================================
CREATE TABLE rechnung_positionen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rechnung_id UUID REFERENCES rechnungen(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  produkt_id UUID REFERENCES produkte(id),
  beschreibung TEXT NOT NULL,
  menge DECIMAL(10,3) DEFAULT 1,
  einheit TEXT DEFAULT 'Stk',
  einzelpreis DECIMAL(10,2) NOT NULL,
  mwst_satz DECIMAL(5,2) DEFAULT 20,
  rabatt_prozent DECIMAL(5,2) DEFAULT 0,
  gesamtpreis DECIMAL(10,2) NOT NULL
);

-- ============================================================
-- EINSTELLUNGEN
-- ============================================================
CREATE TABLE einstellungen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Standard-Einstellungen
INSERT INTO einstellungen (key, value) VALUES
(
  'firma',
  '{"name": "Lassel GmbH", "strasse": "Hetzmannsdorf 25", "plz": "2041", "ort": "Wullersdorf", "land": "Österreich", "uid": "", "email": "", "telefon": "", "iban": "", "bic": "", "bank": "", "logo_url": ""}'::jsonb
),
(
  'angebot_nummerierung',
  '{"prefix": "AN", "naechste_nummer": 63, "format": "AN-{YEAR}-{NUM5}"}'::jsonb
),
(
  'rechnung_nummerierung',
  '{"prefix": "RE", "naechste_nummer": 1, "format": "RE-{YEAR}-{NUM5}"}'::jsonb
),
(
  'lieferschein_nummerierung',
  '{"prefix": "LS", "naechste_nummer": 1, "format": "LS-{YEAR}-{NUM5}"}'::jsonb
),
(
  'pdf_einstellungen',
  '{"zahlungsziel_tage": 14, "standard_mwst": 20, "fusszeile_text": "Bankverbindung: | IBAN: | BIC:"}'::jsonb
);

-- ============================================================
-- TRIGGER: updated_at automatisch setzen
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER angebote_updated_at
  BEFORE UPDATE ON angebote
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rechnungen_updated_at
  BEFORE UPDATE ON rechnungen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER lieferscheine_updated_at
  BEFORE UPDATE ON lieferscheine
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNKTION: Nächste Dokumentnummer generieren
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_nummer(p_typ TEXT)
RETURNS TEXT AS $$
DECLARE
  v_setting JSONB;
  v_prefix TEXT;
  v_nummer INTEGER;
  v_format TEXT;
  v_result TEXT;
  v_year TEXT;
BEGIN
  SELECT value INTO v_setting
  FROM einstellungen
  WHERE key = p_typ || '_nummerierung';

  IF v_setting IS NULL THEN
    RAISE EXCEPTION 'Keine Nummerierung für % gefunden', p_typ;
  END IF;

  v_prefix := v_setting->>'prefix';
  v_nummer := (v_setting->>'naechste_nummer')::INTEGER;
  v_format := v_setting->>'format';
  v_year := TO_CHAR(NOW(), 'YYYY');

  -- Format: AN-{YEAR}-{NUM5}
  v_result := REPLACE(v_format, '{YEAR}', v_year);
  v_result := REPLACE(v_result, '{NUM5}', LPAD(v_nummer::TEXT, 5, '0'));

  -- Nummer erhöhen
  UPDATE einstellungen
  SET value = jsonb_set(value, '{naechste_nummer}', to_jsonb(v_nummer + 1))
  WHERE key = p_typ || '_nummerierung';

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY (vorerst offen, Service Role Key wird genutzt)
-- ============================================================
ALTER TABLE angebote ENABLE ROW LEVEL SECURITY;
ALTER TABLE angebot_positionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE rechnungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE rechnung_positionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE lieferscheine ENABLE ROW LEVEL SECURITY;
ALTER TABLE produkte ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitarbeiter ENABLE ROW LEVEL SECURITY;
ALTER TABLE vermittler ENABLE ROW LEVEL SECURITY;
ALTER TABLE hausverwaltungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE einstellungen ENABLE ROW LEVEL SECURITY;

-- POLICIES: Vorerst alles erlaubt (Service Role Key bypasses RLS)
CREATE POLICY "Allow all" ON angebote FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON angebot_positionen FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rechnungen FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rechnung_positionen FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON lieferscheine FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON produkte FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON mitarbeiter FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON vermittler FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON hausverwaltungen FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON einstellungen FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INDIZES für Performance
-- ============================================================
CREATE INDEX idx_angebote_status ON angebote(status);
CREATE INDEX idx_angebote_angebotsnummer ON angebote(angebotsnummer);
CREATE INDEX idx_angebote_erstellt_von ON angebote(erstellt_von_id);
CREATE INDEX idx_angebote_created_at ON angebote(created_at DESC);
CREATE INDEX idx_angebote_geloescht ON angebote(geloescht_am) WHERE geloescht_am IS NULL;
CREATE INDEX idx_angebot_positionen_angebot ON angebot_positionen(angebot_id);
CREATE INDEX idx_rechnungen_status ON rechnungen(status);
CREATE INDEX idx_rechnungen_angebot ON rechnungen(angebot_id);
CREATE INDEX idx_lieferscheine_angebot ON lieferscheine(angebot_id);
