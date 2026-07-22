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

async function generateRechnungsnummer(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `RE-${year}-`
  const { data } = await supabase
    .from('rechnungen')
    .select('rechnungsnummer')
    .like('rechnungsnummer', `${prefix}%`)
    .order('rechnungsnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data?.rechnungsnummer) {
    const lastNum = parseInt(data.rechnungsnummer.replace(prefix, ''), 10)
    return `${prefix}${String(lastNum + 1).padStart(5, '0')}`
  }
  return `${prefix}00001`
}

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()

  let body: any
  try {
    const raw = await req.text()
    try {
      body = JSON.parse(raw)
      if (typeof body === 'string') {
        const innerLen = body.length
        body = JSON.parse(body)
        logEvent('warning', 'webhook-double-encoded',
          `Webhook sammelrechnung doppelt-encoded JSON empfangen — n8n Flow prüfen`,
          { type: 'sammelrechnung', bodyLength: innerLen }
        ).catch(() => {})
      }
    } catch { body = JSON.parse(raw) }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ticketId = body.ticketId
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId missing' }, { status: 400 })
  }

  try {
    const { ticketNumber, kunde, rechnung, positionen, meta } = body

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
        { type: 'sammelrechnung', ticketId, fallbackName: kundeName }
      ).catch(() => {})
    }

    // Skip if already exists.
    // limit(1): ohne das wirft maybeSingle() bei bereits vorhandenen
    // Duplikaten, `existing` wäre undefined und der Code legte eine weitere
    // Sammelrechnung zum selben Ticket an — bei jedem Aufruf eine mehr.
    const { data: existing } = await supabase
      .from('rechnungen')
      .select('id, rechnungsnummer')
      .eq('zoho_ticket_id', ticketId)
      .eq('rechnungstyp', 'sammelrechnung')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      logEvent('warning', 'sammelrechnung-exists',
        `Sammelrechnung für Ticket ${ticketId} existiert bereits — kein Update`,
        { ticketId, existingId: existing?.id }
      ).catch(() => {})
      return NextResponse.json({
        success: true,
        rechnungId: existing.id,
        rechnungNummer: existing.rechnungsnummer,
        editUrl: `${APP_URL}/rechnungen/${existing.id}`,
        action: 'already_exists',
      })
    }

    const posArray = Array.isArray(positionen) ? positionen : []
    const reverseCharge =
      body.reverseCharge === true || rechnung?.reverseCharge === true || kunde?.reverseCharge === true
    const { netto: netto_gesamt, mwst: mwst_gesamt, brutto: brutto_gesamt } = computeTotals(
      posArray.map((p: any) => ({
        menge: p.menge,
        einzelpreis: p.einzelpreisNetto,
        rabattProzent: p.rabattProzent,
        mwstSatz: p.ustSatz,
      })),
      { reverseCharge }
    )

    const rechnungsnummer = await generateRechnungsnummer()
    const { data: newRechnung, error } = await supabase
      .from('rechnungen')
      .insert({
        rechnungsnummer,
        rechnungstyp: 'sammelrechnung',
        reverse_charge: reverseCharge,
        status: 'entwurf',
        kunde_name: kundeName,
        kunde_strasse: kunde?.strasse || null,
        kunde_plz: kunde?.plz || null,
        kunde_ort: kunde?.ort || null,
        objekt_adresse: rechnung?.objektBeschreibung || null,
        objekt_plz: kunde?.objektAdresse?.plz || null,
        objekt_ort: kunde?.objektAdresse?.ort || null,
        ticket_nummer: ticketNumber || null,
        zoho_ticket_id: ticketId || null,
        notizen: rechnung?.bemerkung || null,
        erstellt_von: rechnung?.erstelltDurch || null,
        hausinhabung: meta?.zoho?.hausinhabung || null,
        rechnungsdatum: rechnung?.datum || new Date().toISOString().split('T')[0],
        faellig_bis: rechnung?.zahlungszielTage
          ? new Date(Date.now() + (parseInt(rechnung.zahlungszielTage) || 30) * 86400000).toISOString().split('T')[0]
          : null,
        netto_gesamt,
        mwst_gesamt,
        brutto_gesamt,
      })
      .select()
      .single()

    if (error || !newRechnung) {
      return NextResponse.json({ error: error?.message || 'Fehler' }, { status: 500 })
    }

    if (posArray.length > 0) {
      await supabase.from('rechnung_positionen').insert(
        posArray.map((p: any) => ({
          rechnung_id: newRechnung.id,
          position: p.pos || 1,
          beschreibung: p.produktName
            ? (p.beschreibung ? `${p.produktName}\n${p.beschreibung}` : p.produktName)
            : (p.beschreibung || ''),
          menge: num(p.menge, 1),
          einheit: p.einheit || 'Stk',
          einzelpreis: num(p.einzelpreisNetto, 0),
          rabatt_prozent: num(p.rabattProzent, 0),
          // 0%-USt bleibt 0 statt still auf 20% zu springen
          mwst_satz: num(p.ustSatz, STANDARD_MWST),
          // gesamtpreis MIT Rabatt (Zeilensumme == Beleg-Netto)
          gesamtpreis: lineNetto({ menge: p.menge, einzelpreis: p.einzelpreisNetto, rabattProzent: p.rabattProzent }),
        }))
      )
    }

    const editUrl = `${APP_URL}/rechnungen/${newRechnung.id}`
    if (meta?.callbackUrl) {
      await fetch(meta.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rechnungId: newRechnung.id, rechnungNummer: rechnungsnummer, editUrl, ticketId }),
      }).catch(console.error)
    }

    return NextResponse.json({ success: true, rechnungId: newRechnung.id, rechnungNummer: rechnungsnummer, editUrl, action: 'created' })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
