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

    const angebotFelder = {
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
    }

    // Prüfen ob bereits ein Angebot für dieses Ticket existiert
    const { data: existing } = ticketId
      ? await supabase.from('angebote').select('id, angebotsnummer').eq('zoho_ticket_id', ticketId).maybeSingle()
      : { data: null }

    let targetId: string
    let angebotsnummer: string
    let action: 'created' | 'updated'

    if (existing) {
      // Angebot existiert → UPDATE
      await supabase.from('angebote')
        .update({ ...angebotFelder, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      // Positionen ersetzen: alte löschen, neue einfügen
      await supabase.from('angebot_positionen').delete().eq('angebot_id', existing.id)

      targetId = existing.id
      angebotsnummer = existing.angebotsnummer
      action = 'updated'
    } else {
      // Neues Angebot anlegen
      angebotsnummer = await generateAngebotsnummer()
      const { data: newAngebot, error: angebotError } = await supabase
        .from('angebote')
        .insert({ angebotsnummer, status: 'entwurf', ...angebotFelder })
        .select()
        .single()

      if (angebotError || !newAngebot) {
        console.error('Angebot insert error:', angebotError)
        return NextResponse.json({ error: angebotError?.message || 'Fehler beim Anlegen' }, { status: 500 })
      }

      targetId = newAngebot.id
      action = 'created'
    }

    // Positionen einfügen
    if (posArray.length > 0) {
      const posData = posArray.map((p: any) => ({
        angebot_id: targetId,
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
    const editUrl = `${APP_URL}/angebote/${targetId}`
    if (meta?.callbackUrl) {
      try {
        await fetch(meta.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            angebotId: targetId,
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
      angebotId: targetId,
      angebotNummer: angebotsnummer,
      editUrl,
      action,
    })
  } catch (error) {
    console.error('Webhook offer error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
