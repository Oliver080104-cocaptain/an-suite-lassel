import { NextRequest, NextResponse } from 'next/server'
import { pruefeToken, ApiError, ganzzahl } from '@/lib/api-core'
import { listeBelege, belegDetail, type BelegTyp } from '@/lib/api-belege'

/**
 * MCP-Server der Angebotssuite — Transport "Streamable HTTP", stateless.
 *
 * Damit lässt sich die Software aus Claude heraus abfragen: in claude.ai
 * unter Einstellungen → Connectors → "Custom Connector hinzufügen" die URL
 * https://<domain>/api/mcp eintragen und als Request-Header
 * `Authorization: Bearer <API_TOKEN_READ>` hinterlegen.
 *
 * WARUM HANDGESCHRIEBEN statt mcp-handler/@modelcontextprotocol/sdk:
 *   - mcp-handler pinnt zod ^3, das Projekt hat zod ^4.3.6 → Peer-Konflikt.
 *   - Der StreamableHTTPServerTransport des SDK erwartet Node-req/res im
 *     Express-Stil; der App Router arbeitet mit Web-Request/Response.
 *   - Gebraucht werden genau vier Methoden. Das sind ~150 Zeilen, gegen die
 *     kein SDK-Major-Update brechen kann.
 *
 * Umgesetzt nach Spec 2025-11-25:
 *   - Ein Pfad, POST beantwortet JSON-RPC, GET liefert 405 (erlaubt, wenn der
 *     Server keinen server-initiierten Stream anbietet).
 *   - Keine Session-ID → stateless, passt zu Serverless.
 *   - JSON-RPC-Notifications werden mit 202 ohne Body quittiert.
 *
 * NUR LESEND. Gründe siehe src/app/api/v1/[...pfad]/route.ts — ein Agent, der
 * Belege schreiben könnte, würde am Autosave der Detailseiten scheitern und
 * dabei stillen Datenverlust erzeugen.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const PROTOKOLL_VERSION = '2025-11-25'
const UNTERSTUETZTE_VERSIONEN = ['2025-11-25', '2025-06-18', '2025-03-26']

interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const BELEG_ENUM = ['angebot', 'rechnung', 'lieferschein'] as const

const TOOLS = [
  {
    name: 'belege_suchen',
    title: 'Belege suchen',
    description:
      'Sucht in Angeboten, Rechnungen und Lieferscheinen nach Belegnummer, Kundenname oder Objektadresse. '
      + 'Liefert eine kompakte Trefferliste. Für Details danach beleg_details aufrufen.',
    inputSchema: {
      type: 'object',
      properties: {
        suchbegriff: { type: 'string', description: 'Teil einer Belegnummer, eines Kundennamens oder einer Objektadresse' },
        typ: { type: 'string', enum: [...BELEG_ENUM], description: 'Optional auf eine Belegart einschränken' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['suchbegriff'],
    },
  },
  {
    name: 'belege_auflisten',
    title: 'Belege auflisten',
    description:
      'Listet Belege einer Art, optional gefiltert nach Status und Zeitraum. '
      + 'Für Auswertungen über größere Mengen besser kennzahlen_abrufen verwenden.',
    inputSchema: {
      type: 'object',
      properties: {
        typ: { type: 'string', enum: [...BELEG_ENUM] },
        status: { type: 'string', description: 'z.B. entwurf, versendet, angenommen (Angebot) oder offen, bezahlt (Rechnung)' },
        von: { type: 'string', description: 'Belegdatum ab, Format YYYY-MM-DD' },
        bis: { type: 'string', description: 'Belegdatum bis, Format YYYY-MM-DD' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
      required: ['typ'],
    },
  },
  {
    name: 'beleg_details',
    title: 'Beleg im Detail',
    description:
      'Liefert einen einzelnen Beleg mit allen Positionen, Kundendaten und Summen. '
      + 'Akzeptiert die Belegnummer (z.B. AN-2026-00069) oder die UUID. '
      + 'Beachte das Feld "hinweise" — dort stehen bekannte Besonderheiten wie Reverse Charge oder Teilfaktura.',
    inputSchema: {
      type: 'object',
      properties: {
        typ: { type: 'string', enum: [...BELEG_ENUM] },
        beleg: { type: 'string', description: 'Belegnummer oder UUID' },
      },
      required: ['typ', 'beleg'],
    },
  },
  {
    name: 'kennzahlen_abrufen',
    title: 'Kennzahlen',
    description:
      'Serverseitig aggregierte Jahreszahlen: Anzahl und Summen für Angebote und Rechnungen, '
      + 'Verteilung nach Status, offene und überfällige Rechnungen. '
      + 'Stornos und gelöschte Belege sind ausgeschlossen.',
    inputSchema: {
      type: 'object',
      properties: {
        jahr: { type: 'integer', description: 'Kalenderjahr, Standard ist das laufende Jahr' },
      },
    },
  },
  {
    name: 'produkte_suchen',
    title: 'Produkte suchen',
    description: 'Durchsucht den Produktkatalog nach Name oder Beschreibung und liefert Preise und Einheiten.',
    inputSchema: {
      type: 'object',
      properties: {
        suchbegriff: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: 'stammdaten_abrufen',
    title: 'Stammdaten',
    description: 'Liefert Vermittler, Mitarbeiter (nur Name und Aktiv-Status), Hausverwaltungen oder Textvorlagen.',
    inputSchema: {
      type: 'object',
      properties: {
        art: { type: 'string', enum: ['vermittler', 'mitarbeiter', 'hausverwaltungen', 'textvorlagen'] },
      },
      required: ['art'],
    },
  },
  {
    name: 'angebot_entwurf_anlegen',
    title: 'Angebots-Entwurf vorschlagen',
    description:
      'Legt einen Angebots-ENTWURF an. Das ist noch kein Angebot: der Vorschlag erscheint in der '
      + 'Angebotssuite unter "Entwürfe" und wird erst zu einem Beleg mit Nummer, wenn ein Mitarbeiter '
      + 'ihn dort ausdrücklich übernimmt. Es wird nichts versendet, nichts nach Zoho übertragen und '
      + 'kein bestehender Beleg verändert. Sag dem Nutzer klar, dass der Entwurf noch freigegeben '
      + 'werden muss. Beträge sind Netto-Einzelpreise in Euro; die Summen rechnet der Server.',
    inputSchema: {
      type: 'object',
      properties: {
        kunde: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            strasse: { type: 'string' },
            plz: { type: 'string' },
            ort: { type: 'string' },
            uid: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name'],
        },
        objekt: {
          type: 'object',
          properties: {
            bezeichnung: { type: 'string' },
            adresse: { type: 'string' },
            plz: { type: 'string' },
            ort: { type: 'string' },
          },
        },
        positionen: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              titel: { type: 'string', description: 'Kurzbezeichnung, erscheint fett in der Positionszeile' },
              beschreibung: { type: 'string', description: 'Optionaler Langtext unter dem Titel' },
              menge: { type: 'number' },
              einheit: { type: 'string', description: 'z.B. Stk, m, m², pausch. — Standard: Stk' },
              einzelpreisNetto: { type: 'number' },
              rabattProzent: { type: 'number' },
              ustSatz: { type: 'number', description: 'Standard 20. Bei Reverse Charge wird keine USt gerechnet.' },
            },
            required: ['titel', 'menge', 'einzelpreisNetto'],
          },
        },
        reverseCharge: { type: 'boolean', description: 'Bauleistung nach §19 Abs. 1a UStG — keine USt' },
        angebotsdatum: { type: 'string', description: 'YYYY-MM-DD, Standard heute' },
        gueltigBis: { type: 'string', description: 'YYYY-MM-DD' },
        ansprechpartner: { type: 'string' },
        ticketNummer: { type: 'string' },
        notizen: { type: 'string' },
        notiz: { type: 'string', description: 'Hinweis an die Person, die den Entwurf prüft' },
      },
      required: ['kunde', 'positionen'],
    },
  },
  {
    name: 'entwuerfe_auflisten',
    title: 'Entwürfe auflisten',
    description:
      'Zeigt die vorgeschlagenen Entwürfe und ihren Zustand (offen, übernommen, verworfen). '
      + 'Das Übernehmen selbst ist über diese Schnittstelle nicht möglich — das passiert in der App.',
    inputSchema: {
      type: 'object',
      properties: {
        zustand: { type: 'string', enum: ['offen', 'uebernommen', 'verworfen', 'alle'], default: 'offen' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: 'pdf_link',
    title: 'PDF-Link',
    description:
      'Liefert die URL, unter der das PDF eines Belegs abrufbar ist. '
      + 'Achtung: die URL ist ohne Anmeldung erreichbar und sollte nicht weitergegeben werden.',
    inputSchema: {
      type: 'object',
      properties: {
        typ: { type: 'string', enum: [...BELEG_ENUM] },
        beleg: { type: 'string', description: 'Belegnummer oder UUID' },
      },
      required: ['typ', 'beleg'],
    },
  },
] as const

/** Ruft die interne v1-API auf, damit Tool und REST-Endpunkt nie auseinanderlaufen. */
async function v1(
  req: NextRequest,
  pfad: string,
  params: Record<string, string | number | undefined> = {},
  body?: unknown
) {
  const url = new URL(`/api/v1/${pfad}`, req.nextUrl.origin)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: req.headers.get('authorization') || '',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const meldung = json?.error?.message || `HTTP ${res.status}`
    throw new ApiError(res.status, json?.error?.code || 'api-fehler', meldung)
  }
  return json
}

