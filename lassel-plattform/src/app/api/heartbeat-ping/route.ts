import { logEvent } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  await logEvent('info', 'heartbeat', 'Lassel AN-Suite läuft normal')
  return Response.json({ ok: true, timestamp: new Date().toISOString() })
}
