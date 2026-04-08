-- ============================================================
-- MIGRATION 005: Rechnungssystem-Erweiterung (RIHA-Style)
-- Im Supabase SQL Editor ausführen.
-- Additiv: bestehende Daten/Tabellen werden NICHT verändert.
--
-- Hinweis: Wir nutzen weiterhin die bestehende `teilzahlungen` Tabelle
-- (statt einer neuen `rechnungen_zahlungen` Tabelle), weil sie in der
-- App schon angebunden ist.
-- ============================================================

-- Zusatzspalten für Teilrechnungen / Anzahlungen / Schlussrechnungen
ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS referenz_angebot_id UUID REFERENCES angebote(id),
  ADD COLUMN IF NOT EXISTS referenz_angebot_nummer TEXT,
  ADD COLUMN IF NOT EXISTS teilbetrag_netto NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS teilbetrag_brutto NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ist_schlussrechnung BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS bereits_fakturiert_netto NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zahlungsstatus TEXT DEFAULT 'offen',
  ADD COLUMN IF NOT EXISTS fusszeile TEXT;

-- Index für schnelle "Verknüpfte Rechnungen"-Lookups vom Angebot aus
CREATE INDEX IF NOT EXISTS idx_rechnungen_referenz_angebot
  ON rechnungen(referenz_angebot_id);

-- Schema-Cache aktualisieren
NOTIFY pgrst, 'reload schema';
