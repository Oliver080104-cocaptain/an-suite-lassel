/**
 * Feld-Freigaben und Lesezugriffe für die API.
 *
 * Bewusst als Whitelist, nicht als Blacklist: eine neue Spalte in der
 * Datenbank taucht nicht automatisch in der API auf. Bei einer Tabelle mit
 * internen Notizen, Kunden-E-Mails und Zoho-IDs ist das die richtige Richtung.
 */

import { apiDb, nurFelder, ohneGeloeschte, ApiError } from '@/lib/api-core'

export type BelegTyp = 'angebot' | 'rechnung' | 'lieferschein'

/** Felder in Listen — knapp halten, das spart Kontext im Agenten. */
const LISTE = {
  angebot: [
    'id', 'angebotsnummer', 'status', 'angebotsdatum', 'gueltig_bis',
    'kunde_name', 'objekt_adresse', 'objekt_bezeichnung',
    'netto_gesamt', 'mwst_gesamt', 'brutto_gesamt', 'reverse_charge',
    'erstellt_von', 'ticket_nummer', 'created_at', 'updated_at',
  ],
  rechnung: [
    'id', 'rechnungsnummer', 'status', 'rechnungstyp', 'rechnungsdatum', 'faellig_bis',
    'kunde_name', 'objekt_adresse', 'objekt_bezeichnung',
    'netto_gesamt', 'mwst_gesamt', 'brutto_gesamt', 'reverse_charge',
    'bezahlt_am', 'zahlungsstatus', 'referenz_angebot_nummer', 'ist_schlussrechnung',
    'erstellt_von', 'ticket_nummer', 'created_at', 'updated_at',
  ],
  lieferschein: [
    'id', 'lieferscheinnummer', 'status', 'lieferdatum',
    'kunde_name', 'objekt_adresse', 'referenz_angebot_nummer',
    'ticket_nummer', 'created_at', 'updated_at',
  ],
} as const

/** Zusätzliche Felder im Detail. Kundenkontakt und Notizen nur hier. */
const DETAIL_EXTRA = {
  angebot: [
    'kunde_strasse', 'kunde_plz', 'kunde_ort', 'kunde_land', 'kunde_uid', 'kunde_email',
    'ansprechpartner', 'hausverwaltung_name', 'objekt_plz', 'objekt_ort',
    'geschaeftsfallnummer', 'zoho_ticket_id', 'notizen', 'source', 'vermittler_id',
  ],
  rechnung: [
    'kunde_strasse', 'kunde_plz', 'kunde_ort', 'kunde_land', 'kunde_uid', 'kunde_email',
    'ansprechpartner', 'objekt_strasse', 'objekt_plz', 'objekt_ort',
    'angebot_id', 'referenz_angebot_id', 'teilbetrag_netto', 'teilbetrag_brutto',
    'bereits_fakturiert_netto', 'storno_von', 'skonto_aktiv', 'skonto_prozent', 'skonto_tage',
    'geschaeftsfallnummer', 'zoho_ticket_id', 'notizen', 'vermittler_id',
  ],
  lieferschein: [
    'kunde_strasse', 'kunde_plz', 'kunde_ort', 'kunde_uid', 'ansprechpartner',
    'angebot_id', 'geschaeftsfallnummer', 'notizen',
  ],
} as const

const POSITION_FELDER = [
  'id', 'position', 'beschreibung', 'menge', 'einheit',
  'einzelpreis', 'rabatt_prozent', 'mwst_satz', 'gesamtpreis',
] as const

export const TABELLE: Record<BelegTyp, { haupt: string; positionen: string; fk: string; nummer: string; datum: string }> = {
  angebot: { haupt: 'angebote', positionen: 'angebot_positionen', fk: 'angebot_id', nummer: 'angebotsnummer', datum: 'angebotsdatum' },
  rechnung: { haupt: 'rechnungen', positionen: 'rechnung_positionen', fk: 'rechnung_id', nummer: 'rechnungsnummer', datum: 'rechnungsdatum' },
  lieferschein: { haupt: 'lieferscheine', positionen: 'lieferschein_positionen', fk: 'lieferschein_id', nummer: 'lieferscheinnummer', datum: 'lieferdatum' },
}

export interface ListeOptionen {
  limit: number
  offset: number
  status?: string
  suche?: string
  vonDatum?: string
  bisDatum?: string
}

/**
 * Belegliste. Sortiert nach Erstellung absteigend.
 *
 * Der Soft-Delete-Filter läuft in JavaScript (siehe api-core), deshalb wird
 * etwas großzügiger geladen als am Ende ausgegeben wird.
 */
