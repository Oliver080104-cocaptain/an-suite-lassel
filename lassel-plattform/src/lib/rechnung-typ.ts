/**
 * Zentrale Definitionen für Rechnungstypen.
 *
 * Wir nutzen weiter die bestehenden DB-Werte ('normal' | 'teilrechnung' |
 * 'schlussrechnung' | 'storno') und ergänzen 'anzahlung' und 'gutschrift'
 * für RIHA-Style. Die kurzen Codes (RE/AN/TR/SR/GS) werden NUR für
 * Nummernkreise und PDF-Titel verwendet, nicht in der DB gespeichert.
 */

import { supabase } from '@/lib/supabase'
import { naechsteBelegnummer, kreisFuerRechnungstyp } from '@/lib/belegnummer'

export type Rechnungstyp =
  | 'normal'
  | 'anzahlung'
  | 'teilrechnung'
  | 'schlussrechnung'
  | 'gutschrift'
  | 'storno'

export interface RechnungstypInfo {
  value: Rechnungstyp
  label: string
  prefix: string  // Nummernkreis-Prefix (RE/AN/TR/SR/GS)
  pdfTitle: string  // Titel auf dem PDF
  badgeBg: string  // Tailwind classes
  badgeText: string
}

export const RECHNUNGSTYP_INFO: Record<Rechnungstyp, RechnungstypInfo> = {
  normal: {
    value: 'normal',
    label: 'Rechnung',
    prefix: 'RE',
    pdfTitle: 'RECHNUNG',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
  },
  anzahlung: {
    value: 'anzahlung',
    label: 'Anzahlung',
    prefix: 'AN',
    pdfTitle: 'ANZAHLUNGSRECHNUNG',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
  },
  teilrechnung: {
    value: 'teilrechnung',
    label: 'Teilrechnung',
    prefix: 'TR',
    pdfTitle: 'TEILRECHNUNG',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
  },
  schlussrechnung: {
    value: 'schlussrechnung',
    label: 'Schlussrechnung',
    prefix: 'SR',
    pdfTitle: 'SCHLUSSRECHNUNG',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
  },
  gutschrift: {
    value: 'gutschrift',
    label: 'Gutschrift',
    prefix: 'GS',
    pdfTitle: 'GUTSCHRIFT',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-700',
  },
  storno: {
    value: 'storno',
    label: 'Storno',
    prefix: 'RE',
    pdfTitle: 'STORNORECHNUNG',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
  },
}

export function getTypInfo(typ: string | null | undefined): RechnungstypInfo {
  if (!typ) return RECHNUNGSTYP_INFO.normal
  return RECHNUNGSTYP_INFO[(typ as Rechnungstyp)] || RECHNUNGSTYP_INFO.normal
}

/**
 * Generiert die nächste Rechnungsnummer für einen gegebenen Typ.
 * Sucht alle existierenden Nummern mit gleichem Prefix im aktuellen Jahr
 * und gibt die nächste fortlaufende Nummer zurück.
 */
export async function generateRechnungsNummer(typ: Rechnungstyp): Promise<string> {
  // Atomare Vergabe je Nummernkreis (Migration 023/025). Vorher wurde die
  // hoechste vorhandene Nummer mit gleichem Prefix gesucht und +1 gerechnet —
  // zwei gleichzeitige Anlagen bekamen dieselbe Nummer, und das einzige
  // Rettungsnetz war der UNIQUE-Constraint mit einer rohen Postgres-Meldung.
  return naechsteBelegnummer(supabase, kreisFuerRechnungstyp(typ))
}
