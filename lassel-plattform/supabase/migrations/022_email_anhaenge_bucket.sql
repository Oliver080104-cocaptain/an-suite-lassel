-- ============================================================
-- MIGRATION 022: email-anhaenge Storage Bucket + Policies
-- Im Supabase SQL Editor ausführen.
--
-- Zweck: Im E-Mail-Vorschau-Modal (Angebot/Rechnung versenden)
-- konnte man zwar Dateien auswählen, sie wurden aber nie hochgeladen
-- oder an die Mail angehängt. Fix analog zu Migration 018
-- (parksperre-anhaenge): der Browser lädt direkt in Supabase Storage
-- hoch (umgeht Vercel's ~4.5MB Body-Limit), das Webhook-Payload
-- enthält nur noch die URLs. n8n holt die Dateien per URL und hängt
-- sie an die ausgehende E-Mail.
--
-- Additiv/idempotent.
-- ============================================================

-- Bucket anlegen — public, 20MB pro Datei
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-anhaenge',
  'email-anhaenge',
  true,
  20971520, -- 20 MB
  NULL      -- alle MIME types erlauben
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520;

-- Policies in storage.objects — idempotent per DROP IF EXISTS
DROP POLICY IF EXISTS "email-anhaenge anon upload" ON storage.objects;
CREATE POLICY "email-anhaenge anon upload"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'email-anhaenge');

DROP POLICY IF EXISTS "email-anhaenge public read" ON storage.objects;
CREATE POLICY "email-anhaenge public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'email-anhaenge');

-- (Delete absichtlich NICHT erlaubt für anon — aufräumen läuft
-- später via Cron oder Admin.)

NOTIFY pgrst, 'reload schema';
