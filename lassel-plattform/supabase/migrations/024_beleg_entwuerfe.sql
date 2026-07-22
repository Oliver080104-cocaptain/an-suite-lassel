-- ============================================================
-- MIGRATION 024: Entwurfsraum für die Schreib-API
-- Im Supabase SQL Editor ausführen. Setzt Migration 023 voraus.
--
-- Zweck: Die API (und damit ein Agent über MCP) soll Belege vorschlagen
-- können, ohne in angebote/rechnungen/lieferscheine zu schreiben.
--
-- Warum nicht direkt in die Belegtabellen: die Detailseiten halten den
-- Beleg als einmalig eingefrorenen React-Snapshot und schreiben bei jedem
-- Autosave den KOMPLETTEN Datensatz plus alle Positionen zurück
-- (beim Angebot als delete-then-insert). Ein API-Write wäre spurlos weg,
-- sobald jemand den Beleg offen hat. Diese Tabelle kommt in keinem
-- Autosave-, Listen-, Analytics- oder Webhook-Pfad vor und kann deshalb
-- nicht kollidieren.
--
-- Ein Entwurf wird erst durch eine ausdrückliche Übernahme durch einen
-- Menschen zu einem echten Beleg.
--
-- Additiv und idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS beleg_entwuerfe (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Aktuell nur 'angebot'. Rechnung und Lieferschein bewusst noch nicht:
  -- bei der Rechnung laufen Kopf und Positionen bei Teilfaktura absichtlich
  -- auseinander, beim Lieferschein triggert das Öffnen einen Ticket-Sync.
  beleg_typ     TEXT        NOT NULL DEFAULT 'angebot'
                            CHECK (beleg_typ IN ('angebot')),

  -- offen → uebernommen | verworfen. Der Übergang läuft als bedingtes
  -- UPDATE, damit zwei Sachbearbeiter aus einem Entwurf nicht zwei Belege
  -- erzeugen.
  zustand       TEXT        NOT NULL DEFAULT 'offen'
                            CHECK (zustand IN ('offen', 'uebernommen', 'verworfen')),

  -- Freitext des Erzeugers: woher kommt der Vorschlag, was war der Auftrag.
  herkunft      TEXT,
  notiz         TEXT,

  -- Der eigentliche Vorschlag: Kopf- und Positionsdaten als JSON.
  -- Bewusst JSONB und keine gespiegelten Spalten — der Entwurf ist kein
  -- Beleg, und ein Schema hier würde bei jeder Feldänderung nachziehen
  -- müssen. Die Validierung passiert in der API (zod), nicht in der DB.
  daten         JSONB       NOT NULL,

  -- Ergebnis der Übernahme
  entschieden_am    TIMESTAMPTZ,
  entschieden_von   TEXT,
  erzeugte_beleg_id UUID,
  erzeugte_nummer   TEXT,
  fehler            TEXT
);

COMMENT ON TABLE beleg_entwuerfe IS
  'Vorschläge der Schreib-API. Werden erst durch ausdrückliche Übernahme zu Belegen.';

CREATE INDEX IF NOT EXISTS idx_beleg_entwuerfe_zustand
  ON beleg_entwuerfe (zustand, erstellt_am DESC);

-- ------------------------------------------------------------
-- Zugriff: RLS an, KEINE Policy.
--
-- Damit kommt der Anon-Key, der im ausgelieferten Browser-Bundle steht,
-- nicht an diese Tabelle heran — auch nicht lesend. Der Service-Role-Key
-- der Server-Routen umgeht RLS.
--
-- Das ist der Unterschied zu den übrigen Tabellen, die durchgängig eine
-- "Allow all"-Policy tragen: dort wäre jede Regel in einer Route nur eine
-- Konvention, weil man mit dem Anon-Key daran vorbeischreiben kann.
-- ------------------------------------------------------------
ALTER TABLE beleg_entwuerfe ENABLE ROW LEVEL SECURITY;

-- Kontrolle nach dem Ausführen:
--   SELECT id, zustand, erstellt_am, erzeugte_nummer FROM beleg_entwuerfe ORDER BY erstellt_am DESC;
