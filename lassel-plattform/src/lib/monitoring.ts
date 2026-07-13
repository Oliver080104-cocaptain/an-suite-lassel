/**
 * Monitoring-Integration für Lassel AN-Suite.
 *
 * logEvent() darf die App NIE crashen oder werfen — daher ist alles
 * defensiv in try/catch gehalten. In Development wird nur in die Konsole
 * geloggt; in Prod geht der Event an cc-monitoring.
 *
 * SICHERHEIT (Audit 2026-07-13): Der Ingest-API-Key ist ein Geheimnis und darf
 * NICHT im Client-Bundle landen. Da diese Datei auch aus 'use client'-Komponenten
 * importiert wird, läuft der Versand vom Browser über die serverseitige Route
 * /api/monitoring (die den Key aus der Server-Env liest). Server-seitige Aufrufer
 * (Webhooks, API-Routen) senden direkt. Der Key kommt ausschließlich aus
 * process.env.MONITORING_API_KEY (nicht NEXT_PUBLIC → nie im Browser sichtbar).
 *
 * Performance-Hinweis: in heißen Pfaden lieber fire-and-forget aufrufen
 * (`logEvent(...).catch(() => {})` ohne await) statt das Request- oder
 * Mutation-Result blockieren zu lassen.
 */

type MonitoringType = 'info' | 'warning' | 'error' | 'critical'

const MONITORING_INGEST_URL = 'https://cc-monitoring.vercel.app/api/ingest'
const MONITORING_PROJECT_SLUG = process.env.MONITORING_PROJECT_SLUG || 'lassel'

export interface MonitoringEvent {
  type: MonitoringType
  source: string
  message: string
  details?: Record<string, unknown>
}

/**
 * SERVER-ONLY: sendet den Event direkt an cc-monitoring inklusive geheimem
 * API-Key aus der Server-Env. Wird von serverseitigen logEvent-Aufrufen sowie
 * von der Proxy-Route /api/monitoring genutzt. Darf nie werfen.
 */
export async function forwardToMonitoring(event: MonitoringEvent): Promise<void> {
  const apiKey = process.env.MONITORING_API_KEY
  if (!apiKey) return
  try {
    await fetch(MONITORING_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_slug: MONITORING_PROJECT_SLUG,
        api_key: apiKey,
        type: event.type,
        source: event.source,
        flow: event.source,
        message: event.message,
        details: {
          ...(event.details || {}),
          timestamp: new Date().toISOString(),
        },
      }),
    })
  } catch {
    // Monitoring darf App NIEMALS crashen
  }
}

export async function logEvent(
  type: MonitoringType,
  source: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[MONITORING] ${type.toUpperCase()} | ${source} | ${message}`, details)
    return
  }
  const event: MonitoringEvent = { type, source, message, details }
  try {
    if (typeof window !== 'undefined') {
      // CLIENT: über die eigene API-Route senden, damit der geheime Ingest-Key
      // NICHT ins Browser-Bundle gelangt.
      await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      })
    } else {
      // SERVER: direkt an cc-monitoring.
      await forwardToMonitoring(event)
    }
  } catch {
    // Monitoring darf App NIEMALS crashen
  }
}
