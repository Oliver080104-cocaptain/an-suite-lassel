-- ============================================================
-- MIGRATION 013: Mitarbeiter RLS Policy
-- Behebt 400-Error beim Hinzufügen von Mitarbeitern in der
-- Analytics-Suite. In Produktion fehlt die Allow-All-Policy auf
-- der mitarbeiter-Tabelle (war nur in schema.sql, nicht in einer
-- Migration, die in Prod ausgeführt wurde).
-- Idempotent.
-- ============================================================

ALTER TABLE mitarbeiter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mitarbeiter;
CREATE POLICY "Allow all" ON mitarbeiter FOR ALL USING (true) WITH CHECK (true);

-- Gleiches für vermittler falls dort auch fehlend
ALTER TABLE vermittler ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON vermittler;
CREATE POLICY "Allow all" ON vermittler FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
