-- ============================================================
-- MIGRATION 023: Atomare Belegnummern-Vergabe
-- Im Supabase SQL Editor ausführen.
--
-- Zweck: Belegnummern entstehen heute an elf Stellen im Code, alle nach
-- dem Muster "alle Belege des Jahres zählen, +1". Das ist nicht atomar
-- (zwei gleichzeitige Anlagen bekommen dieselbe Nummer) und zählt je nach
-- Fundstelle Papierkorb-Belege mit oder nicht. Das einzige Rettungsnetz ist
-- der UNIQUE-Constraint auf der Nummernspalte — der Anwender sieht dann eine
-- rohe Postgres-Fehlermeldung.
--
-- Diese Migration legt einen zentralen, transaktionssicheren Zähler an.
-- Sie ändert KEINEN bestehenden Code-Pfad: die elf Altgeneratoren laufen
-- unverändert weiter. Erster und zunächst einziger Nutzer ist die
-- Übernahme-Route des Entwurfsraums (/api/v1/entwuerfe/{id}/uebernehmen).
--
-- Additiv und idempotent — mehrfaches Ausführen ist gefahrlos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Zählertabelle: ein Zähler je Kreis und Jahr
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS belegnummern_kreise (
  kreis          TEXT        NOT NULL,   -- 'AN' | 'RE' | 'LI'
  jahr           INTEGER     NOT NULL,
  letzte_nummer  INTEGER     NOT NULL DEFAULT 0,
  aktualisiert   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kreis, jahr)
);

COMMENT ON TABLE belegnummern_kreise IS
  'Zentrale, atomare Belegnummern-Vergabe. Siehe naechste_belegnummer().';

