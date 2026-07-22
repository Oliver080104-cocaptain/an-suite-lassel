import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMail, escapeHtml, GraphMailError, type GraphAttachment } from '@/lib/graph-mail'
import { createZip } from '@/lib/zip'
import { logEvent } from '@/lib/monitoring'

/**
 * Angebot / Rechnung per E-Mail versenden.
 *
 * ZWEI BETRIEBSARTEN, umgeschaltet über EMAIL_VERSAND_MODUS:
 *
 *   'n8n' (Default, aktuell aktiv)
 *     Wie bisher: der komplette bestehende n8n-Flow wird mit exakt demselben
 *     Payload angestoßen wie vorher aus dem Modal heraus — inklusive
 *     email-Block und attachments[]. n8n versendet die Mail und legt das PDF
 *     in Zoho ab. Die Route ist hier nur ein dünner Proxy.
 *
 *   'graph'
 *     Die Plattform versendet selbst über Microsoft Graph:
 *       1. PDF von der eigenen /api/pdf/{typ}/{id}-Route holen (mit Retry)
 *       2. Anhänge aus dem Supabase-Bucket email-anhaenge nachladen
 *       3. Anhänge zu "Skizzen.zip" bündeln (wie der n8n-Compression-Node)
 *       4. Mail mit PDF + ZIP über Graph versenden
 *       5. reduzierten Zoho-Upload-Flow anstoßen (nicht versandkritisch)
 *
 * Umgestellt wird erst, wenn die Microsoft-365-Zugangsdaten hinterlegt und
 * getestet sind. Bis dahin ändert sich für die Anwender nichts.
 *
 * Fehler werden in beiden Modi NICHT geschluckt: geht der Versand schief,
 * kommt ein Non-2xx zurück, damit der Client den Beleg-Status nicht
 * fälschlich auf "versendet" setzt.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// PDF-Rendering via api2pdf braucht mehrere Sekunden, dazu Upload der Anhänge.
// vercel.json deckt nur /api/pdf/** ab, deshalb hier explizit.
export const maxDuration = 60

const DOC_CONFIG = {
  angebot: {
    pdfPath: 'angebot',
    filePrefix: 'Angebot',
    idField: 'offerId',
    nrField: 'angebotNummer',
    tabelle: 'angebote',
    nummerSpalte: 'angebotsnummer',
  },
  rechnung: {
    pdfPath: 'rechnung',
    filePrefix: 'Rechnung',
    idField: 'rechnungsId',
    nrField: 'rechnungsNummer',
    tabelle: 'rechnungen',
    nummerSpalte: 'rechnungsnummer',
  },
} as const

type DocType = keyof typeof DOC_CONFIG

/**
 * Versandweg. Default ist bewusst 'n8n' — es ändert sich erst dann etwas,
 * wenn jemand die Variable aktiv auf 'graph' stellt.
 */
function versandModus(): 'n8n' | 'graph' {
  return (process.env.EMAIL_VERSAND_MODUS || '').trim().toLowerCase() === 'graph' ? 'graph' : 'n8n'
}

/**
 * Die BESTEHENDEN, unveränderten n8n-Flows (Mail + Zoho in einem).
 * Werden nur im Modus 'n8n' angesprochen.
 */
const N8N_VERSAND_WEBHOOK = {
  angebot: process.env.N8N_WEBHOOK_ANGEBOT_VERSAND
    ?? 'https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf',
  rechnung: process.env.N8N_WEBHOOK_RECHNUNG_VERSAND
    ?? 'https://n8n.srv1367876.hstgr.cloud/webhook/rechnung-versenden',
} as const

/** Name des gebündelten Anhang-Archivs — bewusst identisch zum bisherigen n8n-Node. */
const ZIP_NAME = 'Skizzen.zip'

/** Obergrenze pro nachgeladener Datei, deckungsgleich mit dem Bucket-Limit (Migration 022). */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/**
 * Zeitbudget. maxDuration ist 60 s — läuft die Function dagegen, wird sie hart
 * abgeschnitten und der Client sieht einen nichtssagenden Fehler. Schlimmer:
 * passiert das MITTEN im Graph-Versand, ist die Mail raus, der User hält es für
 * fehlgeschlagen und schickt sie nochmal.
 *
 * Deshalb sind die Vorbereitungsschritte (PDF + Anhänge) hart gedeckelt. Ist
 * das Vorbereitungsbudget aufgebraucht, brechen wir ab BEVOR gesendet wird —
 * dann ist garantiert keine Mail unterwegs und ein Retry ist gefahrlos.
 */
