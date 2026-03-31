import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://an-suite-lassel.vercel.app'

async function generateRechnungsnummer(): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('rechnungen')
    .select('rechnungsnummer')
    .like('rechnungsnummer', `RE-${year}-%`)
  const nextNumber = (data?.length || 0) + 1
  return `RE-${year}-${String(nextNumber).padStart(5, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { ticketId, ticketNumber, kunde, angebot, positionen, meta } = payload

    if (!kunde?.name) {
      return NextResponse.json({ error: 'kunde.name ist erforderlich' }, { status: 400 })
    }

    const rechnungsnummer = await generateRechnungsnummer()
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

    const { data: newRechnung, error } = await supabase
      .from('rechnungen')
      .insert({
        rechnungsnummer,
        rechnungstyp: 'normal',
        status: 'entwurf',
        kunde_name: kunde.name,
        kunde_strasse: kunde.strasse || null,
        kunde_plz: kunde.plz || null,
        kunde_ort: kunde.ort || null,
        objekt_adresse: angebot?.objektBeschreibung || null,
        ticket_nummer: ticketNumber || null,
        zoho_ticket_id: ticketId || null,
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
      try {
        await fetch(meta.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rechnungId: newRechnung.id,
            rechnungNummer: rechnungsnummer,
            editUrl,
            ticketId: ticketId || null,
          }),
        })
      } catch (e) {
        console.error('Callback fehlgeschlagen:', e)
      }
    }

    return NextResponse.json({ success: true, rechnungId: newRechnung.id, rechnungNummer: rechnungsnummer, editUrl })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
