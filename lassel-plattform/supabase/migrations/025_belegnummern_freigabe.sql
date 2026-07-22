-- ============================================================
-- MIGRATION 025: Belegnummern-Vergabe für die Oberfläche freigeben
-- Im Supabase SQL Editor ausführen. Setzt Migration 023 voraus.
--
-- Zwei Dinge:
--
-- 1. naechste_belegnummer() wird SECURITY DEFINER. Die Tabelle
--    belegnummern_kreise hat RLS ohne Policy — der Anon-Key aus dem
--    Browser-Bundle kommt also nicht heran, und genau so soll es bleiben.
--    Die Detailseiten laufen aber im Browser und brauchen die Nummern.
--    SECURITY DEFINER laesst die Funktion mit den Rechten ihres Besitzers
--    laufen: der Zaehler ist ausschliesslich ueber diese Funktion erreichbar,
--    direkt lesen oder schreiben kann ihn weiterhin niemand.
--
--    search_path wird dabei fest gesetzt — ohne das koennte ein Aufrufer
--    ueber einen eigenen Schema-Eintrag Code unterschieben.
--
-- 2. Nummernkreise fuer die uebrigen Rechnungstypen anlegen. Migration 023
--    hat nur RE- erfasst; Anzahlung (AN-), Teilrechnung (TR-),
--    Schlussrechnung (SR-) und Gutschrift (GS-) hatten keinen Zaehler.
--    Eigene Kreisnamen mit RE_-Prefix, damit die Anzahlungsrechnung AN-…
--    nicht mit der Angebotsnummer AN-… kollidiert — das sind zwei
--    unabhaengige Nummernkreise in zwei Tabellen.
--
-- Additiv und idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION naechste_belegnummer(p_kreis TEXT, p_jahr INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- Nur bekannte Kreise: verhindert, dass ein Aufrufer beliebig viele
  -- Zaehlerzeilen anlegt.
  IF p_kreis NOT IN ('AN', 'RE', 'LI', 'RE_AN', 'RE_TR', 'RE_SR', 'RE_GS') THEN
    RAISE EXCEPTION 'naechste_belegnummer: unbekannter Kreis %', p_kreis;
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

REVOKE ALL ON FUNCTION naechste_belegnummer(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION naechste_belegnummer(TEXT, INTEGER) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Seed der uebrigen Rechnungs-Nummernkreise aus dem Bestand.
-- GREATEST haelt das idempotent: ein erneuter Lauf kann den Zaehler nur
-- anheben, nie zuruecksetzen.
-- ------------------------------------------------------------
WITH bestand AS (
  SELECT
    'RE_' || SUBSTRING(rechnungsnummer FROM '^(AN|TR|SR|GS)-')        AS kreis,
    SUBSTRING(rechnungsnummer FROM '^(?:AN|TR|SR|GS)-(\d{4})-')::INTEGER AS jahr,
    SUBSTRING(rechnungsnummer FROM '-(\d+)$')::INTEGER                AS nr
  FROM rechnungen
  WHERE rechnungsnummer ~ '^(AN|TR|SR|GS)-\d{4}-\d+$'
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
-- Der Trigger aus Migration 023 zieht den Zaehler nach, wenn eine Nummer an
-- der Funktion vorbei gesetzt wird. Er kannte nur AN/RE/LI und ordnete eine
-- Anzahlungsrechnung AN-… faelschlich dem Angebots-Kreis zu. Hier korrigiert:
-- die Zuordnung haengt jetzt an der TABELLE, nicht nur am Prefix.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION belegnummer_zaehler_nachziehen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nummer TEXT;
  v_prefix TEXT;
  v_kreis  TEXT;
  v_jahr   INTEGER;
  v_lfd    INTEGER;
BEGIN
  v_nummer := CASE TG_TABLE_NAME
    WHEN 'angebote'      THEN NEW.angebotsnummer
    WHEN 'rechnungen'    THEN NEW.rechnungsnummer
    WHEN 'lieferscheine' THEN NEW.lieferscheinnummer
  END;

  IF v_nummer IS NULL OR v_nummer !~ '^[A-Z]{2}-\d{4}-\d+$' THEN
    RETURN NEW;
  END IF;

  v_prefix := SUBSTRING(v_nummer FROM '^([A-Z]{2})-');
  v_jahr   := SUBSTRING(v_nummer FROM '^[A-Z]{2}-(\d{4})-')::INTEGER;
  v_lfd    := SUBSTRING(v_nummer FROM '-(\d+)$')::INTEGER;

  v_kreis := CASE TG_TABLE_NAME
    WHEN 'angebote'      THEN 'AN'
    WHEN 'lieferscheine' THEN 'LI'
    WHEN 'rechnungen'    THEN CASE WHEN v_prefix = 'RE' THEN 'RE' ELSE 'RE_' || v_prefix END
  END;

  IF v_kreis IS NULL OR v_kreis NOT IN ('AN', 'RE', 'LI', 'RE_AN', 'RE_TR', 'RE_SR', 'RE_GS') THEN
    RETURN NEW;
  END IF;

  INSERT INTO belegnummern_kreise (kreis, jahr, letzte_nummer)
  VALUES (v_kreis, v_jahr, v_lfd)
  ON CONFLICT (kreis, jahr) DO UPDATE
    SET letzte_nummer = GREATEST(belegnummern_kreise.letzte_nummer, EXCLUDED.letzte_nummer),
        aktualisiert  = NOW();

  RETURN NEW;
END;
$$;

-- Kontrolle nach dem Ausführen:
--   SELECT * FROM belegnummern_kreise ORDER BY kreis, jahr;
--   SELECT naechste_belegnummer('AN', 1000);  -- muss "unplausibles Jahr" werfen
