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

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()

  // Body-Parsing: n8n schickt manchmal doppelt-encoded JSON
  let body: any
  try {
    const raw = await req.text()
    try {
      body = JSON.parse(raw)
      if (typeof body === 'string') {
        body = JSON.parse(body)
      }
    } catch {
      body = JSON.parse(raw)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ticketId = body.ticketId

  console.log('Received ticketId:', ticketId)
  console.log('Body keys:', Object.keys(body || {}))

  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId missing', bodyKeys: Object.keys(body || {}) }, { status: 400 })
  }

  try {
    const { source, ticketNumber, kunde, angebot, positionen, meta } = body

    if (!kunde?.name) {
      return NextResponse.json({ error: 'kunde.name ist erforderlich' }, { status: 400 })
    }

    // Prüfen ob bereits ein Angebot für dieses Ticket existiert
    const { data: existing } = await supabase
      .from('angebote')
      .select('id, angebotsnummer')
      .eq('zoho_ticket_id', ticketId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        angebotId: existing.id,
        angebotNummer: existing.angebotsnummer,
        editUrl: `${APP_URL}/angebote/${existing.id}`,
        action: 'already_exists',
      })
    }

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

    // Neues Angebot anlegen
    const angebotsnummer = await generateAngebotsnummer()
    const { data: newAngebot, error: angebotError } = await supabase
      .from('angebote')
      .insert({
        angebotsnummer,
        status: 'entwurf',
        angebotsdatum: angebot?.datum || new Date().toISOString().split('T')[0],
        gueltig_bis: angebot?.gueltigBis || null,
        kunde_name: kunde.name,
        kunde_strasse: kunde.strasse || null,
        kunde_plz: kunde.plz || null,
        kunde_ort: kunde.ort || null,
        kunde_uid: kunde.uidnummer || null,
        objekt_adresse: angebot?.objektBeschreibung || null,
        objekt_bezeichnung: angebot?.objektBeschreibung || null,
        objekt_plz: kunde?.objektAdresse?.plz || null,
        objekt_ort: kunde?.objektAdresse?.ort || null,
        ticket_nummer: ticketNumber || null,
        zoho_ticket_id: ticketId || null,
        notizen: angebot?.bemerkung || null,
        erstellt_von: angebot?.erstelltDurch || null,
        hausinhabung: meta?.zoho?.hausinhabung || null,
        skizzen_link: angebot?.skizzenLink || null,
        vermittler_name: meta?.zoho?.vermittler?.name || null,
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
      action: 'created',
    })
  } catch (error) {
    console.error('Webhook offer error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
