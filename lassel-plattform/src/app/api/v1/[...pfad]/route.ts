import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  pruefeToken, fehlerAntwort, ApiError, apiDb, apiDbSchreiben, nutztServiceRole,
  ganzzahl, nurFelder, ohneGeloeschte, DEFAULT_LIMIT, MAX_LIMIT,
} from '@/lib/api-core'
import { listeBelege, belegDetail, TABELLE, type BelegTyp } from '@/lib/api-belege'
import { entwurfSchema, entwurfSummen } from '@/lib/entwuerfe'

/**
 * Lese-API der Angebotssuite, Version 1.
 *
 * Ein einziger Catch-all-Handler statt 12 Dateien: die Endpunkte
 * unterscheiden sich fast nur im Tabellennamen, und die gemeinsame
 * Auth-/Fehler-/Limit-Behandlung steht damit garantiert überall gleich.
 *
 * AUTHENTIFIZIERUNG: Bearer-Token aus API_TOKEN_READ bzw. API_TOKEN_WRITE.
 * Ohne konfiguriertes Token antwortet die API mit 503 — sie steht nie offen.
 *
 * BEWUSST NUR LESEND. Schreibzugriff fehlt aus vier Gründen, die im Code
 * belegt sind und vor einer Erweiterung gelöst sein müssen:
 *   1. Autosave in angebote/[id]/page.tsx (handleAutoSave) und
 *      rechnungen/[id]/page.tsx überschreibt eine Sekunde nach jeder
 *      UI-Änderung den kompletten Datensatz samt aller Positionen
 *      (delete-then-insert). Ein API-Write wäre spurlos weg, sobald jemand
 *      den Beleg offen hat.
 *   2. Belegnummern werden an zehn Stellen über COUNT+1 vergeben, nicht
 *      atomar. Ein zusätzlicher paralleler Schreiber erhöht die Kollisionen.
 *   3. Schema-Drift: der Ist-Stand der Prod-Tabellen ist aus dem Repo nicht
 *      rekonstruierbar (siehe api-core.ts).
 *   4. Teilfaktura: eine Summen-Neuberechnung über alle Positionen sprengt
 *      bei Abschlagsrechnungen den Betrag (bekannter offener Punkt).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BELEG_TYPEN: Record<string, BelegTyp> = {
  angebote: 'angebot',
  rechnungen: 'rechnung',
  lieferscheine: 'lieferschein',
}

const PRODUKT_FELDER = [
  'id', 'name', 'beschreibung', 'einheit', 'einzelpreis', 'mwst_satz',
  'kategorie', 'artikelnummer', 'aktiv',
] as const

export async function GET(req: NextRequest, ctx: { params: Promise<{ pfad: string[] }> }) {
  try {
    pruefeToken(req, 'read')
    const { pfad } = await ctx.params
    const q = req.nextUrl.searchParams

    const limit = ganzzahl(q.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
    const offset = ganzzahl(q.get('offset'), 0, 0, 100_000)

    // ---------------------------------------------------------- /v1/health
    if (pfad[0] === 'health' && pfad.length === 1) {
      const db = apiDb()
      const { error } = await db.from('produkte').select('id').limit(1)
      return NextResponse.json({
        ok: !error,
        datenbank: error ? `Fehler: ${error.message}` : 'erreichbar',
        zugriff: nutztServiceRole() ? 'service-role' : 'anon-key',
        schreibzugriff: 'nicht verfügbar (API ist lesend)',
        version: 'v1',
      })
    }

    // ------------------------------------- /v1/{angebote|rechnungen|...}[/id]
    const typ = BELEG_TYPEN[pfad[0]]
    if (typ) {
      if (pfad.length === 1) {
        return NextResponse.json(await listeBelege(typ, {
          limit,
          offset,
          status: q.get('status') || undefined,
          suche: q.get('suche') || undefined,
          vonDatum: q.get('von') || undefined,
          bisDatum: q.get('bis') || undefined,
        }))
      }
      if (pfad.length === 2) {
        return NextResponse.json(await belegDetail(typ, pfad[1]))
      }
      // /v1/{typ}/{id}/pdf-url
      if (pfad.length === 3 && pfad[2] === 'pdf-url') {
        const beleg = await belegDetail(typ, pfad[1])
        const id = beleg.id as string
        return NextResponse.json({
          url: `${req.nextUrl.origin}/api/pdf/${typ}/${id}`,
          hinweis: 'Diese URL ist ohne Anmeldung abrufbar. Nicht an Dritte weitergeben.',
        })
      }
    }

    // -------------------------------------------------------- /v1/produkte
    if (pfad[0] === 'produkte' && pfad.length === 1) {
      const db = apiDb()
      let query = db.from('produkte').select('*').order('name')
      const suche = q.get('suche')
      if (suche) {
        const s = suche.replace(/[%,()]/g, ' ').trim()
        if (s) query = query.or(`name.ilike.%${s}%,beschreibung.ilike.%${s}%`)
      }
      const { data, error } = await query.range(offset, offset + limit - 1)
      if (error) throw new ApiError(502, 'db-fehler', error.message)
      return NextResponse.json({
        anzahl: (data || []).length,
        produkte: (data || []).map((p) => nurFelder(p as Record<string, unknown>, PRODUKT_FELDER)),
      })
    }

    // ------------------------------------------------------ /v1/stammdaten
    if (pfad[0] === 'stammdaten' && pfad.length === 1) {
      return NextResponse.json(await stammdaten(q.get('art') || ''))
    }

    // ------------------------------------------------------- /v1/entwuerfe
    if (pfad[0] === 'entwuerfe' && pfad.length === 1) {
      const db = apiDbSchreiben()
      const zustand = q.get('zustand') || 'offen'
      let query = db.from('beleg_entwuerfe').select('*').order('erstellt_am', { ascending: false })
      if (zustand !== 'alle') query = query.eq('zustand', zustand)
      const { data, error } = await query.range(offset, offset + limit - 1)
      if (error) throw new ApiError(502, 'db-fehler', entwurfsraumFehler(error.message))
      return NextResponse.json({
        anzahl: (data || []).length,
        entwuerfe: (data || []).map(entwurfAusgabe),
      })
    }
    if (pfad[0] === 'entwuerfe' && pfad.length === 2) {
      const db = apiDbSchreiben()
      const { data, error } = await db.from('beleg_entwuerfe').select('*').eq('id', pfad[1]).maybeSingle()
      if (error) throw new ApiError(502, 'db-fehler', entwurfsraumFehler(error.message))
      if (!data) throw new ApiError(404, 'nicht-gefunden', 'Entwurf nicht gefunden.')
      return NextResponse.json(entwurfAusgabe(data))
    }

    // ------------------------------------------------------ /v1/kennzahlen
    if (pfad[0] === 'kennzahlen' && pfad.length === 1) {
      return NextResponse.json(await kennzahlen(q.get('jahr')))
    }

    // ----------------------------------------------------------- /v1/suche
    if (pfad[0] === 'suche' && pfad.length === 1) {
      const begriff = (q.get('q') || '').trim()
      if (!begriff) throw new ApiError(400, 'parameter-fehlt', 'Parameter "q" fehlt.')
      const treffer = await Promise.all(
        (Object.values(BELEG_TYPEN) as BelegTyp[]).map(async (t) => ({
          typ: t,
          ...(await listeBelege(t, { limit: Math.min(limit, 10), offset: 0, suche: begriff })),
        }))
      )
      return NextResponse.json({ begriff, ergebnisse: treffer })
    }

    throw new ApiError(404, 'unbekannter-endpunkt', `Endpunkt /api/v1/${pfad.join('/')} existiert nicht.`)
  } catch (err) {
    return fehlerAntwort(err)
  }
}

/**
 * Entwurf anlegen — der EINZIGE schreibende Endpunkt der v1-API.
 *
 * Bewusst kein Übernehmen/Verwerfen hier: das ist der Moment, in dem aus
 * einem Vorschlag ein Beleg wird, und gehört einem Menschen. Diese Aktionen
 * liegen unter /api/entwuerfe/{id} und sind nur aus der App heraus
 * erreichbar — ein Agent, der über MCP nur die freigegebenen Tools kennt,
 * kann sie nicht auslösen.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ pfad: string[] }> }) {
  try {
    const { pfad } = await ctx.params

    if (pfad[0] === 'entwuerfe' && pfad.length === 1) {
      pruefeToken(req, 'write')
      const db = apiDbSchreiben()
      const body = await req.json().catch(() => null)
      const geprueft = entwurfSchema.safeParse(body)
      if (!geprueft.success) {
        throw new ApiError(422, 'validierung-fehlgeschlagen', validierungsText(geprueft.error))
      }
      const daten = geprueft.data
      const summen = entwurfSummen(daten)

      const { data, error } = await db.from('beleg_entwuerfe').insert({
        beleg_typ: daten.belegTyp,
        zustand: 'offen',
        herkunft: daten.herkunft || null,
        notiz: daten.notiz || null,
        daten,
      }).select().single()
      if (error) throw new ApiError(502, 'db-fehler', entwurfsraumFehler(error.message))

      return NextResponse.json({
        ok: true,
        entwurfId: data.id,
        zustand: 'offen',
        summen,
        hinweis:
          'Der Entwurf ist noch KEIN Angebot. Er erscheint unter /entwuerfe in der '
          + 'Angebotssuite und wird erst durch ausdrückliche Übernahme zu einem Beleg mit Nummer.',
      }, { status: 201 })
    }

    throw new ApiError(404, 'unbekannter-endpunkt', `POST /api/v1/${pfad.join('/')} existiert nicht.`)
  } catch (err) {
    return fehlerAntwort(err)
  }
}

/** Zod-Fehler in eine Meldung, mit der ein Agent etwas anfangen kann. */
function validierungsText(fehler: z.ZodError): string {
  return fehler.issues
    .slice(0, 10)
    .map((i) => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`)
    .join('; ')
}

/** Fehlt die Migration, ist die Meldung von PostgREST wenig hilfreich. */
function entwurfsraumFehler(meldung: string): string {
  if (/beleg_entwuerfe/i.test(meldung) && /does not exist|schema cache|not find/i.test(meldung)) {
    return 'Der Entwurfsraum ist noch nicht eingerichtet. Bitte Migration 024_beleg_entwuerfe.sql in Supabase ausführen.'
  }
  return meldung
}

function entwurfAusgabe(row: Record<string, unknown>) {
  return nurFelder(row, [
    'id', 'erstellt_am', 'beleg_typ', 'zustand', 'herkunft', 'notiz', 'daten',
    'entschieden_am', 'entschieden_von', 'erzeugte_beleg_id', 'erzeugte_nummer', 'fehler',
  ])
}

/**
 * Stammdaten. `mitarbeiter` bewusst nur mit id/name/aktiv: die Tabelle wird
 * mit dem Tourenplaner geteilt, Kontaktdaten Dritter gehören nicht in ein
 * Kontextfenster — und geschrieben wird dort grundsätzlich nicht.
 */
async function stammdaten(art: string) {
  const db = apiDb()
  const quellen: Record<string, { tabelle: string; felder: readonly string[]; sortierung: string }> = {
    vermittler: { tabelle: 'vermittler', felder: ['id', 'name', 'provision_prozent', 'aktiv'], sortierung: 'name' },
    mitarbeiter: { tabelle: 'mitarbeiter', felder: ['id', 'name', 'aktiv'], sortierung: 'name' },
    hausverwaltungen: { tabelle: 'hausverwaltungen', felder: ['id', 'name', 'strasse', 'plz', 'ort'], sortierung: 'name' },
    textvorlagen: { tabelle: 'textvorlagen', felder: ['id', 'name', 'inhalt', 'text', 'kategorie'], sortierung: 'name' },
  }

  const quelle = quellen[art]
  if (!quelle) {
    throw new ApiError(400, 'parameter-ungueltig',
      `Parameter "art" muss einer von: ${Object.keys(quellen).join(', ')} sein.`)
  }

  const { data, error } = await db.from(quelle.tabelle).select('*').order(quelle.sortierung)
  if (error) throw new ApiError(502, 'db-fehler', error.message)

  const rows = ohneGeloeschte((data || []) as Record<string, unknown>[])
  return { art, anzahl: rows.length, eintraege: rows.map((r) => nurFelder(r, quelle.felder)) }
}

/**
 * Aggregate — serverseitig gerechnet, damit kein Agent tausende Zeilen durch
 * sein Kontextfenster zieht, um eine Summe zu bilden.
 *
 * Stornorechnungen und stornierte Belege werden ausgeschlossen, sonst wäre
 * der Umsatz systematisch zu hoch.
 */
async function kennzahlen(jahrParam: string | null) {
  const db = apiDb()
  const jahr = Number(jahrParam) || new Date().getFullYear()
  const von = `${jahr}-01-01`
  const bis = `${jahr}-12-31`

  const [angebote, rechnungen] = await Promise.all([
    db.from(TABELLE.angebot.haupt).select('*').gte('angebotsdatum', von).lte('angebotsdatum', bis),
    db.from(TABELLE.rechnung.haupt).select('*').gte('rechnungsdatum', von).lte('rechnungsdatum', bis),
  ])
  if (angebote.error) throw new ApiError(502, 'db-fehler', angebote.error.message)
  if (rechnungen.error) throw new ApiError(502, 'db-fehler', rechnungen.error.message)

  const a = ohneGeloeschte((angebote.data || []) as Record<string, unknown>[])
  const r = ohneGeloeschte((rechnungen.data || []) as Record<string, unknown>[])
    .filter((x) => x.rechnungstyp !== 'storno' && x.status !== 'storniert')

  const summe = (rows: Record<string, unknown>[], feld: string) =>
    Math.round(rows.reduce((s, x) => s + (Number(x[feld]) || 0), 0) * 100) / 100

  const nachStatus = (rows: Record<string, unknown>[]) => {
    const m: Record<string, number> = {}
    for (const x of rows) {
      const s = typeof x.status === 'string' ? x.status : 'unbekannt'
      m[s] = (m[s] || 0) + 1
    }
    return m
  }

  // "Offen" heißt: nicht als bezahlt markiert. Beide Signale prüfen — in den
  // Daten gibt es Rechnungen mit status='bezahlt' ohne gesetztes bezahlt_am.
  const heute = new Date().toISOString().slice(0, 10)
  const offen = r.filter((x) => !x.bezahlt_am && x.status !== 'bezahlt')
  const ueberfaellig = offen.filter((x) => typeof x.faellig_bis === 'string' && x.faellig_bis < heute)

  return {
    jahr,
    angebote: {
      anzahl: a.length,
      nettoSumme: summe(a, 'netto_gesamt'),
      bruttoSumme: summe(a, 'brutto_gesamt'),
      nachStatus: nachStatus(a),
    },
    rechnungen: {
      anzahl: r.length,
      nettoSumme: summe(r, 'netto_gesamt'),
      bruttoSumme: summe(r, 'brutto_gesamt'),
      nachStatus: nachStatus(r),
      offen: { anzahl: offen.length, bruttoSumme: summe(offen, 'brutto_gesamt') },
      ueberfaellig: { anzahl: ueberfaellig.length, bruttoSumme: summe(ueberfaellig, 'brutto_gesamt') },
    },
    hinweise: [
      'Stornorechnungen und stornierte Belege sind ausgeschlossen.',
      'Belege im Papierkorb sind ausgeschlossen.',
      'Bei Reverse-Charge-Belegen entspricht brutto dem netto.',
      '"offen" zählt Rechnungen ohne Bezahlt-Kennzeichen — auch solche im Status "entwurf".',
    ],
  }
}
