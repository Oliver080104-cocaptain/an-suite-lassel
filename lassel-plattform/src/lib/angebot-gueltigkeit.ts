/**
 * Standard-Gültigkeit eines Angebots.
 *
 * Fachliche Festlegung (2026-07-27): ein Angebot ist zwei Monate ab
 * Angebotsdatum gültig. Vorher standen an drei Stellen unabhängig voneinander
 * 30 Tage bzw. gar kein Datum (Zoho-Webhook) — das war in der Praxis zu kurz,
 * weil zwischen Angebot und Auftragserteilung regelmäßig mehr Zeit vergeht.
 *
 * Alle Pfade, die ein Angebot ANLEGEN, holen den Vorschlag hier:
 *   - Zoho-Webhook  `api/webhooks/offer`
 *   - Entwurfs-Übernahme (API/MCP) `lib/entwuerfe.ts`
 *   - Detailseite `angebote/[id]` (neues Angebot + Nachtrag beim Öffnen)
 *
 * Ein vom Absender mitgeschicktes bzw. im UI gesetztes Datum hat immer Vorrang.
 */

import { addMonths, format, parseISO, isValid } from 'date-fns'

export const GUELTIGKEIT_MONATE = 2

/**
 * Vorschlag für `gueltig_bis` als `yyyy-MM-dd`.
 *
 * `angebotsdatum` wird als lokales Datum gelesen (parseISO, nicht `new Date()`
 * — letzteres interpretiert `yyyy-MM-dd` als UTC-Mitternacht und kann so einen
 * Tag zurückspringen). Fehlt oder taugt der Wert nicht, zählt heute.
 * Monatsenden klemmt `addMonths` korrekt: 31.12. + 2 Monate → 28./29.02.
 */
export function gueltigBisDefault(angebotsdatum?: string | null): string {
  const basis = angebotsdatum ? parseISO(angebotsdatum) : new Date()
  const start = isValid(basis) ? basis : new Date()
  return format(addMonths(start, GUELTIGKEIT_MONATE), 'yyyy-MM-dd')
}
