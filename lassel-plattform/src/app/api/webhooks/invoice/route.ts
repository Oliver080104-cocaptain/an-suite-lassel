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
          `Webhook invoice doppelt-encoded JSON empfangen — n8n Flow prüfen`,
          { type: 'invoice', bodyLength: innerLen }
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
        { type: 'invoice', ticketId, fallbackName: kundeName }
      ).catch(() => {})
    }

    // Dedup NUR innerhalb desselben Rechnungstyps — sonst würde eine normale
    // Rechnung eine bereits existierende Sammelrechnung desselben Tickets
    // überschreiben (Audit F1). Legacy-Zeilen ohne rechnungstyp gelten als 'normal'.
    const incomingTyp = body.rechnungstyp || 'normal'
    let existingQuery = supabase
      .from('rechnungen')
      .select('id, rechnungsnummer')
      .eq('zoho_ticket_id', ticketId)
    existingQuery = incomingTyp === 'normal'
      ? existingQuery.or('rechnungstyp.eq.normal,rechnungstyp.is.null')
      : existingQuery.eq('rechnungstyp', incomingTyp)
    // limit(1) verhindert, dass maybeSingle() bei bereits vorhandenen Duplikaten wirft
    const { data: existing } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const posArray = Array.isArray(positionen) ? positionen : []
    if (posArray.length === 0) {
      logEvent('warning', 'webhook-positionen-leer',
        `Webhook invoice ohne Positionen — Dokument mit 0 Zeilen angelegt`,
        { type: 'invoice', docNummer: existing?.rechnungsnummer ?? null, ticketId }
      ).catch(() => {})
    }
    // Reverse-Charge: falls Zoho den Flag mitschickt, wird MwSt=0 / Brutto=Netto
    // gerechnet; fehlt der Flag, verhält es sich exakt wie bisher (kein RC).
    const reverseCharge =
      body.reverseCharge === true || rechnung?.reverseCharge === true || kunde?.reverseCharge === true
    const totalLines = posArray.map((p: any) => ({
      menge: p.menge,
      einzelpreis: p.einzelpreisNetto,
      rabattProzent: p.rabattProzent,
      mwstSatz: p.ustSatz,
    }))
    const { netto: netto_gesamt, mwst: mwst_gesamt, brutto: brutto_gesamt } =
      computeTotals(totalLines, { reverseCharge })

    const buildData = (rechnungsnummer?: string) => ({
      ...(rechnungsnummer ? { rechnungsnummer } : {}),
      rechnungstyp: incomingTyp,
      reverse_charge: reverseCharge,
      kunde_name: kundeName,
      kunde_strasse: kunde?.strasse || null,
      kunde_plz: kunde?.plz || null,
      kunde_ort: kunde?.ort || null,
      objekt_adresse: rechnung?.objektBeschreibung || null,
      objekt_bezeichnung: rechnung?.objektBeschreibung || null,
      objekt_plz: kunde?.objektAdresse?.plz || null,
      objekt_ort: kunde?.objektAdresse?.ort || null,
      ticket_nummer: ticketNumber || null,
      zoho_ticket_id: ticketId || null,
      notizen: rechnung?.bemerkung || null,
      erstellt_von: rechnung?.erstelltDurch || null,
      rechnung_an_hi: kunde?.rechnungAnHI || false,
      hausinhabung: meta?.zoho?.hausinhabung || null,
      hausverwaltung_name: meta?.zoho?.hausverwaltungName || null,
      hausverwaltung_strasse: meta?.zoho?.hausverwaltungStrasse || null,
      hausverwaltung_plz: meta?.zoho?.hausverwaltungPlz || null,
      hausverwaltung_ort: meta?.zoho?.hausverwaltungOrt || null,
      uid_von_hi: kunde?.uidVonHI || null,
      kunde_uid: kunde?.uid || null,
      email_rechnung: kunde?.emailRechnung || null,
      leistungszeitraum_von: rechnung?.leistungszeitraumVon || null,
      leistungszeitraum_bis: rechnung?.leistungszeitraumBis || null,
      zahlungskondition: rechnung?.zahlungskondition || '30 Tage netto',
      // 0 Tage ("sofort fällig") bleibt 0 statt still auf 30 zu springen
      zahlungsziel_tage: num(rechnung?.zahlungszielTage, 30),
      referenz_angebot_nummer: body.referenzAngebotNummer || null,
      geschaeftsfallnummer: body.geschaeftsfallnummer || null,
      rechnungsdatum: rechnung?.datum || new Date().toISOString().split('T')[0],
      faellig_bis: rechnung?.zahlungszielTage != null && rechnung?.zahlungszielTage !== ''
        ? new Date(Date.now() + num(rechnung.zahlungszielTage, 30) * 86400000).toISOString().split('T')[0]
        : null,
      fotos_link: rechnung?.fotosLink || null,
      fotodoku_link: rechnung?.fotodokuOrdnerlink || null,
      workdrive_folder_id: meta?.workdriveFolderId || null,
      callback_url: meta?.callbackUrl || null,
      netto_gesamt,
      mwst_gesamt,
      brutto_gesamt,
    })

    const buildPositionen = (rechnungId: string) => posArray.map((p: any, i: number) => ({
      rechnung_id: rechnungId,
      position: i + 1,
      beschreibung: p.produktName
        ? (p.beschreibung ? `${p.produktName}\n${p.beschreibung}` : p.produktName)
        : (p.beschreibung || ''),
      menge: num(p.menge, 1),
      einheit: p.einheit || 'Stk',
      einzelpreis: num(p.einzelpreisNetto, 0),
      rabatt_prozent: num(p.rabattProzent, 0),
      // 0%-USt (steuerbefreit/Reverse-Charge) bleibt 0 statt still auf 20% zu springen
      mwst_satz: num(p.ustSatz, STANDARD_MWST),
      // gesamtpreis MIT Rabatt, damit Summe der Zeilen == Beleg-Netto (Audit D3)
      gesamtpreis: lineNetto({ menge: p.menge, einzelpreis: p.einzelpreisNetto, rabattProzent: p.rabattProzent }),
    }))

    let rechnungId: string
    let rechnungsnummer: string
    let action: string

    if (existing) {
      // UPDATE existing — overwrite with fresh payload.
      //
      // Vorher liefen Kopf-Update, Positionen-Delete und Positionen-Insert als
      // drei nackte awaits ohne Fehlerprüfung. Scheiterte der Insert nach dem
      // Delete, war die Rechnung ohne eine einzige Zeile — mit den frischen
      // Summen im Kopf, ohne Fehlermeldung und ohne Weg zurück.
      const { error: kopfError } = await supabase.from('rechnungen').update(buildData()).eq('id', existing.id)
      if (kopfError) {
        await logEvent('error', 'webhook-invoice',
          `Rechnungskopf konnte nicht aktualisiert werden für ${existing.rechnungsnummer}`,
          { rechnungsnummer: existing.rechnungsnummer, ticketId, error: kopfError.message })
        return NextResponse.json({ error: kopfError.message }, { status: 500 })
      }

      if (posArray.length > 0) {
        const { error: delError } = await supabase.from('rechnung_positionen').delete().eq('rechnung_id', existing.id)
        if (delError) {
          await logEvent('error', 'webhook-invoice',
            `Alte Rechnungspositionen konnten nicht entfernt werden für ${existing.rechnungsnummer}`,
            { rechnungsnummer: existing.rechnungsnummer, error: delError.message })
          return NextResponse.json({ error: delError.message }, { status: 500 })
        }
        const { error: insError } = await supabase.from('rechnung_positionen').insert(buildPositionen(existing.id))
        if (insError) {
          await logEvent('critical', 'webhook-invoice',
            `Rechnung ${existing.rechnungsnummer} hat jetzt KEINE Positionen — Insert nach Delete fehlgeschlagen`,
            { rechnungsnummer: existing.rechnungsnummer, error: insError.message })
          return NextResponse.json({ error: insError.message }, { status: 500 })
        }
      } else {
        // Leeres Positionen-Array: die Summen wurden oben trotzdem neu
        // gerechnet (computeTotals über [] ergibt 0). Kopf und Positionen
        // würden auseinanderlaufen — deshalb hier gar nicht erst anfassen.
        await logEvent('warning', 'webhook-invoice',
          `Update ohne Positionen für ${existing.rechnungsnummer} — bestehende Zeilen bleiben, Summen wurden auf 0 gesetzt`,
          { rechnungsnummer: existing.rechnungsnummer, ticketId })
      }
      rechnungId = existing.id
      rechnungsnummer = existing.rechnungsnummer
      action = 'updated'
    } else {
      // INSERT new
      rechnungsnummer = await generateRechnungsnummer()
      const { data: newRechnung, error } = await supabase
        .from('rechnungen')
        .insert({ ...buildData(rechnungsnummer), status: 'entwurf' })
        .select()
        .single()
      if (error || !newRechnung) {
        return NextResponse.json({ error: error?.message || 'Fehler' }, { status: 500 })
      }
      if (posArray.length > 0) {
        const { error: insError } = await supabase.from('rechnung_positionen').insert(buildPositionen(newRechnung.id))
        if (insError) {
          // Kopf zurücknehmen: eine Rechnung mit Summen und ohne Zeilen ist
          // schlimmer als gar keine — sie sieht in der Liste vollständig aus.
          await supabase.from('rechnungen').delete().eq('id', newRechnung.id)
          await logEvent('error', 'webhook-invoice',
            `Rechnungspositionen konnten nicht gespeichert werden, Rechnung ${rechnungsnummer} wurde zurückgenommen`,
            { rechnungsnummer, ticketId, error: insError.message })
          return NextResponse.json({ error: insError.message }, { status: 500 })
        }
      }
      rechnungId = newRechnung.id
      action = 'created'
    }

    const editUrl = `${APP_URL}/rechnungen/${rechnungId}`
    if (meta?.callbackUrl) {
      await fetch(meta.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rechnungId, rechnungNummer: rechnungsnummer, editUrl, ticketId }),
      }).catch(console.error)
    }

    return NextResponse.json({ success: true, rechnungId, rechnungNummer: rechnungsnummer, editUrl, action })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
