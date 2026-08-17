-- ============================================================
-- MIGRATION 026: Belegnummern-Trigger repariert (BLOCKER)
-- Im Supabase SQL Editor ausfuehren. Setzt Migration 023 + 025 voraus.
--
-- SYMPTOM
--   Jedes Anlegen eines Angebots scheiterte mit
--     record "new" has no field "rechnungsnummer"
--   (bei Rechnungen entsprechend "angebotsnummer", bei Lieferscheinen ebenso).
--   Sichtbar wurde das zuerst im Zoho-/n8n-Weg: der Webhook /api/webhooks/offer
--   antwortete mit HTTP 500, das Angebot entstand nicht.
--
-- URSACHE
--   belegnummer_zaehler_nachziehen() (Migration 023, angepasst in 025) waehlt
--   die Nummernspalte ueber
--     CASE TG_TABLE_NAME
--       WHEN 'angebote'   THEN NEW.angebotsnummer
--       WHEN 'rechnungen' THEN NEW.rechnungsnummer
--       ...
--   PL/pgSQL wertet diesen Ausdruck NICHT faul aus. Vor der ersten Ausfuehrung
--   muss der Parser den Datentyp JEDES Feldverweises kennen — auch der Zweige,
--   die gar nicht genommen werden. Bei einem INSERT in `angebote` ist NEW eine
--   Zeile aus `angebote`; die Spalte `rechnungsnummer` gibt es dort nicht, also
--   bricht schon die Typaufloesung ab. Ein AFTER-Trigger, der wirft, rollt die
--   ganze Anweisung zurueck — der Beleg entsteht nicht.
--
--   Warum es trotzdem "manchmal ging": der Trigger haengt an
--   AFTER INSERT OR UPDATE OF <nummernspalte>. Ein Zoho-Update zu einem bereits
--   vorhandenen Ticket laeuft im Webhook in den UPDATE-Zweig und fasst die
--   Nummernspalte nicht an — der Trigger feuert nicht, der Aufruf gelingt.
--   Nur das ANLEGEN war kaputt.
--
-- FIX, drei Teile
--   1. Feldzugriff ueber to_jsonb(NEW) ->> 'spalte'. NEW wird dabei als Ganzes
--      uebergeben, es gibt keinen Feldverweis mehr, den der Parser vorab
--      aufloesen muesste. Fehlt die Spalte, kommt schlicht NULL zurueck.
--   2. SECURITY DEFINER. `belegnummern_kreise` hat RLS ohne Policy. Legt jemand
--      im Browser (anon-Key) einen Beleg an, duerfte der Trigger den Zaehler
--      sonst nicht schreiben — der naechste Fehler waere
--      "new row violates row-level security policy". search_path fest gesetzt.
--   3. EXCEPTION-Netz. Das Nachziehen des Zaehlers ist reine Buchfuehrung.
--      Es darf das Anlegen eines Belegs unter keinen Umstaenden verhindern.
--      Was schiefgeht, landet als WARNING im Postgres-Log, der Beleg entsteht.
--
-- Idempotent, aendert nur die Funktion. Die drei Trigger aus 023 bleiben
-- unveraendert bestehen und zeigen weiter auf diese Funktion.
-- ============================================================

CREATE OR REPLACE FUNCTION belegnummer_zaehler_nachziehen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row    JSONB;
  v_nummer TEXT;
  v_prefix TEXT;
  v_kreis  TEXT;
  v_jahr   INTEGER;
  v_lfd    INTEGER;
BEGIN
  BEGIN
    v_row := to_jsonb(NEW);

    v_nummer := CASE TG_TABLE_NAME
      WHEN 'angebote'      THEN v_row ->> 'angebotsnummer'
      WHEN 'rechnungen'    THEN v_row ->> 'rechnungsnummer'
      WHEN 'lieferscheine' THEN v_row ->> 'lieferscheinnummer'
    END;

    IF v_nummer IS NULL OR v_nummer !~ '^[A-Z]{2}-\d{4}-\d+$' THEN
      RETURN NEW;
    END IF;

    v_prefix := SUBSTRING(v_nummer FROM '^([A-Z]{2})-');
    v_jahr   := SUBSTRING(v_nummer FROM '^[A-Z]{2}-(\d{4})-')::INTEGER;
    -- Laufende Nummer auf 9 Stellen begrenzt: ein handgesetztes
    -- "AN-2026-99999999999999" wuerde beim ::INTEGER sonst ueberlaufen.
    v_lfd    := SUBSTRING(v_nummer FROM '-(\d{1,9})$')::INTEGER;

    IF v_lfd IS NULL THEN
      RETURN NEW;
    END IF;

    -- Zuordnung haengt an der TABELLE, nicht am Prefix: eine Anzahlungs-
    -- rechnung traegt AN-… wie ein Angebot, ist aber ein anderer Beleg in
    -- einer anderen Tabelle mit eigenem Zaehler.
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

  EXCEPTION WHEN OTHERS THEN
    -- Bewusst verschluckt: der Beleg ist wichtiger als der Zaehlerstand.
    -- Ein zu niedrig stehender Zaehler faellt spaetestens beim naechsten
    -- naechste_belegnummer() ueber den UNIQUE-Constraint auf.
    RAISE WARNING 'belegnummer_zaehler_nachziehen(%): % (Beleg wurde trotzdem angelegt)',
      TG_TABLE_NAME, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION belegnummer_zaehler_nachziehen() IS
  'Zieht belegnummern_kreise nach, wenn eine Belegnummer an naechste_belegnummer() vorbei gesetzt wird. Darf niemals werfen.';

-- ------------------------------------------------------------
-- Kontrolle nach dem Ausfuehren (im SQL-Editor, in EINEM Rutsch):
--
--   BEGIN;
--     INSERT INTO angebote (angebotsnummer, kunde_name, angebotsdatum, status)
--     VALUES ('AN-2026-99999', 'TRIGGERTEST', CURRENT_DATE, 'entwurf');
--     SELECT * FROM belegnummern_kreise WHERE kreis = 'AN';  -- muss 99999 zeigen
--   ROLLBACK;   -- <- laesst weder Testangebot noch Zaehlerstand zurueck
--
-- Danach der Realitaetscheck: ein Angebot ueber die Oberflaeche anlegen und
-- den Zoho-Weg einmal mit einem NEUEN Ticket ausloesen.
--
-- Hinweis zu Luecken: jeder gescheiterte Anlageversuch hat vorher bereits eine
-- Nummer aus naechste_belegnummer('AN') gezogen. Der AN-Kreis steht deshalb
-- hoeher als die hoechste tatsaechlich vergebene Angebotsnummer; die naechsten
-- Angebote haben eine Luecke davor. Bei Angeboten unkritisch. Ob auch
-- Rechnungsnummern betroffen sind, zeigt:
--   SELECT k.kreis, k.jahr, k.letzte_nummer,
--          (SELECT MAX(SUBSTRING(rechnungsnummer FROM '-(\d+)$')::INTEGER)
--             FROM rechnungen
--            WHERE rechnungsnummer LIKE 'RE-' || k.jahr || '-%') AS hoechste_vergebene
--     FROM belegnummern_kreise k WHERE k.kreis = 'RE';
-- ------------------------------------------------------------
