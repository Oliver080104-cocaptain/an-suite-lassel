/**
 * Zentrale Geld-/Steuer-Helfer für die Angebotssuite.
 *
 * HINTERGRUND (Audit 2026-07-13):
 * Überall im Code wurde `parseFloat(x) || DEFAULT` benutzt. Da `0` in JS falsy
 * ist, verwandelte das legitime 0-Werte still in den Default — insbesondere
 * einen 0%-USt-Satz (steuerbefreit / Reverse-Charge / innergemeinschaftlich)
 * in 20% MwSt, oder 0% Provision in 10%. Zusätzlich divergierten Defaults
 * (Kopf-Summe rechnete mit `|| 0`, Positionszeile mit `|| 1`), und die pro
 * Position gespeicherte `gesamtpreis`-Summe ignorierte Rabatte, obwohl die
 * Beleg-Summe sie berücksichtigte.
 *
 * Diese Datei ist bewusst FRAMEWORK-FREI (keine Imports) und rein funktional,
 * damit sie ohne DB/Next.js unit-getestet werden kann.
 */

/** Österreichischer Regelsteuersatz. Einziger Default-USt-Wert der App. */
export const STANDARD_MWST = 20

/**
 * Robuste Zahlen-Coercion. Fällt NUR auf `fallback` zurück, wenn der Wert
 * nicht zu einer endlichen Zahl parsebar ist. `0` (und "0") bleiben erhalten.
 * Unterstützt deutsche Dezimalkommata ("10,5") solange kein Punkt vorkommt
 * (verhindert Fehlinterpretation von Tausenderpunkten).
 */
export function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    let s = value.trim()
    if (s === '') return fallback
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

/** Kaufmännisch auf 2 Nachkommastellen (Cent) runden. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface TotalsLine {
  menge?: unknown
  einzelpreis?: unknown
  rabattProzent?: unknown
  mwstSatz?: unknown
}

export interface Totals {
  netto: number
  mwst: number
  brutto: number
}

/**
 * Netto einer einzelnen Position (Menge × Einzelpreis − Rabatt), auf Cent
 * gerundet. Wird sowohl für die gespeicherte `gesamtpreis`-Spalte als auch
 * für die Summenbildung verwendet, damit Zeilensumme == Beleg-Summe gilt.
 */
export function lineNetto(line: TotalsLine): number {
  const menge = num(line.menge, 1)
  const einzelpreis = num(line.einzelpreis, 0)
  const rabatt = num(line.rabattProzent, 0)
  return round2(menge * einzelpreis * (1 - rabatt / 100))
}

/**
 * Beleg-Summen aus Positionen. Bei `reverseCharge` ist die MwSt IMMER 0 und
 * Brutto == Netto (Steuerschuld geht auf den Leistungsempfänger über). Sonst
 * wird pro Position mit deren `mwstSatz` gerechnet (Default: STANDARD_MWST),
 * sodass gemischte Sätze und echte 0%-Positionen korrekt abgebildet werden.
 */
export function computeTotals(
  lines: TotalsLine[],
  opts?: { reverseCharge?: boolean }
): Totals {
  const rc = opts?.reverseCharge === true
  let netto = 0
  let mwst = 0
  for (const l of lines) {
    const n = lineNetto(l)
    netto = round2(netto + n)
    if (!rc) {
      const satz = num(l.mwstSatz, STANDARD_MWST)
      mwst = round2(mwst + round2(n * (satz / 100)))
    }
  }
  return { netto: round2(netto), mwst: round2(mwst), brutto: round2(netto + mwst) }
}
