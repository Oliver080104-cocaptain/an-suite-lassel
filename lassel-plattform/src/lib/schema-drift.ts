/**
 * Schema-Drift-Schutz fuer Schreibzugriffe.
 *
 * Das Repo-Schema ist nicht die Wahrheit: `supabase/schema.sql` und die
 * Migrationen beschreiben nicht den Ist-Stand der Produktionsdatenbank.
 * Schreibt der Code eine Spalte, die es dort nicht gibt, antwortet PostgREST
 * mit
 *
 *   Could not find the 'produkt_id' column of 'angebot_positionen' in the schema cache
 *
 * und das GESAMTE insert scheitert — nicht nur das eine Feld. Genau daran ist
 * am 17.08.2026 jedes Speichern eines Angebots gescheitert: `produkt_id` steht
 * in schema.sql, in der Produktionsdatenbank aber nicht.
 *
 * Dieselbe Rettung existierte schon dreimal ad hoc (rechnungen/[id],
 * lieferscheine/[id], api/webhooks/offer) — nur an den Positionstabellen
 * nicht. Hier einmal zentral.
 *
 * Bewusst nur fuer FEHLENDE Spalten: jeder andere Fehler wird unveraendert
 * zurueckgegeben. Ein Tippfehler im Spaltennamen faellt damit weiterhin auf
 * (die Spalte fehlt dann ueberall, das Feld wird still verworfen) — deshalb
 * meldet die Funktion jeden Strip ans Monitoring.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '@/lib/monitoring'

const MAX_VERSUCHE = 6

function fehlendeSpalte(nachricht: string | undefined): string | null {
  if (!nachricht) return null
  return /Could not find the '([^']+)' column/i.exec(nachricht)?.[1] ?? null
}

/**
 * `insert`, das eine in der Prod-DB fehlende Spalte aus ALLEN Zeilen entfernt
 * und es erneut versucht, statt den ganzen Vorgang scheitern zu lassen.
 *
 * Rueckgabe wie supabase-js: `{ data, error }` — der Aufrufer prueft weiterhin
 * selbst. `data` ist nur gefuellt, wenn `select` gesetzt ist.
 */
export interface DriftErgebnis {
  data: unknown
  error: { message: string } | null
}

export async function insertMitDriftSchutz<T extends Record<string, unknown>>(
  db: SupabaseClient,
  tabelle: string,
  zeilen: T[],
  opts: { select?: boolean; kontext?: string } = {}
): Promise<DriftErgebnis> {
  if (zeilen.length === 0) return { data: null, error: null }

  let payload: Record<string, unknown>[] = zeilen.map((z) => ({ ...z }))

  for (let i = 0; i < MAX_VERSUCHE; i++) {
    const resp = opts.select
      ? await db.from(tabelle).insert(payload).select()
      : await db.from(tabelle).insert(payload)
    if (!resp.error) return resp

    const fehlend = fehlendeSpalte(resp.error.message)
    if (!fehlend || !(fehlend in payload[0])) return resp

    console.warn(`[${tabelle}] Schema-Drift: Spalte '${fehlend}' fehlt, Retry ohne.`)
    logEvent('warning', 'schema-drift',
      `Spalte '${fehlend}' fehlt in ${tabelle} — Wert wird beim Speichern verworfen`,
      { tabelle, spalte: fehlend, kontext: opts.kontext ?? null }
    ).catch(() => {})

    payload = payload.map((z) => {
      const kopie = { ...z }
      delete kopie[fehlend]
      return kopie
    })
  }

  return { data: null, error: { message: `[${tabelle}] zu viele Schema-Drift-Retries` } }
}
