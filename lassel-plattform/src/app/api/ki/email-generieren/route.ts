import { NextRequest, NextResponse } from 'next/server'

function euroFormat(n: number) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n)
}

function buildTemplate(body: any): string {
  const { typ, angebotsnummer, kundeName, objektAdresse, bruttoGesamt, zusatzAnweisung, stil } = body

  if (typ === 'parksperre') {
    return `Sehr geehrte Damen und Herren,

hiermit beantragen wir eine Parkraumsperre für folgende Adresse:

${objektAdresse || '[Objektadresse]'}

Die Sperre wird für die Einrichtung einer Baustelle im Rahmen von Höhenarbeiten benötigt.
Wir bitten um rechtzeitige Bearbeitung und Bewilligung.

Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.

Mit freundlichen Grüßen
Höhenarbeiten Lassel GmbH`
  }

  const betrag = (bruttoGesamt !== null && bruttoGesamt !== undefined) ? euroFormat(Number(bruttoGesamt)) : '[Betrag]'
  const zusatz = zusatzAnweisung ? `\n\n[Hinweis: ${zusatzAnweisung}]` : ''

  if (stil === 'ausfuehrlich') {
    return `Sehr geehrte/r ${kundeName || 'Damen und Herren'},

vielen Dank für Ihr Interesse an unseren Leistungen und das damit verbundene Vertrauen.

Wie besprochen darf ich Ihnen anbei unser detailliertes Angebot mit der Nummer ${angebotsnummer} für das Objekt in der ${objektAdresse || '[Objektadresse]'} übermitteln. Sämtliche notwendigen Arbeiten, Materialien sowie die für die fachgerechte und sichere Ausführung erforderlichen Sicherungsmaßnahmen sind darin transparent aufgeführt.

Der Gesamtbetrag beläuft sich auf ${betrag} (inkl. USt.).

Bitte prüfen Sie das Angebot in Ruhe. Selbstverständlich stehe ich Ihnen für Rückfragen, Anpassungswünsche oder einen persönlichen Termin jederzeit gerne zur Verfügung. Wir freuen uns sehr auf eine vertrauensvolle Zusammenarbeit.${zusatz}

Mit freundlichen Grüßen`
  }

  if (stil === 'locker') {
    return `Hallo ${kundeName || 'zusammen'},

vielen Dank für die nette Anfrage! Wie besprochen schicke ich Ihnen anbei unser Angebot ${angebotsnummer} für das Objekt ${objektAdresse || '[Objektadresse]'}.

Der Gesamtbetrag liegt bei ${betrag}.

Schauen Sie es sich gerne in Ruhe an — falls etwas unklar ist oder Sie Anpassungen brauchen, melden Sie sich einfach kurz.${zusatz}

Beste Grüße`
  }

  // stil === 'formell' (Standard)
  return `Sehr geehrte/r ${kundeName || 'Damen und Herren'},

ich hoffe, es geht Ihnen gut.

Anbei übersende ich Ihnen unser Angebot mit der Nummer ${angebotsnummer} für das Objekt in der ${objektAdresse || '[Objektadresse]'}.

Der Gesamtbetrag beläuft sich auf ${betrag}.

Bitte prüfen Sie das Angebot und teilen Sie uns Ihre Rückmeldung mit. Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.

Wir bedanken uns sehr für Ihr Vertrauen und freuen uns auf eine gute Zusammenarbeit.${zusatz}

Mit freundlichen Grüßen`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { typ, angebotsnummer, kundeName, objektAdresse, bruttoGesamt, erstelltVon, zusatzAnweisung, stil } = body

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || apiKey.includes('HIER') || apiKey.length < 20) {
      return NextResponse.json({ text: buildTemplate(body) })
    }

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    let prompt: string
    if (typ === 'parksperre') {
      prompt = `Schreibe einen formellen Antrag auf Parkraumsperre auf Deutsch.
Adresse: ${objektAdresse || ''}
Zweck: Baustelleneinrichtung für Höhenarbeiten (Lassel GmbH)
${zusatzAnweisung ? `Zusätzliche Anweisung: ${zusatzAnweisung}` : ''}

Formell, präzise, auf Deutsch. Nur den Text, keine Anredeformel außen.`
    } else {
      const betrag = (bruttoGesamt !== null && bruttoGesamt !== undefined) ? euroFormat(Number(bruttoGesamt)) : ''

      const stilDirektive: Record<string, string> = {
        formell:
          'Schreibstil: FORMELL und kompakt (per "Sie"). Höflich, neutral, ca. 5–7 Sätze. Standardform für Geschäftskorrespondenz im DACH-Raum.',
        ausfuehrlich:
          'Schreibstil: FORMELL und AUSFÜHRLICHER (per "Sie"). Etwas mehr Kontext zu den angebotenen Leistungen, Sicherheits-/Qualitätsaspekten und Ablauf. 8–12 Sätze. Klingt gewissenhaft und vertrauensvoll.',
        locker:
          'Schreibstil: LOCKERER und persönlicher Ton, dennoch professionell (per "Sie", aber freundlich-direkt — keine Floskeln). 4–6 Sätze. Beginne ggf. mit "Hallo …" statt "Sehr geehrte/r …".',
      }
      const stilHinweis = stilDirektive[stil] || stilDirektive.formell

      prompt = `Schreibe eine E-Mail auf Deutsch für ein Angebot.
Angebotsnummer: ${angebotsnummer}
Kundenname: ${kundeName}
Objekt: ${objektAdresse || ''}
Betrag: ${betrag}
Erstellt von: ${erstelltVon || ''}
${zusatzAnweisung ? `Zusätzliche Anweisung: ${zusatzAnweisung}` : ''}

${stilHinweis}

Erwähne die Angebotsnummer und den Gesamtbetrag.
Bitte um Rückmeldung.
Nur den E-Mail-Text, keine Betreffzeile, keine Signatur.`
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    })

    return NextResponse.json({ text: completion.choices[0].message.content || buildTemplate(body) })
  } catch (error) {
    console.error('Email generation error:', error)
    return NextResponse.json({ text: buildTemplate(await req.json().catch(() => ({}))) })
  }
}
