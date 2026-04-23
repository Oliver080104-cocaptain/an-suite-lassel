import { NextRequest, NextResponse } from 'next/server'

/**
 * Parksperre-Versand — dünner Proxy zum n8n-Webhook.
 *
 * Nimmt nur noch JSON (kein multipart mehr): attachment-URLs + email.
 * Datei-Uploads passieren CLIENT-SEITIG direkt gegen Supabase Storage
 * (siehe Migration 018 für Bucket + Policies). Dadurch umgehen wir
 * Vercel's 4.5MB Body-Limit.
 *
 * Der einzige Grund warum der Client nicht selbst n8n ruft: CORS-
 * Preflight vom n8n-Hostinger-Endpoint wird nicht beantwortet
 * (kein Access-Control-Allow-Origin).
 */

const PARKSPERRE_WEBHOOK = 'https://n8n.srv1367876.hstgr.cloud/webhook/7836c00e-ddef-4c0a-90b9-be803b9dc3a9'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Attachment {
  url: string
  name: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid-json-body' }, { status: 400 })
    }

    const email = body.email
    if (!email?.to) {
      return NextResponse.json({ error: 'email.to fehlt' }, { status: 400 })
    }

    const attachments: Attachment[] = Array.isArray(body.attachments) ? body.attachments : []
    const angebotsnummer = body.angebotsnummer || ''
    const objektAdresse = body.objektAdresse || ''

    const n8nResp = await fetch(PARKSPERRE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typ: 'parksperre',
        angebotsnummer,
        objektAdresse,
        attachments,
        email: {
          to: email.to,
          subject: email.subject || '',
          body: email.body || '',
          mitarbeiter: email.mitarbeiter || '',
          signatur: email.signatur || '',
        },
        timestamp: new Date().toISOString(),
      }),
    })

    const n8nText = await n8nResp.text().catch(() => '')
    if (!n8nResp.ok) {
      console.error('[parksperre-senden] n8n failed', {
        status: n8nResp.status,
        statusText: n8nResp.statusText,
        body: n8nText.slice(0, 1000),
        url: PARKSPERRE_WEBHOOK,
      })
      return NextResponse.json(
        {
          error: 'n8n-webhook-failed',
          n8nStatus: n8nResp.status,
          n8nStatusText: n8nResp.statusText,
          n8nResponse: n8nText.slice(0, 500),
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, attachmentsCount: attachments.length })
  } catch (err: any) {
    console.error('[parksperre-senden]', err)
    return NextResponse.json(
      { error: err?.message || 'unbekannter Fehler' },
      { status: 500 }
    )
  }
}
