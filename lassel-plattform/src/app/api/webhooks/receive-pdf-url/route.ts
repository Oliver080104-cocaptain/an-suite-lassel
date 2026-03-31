import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Payload: { documentType: 'angebot'|'rechnung'|'lieferschein', documentId, pdfUrl }
// Stores the PDF URL from an external PDF service back into the document
export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()
  try {
    const payload = await req.json()
    const { documentType, documentId, pdfUrl } = payload

    if (!documentType || !documentId || !pdfUrl) {
      return NextResponse.json({ error: 'documentType, documentId und pdfUrl sind erforderlich' }, { status: 400 })
    }

    const tableMap: Record<string, string> = {
      angebot: 'angebote',
      rechnung: 'rechnungen',
      lieferschein: 'lieferscheine',
    }

    const table = tableMap[documentType]
    if (!table) {
      return NextResponse.json({ error: `Unbekannter documentType: ${documentType}` }, { status: 400 })
    }

    const { error } = await supabase.from(table).update({ pdf_url: pdfUrl }).eq('id', documentId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, documentId, pdfUrl })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
