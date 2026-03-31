import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Payload: { ticketId, ticketNumber, angebotId?, status? }
// Links a Zoho ticket to an existing Angebot, or just stores ticket data
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { ticketId, ticketNumber, angebotId, status } = payload

    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId ist erforderlich' }, { status: 400 })
    }

    if (angebotId) {
      const { error } = await supabase
        .from('angebote')
        .update({
          zoho_ticket_id: ticketId,
          ticket_nummer: ticketNumber || null,
          ...(status ? { status } : {}),
        })
        .eq('id', angebotId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, angebotId })
    }

    return NextResponse.json({ success: true, ticketId })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
