/**
 * Zentrale, atomare Belegnummern-Vergabe.
 *
 * Vorher entstanden Belegnummern an elf Stellen nach dem Muster "alle Belege
 * des Jahres zaehlen, +1". Das ist nicht atomar — zwei gleichzeitige Anlagen
 * bekommen dieselbe Nummer — und zaehlte je nach Fundstelle Papierkorb-Belege
 * mit oder nicht. Das einzige Rettungsnetz war der UNIQUE-Constraint, der
 * dem Anwender eine rohe Postgres-Meldung praesentierte.
 *
 * Die Vergabe laeuft jetzt ueber die Postgres-Funktion `naechste_belegnummer`
 * (Migration 023), ein einzelnes `INSERT … ON CONFLICT DO UPDATE … RETURNING`
 * und damit unter Postgres atomar. Migration 025 gibt sie per SECURITY DEFINER
 * fuer die Oberflaeche frei, ohne die Zaehlertabelle selbst zu oeffnen.
 *
 * Der Trigger aus Migration 023/025 zieht den Zaehler nach, wenn eine Nummer
 * an diesem Weg vorbei gesetzt wird (z.B. manuell ueber EditableDocNumber).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '@/lib/monitoring'

/**
 * Nummernkreise. Getrennt nach Tabelle, nicht nur nach Prefix: eine
 * Anzahlungsrechnung traegt `AN-…` wie ein Angebot, ist aber ein anderer
 * Beleg in einer anderen Tabelle und braucht einen eigenen Zaehler.
 */
export type Nummernkreis = 'AN' | 'RE' | 'LI' | 'RE_AN' | 'RE_TR' | 'RE_SR' | 'RE_GS'

/** Sichtbares Prefix je Kreis — `RE_TR` erzeugt Nummern der Form `TR-2026-00001`. */
const PREFIX: Record<Nummernkreis, string> = {
  AN: 'AN', RE: 'RE', LI: 'LI',
  RE_AN: 'AN', RE_TR: 'TR', RE_SR: 'SR', RE_GS: 'GS',
}

/** Tabelle und Spalte je Kreis — nur fuer den Notfall-Fallback. */
const QUELLE: Record<Nummernkreis, { tabelle: string; spalte: string }> = {
  AN: { tabelle: 'angebote', spalte: 'angebotsnummer' },
  LI: { tabelle: 'lieferscheine', spalte: 'lieferscheinnummer' },
  RE: { tabelle: 'rechnungen', spalte: 'rechnungsnummer' },
  RE_AN: { tabelle: 'rechnungen', spalte: 'rechnungsnummer' },
  RE_TR: { tabelle: 'rechnungen', spalte: 'rechnungsnummer' },
  RE_SR: { tabelle: 'rechnungen', spalte: 'rechnungsnummer' },
  RE_GS: { tabelle: 'rechnungen', spalte: 'rechnungsnummer' },
}

function formatiere(kreis: Nummernkreis, jahr: number, lfd: number): string {
  return `${PREFIX[kreis]}-${jahr}-${String(lfd).padStart(5, '0')}`
}

/**
 * Notfall-Weg, falls die Funktion (noch) nicht existiert oder der Aufrufer
 * sie nicht ausfuehren darf — also solange Migration 023/025 nicht eingespielt
 * ist. Entspricht dem bisherigen Verhalten: hoechste vorhandene Nummer + 1.
 *
 * Bewusst KEIN stiller Fallback: der Vorgang wird als Warnung gemeldet, damit
 * im Monitoring sichtbar ist, dass die atomare Vergabe nicht greift. Ein
 * harter Abbruch waere hier falsch — dann koennte niemand mehr einen Beleg
 * anlegen.
 */
async function fallbackNummer(
  db: SupabaseClient,
  kreis: Nummernkreis,
  jahr: number,
  grund: string
): Promise<string> {
  await logEvent('warning', 'belegnummer',
    `Atomare Nummernvergabe nicht verfügbar (${kreis}) — Rückfall auf Zählen. Migration 023/025 prüfen.`,
    { kreis, jahr, grund }
  ).catch(() => {})

  const q = QUELLE[kreis]
  const prefix = `${PREFIX[kreis]}-${jahr}-`
  const { data } = await db
    .from(q.tabelle)
    .select(q.spalte)
    .like(q.spalte, `${prefix}%`)
    .order(q.spalte, { ascending: false })
    .limit(1)
    .maybeSingle()

  const letzte = (data as Record<string, string> | null)?.[q.spalte]
  const lfd = letzte ? (parseInt(letzte.replace(prefix, ''), 10) || 0) + 1 : 1
  return formatiere(kreis, jahr, lfd)
}

/**
 * Liefert die naechste freie Belegnummer, z.B. `AN-2026-00110`.
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
    // Gegen die echte Datenbank geprüft: ohne Migration 025 läuft die Funktion
    // nicht als SECURITY DEFINER, und der Anon-Key aus dem Browser scheitert
    // an der RLS der Zählertabelle mit
    //   "new row violates row-level security policy for table …".
    // Diese Meldung MUSS in der Fallback-Erkennung stehen — sonst könnte
    // niemand mehr einen Beleg anlegen, bis die Migration eingespielt ist.
    const nichtVerfuegbar =
      /could not find the function|does not exist|schema cache|permission denied|row-level security|violates row/i
        .test(error.message || '')
    if (nichtVerfuegbar) {
      return fallbackNummer(db, kreis, jahr, error.message)
    }
    throw new Error(`Belegnummer konnte nicht vergeben werden: ${error.message}`)
  }

  const lfd = Number(data)
  if (!Number.isFinite(lfd) || lfd < 1) {
    return fallbackNummer(db, kreis, jahr, 'RPC lieferte keinen gültigen Wert')
  }

  return formatiere(kreis, jahr, lfd)
}

/** Nummernkreis fuer einen Rechnungstyp (siehe RECHNUNGSTYP_INFO). */
export function kreisFuerRechnungstyp(typ: string): Nummernkreis {
  switch (typ) {
    case 'anzahlung': return 'RE_AN'
    case 'teilrechnung': return 'RE_TR'
    case 'schlussrechnung': return 'RE_SR'
    case 'gutschrift': return 'RE_GS'
    default: return 'RE'
  }
}
