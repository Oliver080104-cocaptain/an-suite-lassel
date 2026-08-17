-- ============================================================
-- MIGRATION 027: produkt_id in den Positionstabellen nachziehen
-- Im Supabase SQL Editor ausfuehren. Additiv und idempotent.
--
-- SYMPTOM
--   Could not find the 'produkt_id' column of 'angebot_positionen'
--   in the schema cache
--   -> jedes Speichern eines Angebots scheiterte, ebenso jede aus einem
--      Angebot erzeugte Rechnung und jede Uebernahme aus dem Entwurfsraum.
--
-- URSACHE
--   `supabase/schema.sql` fuehrt produkt_id fuer angebot_positionen UND
--   rechnung_positionen (jeweils REFERENCES produkte(id)). In der
--   Produktionsdatenbank existiert die Spalte in keiner der beiden Tabellen —
--   das Repo-Schema ist dort nie vollstaendig angekommen. Solange der Code die
--   Spalte nicht mitschrieb, fiel das nicht auf; seit sie mitgeschrieben wird,
--   scheitert der komplette INSERT an dem einen Feld.
--
--   Gegenprobe ueber die PostgREST-OpenAPI-Definition am 17.08.2026:
--     angebot_positionen  = id, angebot_id, position, beschreibung, menge,
--                           einheit, einzelpreis, mwst_satz, rabatt_prozent,
--                           gesamtpreis
--     rechnung_positionen = … + referenz_angebot_position_id
--   In beiden Faellen ohne produkt_id.
--
-- ZWEI EBENEN
--   Der Code ist unabhaengig von dieser Migration abgesichert: die
--   Positions-Inserts laufen jetzt ueber insertMitDriftSchutz()
--   (src/lib/schema-drift.ts) und verwerfen eine fehlende Spalte, statt den
--   ganzen Beleg scheitern zu lassen. Diese Migration stellt die eigentliche
--   Funktion wieder her — die Verknuepfung Position -> Produkt.
--
--   Wer sie NICHT einspielen will: dann bitte produkt_id auch aus dem Code
--   entfernen, sonst wird bei jedem Speichern still eine Warnung ans
--   Monitoring gemeldet.
-- ============================================================

ALTER TABLE angebot_positionen
  ADD COLUMN IF NOT EXISTS produkt_id UUID REFERENCES produkte(id);

ALTER TABLE rechnung_positionen
  ADD COLUMN IF NOT EXISTS produkt_id UUID REFERENCES produkte(id);

COMMENT ON COLUMN angebot_positionen.produkt_id IS
  'Verknuepfung zum Stammprodukt. Optional — handgeschriebene Positionen haben keine.';
COMMENT ON COLUMN rechnung_positionen.produkt_id IS
  'Verknuepfung zum Stammprodukt. Optional — handgeschriebene Positionen haben keine.';

-- ------------------------------------------------------------
-- PostgREST cached das Schema. Ohne diesen Reload liefert die API noch
-- Minuten nach dem ALTER TABLE "Could not find the column".
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- Kontrolle:
--   SELECT table_name, column_name
--     FROM information_schema.columns
--    WHERE column_name = 'produkt_id'
--      AND table_name IN ('angebot_positionen', 'rechnung_positionen');
--   -> muss zwei Zeilen liefern