const PREPARE_BUDGET_MS = 30_000
const PDF_TIMEOUT_MS = 20_000
const ATTACHMENT_TIMEOUT_MS = 15_000
/** Gesamtbudget inkl. Versand — lässt ~7 s Puffer bis zum harten Vercel-Limit. */
const TOTAL_BUDGET_MS = 53_000

interface IncomingAttachment {
  url: string
  fileName: string
  mimeType?: string
}

interface RequestBody {
  docType?: string
  docId?: string
  docNummer?: string
  an?: string
  betreff?: string
  nachricht?: string
  signatur?: string
  mitarbeiter?: string
  antwortAn?: string
  attachments?: IncomingAttachment[]
  /** Zusatzfelder für den Zoho-Webhook (ticketId, positionen, …). */
  zohoPayload?: Record<string, unknown>
}

/**
 * Abgelehnte Anfragen werden mitgeloggt. Vorher hat das Modal jeden Non-2xx
 * des n8n-Webhooks als `webhook-outgoing`-Error gemeldet; ohne Logging hier
 * wären fehlgeschlagene Versandversuche im Monitoring unsichtbar.
 */
function badRequest(message: string, kontext?: Record<string, unknown>) {
  if (kontext) {
    logEvent('warning', 'email-versand', `Versand abgelehnt: ${message}`, kontext).catch(() => {})
  }
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * Prüft, ob der Beleg existiert und die übergebene Nummer dazu passt.
 * Gibt bei Erfolg null zurück, sonst die Fehlermeldung.
 *
 * Ist Supabase nicht erreichbar, wird der Versand NICHT blockiert — sonst
 * würde ein Ausfall der Prüfung den Versand lahmlegen. Die Prüfung ist eine
 * Plausibilitätsschranke, kein Sicherheitsmechanismus; echten Schutz gibt es
 * erst mit einer Authentifizierung vor der Route.
 */
async function pruefeBeleg(docType: DocType, docId: string, docNummer: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  const cfg = DOC_CONFIG[docType]
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await supabase
      .from(cfg.tabelle)
      .select(`${cfg.nummerSpalte}, geloescht_am`)
      .eq('id', docId)
      .maybeSingle()
    if (error) {
      console.warn('[email-versand] Beleg-Prüfung fehlgeschlagen:', error.message)
      return null
    }
    if (!data) return 'Beleg nicht gefunden'
    // Ein Beleg im Papierkorb darf nicht mehr an den Kunden gehen.
    if ((data as Record<string, unknown>).geloescht_am != null) {
      return 'Dieser Beleg liegt im Papierkorb und kann nicht versendet werden.'
    }
    const gespeichert = (data as Record<string, unknown>)[cfg.nummerSpalte]
    if (typeof gespeichert === 'string' && gespeichert && gespeichert !== docNummer) {
      return 'Belegnummer passt nicht zum Beleg'
    }
    return null
  } catch (err) {
    console.warn('[email-versand] Beleg-Prüfung übersprungen:', (err as Error).message)
    return null
  }
}

/** Empfängerfeld kann "a@b.at, c@d.at" oder mit Semikolon getrennt sein. */
function parseRecipients(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => /.+@.+\..+/.test(s))
}

/**
 * Baut den Mail-Body exakt wie bisher der n8n-Node "Code in JavaScript2":
 * Arial-Rahmen, Nachricht als <pre>, darunter abgesetzt die Signatur.
 * Neu ist nur, dass beide Teile escaped werden — vorher ging der KI-Text
 * ungeprüft ins Markup und ein "<" hat die Mail zerlegt.
 */
function buildHtmlBody(nachricht: string, signatur: string): string {
  const signaturHtml = escapeHtml(signatur).replace(/\r?\n/g, '<br>')
  return [
    '<div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">',
    `  <pre style="font-family: Arial, sans-serif; font-size: 14px; white-space: pre-wrap; margin: 0;">${escapeHtml(nachricht)}</pre>`,
    '  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; color: #555;">',
    `    ${signaturHtml}`,
    '  </div>',
    '</div>',
  ].join('\n')
}

