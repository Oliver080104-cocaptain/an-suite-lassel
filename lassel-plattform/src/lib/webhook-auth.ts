export function validateWebhookSecret(req: Request): boolean {
  const secret = req.headers.get('x-webhook-secret')
  return secret === process.env.WEBHOOK_SECRET
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
