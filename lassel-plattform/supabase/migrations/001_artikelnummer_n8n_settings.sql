-- ============================================================
-- MIGRATION 001: artikelnummer + n8n Webhook Settings
-- Im Supabase SQL Editor ausführen (NACH schema.sql)
-- ============================================================

-- 1. artikelnummer Spalte zu produkte hinzufügen
ALTER TABLE produkte ADD COLUMN IF NOT EXISTS artikelnummer TEXT;

-- Eindeutiger Index (NULL-Werte ausgenommen)
CREATE UNIQUE INDEX IF NOT EXISTS idx_produkte_artikelnummer
  ON produkte(artikelnummer)
  WHERE artikelnummer IS NOT NULL;

-- 2. n8n Outgoing Webhook URLs (Self-Hosted auf Hostinger)
INSERT INTO einstellungen (key, value) VALUES
(
  'n8n_webhooks',
  '{
    "auftrag_erteilt":              "https://n8n.srv1367876.hstgr.cloud/webhook/2c51d71e-b55d-493d-aafb-1443d1d100cc",
    "lieferschein_erstellt":        "https://n8n.srv1367876.hstgr.cloud/webhook/5e4e9681-a79e-42be-a1d0-309bfdc36909",
    "parkraumsperre":               "https://n8n.srv1367876.hstgr.cloud/webhook/7836c00e-ddef-4c0a-90b9-be803b9dc3a9",
    "rechnung_bezahlt":             "https://n8n.srv1367876.hstgr.cloud/webhook/fd01a47a-4d74-4763-b551-e5c3a29155da",
    "lieferschein_ticket_zuweisen": "https://n8n.srv1367876.hstgr.cloud/webhook/fb90b972-45fd-4762-bbea-cdec7543f6de",
    "auftrag_abschliessen":         "https://n8n.srv1367876.hstgr.cloud/webhook/auftrag-abschliessen",
    "pdf_rechnung_hochladen":       "https://n8n.srv1367876.hstgr.cloud/webhook/48a021d8-c88d-4663-80f6-dc09a70d598b"
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();

-- 3. E-Mail Einstellungen
INSERT INTO einstellungen (key, value) VALUES
(
  'email_einstellungen',
  '{
    "absender_name": "Lassel GmbH",
    "absender_email": "office@lassel.at",
    "angebot_betreff": "Ihr Angebot {nummer} von Lassel GmbH",
    "angebot_text": "Sehr geehrte Damen und Herren,\n\nim Anhang finden Sie unser Angebot {nummer}.\n\nBei Fragen stehen wir gerne zur Verfügung.\n\nMit freundlichen Grüßen\nLassel GmbH",
    "rechnung_betreff": "Ihre Rechnung {nummer} von Lassel GmbH",
    "rechnung_text": "Sehr geehrte Damen und Herren,\n\nim Anhang finden Sie unsere Rechnung {nummer}.\n\nMit freundlichen Grüßen\nLassel GmbH"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 4. Parkraumsperre Einstellungen
INSERT INTO einstellungen (key, value) VALUES
(
  'parkraumsperre',
  '{
    "empfaenger_email": "",
    "standard_betreff": "Antrag auf Parkraumsperre",
    "standard_text": "Sehr geehrte Damen und Herren,\n\nhiermit beantragen wir eine Parkraumsperre.\n\nMit freundlichen Grüßen\nLassel GmbH"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
