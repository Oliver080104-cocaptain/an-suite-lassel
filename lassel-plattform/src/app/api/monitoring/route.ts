import { NextRequest, NextResponse } from 'next/server'
import { forwardToMonitoring, type MonitoringEvent } from '@/lib/monitoring'

/**
 * Server-Proxy für Client-seitiges Monitoring.
 *
 * Grund: der cc-monitoring Ingest-API-Key ist geheim und darf nicht im
 * Browser-Bundle stehen. Der Browser POSTet den Event hierher (same-origin),
 * diese Route hängt server-seitig den Key an und leitet weiter.
 * Fällt bewusst nie hart aus — Monitoring darf die App nie stören.
 */
const VALID_TYPES = new Set(['info', 'warning', 'error', 'critical'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body.type !== 'string' || !VALID_TYPES.has(body.type) || typeof body.source !== 'string') {
      return NextResponse.json({ ok: false, error: 'invalid event' }, { status: 400 })
    }
    const event: MonitoringEvent = {
      type: body.type,
      source: String(body.source).slice(0, 200),
      message: String(body.message ?? '').slice(0, 2000),
      details: body.details && typeof body.details === 'object' ? body.details : undefined,
    }
    await forwardToMonitoring(event)
    return NextResponse.json({ ok: true })
  } catch {
    // Nie hart failen lassen — der Client feuert fire-and-forget.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
