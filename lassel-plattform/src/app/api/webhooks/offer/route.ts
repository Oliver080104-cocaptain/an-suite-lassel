import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'
import { resolveKundeName, isKundeNameFallback } from '@/lib/webhook-kunde'
import { logEvent } from '@/lib/monitoring'
import { num, computeTotals, lineNetto, STANDARD_MWST } from '@/lib/money'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://an-suite-lassel.vercel.app'

async function generateAngebotsnummer(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `AN-${year}-`

  const { data } = await supabase
    .from('angebote')
    .select('angebotsnummer')
    .like('angebotsnummer', `${prefix}%`)
    .order('angebotsnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.angebotsnummer) {
    const lastNum = parseInt(data.angebotsnummer.replace(prefix, ''), 10)
    return `${prefix}${String(lastNum + 1).padStart(5, '0')}`
  }

  return `${prefix}00001`
}

/**
 * Vermittler-ID via Name-Match auflösen.
 * Zoho schickt im payload einen vermittler-objekt mit id/name — die Zoho-ID
 * stimmt aber NIE mit unserer Supabase-UUID überein. Daher: Name-Match in
 * unserer vermittler-Tabelle (case-insensitive). Nichts gefunden → null.
 */
async function resolveVermittlerId(
  vermittlerName: string | null | undefined,
  ctx?: { ticketId?: string | null }
): Promise<string | null> {
  if (!vermittlerName?.trim()) return null
  const { data } = await supabase
    .from('vermittler')
    .select('id')
    .ilike('name', vermittlerName.trim())
    .limit(1)
    .maybeSingle()
  if (!data?.id) {
    logEvent('warning', 'webhook-offer-vermittler',
      `Vermittler '${vermittlerName}' nicht in DB — Angebot ohne Vermittler-Verknüpfung`,
      { vermittlerName, ticketId: ctx?.ticketId ?? null }
    ).catch(() => {})
    return null
  }
  return data.id
}

/**
 * Komplettes Feld-Mapping vom n8n-Payload auf die angebote-Spalten.
 * Liste muss synchron mit dem Detail-Page-State (angebote/[id]/page.tsx)
 * gehalten werden — fehlende Mappings hier = fehlende Felder beim User.
 *
 * Defensiv: Felder können null sein. Spalten die in der Prod-DB eventuell
 * fehlen (Schema-Drift) werden beim Retry-Loop weiter unten gestrippt.
 */
function buildAngebotData(payload: any, opts: { includeIdentity: boolean }) {
  const { kunde = {}, angebot = {}, meta = {} } = payload
  const zoho = meta?.zoho || {}
  const objekt = kunde?.objektAdresse || {}
  const gasse = objekt.gasse || ''

  const data: Record<string, unknown> = {
    // Rechnungsempfänger (= Hausverwaltung falls rechnungAnHI, sonst Direktkunde)
    // Fallback-Kette wenn kunde.name leer (HV-Objekte ohne Namen) — siehe resolveKundeName.
    kunde_name: resolveKundeName(payload),
    kunde_strasse: kunde.strasse || null,
    kunde_plz: kunde.plz || null,
    kunde_ort: kunde.ort || null,
    kunde_uid: kunde.uidnummer || kunde.ustId || null,
    kunde_email: kunde.email || null,

    // Angebots-spezifische Kontakt-Mails (fallen zurück auf kunde.email)
    email_angebot: kunde.emailAngebot || kunde.email || null,
    email_rechnung: kunde.emailRechnung || null,

    // Ansprechpartner (Ticket_erstellt_von in Zoho)
    ansprechpartner: kunde.ansprechpartner || null,

    // Objekt/Baustelle
    objekt_adresse: objekt.strasse || gasse || angebot.objektBeschreibung || null,
    objekt_bezeichnung: gasse || angebot.objektBeschreibung || null,
    objekt_plz: objekt.plz || null,
    objekt_ort: objekt.ort || null,

    // HI-Block
    hausinhabung: zoho.hausinhabung || null,
    hausverwaltung_name: zoho.hausverwaltungName || null,
    rechnung_an_hi: Boolean(kunde.rechnungAnHI),
    uid_von_hi: kunde.uidVonHI || null,

    // Angebots-Meta
    angebotsdatum: angebot.datum || new Date().toISOString().split('T')[0],
    gueltig_bis: angebot.gueltigBis || null,
    geschaeftsfallnummer: angebot.geschaeftsfallnummer || zoho.geschaeftsfallnummer || null,
    erstellt_von: angebot.erstelltDurch || zoho.ownerName || null,
    notizen: angebot.bemerkung || null,
    skizzen_link: angebot.skizzenLink || null,

    // Ticket-Refs
    ticket_nummer: payload.ticketNumber || null,
    zoho_ticket_id: payload.ticketId || null,
  }

  // status + angebotsnummer nur bei INSERT setzen, nicht bei UPDATE
  // (status kann der User im UI verändern, wir wollen nicht bei Zoho-Update
  // wieder auf 'entwurf' zurückfallen).
  if (opts.includeIdentity) {
    data.status = 'entwurf'
    // reverse_charge NUR beim INSERT setzen — sonst würde ein Zoho-Update den
    // im UI manuell gesetzten Wert zurücksetzen (analog zu status).
    data.reverse_charge = Boolean(angebot.reverseCharge ?? kunde.reverseCharge)
  }

  return data
}

