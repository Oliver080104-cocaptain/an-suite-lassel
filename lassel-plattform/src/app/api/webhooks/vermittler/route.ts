import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'

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
      if (typeof body === 'string') body = JSON.parse(body)
    } catch { body = JSON.parse(raw) }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name) {
    return NextResponse.json({ error: 'name ist erforderlich' }, { status: 400 })
  }

  try {
    const { data: existing } = await supabase
      .from('vermittler')
      .select('id')
      .eq('name', body.name)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('vermittler').update({
        email: body.email || null,
        telefon: body.telefon || null,
        provisionssatz: parseFloat(body.provisionssatz) || 10,
        status: body.status || 'aktiv',
        notizen: body.notizen || null,
      }).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, action: 'updated', id: existing.id })
    }

    const { data, error } = await supabase.from('vermittler').insert({
      name: body.name,
      email: body.email || null,
      telefon: body.telefon || null,
      provisionssatz: parseFloat(body.provisionssatz) || 10,
      status: body.status || 'aktiv',
      notizen: body.notizen || null,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, action: 'created', id: data.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
