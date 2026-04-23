import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Server-Side Proxy für den Parksperre-Versand.
 *
 * Frisst multipart/form-data mit:
 *  - email.to, email.subject, email.body, email.mitarbeiter, email.signatur
 *  - angebotsnummer, objektAdresse
 *  - files[]: einzelne File-Felder (max 3)
 *
 * Macht zwei Dinge die client-seitig scheitern würden:
 *  1) Upload der Anhänge in den Supabase Storage Bucket `parksperre-anhaenge`
 *     (Bucket wird automatisch angelegt wenn nicht vorhanden) mittels
 *     Service-Role-Key — RLS umgangen, public-URLs zurück.
 *  2) POST an den n8n-Webhook — serverseitig, also kein CORS-Problem
 *     (n8n-Hostinger-Webhook antwortet browserseitig ohne
 *     Access-Control-Allow-Origin-Header).
 */

const PARKSPERRE_WEBHOOK = 'https://n8n.srv1367876.hstgr.cloud/webhook/parkraumsperre%20beantragen'
const BUCKET = 'parksperre-anhaenge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function ensureBucketExists(admin: any) {
  // getBucket wirft bei Fehlern; createBucket ist idempotent über try/catch.
  try {
    const { data } = await admin.storage.getBucket(BUCKET)
    if (data) return
  } catch {
    // ignore — bucket existiert nicht
  }
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true, // Öffentliche Lese-URL damit n8n die Datei fetchen kann.
    fileSizeLimit: 20 * 1024 * 1024, // 20 MB pro Datei
  })
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Bucket-Anlage fehlgeschlagen: ${error.message}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'supabase-env-missing' }, { status: 500 })
    }
    const admin = createClient(supabaseUrl, serviceKey)

    const form = await req.formData()

    const emailTo = String(form.get('email.to') || '')
    const emailSubject = String(form.get('email.subject') || '')
    const emailBody = String(form.get('email.body') || '')
    const emailMitarbeiter = String(form.get('email.mitarbeiter') || '')
    const emailSignatur = String(form.get('email.signatur') || '')
    const angebotsnummer = String(form.get('angebotsnummer') || '')
    const objektAdresse = String(form.get('objektAdresse') || '')

    if (!emailTo) {
      return NextResponse.json({ error: 'email.to fehlt' }, { status: 400 })
    }

    // Anhänge sammeln. Frontend schickt sie unter key "files" mehrfach.
    const rawFiles = form.getAll('files').filter((x): x is File => x instanceof File)
    const attachments: { url: string; name: string }[] = []

    if (rawFiles.length > 0) {
      await ensureBucketExists(admin)
      for (const file of rawFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${Date.now()}-${safeName}`
        const buf = Buffer.from(await file.arrayBuffer())
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
        if (upErr) {
          console.error('[parksperre upload]', upErr)
          return NextResponse.json(
            { error: `Upload fehlgeschlagen für ${file.name}: ${upErr.message}` },
            { status: 500 }
          )
        }
        const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
        attachments.push({ url: data.publicUrl, name: file.name })
      }
    }

    // n8n-Webhook feuern — server-zu-server, kein CORS.
    const n8nResp = await fetch(PARKSPERRE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typ: 'parksperre',
        angebotsnummer,
        objektAdresse,
        attachments,
        email: {
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
          mitarbeiter: emailMitarbeiter,
          signatur: emailSignatur,
        },
        timestamp: new Date().toISOString(),
      }),
    })

    const n8nText = await n8nResp.text().catch(() => '')
    if (!n8nResp.ok) {
      return NextResponse.json(
        { error: 'n8n-webhook-failed', status: n8nResp.status, response: n8nText.slice(0, 500) },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, attachmentsUploaded: attachments.length })
  } catch (err: any) {
    console.error('[parksperre-senden]', err)
    return NextResponse.json({ error: err?.message || 'unbekannter Fehler' }, { status: 500 })
  }
}