async function toolAusfuehren(req: NextRequest, name: string, args: Record<string, unknown>) {
  const typ = args.typ as BelegTyp | undefined
  const limit = ganzzahl(args.limit === undefined ? null : String(args.limit), 20, 1, 100)

  switch (name) {
    case 'belege_suchen': {
      const begriff = String(args.suchbegriff || '').trim()
      if (!begriff) throw new ApiError(400, 'parameter-fehlt', 'suchbegriff fehlt.')
      if (typ) {
        return listeBelege(typ, { limit: Math.min(limit, 50), offset: 0, suche: begriff })
      }
      return v1(req, 'suche', { q: begriff, limit: Math.min(limit, 10) })
    }
    case 'belege_auflisten': {
      if (!typ) throw new ApiError(400, 'parameter-fehlt', 'typ fehlt.')
      return listeBelege(typ, {
        limit,
        offset: ganzzahl(args.offset === undefined ? null : String(args.offset), 0, 0, 100_000),
        status: args.status ? String(args.status) : undefined,
        vonDatum: args.von ? String(args.von) : undefined,
        bisDatum: args.bis ? String(args.bis) : undefined,
      })
    }
    case 'beleg_details': {
      if (!typ) throw new ApiError(400, 'parameter-fehlt', 'typ fehlt.')
      return belegDetail(typ, String(args.beleg || ''))
    }
    case 'kennzahlen_abrufen':
      return v1(req, 'kennzahlen', { jahr: args.jahr ? Number(args.jahr) : undefined })
    case 'produkte_suchen':
      return v1(req, 'produkte', { suche: args.suchbegriff ? String(args.suchbegriff) : undefined, limit })
    case 'stammdaten_abrufen':
      return v1(req, 'stammdaten', { art: String(args.art || '') })
    case 'angebot_entwurf_anlegen':
      // Braucht den Schreib-Token. Trägt der Connector nur den Lese-Token,
      // antwortet die v1-Route mit 401 und der Agent bekommt das als
      // Tool-Fehler zurück — genau das gewünschte Verhalten.
      return v1(req, 'entwuerfe', {}, args)
    case 'entwuerfe_auflisten':
      return v1(req, 'entwuerfe', {
        zustand: args.zustand ? String(args.zustand) : 'offen',
        limit,
      })
    case 'pdf_link': {
      if (!typ) throw new ApiError(400, 'parameter-fehlt', 'typ fehlt.')
      const beleg = await belegDetail(typ, String(args.beleg || ''))
      return {
        url: `${req.nextUrl.origin}/api/pdf/${typ}/${beleg.id}`,
        hinweis: 'Diese URL ist ohne Anmeldung abrufbar. Nicht an Dritte weitergeben.',
      }
    }
    default:
      throw new ApiError(400, 'unbekanntes-tool', `Tool "${name}" existiert nicht.`)
  }
}