/**
 * Holt das PDF von der eigenen Route. Bewusst per HTTP statt via direktem
 * Aufruf des Renderers: die Route baut das komplette HTML (Adressblock,
 * Reverse-Charge-Logik, Positionen) und die soll nicht dupliziert werden.
 *
 * api2pdf antwortet gelegentlich mit 502; deshalb ein Retry. Zusätzlich wird
 * geprüft, ob wirklich ein PDF zurückkommt — die Route liefert Fehler als
 * Text-Body mit Status 500/502, und ein solcher "Anhang" wäre wertlos.
 */
async function fetchPdf(url: string, fileName: string, restMs: () => number): Promise<GraphAttachment> {
  let lastDetail = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/pdf' },
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(PDF_TIMEOUT_MS, Math.max(restMs(), 1000))),
      })
      if (!res.ok) {
        lastDetail = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`
      } else {
        const data = new Uint8Array(await res.arrayBuffer())
        // %PDF-Signatur prüfen — schützt vor HTML-Fehlerseiten als "PDF".
        const isPdf = data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46
        if (isPdf) {
          return { name: fileName, contentType: 'application/pdf', data }
        }
        lastDetail = `Antwort ist kein PDF (${data.length} Bytes, Content-Type ${res.headers.get('content-type')})`
      }
    } catch (err) {
      lastDetail = (err as Error).message
    }
    // Zweiter Versuch nur, wenn danach noch Zeit zum Senden bleibt.
    if (attempt === 1) {
      if (restMs() < PDF_TIMEOUT_MS) break
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw new Error(`PDF konnte nicht erzeugt werden — ${lastDetail}`)
}

/**
 * Lädt die vom Browser hochgeladenen Anhänge aus dem Supabase-Bucket nach.
 *
 * Der Client bestimmt die URLs, deshalb wird hart eingegrenzt: nur https, nur
 * der Host des eigenen Supabase-Projekts, und nur der öffentliche Pfad des
 * Buckets `email-anhaenge`. Ohne die Pfadprüfung wäre z.B.
 * `https://<projekt>.supabase.co/rest/v1/kunden?select=*` ein gültiger
 * "Anhang" — die Route würde die Kundentabelle abrufen und an eine beliebige
 * Adresse mailen. Fehlt die Konfiguration, wird abgelehnt statt durchgelassen.
 */
const ANHANG_PFAD_PREFIX = '/storage/v1/object/public/email-anhaenge/'

async function fetchAttachments(
  list: IncomingAttachment[],
  restMs: () => number
): Promise<GraphAttachment[]> {
  if (list.length === 0) return []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  let allowedHost = ''
  try {
    allowedHost = supabaseUrl ? new URL(supabaseUrl).host : ''
  } catch {
    allowedHost = ''
  }
  if (!allowedHost) {
    throw new Error('Speicher für Anhänge ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL fehlt).')
  }

  const result: GraphAttachment[] = []
  for (const item of list) {
    if (restMs() <= 0) {
      throw new Error('Die Anhänge konnten nicht rechtzeitig geladen werden. Bitte erneut versuchen.')
    }
    let parsed: URL
    try {
      parsed = new URL(item.url)
    } catch {
      throw new Error(`Anhang "${item.fileName}" hat keine gültige URL`)
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.host !== allowedHost ||
      !parsed.pathname.startsWith(ANHANG_PFAD_PREFIX) ||
      parsed.search !== ''
    ) {
      throw new Error(`Anhang "${item.fileName}" liegt nicht im erlaubten Speicher`)
    }

    const res = await fetch(parsed.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.min(ATTACHMENT_TIMEOUT_MS, Math.max(restMs(), 1000))),
    }).catch((err: Error) => {
      throw new Error(`Anhang "${item.fileName}" konnte nicht geladen werden: ${err.message}`)
    })
    if (!res.ok) {
      throw new Error(`Anhang "${item.fileName}" konnte nicht geladen werden (HTTP ${res.status})`)
    }

    const data = new Uint8Array(await res.arrayBuffer())
    if (data.length === 0) {
      throw new Error(`Anhang "${item.fileName}" ist leer`)
    }
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Anhang "${item.fileName}" ist zu groß (max. 20 MB)`)
    }
    result.push({
      name: item.fileName || 'anhang',
      contentType: item.mimeType || res.headers.get('content-type') || 'application/octet-stream',
      data,
    })
  }
  return result
}

/**
 * Stößt den (reduzierten) n8n-Flow an, der das PDF in den Zoho-WorkDrive-
 * Ordner legt. Bewusst NACH dem Versand und nicht versandkritisch: ist n8n
 * offline, ist die Mail trotzdem raus und der Beleg-Status stimmt.
 * Leere Env-Variable schaltet den Upload ab.
 *
 * ANGEBOT: Default ist der bestehende Flow ab34322b… — dessen Mail-Zweig ist
 * entfernt, er macht nur noch den WorkDrive-Upload.
 * RECHNUNG: Default ist ABSICHTLICH leer. Der Flow /webhook/rechnung-versenden
 * verschickt aktuell noch selbst eine Mail; würde er hier mitgefeuert, bekäme
 * der Kunde die Rechnung doppelt. Erst nach identischer Reduktion des Flows
 * N8N_ZOHO_WEBHOOK_RECHNUNG setzen.
 */
async function triggerZohoUpload(
  docType: DocType,
  payload: Record<string, unknown>,
  docNummer: string,
  restMs: () => number
): Promise<'ok' | 'fehlgeschlagen' | 'deaktiviert' | 'uebersprungen'> {
  const url =
    docType === 'angebot'
      ? process.env.N8N_ZOHO_WEBHOOK_ANGEBOT ?? ''
      : process.env.N8N_ZOHO_WEBHOOK_RECHNUNG ?? ''

  if (!url) return 'deaktiviert'

  // Die Mail ist an dieser Stelle bereits raus. Bleibt keine Zeit mehr, wird
  // der Upload übersprungen — würde die Function hier abgeschnitten, sähe der
  // Client einen Fehler und der Sachbearbeiter würde die Mail erneut senden.
  const budget = Math.min(8_000, restMs())
  if (budget < 1_000) {
    await logEvent('warning', 'zoho-upload',
      `Zoho-Ablage übersprungen (keine Zeit mehr) für ${docNummer} — E-Mail wurde versendet`,
      { docNummer }
    )
    return 'uebersprungen'
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(budget),
    })
    if (res.ok) return 'ok'
    await logEvent('warning', 'zoho-upload',
      `Zoho-Ablage fehlgeschlagen (HTTP ${res.status}) für ${docNummer} — E-Mail wurde trotzdem versendet`,
      { docNummer, status: res.status }
    )
    return 'fehlgeschlagen'
  } catch (err) {
    await logEvent('warning', 'zoho-upload',
      `Zoho-Ablage nicht erreichbar für ${docNummer} — E-Mail wurde trotzdem versendet`,
      { docNummer, error: (err as Error).message }
    )
    return 'fehlgeschlagen'
  }
}

/**
 * Modus 'n8n': stößt den bestehenden Flow mit exakt dem Payload an, den vorher
 * das Modal geschickt hat. Struktur bewusst unverändert, damit die Nodes
 * "Code in JavaScript2/4", "Bilder extrahieren" und "Payload vorbereiten"
 * dieselben Felder vorfinden wie bisher:
 *
 *   {...kunde/rechnungsempfaenger, objekt, erstelltDurch, summen,
 *    ...extraPayload, offerId|rechnungsId, angebotNummer|rechnungsNummer,
 *    pdfUrl, pdfFileName, status, email:{…}, timestamp, attachments:[…]}
 *
 * Einzige inhaltliche Abweichung: `nachrichtHtml` wird HTML-escaped. n8n setzt
 * den Text roh ins Markup — ein "<" aus dem KI-Text hat die Mail bisher
 * zerlegt. Für Text ohne Sonderzeichen ist das Ergebnis identisch.
 */
async function versandUeberN8n(args: {
  docType: DocType
  docId: string
  docNummer: string
  empfaenger: string[]
  betreff: string
  nachricht: string
  signatur: string
  mitarbeiter: string
  attachments: IncomingAttachment[]
  zohoPayload: Record<string, unknown>
  pdfUrl: string
  pdfFileName: string
}): Promise<NextResponse> {
  const cfg = DOC_CONFIG[args.docType]
  const url = N8N_VERSAND_WEBHOOK[args.docType]

  if (!url) {
    return NextResponse.json(
      { error: 'E-Mail-Versand ist nicht konfiguriert (kein n8n-Webhook hinterlegt).' },
      { status: 500 }
    )
  }

  const payload = {
    ...args.zohoPayload,
    [cfg.idField]: args.docId,
    [cfg.nrField]: args.docNummer,
    pdfUrl: args.pdfUrl,
    pdfFileName: args.pdfFileName,
    email: {
      sendenAn: args.empfaenger.join(', '),
      betreff: args.betreff,
      nachrichtHtml: `<pre>${escapeHtml(args.nachricht)}</pre>`,
      mitarbeiter: args.mitarbeiter,
      signatur: args.signatur,
    },
    timestamp: new Date().toISOString(),
    attachments: args.attachments,
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    await logEvent('error', 'email-versand',
      `n8n-Versand-Webhook nicht erreichbar für ${args.docNummer}`,
      { docType: args.docType, docNummer: args.docNummer, error: (err as Error).message }
    )
    return NextResponse.json(
      { error: 'E-Mail-Dienst nicht erreichbar. Bitte erneut versuchen.' },
      { status: 502 }
    )
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    await logEvent('error', 'email-versand',
      `n8n-Versand-Webhook fehlgeschlagen (HTTP ${res.status}) für ${args.docNummer}`,
      { docType: args.docType, docNummer: args.docNummer, status: res.status, detail: detail.slice(0, 300) }
    )
    return NextResponse.json(
      { error: `E-Mail-Versand fehlgeschlagen (HTTP ${res.status}). Status wurde nicht geändert.` },
      { status: 502 }
    )
  }

  // Wie bisher: 2xx heißt "n8n hat den Trigger angenommen", NICHT "zugestellt".
  // n8n verschickt asynchron; die Zoho-Ablage passiert im selben Flow.
  return NextResponse.json({
    ok: true,
    modus: 'n8n',
    anhaenge: args.attachments.map((a) => ({ name: a.fileName })),
    zohoAblage: 'ueber-n8n',
  })
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const restMs = () => PREPARE_BUDGET_MS - (Date.now() - startedAt)
  const restGesamtMs = () => TOTAL_BUDGET_MS - (Date.now() - startedAt)

  const body = (await req.json().catch(() => null)) as RequestBody | null
  if (!body || typeof body !== 'object') return badRequest('Ungültiger Request-Body')

  const docType = body.docType === 'rechnung' ? 'rechnung' : body.docType === 'angebot' ? 'angebot' : null
  if (!docType) return badRequest('docType muss "angebot" oder "rechnung" sein')
  const cfg = DOC_CONFIG[docType]

  const docId = (body.docId || '').trim()
  const docNummer = (body.docNummer || '').trim()
  if (!docId) return badRequest('docId fehlt')
  if (!docNummer) return badRequest('docNummer fehlt')

  const empfaenger = parseRecipients(body.an || '')
  if (empfaenger.length === 0) {
    return badRequest('Keine gültige Empfänger-E-Mail-Adresse angegeben', { docType, docNummer })
  }

  const betreff = (body.betreff || '').trim()
  if (!betreff) return badRequest('Betreff fehlt')

  const origin = req.nextUrl.origin

  // Nur Anfragen aus der eigenen App. Kein Ersatz für echte Authentifizierung
  // (die es in dieser App noch nirgends gibt, siehe Audit 2026-07-13), aber es
  // verhindert, dass eine fremde Website im Browser eines Mitarbeiters Mails
  // über das Firmenpostfach auslöst.
  const herkunft = req.headers.get('origin')
  if (herkunft && herkunft !== origin) {
    return badRequest('Anfrage von unerlaubter Herkunft', { docType, docNummer })
  }

  // Beleg muss existieren und die Nummer muss passen. Verhindert, dass über
  // die Route frei erfundene Mails unter dem Absender der Firma verschickt
  // werden, und fängt nebenbei vertauschte docId/docNummer ab.
  const belegFehler = await pruefeBeleg(docType, docId, docNummer)
  if (belegFehler) return badRequest(belegFehler, { docType, docNummer })

  const attachmentsIn = Array.isArray(body.attachments) ? body.attachments : []
  const pdfFileName = `${cfg.filePrefix}_${docNummer}.pdf`
  // Selbstreferenz auf die eigene Deployment-URL — nicht aus dem Client
  // übernehmen, sonst wäre die Route ein Proxy für beliebige Fremd-PDFs.
  const pdfUrl = `${origin}/api/pdf/${cfg.pdfPath}/${encodeURIComponent(docId)}`

  if (versandModus() === 'n8n') {
    return versandUeberN8n({
      docType,
      docId,
      docNummer,
      empfaenger,
      betreff,
      nachricht: body.nachricht || '',
      signatur: body.signatur || '',
      mitarbeiter: body.mitarbeiter || '',
      attachments: attachmentsIn,
      zohoPayload: body.zohoPayload || {},
      pdfUrl,
      pdfFileName,
    })
  }

  try {
    const pdf = await fetchPdf(pdfUrl, pdfFileName, restMs)

    const geladen = await fetchAttachments(attachmentsIn, restMs)

    // Letzter Check vor dem Punkt ohne Wiederkehr: ab hier könnte ein
    // Abschneiden der Function eine bereits versendete Mail verschleiern.
    if (restMs() <= 0) {
      throw new Error(
        'Die Vorbereitung von PDF und Anhängen hat zu lange gedauert. Es wurde nichts versendet — bitte erneut versuchen.'
      )
    }

    const mailAttachments: GraphAttachment[] = [pdf]
    if (geladen.length > 0) {
      // Wie bisher in n8n: alle Zusatzdateien in ein Archiv bündeln.
      const zip = createZip(geladen.map((a) => ({ name: a.name, data: a.data })))
      mailAttachments.push({ name: ZIP_NAME, contentType: 'application/zip', data: zip })
    }

    const antwortAn = parseRecipients(body.antwortAn || '')
    const result = await sendMail({
      to: empfaenger,
      replyTo: antwortAn.length ? antwortAn : undefined,
      subject: betreff,
      html: buildHtmlBody(body.nachricht || '', body.signatur || ''),
      attachments: mailAttachments,
      // Erlaubt später die Zuordnung im Microsoft-365-Nachrichtenverlauf.
      headers: [{ name: 'x-beleg-nummer', value: docNummer }],
    })

    const zoho = await triggerZohoUpload(
      docType,
      {
        ...(body.zohoPayload || {}),
        [cfg.idField]: docId,
        [cfg.nrField]: docNummer,
        pdfUrl,
        pdfFileName,
        versendetAn: empfaenger.join(', '),
        timestamp: new Date().toISOString(),
      },
      docNummer,
      restGesamtMs
    )

    return NextResponse.json({
      ok: true,
      modus: result.mode,
      anhaenge: mailAttachments.map((a) => ({ name: a.name, bytes: a.data.length })),
      zohoAblage: zoho,
    })
  } catch (err) {
    const graphError = err instanceof GraphMailError ? err : null
    const userMessage = graphError ? graphError.userMessage : (err as Error).message

    await logEvent('error', 'email-versand',
      `E-Mail-Versand fehlgeschlagen für ${docNummer}: ${userMessage}`,
      {
        docType,
        docNummer,
        empfaenger: empfaenger.length,
        anhaenge: attachmentsIn.length,
        code: graphError?.code,
        status: graphError?.status,
        detail: (err as Error).message.slice(0, 300),
      }
    )

    // Statuscode so wählen, dass er zur Meldung passt:
    // 429 bleibt 429 (transient, Wiederholung sinnvoll), Eingabe- und
    // Konfigurationsfehler sind 400, alles Übrige ist ein Fremddienst-Ausfall.
    let status = 502
    if (graphError?.status === 429) {
      status = 429
    } else if (graphError?.status && graphError.status >= 400 && graphError.status < 500) {
      status = 400
    } else if (
      graphError?.code === 'no-recipients' ||
      graphError?.code === 'attachments-too-large' ||
      graphError?.code === 'config-missing'
    ) {
      status = 400
    }
    return NextResponse.json({ error: userMessage }, { status })
  }
}
