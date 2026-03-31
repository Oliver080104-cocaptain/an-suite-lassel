import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Payload: { name, email, telefon, provisionssatz, adresse, ort, plz }
export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()
  try {
    const payload = await req.json()
    const { name, email, telefon, provisionssatz, adresse, ort, plz } = payload

    if (!name) {
      return NextResponse.json({ error: 'name ist erforderlich' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('vermittler')
      .insert({
        name,
        email: email || null,
        telefon: telefon || null,
        provisionssatz: parseFloat(provisionssatz) || 10,
        adresse: adresse || null,
        ort: ort || null,
        plz: plz || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, vermittlerId: data.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
