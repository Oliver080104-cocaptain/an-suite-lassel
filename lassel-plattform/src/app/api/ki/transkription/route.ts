import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
    if (!audio) return NextResponse.json({ error: 'Keine Audiodatei' }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || apiKey.includes('HIER') || apiKey.length < 20) {
      return NextResponse.json({ text: 'OpenAI API-Key nicht konfiguriert' })
    }

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audio,
      language: 'de',
      response_format: 'text',
    })

    return NextResponse.json({ text: transcription })
  } catch (error) {
    console.error('Transkription error:', error)
    return NextResponse.json({ error: 'Transkription fehlgeschlagen' }, { status: 500 })
  }
}
