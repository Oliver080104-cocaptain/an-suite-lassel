/**
 * Atomare Belegnummern-Vergabe über die Postgres-Funktion aus Migration 023.
 *
 * Die elf bestehenden Generatoren im UI und in den Webhooks bleiben
 * unangetastet — sie zählen weiterhin `COUNT(*) + 1`. Diese Funktion ist der
 * Weg für neue Schreibpfade, angefangen bei der Übernahme aus dem
 * Entwurfsraum.
 *
 * Der Trigger aus Migration 023 zieht den Zähler nach, wenn eine Nummer an
 * diesem Weg vorbei gesetzt wird. Beide Verfahren können deshalb parallel
 * laufen, ohne sich zu überholen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api-core'

export type Nummernkreis = 'AN' | 'RE' | 'LI'

/**
 * Liefert die nächste freie Belegnummer im Format `AN-2026-00042`.
 * Wirft mit klarer Meldung, wenn Migration 023 noch nicht eingespielt ist —
 * ein stiller Fallback auf COUNT+1 wäre hier falsch, weil er genau die
 * Kollisionen zurückbrächte, die die Migration beseitigt.
 */
export async function naechsteBelegnummer(
  db: SupabaseClient,
  kreis: Nummernkreis,
  jahr: number = new Date().getFullYear()
): Promise<string> {
  const { data, error } = await db.rpc('naechste_belegnummer', {
    p_kreis: kreis,
    p_jahr: jahr,
  })

  if (error) {
    const fehltNoch = /could not find the function|does not exist|schema cache/i.test(error.message || '')
    throw new ApiError(
      500,
      fehltNoch ? 'migration-fehlt' : 'nummernvergabe-fehlgeschlagen',
      fehltNoch
        ? 'Die Belegnummern-Vergabe ist noch nicht eingerichtet. Bitte Migration 023_belegnummern_kreise.sql in Supabase ausführen.'
        : `Belegnummer konnte nicht vergeben werden: ${error.message}`
    )
  }

  const lfd = Number(data)
  if (!Number.isFinite(lfd) || lfd < 1) {
    throw new ApiError(500, 'nummernvergabe-ungueltig',
      'Die Belegnummern-Vergabe hat keinen gültigen Wert geliefert.')
  }

  return `${kreis}-${jahr}-${String(lfd).padStart(5, '0')}`
}