-- ------------------------------------------------------------
-- 2. Vergabefunktion
--
-- Ein einziges INSERT ... ON CONFLICT DO UPDATE ist unter Postgres atomar:
-- konkurrierende Aufrufe serialisieren sich an der Zeilensperre, jeder
-- bekommt garantiert eine andere Nummer. Kein SELECT-dann-UPDATE, kein
-- Zeitfenster dazwischen.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION naechste_belegnummer(p_kreis TEXT, p_jahr INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nummer INTEGER;
BEGIN
  IF p_kreis IS NULL OR p_kreis = '' THEN
    RAISE EXCEPTION 'naechste_belegnummer: kreis fehlt';
  END IF;
  IF p_jahr IS NULL OR p_jahr < 2000 OR p_jahr > 2999 THEN
    RAISE EXCEPTION 'naechste_belegnummer: unplausibles Jahr %', p_jahr;
  END IF;

  INSERT INTO belegnummern_kreise (kreis, jahr, letzte_nummer)
  VALUES (p_kreis, p_jahr, 1)
  ON CONFLICT (kreis, jahr) DO UPDATE
    SET letzte_nummer = belegnummern_kreise.letzte_nummer + 1,
        aktualisiert  = NOW()
  RETURNING letzte_nummer INTO v_nummer;

  RETURN v_nummer;
END;
$$;

COMMENT ON FUNCTION naechste_belegnummer(TEXT, INTEGER) IS
  'Liefert die nächste freie laufende Nummer für Kreis+Jahr. Atomar.';

-- ------------------------------------------------------------
-- 3. Seed aus dem Bestand
--
-- Der Zähler muss über der höchsten bereits VERGEBENEN Nummer starten,
-- sonst würde er belegte Nummern erneut ausgeben. Gezählt wird bewusst
-- über ALLE Belege inklusive Papierkorb — eine gelöschte Nummer bleibt
-- vergeben.
--
-- GREATEST() macht den Seed idempotent: ein erneuter Lauf kann den Zähler
-- nur erhöhen, nie zurücksetzen.
-- ------------------------------------------------------------
WITH bestand AS (
  SELECT 'AN' AS kreis,
         SUBSTRING(angebotsnummer FROM 'AN-(\d{4})-')::INTEGER      AS jahr,
         SUBSTRING(angebotsnummer FROM 'AN-\d{4}-(\d+)$')::INTEGER  AS nr
  FROM angebote
  WHERE angebotsnummer ~ '^AN-\d{4}-\d+$'

  UNION ALL
  SELECT 'RE',
         SUBSTRING(rechnungsnummer FROM 'RE-(\d{4})-')::INTEGER,
         SUBSTRING(rechnungsnummer FROM 'RE-\d{4}-(\d+)$')::INTEGER
  FROM rechnungen
  WHERE rechnungsnummer ~ '^RE-\d{4}-\d+$'

  UNION ALL
  SELECT 'LI',
         SUBSTRING(lieferscheinnummer FROM 'LI-(\d{4})-')::INTEGER,
         SUBSTRING(lieferscheinnummer FROM 'LI-\d{4}-(\d+)$')::INTEGER
  FROM lieferscheine
  WHERE lieferscheinnummer ~ '^LI-\d{4}-\d+$'
),
hoechste AS (
  SELECT kreis, jahr, MAX(nr) AS max_nr
  FROM bestand
  GROUP BY kreis, jahr
)
INSERT INTO belegnummern_kreise (kreis, jahr, letzte_nummer)
SELECT kreis, jahr, max_nr FROM hoechste
ON CONFLICT (kreis, jahr) DO UPDATE
  SET letzte_nummer = GREATEST(belegnummern_kreise.letzte_nummer, EXCLUDED.letzte_nummer),
      aktualisiert  = NOW();

-- ------------------------------------------------------------
-- 4. Nachziehen bei handgesetzten Nummern
--
-- Belegnummern lassen sich im UI manuell überschreiben (EditableDocNumber),
-- und die elf Altgeneratoren schreiben ohnehin an diesem Zähler vorbei.
-- Der Trigger hebt den Zähler bei jeder direkt gesetzten höheren Nummer an,
-- damit der nächste Aufruf von naechste_belegnummer() nicht kollidiert.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION belegnummer_zaehler_nachziehen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nummer TEXT;
  v_kreis  TEXT;
  v_jahr   INTEGER;
  v_lfd    INTEGER;
BEGIN
  v_nummer := CASE TG_TABLE_NAME
    WHEN 'angebote'     THEN NEW.angebotsnummer
    WHEN 'rechnungen'   THEN NEW.rechnungsnummer
    WHEN 'lieferscheine' THEN NEW.lieferscheinnummer
  END;

  IF v_nummer IS NULL OR v_nummer !~ '^(AN|RE|LI)-\d{4}-\d+$' THEN
    RETURN NEW;
  END IF;

  v_kreis := SUBSTRING(v_nummer FROM '^(AN|RE|LI)-');
  v_jahr  := SUBSTRING(v_nummer FROM '^(?:AN|RE|LI)-(\d{4})-')::INTEGER;
  v_lfd   := SUBSTRING(v_nummer FROM '-(\d+)$')::INTEGER;

  INSERT INTO belegnummern_kreise (kreis, jahr, letzte_nummer)
  VALUES (v_kreis, v_jahr, v_lfd)
  ON CONFLICT (kreis, jahr) DO UPDATE
    SET letzte_nummer = GREATEST(belegnummern_kreise.letzte_nummer, EXCLUDED.letzte_nummer),
        aktualisiert  = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_angebote_belegnummer      ON angebote;
DROP TRIGGER IF EXISTS trg_rechnungen_belegnummer    ON rechnungen;
DROP TRIGGER IF EXISTS trg_lieferscheine_belegnummer ON lieferscheine;

CREATE TRIGGER trg_angebote_belegnummer
  AFTER INSERT OR UPDATE OF angebotsnummer ON angebote
  FOR EACH ROW EXECUTE FUNCTION belegnummer_zaehler_nachziehen();

CREATE TRIGGER trg_rechnungen_belegnummer
  AFTER INSERT OR UPDATE OF rechnungsnummer ON rechnungen
  FOR EACH ROW EXECUTE FUNCTION belegnummer_zaehler_nachziehen();

CREATE TRIGGER trg_lieferscheine_belegnummer
  AFTER INSERT OR UPDATE OF lieferscheinnummer ON lieferscheine
  FOR EACH ROW EXECUTE FUNCTION belegnummer_zaehler_nachziehen();

-- ------------------------------------------------------------
-- 5. Zugriff
--
-- Die Tabelle ist nur über die Funktion zu benutzen. RLS an, keine Policy
-- → der Anon-Key aus dem Browser-Bundle kommt nicht heran; der
-- Service-Role-Key der Server-Routen umgeht RLS ohnehin.
-- ------------------------------------------------------------
ALTER TABLE belegnummern_kreise ENABLE ROW LEVEL SECURITY;

-- Kontrolle nach dem Ausführen:
--   SELECT * FROM belegnummern_kreise ORDER BY kreis, jahr;
--   SELECT naechste_belegnummer('AN', EXTRACT(YEAR FROM NOW())::INTEGER);
