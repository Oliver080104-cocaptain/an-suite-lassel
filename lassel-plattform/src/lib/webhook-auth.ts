import { logEvent } from '@/lib/monitoring'

export function validateWebhookSecret(req: Request): boolean {
  const secret = req.headers.get('x-webhook-secret')
  const expected = process.env.WEBHOOK_SECRET
  if (!expected) {
    logEvent('critical', 'webhook-auth',
      'CRITICAL: WEBHOOK_SECRET ENV-Variable fehlt — alle eingehenden Webhooks werden 401 abgelehnt',
      { secret_defined: !!process.env.WEBHOOK_SECRET }
    ).catch(() => {})
    return false
  }
  return secret === expected
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
