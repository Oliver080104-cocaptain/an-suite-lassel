/**
 * Die einzigen Werte, die `angebote.status` annehmen kann.
 *
 * Die Spalte ist ein Postgres-ENUM (`angebot_status`, siehe
 * `supabase/schema.sql`) — kein TEXT wie bei Rechnung und Lieferschein.
 * Ein unbekannter Wert wird deshalb nicht gespeichert und nicht ignoriert,
 * sondern lässt das UPDATE hart scheitern:
 *
 *   invalid input value for enum angebot_status: "in_bearbeitung"
 *
 * Genau das ist passiert: das Status-Dropdown der Detailseite bot
 * `in_bearbeitung`, `ready_for_pdf`, `abgelaufen` und `storniert` an. Keiner
 * dieser vier Werte steht im Enum. Wer einen davon wählte, konnte das Angebot
 * danach nicht mehr speichern — und weil der Zoho-Webhook erst NACH dem
 * Speichern feuert, blieb auch die Ablage in Zoho aus.
 *
 * `storniert` gehört zum Rechnungsstatus (dort TEXT, deshalb fiel es nie auf),
 * die anderen drei standen in keiner Migration.
 *
 * Diese Liste ist ab jetzt die einzige Quelle — Detailseite und Übersicht
 * lesen beide hier. Wer einen Status ergänzen will, braucht zuerst ein
 * `ALTER TYPE angebot_status ADD VALUE '…'` in einer Migration.
 */

export const ANGEBOT_STATUS = [
  { value: 'entwurf', label: 'Entwurf' },
  { value: 'offen', label: 'Offen' },
  { value: 'versendet', label: 'Versendet' },
  { value: 'final', label: 'Final' },
  { value: 'angenommen', label: 'Angenommen' },
  { value: 'abgelehnt', label: 'Abgelehnt' },
  { value: 'archiviert', label: 'Archiviert' },
] as const

export type AngebotStatus = (typeof ANGEBOT_STATUS)[number]['value']

export const ANGEBOT_STATUS_DEFAULT: AngebotStatus = 'entwurf'

const ERLAUBT = new Set<string>(ANGEBOT_STATUS.map((s) => s.value))

/** True, wenn der Wert so in der Datenbank landen darf. */
export function istAngebotStatus(wert: unknown): wert is AngebotStatus {
  return typeof wert === 'string' && ERLAUBT.has(wert)
}

/**
 * Macht aus einem beliebigen Wert einen speicherbaren Status.
 *
 * Bewusst kein Werfen: ein unbekannter Status ist immer ein Fehler im Code
 * oder ein Rest aus einer alten Sitzung, nie eine Eingabe des Anwenders, die
 * es zu verteidigen gäbe. Das Angebot samt Positionen und Zoho-Ablage daran
 * scheitern zu lassen wäre der deutlich größere Schaden.
 */
export function normalisiereAngebotStatus(wert: unknown): AngebotStatus {
  return istAngebotStatus(wert) ? wert : ANGEBOT_STATUS_DEFAULT
}
