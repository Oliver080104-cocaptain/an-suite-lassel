import { NextRequest, NextResponse } from 'next/server'

const N8N_WEBHOOK = 'https://n8n.srv1367876.hstgr.cloud/webhook/e41b0145-a4cd-4070-bed9-6a043a5cecf8'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const ticketNumber = formData.get('ticketNumber') as string | null

    if (!file) return NextResponse.json({ message: 'Keine Datei' }, { status: 400 })
    if (!ticketNumber) return NextResponse.json({ message: 'Keine Ticketnummer' }, { status: 400 })

    // Convert file to base64 for webhook
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${file.type || 'application/pdf'};base64,${base64}`

    const payload = {
      fileName: file.name,
      fileData: dataUrl,
      fileSize: file.size,
      ticketNumber: ticketNumber.trim(),
      uploadedAt: new Date().toISOString(),
      source: 'rustler_upload',
    }

    const response = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Webhook-Fehler: ${response.status}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 }
    )
  }
}
