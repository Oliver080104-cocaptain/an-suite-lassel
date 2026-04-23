-- ============================================================
-- MIGRATION 018: parksperre-anhaenge Storage Bucket + Policies
-- Im Supabase SQL Editor ausführen.
--
-- Symptom: POST /api/parksperre-senden lieferte 502 beim Datei-
-- Upload, weil Vercel's Body-Limit (~4.5MB Hobby) überschritten
-- wurde. Architektur-Fix: Client lädt direkt in Supabase Storage
-- hoch (keine Vercel-Grenze), Server-Route bekommt nur die URLs
-- + Mail-Daten im JSON-Body (klein, unproblematisch).
--
-- Diese Migration legt den Bucket + Policies an damit der Anon-
-- Client aus dem Browser hochladen und lesen darf.
--
-- Additiv/idempotent.
-- ============================================================

-- Bucket anlegen — public, 20MB pro Datei
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'parksperre-anhaenge',
  'parksperre-anhaenge',
  true,
  20971520, -- 20 MB
  NULL      -- alle MIME types erlauben
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520;

-- Policies in storage.objects — idempotent per DROP IF EXISTS
DROP POLICY IF EXISTS "parksperre-anhaenge anon upload" ON storage.objects;
CREATE POLICY "parksperre-anhaenge anon upload"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'parksperre-anhaenge');

DROP POLICY IF EXISTS "parksperre-anhaenge public read" ON storage.objects;
CREATE POLICY "parksperre-anhaenge public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'parksperre-anhaenge');

-- (Delete absichtlich NICHT erlaubt für anon — aufräumen läuft
-- später via Cron oder Admin.)

NOTIFY pgrst, 'reload schema';
