import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSecret, unauthorizedResponse } from '@/lib/webhook-auth'
import { logEvent } from '@/lib/monitoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Payload: { angebotId?, rechnungId?, lieferscheinId?, pdfUrl, status? }
// Called by n8n after PDF has been generated and stored
export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) return unauthorizedResponse()
  try {
    const payload = await req.json()
    const { angebotId, rechnungId, lieferscheinId, pdfUrl, status } = payload

    if (!pdfUrl) {
      return NextResponse.json({ error: 'pdfUrl ist erforderlich' }, { status: 400 })
    }

    const noMatchWarn = () => {
      logEvent('warning', 'pdf-callback-no-match',
        `PDF-Callback für unbekanntes Dokument — kein Update`,
        {
          angebotId: angebotId || null,
          rechnungId: rechnungId || null,
          lieferscheinId: lieferscheinId || null,
        }
      ).catch(() => {})
    }

    if (angebotId) {
      const { data: updateResult } = await supabase
        .from('angebote')
        .update({ pdf_url: pdfUrl, ...(status ? { status } : {}) })
        .eq('id', angebotId)
        .select()
      if (!updateResult || updateResult.length === 0) noMatchWarn()
    }

    if (rechnungId) {
      const { data: updateResult } = await supabase
        .from('rechnungen')
        .update({ pdf_url: pdfUrl, ...(status ? { status } : {}) })
        .eq('id', rechnungId)
        .select()
      if (!updateResult || updateResult.length === 0) noMatchWarn()
    }

    if (lieferscheinId) {
      const { data: updateResult } = await supabase
        .from('lieferscheine')
        .update({ pdf_url: pdfUrl, ...(status ? { status } : {}) })
        .eq('id', lieferscheinId)
        .select()
      if (!updateResult || updateResult.length === 0) noMatchWarn()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
