import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'

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
      if (typeof body === 'string') body = JSON.parse(body)
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

    if (!kunde?.name) {
      return NextResponse.json({ error: 'kunde.name ist erforderlich' }, { status: 400 })
    }

    // Skip if already exists
    const { data: existing } = await supabase
      .from('rechnungen')
      .select('id, rechnungsnummer')
      .eq('zoho_ticket_id', ticketId)
      .eq('rechnungstyp', 'sammelrechnung')
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        rechnungId: existing.id,
        rechnungNummer: existing.rechnungsnummer,
        editUrl: `${APP_URL}/rechnungen/${existing.id}`,
        action: 'already_exists',
      })
    }

    const posArray = Array.isArray(positionen) ? positionen : []
    const netto_gesamt = posArray.reduce((sum: number, p: any) => {
      const menge = parseFloat(p.menge) || 0
      const einzelpreis = parseFloat(p.einzelpreisNetto) || 0
      const rabatt = parseFloat(p.rabattProzent) || 0
      return sum + (menge * einzelpreis * (1 - rabatt / 100))
    }, 0)
    const mwst_gesamt = posArray.reduce((sum: number, p: any) => {
      const menge = parseFloat(p.menge) || 0
      const einzelpreis = parseFloat(p.einzelpreisNetto) || 0
      const rabatt = parseFloat(p.rabattProzent) || 0
      const netto = menge * einzelpreis * (1 - rabatt / 100)
      return sum + (netto * ((parseFloat(p.ustSatz) || 20) / 100))
    }, 0)

    const rechnungsnummer = await generateRechnungsnummer()
    const { data: newRechnung, error } = await supabase
      .from('rechnungen')
      .insert({
        rechnungsnummer,
        rechnungstyp: 'sammelrechnung',
        status: 'entwurf',
        kunde_name: kunde.name,
        kunde_strasse: kunde.strasse || null,
        kunde_plz: kunde.plz || null,
        kunde_ort: kunde.ort || null,
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
        brutto_gesamt: netto_gesamt + mwst_gesamt,
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
          menge: parseFloat(p.menge) || 0,
          einheit: p.einheit || 'Stk',
          einzelpreis: parseFloat(p.einzelpreisNetto) || 0,
          rabatt_prozent: parseFloat(p.rabattProzent) || 0,
          mwst_satz: parseFloat(p.ustSatz) || 20,
          gesamtpreis: (parseFloat(p.menge) || 0) * (parseFloat(p.einzelpreisNetto) || 0),
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
