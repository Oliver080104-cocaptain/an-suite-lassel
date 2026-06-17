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

## Letzte Session (Stand 2026-06-17)

Drei Fixes, alle nach `main` gepusht (Vercel deployt auto):

1. **kunde.name Fallback-Kette** — Commit `cb01d6b`. Webhooks blockten mit
   HTTP 400, wenn Zoho bei HV-Objekten kein `kunde.name` schickte. Neuer Helper
   `src/lib/webhook-kunde.ts` (`resolveKundeName`): `kunde.name → hausverwaltungName
   → accountName → kundeGasseName → objektAdresse.gasse → 400 als Notbremse`.
   `ansprechpartner` = interne Lassel-MitarbeiterIn, wird NIE als Kunde genutzt.
   Eingebaut in alle 4 Webhooks (offer/invoice/sammelrechnung/delivery-note).

2. **E-Mail-Anhänge im Vorschau-Modal** — Commit `c48c25f`. Datei-Input war
   reine Deko. Jetzt: Direkt-Upload aus dem Browser in public Bucket
   `email-anhaenge` (umgeht Vercel-Body-Limit, Muster wie `ParksperreModal`),
   URLs gehen top-level als `attachments[]` ins Webhook-Payload. Migration 022
   legt den Bucket an. ⚠️ ZWEI Schritte noch offen (siehe TODOs) — sonst kommt
   der Anhang nicht beim Empfänger an.

3. **Mitarbeiter-Verwaltung in Analytics entfernt** — Commit `4c91ddc`. Der
   Lösch-Button setzte `aktiv=false` → da `mitarbeiter` (inkl. `aktiv`) mit dem
   Tourenplaner geteilt ist, verschwanden Leute aus BEIDEN Apps. Abschnitt +
   add/delete/cleanup-Mutations komplett raus. Performance-Tabelle (nur Anzeige)
   bleibt.

## Offene TODOs

- [ ] **Migration 022 in Supabase SQL-Editor ausführen** (`email-anhaenge`-Bucket)
      — bis dahin Fehler "Storage-Bucket fehlt" beim Senden mit Anhang.
- [ ] **n8n-Node "Bilder extrahieren" auf URL-Download umstellen** (email-versand-
      Flow Angebot+Rechnung): liest noch `body.email.attachments` + Base64; muss
      `body.attachments[].url` per `this.helpers.httpRequest` laden. Fertiger
      Code-Snippet liegt im Chatverlauf 2026-06-17.
- [ ] Monitoring Runde 3: Errors + Info einbauen (9 + 5 Stellen)
- [ ] Lieferscheinnummer Race Condition fix (DB-Constraint statt
      Frontend-Count in `api/webhooks/delivery-note`)
- [ ] Webhook-Invoice Schema-Drift Retry (analog zu
      `upsertAngebotSafe` im Offer-Webhook)
- [ ] Tourenplaner Ticket-Sync silent fix
      (`syncPositionsToTicket` in `lieferscheine/[id]/page.tsx` —
      derzeit nur `console.error`, User merkt Sync-Fail nicht)