function ergebnis(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result })
}

function jsonRpcFehler(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
}

export async function POST(req: NextRequest) {
  // Auth VOR der Protokollschicht: Claude löst den Anmeldehinweis nur bei
  // einem echten Transport-401 aus, nicht bei 200 mit Fehlerobjekt.
  try {
    pruefeToken(req, 'read')
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 401
    const message = err instanceof ApiError ? err.message : 'Nicht autorisiert.'
    return NextResponse.json(
      { error: 'unauthorized', error_description: message },
      { status, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } }
    )
  }

  const version = req.headers.get('mcp-protocol-version')
  if (version && !UNTERSTUETZTE_VERSIONEN.includes(version)) {
    return NextResponse.json(
      { error: 'unsupported_protocol_version', supported: UNTERSTUETZTE_VERSIONEN },
      { status: 400 }
    )
  }

  const body = (await req.json().catch(() => null)) as JsonRpcRequest | JsonRpcRequest[] | null
  if (!body) return jsonRpcFehler(null, -32700, 'Parse error')

  // Batches beantworten wir der Einfachheit halber nicht — die Spec erlaubt das,
  // und Claude schickt einzelne Requests.
  const nachricht = Array.isArray(body) ? body[0] : body
  if (!nachricht) return jsonRpcFehler(null, -32600, 'Invalid Request')

  // Notification (ohne id) → 202 ohne Body, so verlangt es die Spec.
  if (nachricht.id === undefined || nachricht.id === null) {
    if (nachricht.method?.startsWith('notifications/')) {
      return new NextResponse(null, { status: 202 })
    }
  }

  try {
    switch (nachricht.method) {
      case 'initialize':
        return ergebnis(nachricht.id, {
          protocolVersion: PROTOKOLL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'lassel-angebotssuite', version: '1.0.0' },
          instructions:
            'Lesezugriff auf die Angebotssuite der Höhenarbeiten Lassel GmbH: Angebote, Rechnungen, '
            + 'Lieferscheine, Produkte und Stammdaten. Der Zugriff ist ausschließlich lesend — '
            + 'Belege anlegen, ändern oder versenden ist über diese Schnittstelle nicht möglich. '
            + 'Beträge sind in Euro. Bei Belegen mit reverse_charge=true wird keine Umsatzsteuer '
            + 'ausgewiesen, brutto entspricht dann netto.',
        })

      case 'ping':
        return ergebnis(nachricht.id, {})

      case 'tools/list':
        return ergebnis(nachricht.id, { tools: TOOLS })

      case 'tools/call': {
        const name = String(nachricht.params?.name || '')
        const args = (nachricht.params?.arguments || {}) as Record<string, unknown>
        try {
          const daten = await toolAusfuehren(req, name, args)
          return ergebnis(nachricht.id, {
            content: [{ type: 'text', text: JSON.stringify(daten, null, 2) }],
            structuredContent: daten,
          })
        } catch (err) {
          // Fachliche Fehler gehören als isError-Ergebnis zurück, nicht als
          // JSON-RPC-Fehler — dann kann das Modell darauf reagieren.
          const message = err instanceof ApiError ? err.message : (err as Error).message
          return ergebnis(nachricht.id, {
            content: [{ type: 'text', text: `Fehler: ${message}` }],
            isError: true,
          })
        }
      }

      default:
        return jsonRpcFehler(nachricht.id, -32601, `Method not found: ${nachricht.method}`)
    }
  } catch (err) {
    console.error('[mcp]', err)
    return jsonRpcFehler(nachricht.id, -32603, 'Internal error')
  }
}

/**
 * Kein server-initiierter Stream — die Spec erlaubt hier ausdrücklich 405.
 * Ein GET auf diesen Pfad ist also kein Fehler in der Konfiguration.
 */
export async function GET() {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { allow: 'POST' },
  })
}