export async function listeBelege(typ: BelegTyp, opt: ListeOptionen) {
  const t = TABELLE[typ]
  const db = apiDb()

  let query = db.from(t.haupt).select('*').order('created_at', { ascending: false })

  if (opt.status) query = query.eq('status', opt.status)
  if (opt.vonDatum) query = query.gte(t.datum, opt.vonDatum)
  if (opt.bisDatum) query = query.lte(t.datum, opt.bisDatum)
  if (opt.suche) {
    const s = opt.suche.replace(/[%,()]/g, ' ').trim()
    if (s) query = query.or(`${t.nummer}.ilike.%${s}%,kunde_name.ilike.%${s}%,objekt_adresse.ilike.%${s}%`)
  }

  // Puffer für die nachgelagerte Papierkorb-Filterung.
  query = query.range(opt.offset, opt.offset + opt.limit * 2)

  const { data, error } = await query
  if (error) throw new ApiError(502, 'db-fehler', `Abfrage fehlgeschlagen: ${error.message}`)

  const rows = ohneGeloeschte((data || []) as Record<string, unknown>[]).slice(0, opt.limit)
  return {
    anzahl: rows.length,
    limit: opt.limit,
    offset: opt.offset,
    /** true, wenn es vermutlich weitere Treffer gibt. */
    weitere: (data || []).length > opt.limit,
    belege: rows.map((r) => nurFelder(r, LISTE[typ])),
  }
}

export interface BelegDetail extends Record<string, unknown> {
  id: string
  positionen: Record<string, unknown>[]
  hinweise: string[]
}

/** Einzelbeleg inklusive Positionen. Akzeptiert UUID oder Belegnummer. */
export async function belegDetail(typ: BelegTyp, idOderNummer: string): Promise<BelegDetail> {
  const t = TABELLE[typ]
  const db = apiDb()

  const istUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOderNummer)
  const { data, error } = await db
    .from(t.haupt)
    .select('*')
    .eq(istUuid ? 'id' : t.nummer, idOderNummer)
    .limit(1)

  if (error) throw new ApiError(502, 'db-fehler', `Abfrage fehlgeschlagen: ${error.message}`)
  const roh = ohneGeloeschte((data || []) as Record<string, unknown>[])[0]
  if (!roh) throw new ApiError(404, 'nicht-gefunden', `${typ} "${idOderNummer}" wurde nicht gefunden.`)

  const { data: posData, error: posError } = await db
    .from(t.positionen)
    .select('*')
    .eq(t.fk, roh.id as string)
    .order('position', { ascending: true })

  if (posError) throw new ApiError(502, 'db-fehler', `Positionen konnten nicht geladen werden: ${posError.message}`)

  const positionen = ((posData || []) as Record<string, unknown>[]).map((p) => {
    const feld = nurFelder(p, POSITION_FELDER)
    // Die UI legt Titel und Langtext in EINE Spalte, getrennt durch \n.
    // Für einen Agenten ist der Titel allein meist das Nützliche.
    const text = typeof p.beschreibung === 'string' ? p.beschreibung : ''
    const [titel, ...rest] = text.split('\n')
    feld.titel = titel
    if (rest.length) feld.beschreibung_lang = rest.join('\n')
    return feld
  })

  return {
    ...nurFelder(roh, [...LISTE[typ], ...DETAIL_EXTRA[typ]]),
    id: roh.id as string,
    positionen,
    hinweise: hinweiseZuBeleg(typ, roh, positionen),
  }
}

/**
 * Bekannte Fallstricke, die man einem Agenten mitgeben sollte, damit er aus
 * den Zahlen keine falschen Schlüsse zieht. Stammen aus dem internen Audit.
 */
function hinweiseZuBeleg(
  typ: BelegTyp,
  row: Record<string, unknown>,
  positionen: Record<string, unknown>[]
): string[] {
  const hinweise: string[] = []

  if (row.reverse_charge === true) {
    hinweise.push('Reverse Charge: Es wird keine Umsatzsteuer ausgewiesen, brutto entspricht netto.')
  }

  if (typ === 'rechnung') {
    const teil = Number(row.teilbetrag_netto)
    if (Number.isFinite(teil) && teil > 0) {
      const summePositionen = positionen.reduce((s, p) => s + (Number(p.gesamtpreis) || 0), 0)
      if (Math.abs(summePositionen - Number(row.netto_gesamt || 0)) > 0.01) {
        hinweise.push(
          'Teilfaktura: Die Summe der Positionen weicht vom Rechnungsbetrag ab. ' +
          'Maßgeblich ist netto_gesamt/brutto_gesamt im Kopf, nicht die Positionssumme.'
        )
      }
    }
    if (row.ist_schlussrechnung === true) {
      hinweise.push('Schlussrechnung: Der Abzug bereits fakturierter Beträge wird nur im PDF dargestellt, nicht in den Summenfeldern.')
    }
  }

  return hinweise
}
