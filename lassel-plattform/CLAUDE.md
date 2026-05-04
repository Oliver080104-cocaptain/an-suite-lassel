@AGENTS.md

## Monitoring Status (Stand 2026-05-04)

- `src/lib/monitoring.ts` live (project_slug: `lassel`, ingest:
  `https://cc-monitoring.vercel.app/api/ingest`)
- Top 5 kritische Stellen instrumentiert — Commit `1f13904`
- 9 Warnings instrumentiert — Commit `1808853`
- Noch offen (Runde 3): 9 Errors + 5 Info-Stellen

### Heartbeat

- `/api/heartbeat-ping` live (Bearer `CRON_SECRET`)
- Vercel Cron `*/5 * * * *` in `vercel.json` aktiv

## Offene TODOs

- [ ] Monitoring Runde 3: Errors + Info einbauen (9 + 5 Stellen)
- [ ] Lieferscheinnummer Race Condition fix (DB-Constraint statt
      Frontend-Count in `api/webhooks/delivery-note`)
- [ ] Webhook-Invoice Schema-Drift Retry (analog zu
      `upsertAngebotSafe` im Offer-Webhook)
- [ ] Tourenplaner Ticket-Sync silent fix
      (`syncPositionsToTicket` in `lieferscheine/[id]/page.tsx` —
      derzeit nur `console.error`, User merkt Sync-Fail nicht)
