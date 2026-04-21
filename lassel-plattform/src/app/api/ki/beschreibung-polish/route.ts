import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Du bist ein Assistent, der gesprochene Notizen eines Höhenarbeiten-Unternehmers (Lassel GmbH, Wien) in professionelle Angebotsbeschreibungen umschreibt.

REGELN:
- Wandle die Sprachnotiz in einen flüssigen, sachlichen Angebotstext um.
- Entferne Füllwörter, Selbstkorrekturen ("äh", "also", "ich meine", "Moment"), Versprecher und Wiederholungen.
- Formuliere in 3. Person / neutraler Fachsprache (keine "ich werde...", stattdessen "Durchführung von...", "Anbringen von...").
- Nutze gängige Branchenbegriffe (Gesimse, Dachinspektion, Abschlag, Montage, Demontage, etc.).
- Behalte alle konkreten Fakten (Mengen, Materialien, Adressen, Arbeitsschritte) bei. Erfinde nichts dazu.
- Kurz und prägnant. Keine Floskeln wie "wir freuen uns".
- Deutsches Österreichisch, aber formell.
- Antworte NUR mit dem umformulierten Text, ohne Einleitung, ohne Anführungszeichen, ohne Markdown.`

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Text fehlt' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || apiKey.includes('HIER') || apiKey.length < 20) {
      return NextResponse.json({ text: text.trim() })
    }

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      max_tokens: 800,
      temperature: 0.3,
    })

    const polished = completion.choices[0].message.content?.trim() || text.trim()
    return NextResponse.json({ text: polished })
  } catch (error) {
    console.error('Beschreibung-Polish error:', error)
    return NextResponse.json({ error: 'Umformulierung fehlgeschlagen' }, { status: 500 })
  }
}
