import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://an-suite-lassel.vercel.app'

async function generateLieferscheinnummer(): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('lieferscheine')
    .select('lieferscheinnummer')
    .like('lieferscheinnummer', `LI-${year}-%`)
  const nextNumber = (data?.length || 0) + 1
  return `LI-${year}-${String(nextNumber).padStart(5, '0')}`
}

// Payload: { ticketId, ticketNumber, kunde, angebot, positionen, meta }
export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()
  try {
    const payload = await req.json()
    const { ticketId, ticketNumber, kunde, angebot, positionen, meta } = payload

    if (!kunde?.name) {
      return NextResponse.json({ error: 'kunde.name ist erforderlich' }, { status: 400 })
    }

    const lieferscheinnummer = await generateLieferscheinnummer()
    const posArray = Array.isArray(positionen) ? positionen : []

    const { data: newLS, error } = await supabase
      .from('lieferscheine')
      .insert({
        lieferscheinnummer,
        status: 'entwurf',
        kunde_name: kunde.name,
        kunde_strasse: kunde.strasse || null,
        kunde_plz: kunde.plz || null,
        kunde_ort: kunde.ort || null,
        objekt_adresse: angebot?.objektBeschreibung || null,
        ticket_nummer: ticketNumber || null,
        lieferdatum: new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    if (error || !newLS) {
      return NextResponse.json({ error: error?.message || 'Fehler' }, { status: 500 })
    }

    if (posArray.length > 0) {
      await supabase.from('lieferschein_positionen').insert(
        posArray.map((p: any) => ({
          lieferschein_id: newLS.id,
          position: p.pos || 1,
          beschreibung: p.produktName
            ? (p.beschreibung ? `${p.produktName}\n${p.beschreibung}` : p.produktName)
            : (p.beschreibung || ''),
          menge: parseFloat(p.menge) || 0,
          einheit: p.einheit || 'Stk',
        }))
      )
    }

    const editUrl = `${APP_URL}/lieferscheine/${newLS.id}`
    if (meta?.callbackUrl) {
      try {
        await fetch(meta.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lieferscheinId: newLS.id,
            lieferscheinNummer: lieferscheinnummer,
            editUrl,
            ticketId: ticketId || null,
          }),
        })
      } catch (e) {
        console.error('Callback fehlgeschlagen:', e)
      }
    }

    return NextResponse.json({ success: true, lieferscheinId: newLS.id, lieferscheinNummer: lieferscheinnummer, editUrl })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
