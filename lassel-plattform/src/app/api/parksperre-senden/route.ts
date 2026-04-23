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

// Zwei URL-Varianten probieren — je nach n8n-Deploy matched mal die UUID,
// mal der Custom-Path. Wir probieren erst UUID, dann den percent-encodeten
// Custom-Path. Hilfreich falls der User die Webhook-Node neu anlegt oder
// den Path ändert ohne UUID zu wissen.
const PARKSPERRE_WEBHOOKS = [
  'https://n8n.srv1367876.hstgr.cloud/webhook/7836c00e-ddef-4c0a-90b9-be803b9dc3a9',
  'https://n8n.srv1367876.hstgr.cloud/webhook/parkraumsperre%20beantragen',
]

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

    const payload = JSON.stringify({
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
    })

    // Fallback-Chain: ersten Webhook probieren, bei non-2xx den nächsten.
    // So tauchen 404/405 auf UUID-Route nicht als sofortiger Fehler auf,
    // wenn n8n den Webhook unter dem custom-Path registriert hat.
    const attempts: { url: string; status: number; statusText: string; body: string }[] = []
    let okResp: Response | null = null

    for (const url of PARKSPERRE_WEBHOOKS) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        })
        if (resp.ok) {
          okResp = resp
          break
        }
        const txt = await resp.text().catch(() => '')
        attempts.push({ url, status: resp.status, statusText: resp.statusText, body: txt.slice(0, 500) })
      } catch (fetchErr: any) {
        attempts.push({
          url,
          status: 0,
          statusText: fetchErr?.message || 'fetch-threw',
          body: '',
        })
      }
    }

    if (!okResp) {
      console.error('[parksperre-senden] all n8n attempts failed', attempts)
      return NextResponse.json(
        {
          error: 'n8n-webhook-failed',
          hint: 'Alle n8n-Webhook-URLs haben non-2xx geliefert. Prüfe ob der Flow in n8n AKTIV ist (nicht nur gespeichert — "Active"-Toggle oben rechts muss grün sein).',
          attempts,
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
