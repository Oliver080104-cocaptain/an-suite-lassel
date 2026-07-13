import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'
import { logEvent } from '@/lib/monitoring'
import { num, STANDARD_MWST } from '@/lib/money'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
          `Webhook product doppelt-encoded JSON empfangen — n8n Flow prüfen`,
          { type: 'product', bodyLength: innerLen }
        ).catch(() => {})
      }
    } catch { body = JSON.parse(raw) }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // n8n "Build Product Payload" node wraps data in a body key
  const d = body.body || body

  const name = d.produktname || d.produktName
  if (!name) {
    return NextResponse.json({ error: 'produktname ist erforderlich' }, { status: 400 })
  }

  try {
    const { data: existing } = await supabase
      .from('produkte')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('produkte').update({
        einzelpreis: num(d.standardpreisNetto, 0),
        // 0%-Steuersatz (steuerfrei) bleibt 0 statt still auf 20% zu springen
        mwst_satz: num(d.steuersatz, STANDARD_MWST),
        einheit: d.einheit || 'Stk',
        kategorie: d.produktKategorie || null,
        aktiv: d.aktiv !== false && d.aktiv !== 'false',
        beschreibung: d.beschreibung || null,
      }).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'updated', id: existing.id })
    }

    const { data, error } = await supabase.from('produkte').insert({
      name,
      einzelpreis: num(d.standardpreisNetto, 0),
      // 0%-Steuersatz (steuerfrei) bleibt 0 statt still auf 20% zu springen
      mwst_satz: num(d.steuersatz, STANDARD_MWST),
      einheit: d.einheit || 'Stk',
      kategorie: d.produktKategorie || null,
      aktiv: d.aktiv !== false && d.aktiv !== 'false',
      beschreibung: d.beschreibung || null,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, action: 'created', id: data.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
