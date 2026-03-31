import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://an-suite-lassel.vercel.app'

async function generateAngebotsnummer(): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('angebote')
    .select('angebotsnummer')
    .like('angebotsnummer', `AN-${year}-%`)
  const nextNumber = (data?.length || 0) + 1
  return `AN-${year}-${String(nextNumber).padStart(5, '0')}`
}

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()
  try {
    const payload = await req.json()

    const { source, ticketId, ticketNumber, kunde, angebot, positionen, meta } = payload

    if (!kunde?.name) {
      return NextResponse.json({ error: 'kunde.name ist erforderlich' }, { status: 400 })
    }

    const angebotsnummer = await generateAngebotsnummer()

    // Totals berechnen
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
      const ust = parseFloat(p.ustSatz) || 20
      return sum + (netto * (ust / 100))
    }, 0)
    const brutto_gesamt = netto_gesamt + mwst_gesamt

    // Angebot anlegen
    const { data: newAngebot, error: angebotError } = await supabase
      .from('angebote')
      .insert({
        angebotsnummer,
        status: 'entwurf',
        kunde_name: kunde.name,
        kunde_strasse: kunde.strasse || null,
        kunde_plz: kunde.plz || null,
        kunde_ort: kunde.ort || null,
        kunde_uid: kunde.uidnummer || null,
        objekt_adresse: angebot?.objektBeschreibung || null,
        ticket_nummer: ticketNumber || null,
        zoho_ticket_id: ticketId || null,
        notizen: angebot?.bemerkung || null,
        netto_gesamt,
        mwst_gesamt,
        brutto_gesamt,
      })
      .select()
      .single()

    if (angebotError || !newAngebot) {
      console.error('Angebot insert error:', angebotError)
      return NextResponse.json({ error: angebotError?.message || 'Fehler beim Anlegen' }, { status: 500 })
    }

    // Positionen anlegen
    if (posArray.length > 0) {
      const posData = posArray.map((p: any) => ({
        angebot_id: newAngebot.id,
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

      const { error: posError } = await supabase.from('angebot_positionen').insert(posData)
      if (posError) {
        console.error('Positionen insert error:', posError)
      }
    }

    // Callback an n8n senden
    const editUrl = `${APP_URL}/angebote/${newAngebot.id}`
    if (meta?.callbackUrl) {
      try {
        await fetch(meta.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            angebotId: newAngebot.id,
            angebotNummer: angebotsnummer,
            editUrl,
            ticketId: ticketId || null,
          }),
        })
      } catch (e) {
        console.error('Callback fehlgeschlagen:', e)
      }
    }

    return NextResponse.json({
      success: true,
      angebotId: newAngebot.id,
      angebotNummer: angebotsnummer,
      editUrl,
    })
  } catch (error) {
    console.error('Webhook offer error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
