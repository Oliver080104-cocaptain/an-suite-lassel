import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Payload: { produktName, beschreibung, einzelpreisNetto, ustSatz, einheit, kategorie, aktiv }
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { produktName, beschreibung, einzelpreisNetto, ustSatz, einheit, kategorie, aktiv } = payload

    if (!produktName) {
      return NextResponse.json({ error: 'produktName ist erforderlich' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('produkte')
      .insert({
        name: produktName,
        beschreibung: beschreibung || null,
        einzelpreis: parseFloat(einzelpreisNetto) || 0,
        mwst_satz: parseFloat(ustSatz) || 20,
        einheit: einheit || 'Stk',
        kategorie: kategorie || null,
        aktiv: aktiv !== false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, produktId: data.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
