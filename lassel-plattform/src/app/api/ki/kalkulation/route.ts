import { NextRequest, NextResponse } from 'next/server'

const PREISLOGIK = `Du bist ein Kalkulationsassistent für Lassel GmbH Höhenarbeiten Wien.
Berechne NUR auf Basis dieser exakten Preislogik:

PREISE:
- Anfahrt: 1€/km × 2 (Hin+Rück)
- Monteur: 85€/h, Helfer: 75€/h (Partie = 2 Personen)
- Höhenaufschlag ab 15m: +15%
- Dachrinne leicht: 4€/m, mittel: 8€/m, schwer: 15€/m
- Straßensperre: 680€ pauschal
- Taubennetz: 20€/m² (>50m²: -5%, >100m²: -10%)
- Taubenspitzen: 25€/lfm (>200lfm: -10%)
- Fassade glatt: 60€/m², verziert: 90€/m²
- Glasreinigung leicht: 6€/m², schwer: 10€/m²
- Seilzugang: +25%
- Parkverbot: 680€
- Entsorgung: 2€/kg

WICHTIG:
- Verwende NUR Positionen die der Benutzer erwähnt hat
- Erfinde KEINE Positionen
- Falls keine Mengen angegeben → schreibe "0" und erkläre was fehlt
- Bezeichnungen auf Deutsch, konkret (z.B. "Taubennetz 50m²")
- Antworte NUR mit JSON, kein Markdown

Format:
{
  "beschreibungstext": "Professioneller Angebotstext...",
  "kalkulation": {
    "positionen": [
      { "bezeichnung": "Taubennetz", "menge": 50, "einheit": "m²", "einzelpreis": 20, "gesamt": 1000 }
    ],
    "gesamtNetto": 1000,
    "aufschluesselung": "Taubennetz 50m² × 20€ = 1.000€"
  },
  "fehlende_angaben": ["Anfahrt km nicht angegeben", "Arbeitsstunden unklar"]
}`

const FALLBACK_KALKULATION = {
  beschreibungstext: 'Durchführung der beschriebenen Höhenarbeiten gemäß Leistungsverzeichnis.',
  kalkulation: {
    positionen: [
      { bezeichnung: 'Arbeitsleistung', menge: 1, einheit: 'Pau.', einzelpreis: 500, gesamt: 500 }
    ],
    gesamtNetto: 500,
    aufschluesselung: 'Schätzwert – bitte OpenAI API Key konfigurieren für genaue Kalkulation.'
  }
}

export async function POST(req: NextRequest) {
  try {
    const { eingabe, objektAdresse } = await req.json()
    if (!eingabe?.trim()) {
      return NextResponse.json({ error: 'Eingabe fehlt' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || apiKey.includes('HIER') || apiKey.length < 20) {
      return NextResponse.json(FALLBACK_KALKULATION)
    }

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PREISLOGIK },
        { role: 'user', content: `Berechne nur was der Benutzer erwähnt hat.\nObjekt: ${objektAdresse || 'unbekannt'}\nBenutzer sagte: "${eingabe}"` }
      ],
      max_tokens: 1200,
    })

    const result = JSON.parse(completion.choices[0].message.content || '{}')
    return NextResponse.json(result)
  } catch (error) {
    console.error('Kalkulation error:', error)
    return NextResponse.json(FALLBACK_KALKULATION)
  }
}