/**
 * Schema-Drift-Fallback: wenn eine Spalte in der Prod-DB fehlt, PostgREST
 * antwortet mit "Could not find the 'X' column". Wir strippen die Spalte
 * und retrien bis zu 5x. Damit läuft der Webhook auch wenn nicht alle
 * Migrations durch sind.
 */
async function upsertAngebotSafe(
  idOrNull: string | null,
  data: Record<string, unknown>,
  ctx?: { ticketId?: string | null; angebotsnummer?: string | null }
): Promise<{ data: any; error: any }> {
  let payload = { ...data }
  for (let i = 0; i < 6; i++) {
    const resp = idOrNull
      ? await supabase.from('angebote').update(payload).eq('id', idOrNull).select().single()
      : await supabase.from('angebote').insert(payload).select().single()
    if (!resp.error) return resp
    const missing = /Could not find the '([^']+)' column/i.exec(resp.error.message || '')?.[1]
    if (!missing || !(missing in payload)) return resp
    console.warn(`[webhooks/offer] schema-drift: '${missing}' fehlt, retry ohne.`)
    logEvent('warning', 'webhook-offer-schema-drift',
      `Schema-Drift: Spalte '${missing}' fehlt in angebote — Daten werden gestripped`,
      {
        missingColumn: missing,
        ticketId: ctx?.ticketId ?? null,
        angebotsnummer: ctx?.angebotsnummer ?? null,
      }
    ).catch(() => {})
    delete payload[missing]
  }
  return { data: null, error: { message: 'zu viele Schema-Drift-Retries' } }
}

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()

  // n8n schickt manchmal doppelt-encoded JSON — defensiv parsen
  let body: any
  try {
    const raw = await req.text()
    body = JSON.parse(raw)
    if (typeof body === 'string') {
      const innerLen = body.length
      body = JSON.parse(body)
      logEvent('warning', 'webhook-double-encoded',
        `Webhook offer doppelt-encoded JSON empfangen — n8n Flow prüfen`,
        { type: 'offer', bodyLength: innerLen }
      ).catch(() => {})
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ticketId = body.ticketId
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId missing', bodyKeys: Object.keys(body || {}) }, { status: 400 })
  }
  const kundeName = resolveKundeName(body)
  if (!kundeName) {
    return NextResponse.json(
      { error: 'kunde.name fehlt und kein Fallback (Hausverwaltung/Account/Gasse) verfügbar' },
      { status: 400 }
    )
  }
  if (isKundeNameFallback(body)) {
    logEvent('warning', 'webhook-kunde-name-fallback',
      `kunde.name leer — Fallback '${kundeName}' verwendet (Zoho-Datenqualität prüfen)`,
      { type: 'offer', ticketId, fallbackName: kundeName }
    ).catch(() => {})
  }

  try {
    // Vermittler-ID via Name-Match auflösen (falls vorhanden)
    const vermittlerId = await resolveVermittlerId(body.meta?.zoho?.vermittler?.name, { ticketId })

    // Prüfen ob Angebot bereits existiert.
    // limit(1) verhindert, dass maybeSingle() bei bereits vorhandenen
    // Duplikaten wirft: dann wäre `existing` undefined, der Code liefe in den
    // INSERT-Zweig und legte bei JEDEM weiteren Zoho-Update ein zusätzliches
    // Angebot zum selben Ticket an. Gleiches Muster wie in webhooks/invoice.
    const { data: existing } = await supabase
      .from('angebote')
      .select('id, angebotsnummer')
      .eq('zoho_ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let angebotId: string
    let angebotsnummer: string
    let action: 'created' | 'updated'

    if (existing) {
      // UPDATE: bestehendes Angebot aktualisieren, status NICHT zurücksetzen,
      // Nummer NICHT überschreiben (User könnte die manuell geändert haben).
      // Updates sind idempotent — nach dem 2./3. mal Schicken wird einfach
      // das gespeicherte Angebot nochmal aktualisiert.
      angebotId = existing.id
      angebotsnummer = existing.angebotsnummer
      action = 'updated'

      const updateData = buildAngebotData(body, { includeIdentity: false })
      if (vermittlerId) updateData.vermittler_id = vermittlerId

      const { error } = await upsertAngebotSafe(angebotId, updateData, { ticketId, angebotsnummer })
      if (error) {
        console.error('[webhooks/offer] update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      // INSERT: neues Angebot anlegen mit frischer Nummer
      angebotsnummer = await generateAngebotsnummer()
      action = 'created'

      const insertData = buildAngebotData(body, { includeIdentity: true })
      insertData.angebotsnummer = angebotsnummer
      if (vermittlerId) insertData.vermittler_id = vermittlerId

      const { data: newAngebot, error } = await upsertAngebotSafe(null, insertData, { ticketId, angebotsnummer })
      if (error || !newAngebot) {
        console.error('[webhooks/offer] insert error:', error)
        return NextResponse.json({ error: error?.message || 'Insert fehlgeschlagen' }, { status: 500 })
      }
      angebotId = newAngebot.id
    }

    // Positionen: bei INSERT neu anlegen. Bei UPDATE NICHT überschreiben —
    // der User hat die eventuell schon im UI angepasst, wir wollen seine
    // Arbeit nicht kaputt machen. Zoho kann Positionen nur einmal beim
    // Anlegen mitgeben.
    if (action === 'created') {
      const posArray = Array.isArray(body.positionen) ? body.positionen : []
      if (posArray.length === 0) {
        logEvent('warning', 'webhook-positionen-leer',
          `Webhook offer ohne Positionen — Dokument mit 0 Zeilen angelegt`,
          { type: 'offer', docNummer: angebotsnummer, ticketId }
        ).catch(() => {})
      }
      if (posArray.length > 0) {
        const posData = posArray.map((p: any, i: number) => ({
          angebot_id: angebotId,
          position: p.pos || i + 1,
          beschreibung: p.produktName
            ? (p.beschreibung ? `${p.produktName}\n${p.beschreibung}` : p.produktName)
            : (p.beschreibung || ''),
          menge: num(p.menge, 1),
          einheit: p.einheit || 'Stk',
          einzelpreis: num(p.einzelpreisNetto, 0),
          rabatt_prozent: num(p.rabattProzent, 0),
          // 0%-USt bleibt 0 statt still auf 20% zu springen
          mwst_satz: num(p.ustSatz, STANDARD_MWST),
          // gesamtpreis MIT Rabatt (Zeilensumme == Angebots-Netto, Audit D3)
          gesamtpreis: lineNetto({ menge: p.menge, einzelpreis: p.einzelpreisNetto, rabattProzent: p.rabattProzent }),
        }))
        const { error: posError } = await supabase.from('angebot_positionen').insert(posData)
        if (posError) console.error('[webhooks/offer] positionen insert error:', posError)
      }
    }

    // Totals neu berechnen und ins Angebot schreiben (damit list-views stimmen)
    if (action === 'created') {
      const posArray = Array.isArray(body.positionen) ? body.positionen : []
      const reverseCharge = Boolean(body.angebot?.reverseCharge ?? body.kunde?.reverseCharge)
      const { netto: netto_gesamt, mwst: mwst_gesamt, brutto: brutto_gesamt } = computeTotals(
        posArray.map((p: any) => ({
          menge: p.menge,
          einzelpreis: p.einzelpreisNetto,
          rabattProzent: p.rabattProzent,
          mwstSatz: p.ustSatz,
        })),
        { reverseCharge }
      )
      await supabase.from('angebote').update({
        netto_gesamt,
        mwst_gesamt,
        brutto_gesamt,
      }).eq('id', angebotId)
    }

    // Callback an n8n (optional)
    const editUrl = `${APP_URL}/angebote/${angebotId}`
    if (body.meta?.callbackUrl) {
      try {
        await fetch(body.meta.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ angebotId, angebotNummer: angebotsnummer, editUrl, ticketId, action }),
        })
      } catch (e) {
        console.error('[webhooks/offer] callback failed:', e)
      }
    }

    return NextResponse.json({ success: true, angebotId, angebotNummer: angebotsnummer, editUrl, action })
  } catch (error) {
    console.error('[webhooks/offer] fatal:', error)
    const err = error as Error
    await logEvent('critical', 'webhook-offer',
      `CRITICAL: Webhook /offer fatal — Zoho kann keine Angebote anlegen. Error: ${err.message}`,
      { ticketId, error: err.message, stack: err.stack?.substring(0, 500) }
    )
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
