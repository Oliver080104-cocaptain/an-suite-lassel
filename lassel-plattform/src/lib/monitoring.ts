/**
 * Monitoring-Integration für Lassel AN-Suite.
 *
 * logEvent() darf die App NIE crashen oder werfen — daher ist alles
 * defensiv in try/catch gehalten. In Development wird nur in die Konsole
 * geloggt; in Prod geht der Event an cc-monitoring.
 *
 * Performance-Hinweis: in heißen Pfaden lieber fire-and-forget aufrufen
 * (`logEvent(...).catch(() => {})` ohne await) statt das Request- oder
 * Mutation-Result blockieren zu lassen.
 */

type MonitoringType = 'info' | 'warning' | 'error' | 'critical'

const MONITORING_INGEST_URL = 'https://cc-monitoring.vercel.app/api/ingest'
const MONITORING_PROJECT_SLUG = 'lassel'
const MONITORING_API_KEY = 'cc_0e7f66e8656b498d827e7406d304cfc3'

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
  try {
    await fetch(MONITORING_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_slug: MONITORING_PROJECT_SLUG,
        api_key: MONITORING_API_KEY,
        type,
        source,
        flow: source,
        message,
        details: {
          ...(details || {}),
          timestamp: new Date().toISOString(),
        },
      }),
    })
  } catch {
    // Monitoring darf App NIEMALS crashen
  }
}
