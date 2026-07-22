/**
 * Gemeinsame Bausteine für die öffentliche API unter /api/v1/** und den
 * MCP-Endpunkt /api/mcp.
 *
 * Zwei Dinge prägen das Design und sollten beim Erweitern nicht verwässert
 * werden:
 *
 * 1. SCHEMA-DRIFT. Die Datenbank stammt aus einer Base44-Migration, in die
 *    nachträglich SQL-Dateien geschrieben wurden. `supabase/schema.sql` und
 *    `supabase/migrations/` beschreiben NICHT zuverlässig den Ist-Stand — der
 *    Code enthält an fünf Stellen einen Retry, der fehlende Spalten aus dem
 *    Payload wirft. Deshalb selektiert die API immer `*` und filtert die
 *    Ausgabefelder in JavaScript. Eine Spalte, die es nicht gibt, fehlt dann
 *    einfach in der Antwort, statt die ganze Abfrage mit 400 zu killen.
 *
 * 2. SOFT-DELETE. `geloescht_am` existiert nicht auf allen Tabellen. Statt
 *    serverseitig zu filtern (und bei fehlender Spalte zu scheitern) wird in
 *    JavaScript gefiltert — das ist immer korrekt, auch bei Drift.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------- Datenbank

/**
 * Bevorzugt den Service-Role-Key. Fehlt er, wird der Anon-Key genutzt —
 * heute gleichwertig, weil die RLS-Policies durchgängig "allow all" sind.
 * `/api/v1/health` weist aus, welcher Weg aktiv ist; nach einer RLS-Härtung
 * muss der Service-Role-Key gesetzt sein.
 */
export function apiDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new ApiError(500, 'supabase-nicht-konfiguriert', 'Datenbankzugang ist nicht konfiguriert.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export function nutztServiceRole(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

/**
 * Datenbankzugang für SCHREIBENDE Endpunkte. Anders als `apiDb()` gibt es
 * hier keinen Anon-Fallback: `beleg_entwuerfe` und `belegnummern_kreise`
 * haben RLS ohne Policy, ein Anon-Client bekäme dort wortlos leere
 * Ergebnisse statt eines Fehlers. Lieber hart abbrechen.
 */
export function apiDbSchreiben(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new ApiError(500, 'service-role-fehlt',
      'Schreibzugriff ist nicht konfiguriert. SUPABASE_SERVICE_ROLE_KEY in den Umgebungsvariablen setzen.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ------------------------------------------------------------------- Fehler

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function fehlerAntwort(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status })
  }
  const message = err instanceof Error ? err.message : String(err)
  console.error('[api/v1]', message)
  return NextResponse.json(
    { error: { code: 'interner-fehler', message: 'Unerwarteter Fehler bei der Verarbeitung.' } },
    { status: 500 }
  )
}

// --------------------------------------------------------------------- Auth

/**
 * Bearer-Token gegen die Env prüfen. Zwei getrennte Tokens, damit ein
 * MCP-Connector physisch nur lesen kann:
 *   API_TOKEN_READ   — Lesezugriff
 *   API_TOKEN_WRITE  — Lese- UND Schreibzugriff (aktuell gibt es keine
 *                      Schreib-Endpunkte; die Variable ist die Vorbereitung)
 *
 * Fail-closed: ist kein Token konfiguriert, wird JEDE Anfrage abgelehnt.
 * Eine API, die ohne Konfiguration offen steht, ist schlimmer als eine, die
 * nicht funktioniert.
 */
export type Scope = 'read' | 'write'

function sicherGleich(a: string, b: string): boolean {
  // Über den SHA-256 vergleichen, damit die Laufzeit nicht von der Länge abhängt.
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function pruefeToken(req: Request, benoetigt: Scope): void {
  const read = process.env.API_TOKEN_READ || ''
  const write = process.env.API_TOKEN_WRITE || ''

  if (!read && !write) {
    throw new ApiError(503, 'api-deaktiviert',
      'Die API ist nicht konfiguriert. API_TOKEN_READ in den Umgebungsvariablen setzen.')
  }

  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    throw new ApiError(401, 'kein-token', 'Authorization-Header mit Bearer-Token fehlt.')
  }

  // write deckt read mit ab, read nicht write.
  const erlaubt = benoetigt === 'read'
    ? [read, write].filter(Boolean)
    : [write].filter(Boolean)

  if (!erlaubt.some((gueltig) => sicherGleich(token, gueltig))) {
    throw new ApiError(401, 'token-ungueltig', 'Bearer-Token ist ungültig oder hat nicht die nötigen Rechte.')
  }
}

// -------------------------------------------------------------- Query-Hilfen

export const MAX_LIMIT = 100
export const DEFAULT_LIMIT = 20

export function ganzzahl(wert: string | null, standard: number, min: number, max: number): number {
  const n = Number(wert)
  if (!Number.isFinite(n)) return standard
  return Math.min(Math.max(Math.trunc(n), min), max)
}

/** Zeilen, die im Papierkorb liegen, verlassen die API nie. */
export function ohneGeloeschte<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter((r) => r.geloescht_am === null || r.geloescht_am === undefined)
}

/**
 * Reduziert eine DB-Zeile auf die freigegebenen Felder. Nicht vorhandene
 * Spalten werden übersprungen statt als null ausgegeben — so ist an der
 * Antwort erkennbar, was die Datenbank wirklich hergibt.
 */
export function nurFelder<T extends Record<string, unknown>>(
  row: T,
  felder: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of felder) {
    if (f in row) out[f] = row[f]
  }
  return out
}
