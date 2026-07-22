import { NextRequest, NextResponse } from 'next/server'
import { apiDbSchreiben, fehlerAntwort, ApiError, nurFelder } from '@/lib/api-core'
import { entwurfUebernehmen } from '@/lib/entwuerfe'

/**
 * Entwurfsraum — Endpunkte für die eigene Oberfläche unter /entwuerfe.
 *
 * Getrennt von /api/v1/entwuerfe, weil die beiden Seiten unterschiedliche
 * Zugänge haben: die v1-API arbeitet mit einem Bearer-Token, das ein Agent
 * trägt. Der Browser darf dieses Token nicht kennen — es läge sonst im
 * ausgelieferten Bundle. Diese Routen sind deshalb tokenfrei und nur aus der
 * App heraus erreichbar.
 *
 * Damit gilt: der Agent kann Entwürfe ANLEGEN (v1, Schreib-Token), aber nicht
 * entscheiden. Der Mensch kann entscheiden (hier), ohne ein Token zu kennen.
 *
 * Wie überall in dieser App gibt es (noch) keine Benutzeranmeldung — die
 * Herkunftsprüfung ist eine Schranke gegen fremde Webseiten, kein
 * Zugriffsschutz. Sie ist so streng wie der Rest der Anwendung, nicht
 * strenger und nicht schwächer.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUSGABE_FELDER = [
  'id', 'erstellt_am', 'beleg_typ', 'zustand', 'herkunft', 'notiz', 'daten',
  'entschieden_am', 'entschieden_von', 'erzeugte_beleg_id', 'erzeugte_nummer', 'fehler',
] as const

function pruefeHerkunft(req: NextRequest) {
  const herkunft = req.headers.get('origin')
  // GET aus dem Browser trägt bei same-origin-fetch keinen Origin-Header —
  // deshalb wird nur ein FREMDER Origin abgelehnt, nicht ein fehlender.
  if (herkunft && herkunft !== req.nextUrl.origin) {
    throw new ApiError(403, 'fremde-herkunft', 'Anfrage von unerlaubter Herkunft.')
  }
}

/** Fehlt die Migration, ist die Meldung von PostgREST wenig hilfreich. */
function lesbarerFehler(meldung: string): string {
  if (/beleg_entwuerfe/i.test(meldung) && /does not exist|schema cache|not find/i.test(meldung)) {
    return 'Der Entwurfsraum ist noch nicht eingerichtet. Bitte Migration 024_beleg_entwuerfe.sql in Supabase ausführen.'
  }
  return meldung
}

export async function GET(req: NextRequest) {
  try {
    pruefeHerkunft(req)
    const db = apiDbSchreiben()
    const zustand = req.nextUrl.searchParams.get('zustand') || 'offen'

    let query = db.from('beleg_entwuerfe').select('*').order('erstellt_am', { ascending: false }).limit(100)
    if (zustand !== 'alle') query = query.eq('zustand', zustand)

    const { data, error } = await query
    if (error) throw new ApiError(502, 'db-fehler', lesbarerFehler(error.message))

    return NextResponse.json({
      anzahl: (data || []).length,
      entwuerfe: (data || []).map((r) => nurFelder(r as Record<string, unknown>, AUSGABE_FELDER)),
    })
  } catch (err) {
    return fehlerAntwort(err)
  }
}

/**
 * Entscheidet über einen Entwurf.
 * Body: { id, aktion: 'uebernehmen' | 'verwerfen', entschiedenVon }
 */
export async function POST(req: NextRequest) {
  try {
    pruefeHerkunft(req)
    const db = apiDbSchreiben()
    const body = (await req.json().catch(() => null)) as
      { id?: string; aktion?: string; entschiedenVon?: string } | null

    const id = (body?.id || '').trim()
    if (!id) throw new ApiError(400, 'id-fehlt', 'id fehlt.')
    const person = (body?.entschiedenVon || '').trim().slice(0, 120) || 'unbekannt'

    if (body?.aktion === 'uebernehmen') {
      const ergebnis = await entwurfUebernehmen(db, id, person)
      return NextResponse.json({
        ok: true,
        angebotId: ergebnis.angebotId,
        angebotsnummer: ergebnis.angebotsnummer,
      })
    }

    if (body?.aktion === 'verwerfen') {
      // Bedingtes Update mit .select(): ohne das liefert supabase-js bei null
      // getroffenen Zeilen error === null, ein Konflikt sähe wie Erfolg aus.
      const { data, error } = await db
        .from('beleg_entwuerfe')
        .update({ zustand: 'verworfen', entschieden_am: new Date().toISOString(), entschieden_von: person })
        .eq('id', id)
        .eq('zustand', 'offen')
        .select()
      if (error) throw new ApiError(502, 'db-fehler', lesbarerFehler(error.message))
      if (!data || data.length === 0) {
        throw new ApiError(409, 'bereits-entschieden', 'Dieser Entwurf wurde bereits entschieden.')
      }
      return NextResponse.json({ ok: true, zustand: 'verworfen' })
    }

    throw new ApiError(400, 'aktion-ungueltig', 'aktion muss "uebernehmen" oder "verwerfen" sein.')
  } catch (err) {
    return fehlerAntwort(err)
  }
}
