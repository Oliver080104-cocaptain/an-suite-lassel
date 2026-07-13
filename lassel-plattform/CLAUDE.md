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

## Session 2026-07-13 — Audit + Steuer/RC/Fail-silent/Secret/Analytics-Fixes

### Umfassendes internes Audit (ohne n8n-Flows)
Multi-Agent-Audit: **114 verifizierte Findings** (18 high / 42 medium / 47 low / 7 info),
4 systemische Wurzelursachen:
1. `|| default` verfälscht legitime 0-Werte (0% USt→20%, 0% Provision→10%, Zahlungsziel 0→30)
2. Reverse-Charge durchgängig falsch (Brutto = Netto×1,2 trotz 0%-Ausweis)
3. Fail-silent (DB-/Webhook-Fehler nur `console.error`, User sieht „Erfolg")
4. Keine Auth + Anon-Key + „Allow-all"-RLS (öffentlicher Voll-Lese/Schreibzugriff)

Volle Findings-Liste: Memory `project_internal_audit_2026-07-13`.

### Gefixt in dieser Session (committed)
- **Neue `src/lib/money.ts`** — `num(v, fallback)` fällt NUR bei nicht-endlichem Wert auf
  Default zurück (→ `0` bleibt `0`, behebt Wurzelursache 1 flächendeckend), dazu `round2()`,
  `computeTotals()` (Reverse-Charge-bewusst, gemischte Sätze) und `STANDARD_MWST = 20`.
  Rein funktional, mit 11/11 Node-Sanity-Checks abgesichert.
- **D1/D2/D3 über ALLE Belegtypen**: Webhooks (invoice/sammelrechnung/offer/product/
  vermittler), OfferSummary (Default **19→20** + saubere RC-Zeile), Offer/InvoicePositionsTable,
  produkte/page, CurrencyDisplay (NaN-Guard), OfferListItem, PDF-Routen angebot+rechnung,
  angebote/[id] (`totals`-Memo RC-bewusst + „Rechnung erzeugen" nutzt Positions-USt-Sätze
  statt pauschal 20 %), rechnungen/[id] (**reverse_charge NEU durchgereicht**: default/load/
  totals/persist/storno + Summary-Prop; Zahlungsziel-0). Positions-`gesamtpreis` jetzt MIT
  Rabatt (Zeilensumme = Beleg-Netto).
- **F1 Invoice-Dedup**: filtert nach `rechnungstyp` → normale Rechnung überschreibt keine
  Sammelrechnung desselben Tickets mehr.
- **R1 Fail-silent E-Mail** (EmailVorschauModal): `res.ok`-Prüfung, Status ERST nach
  bestätigtem Versand, Empfänger-Pflicht. ⚠️ `res.ok` = n8n hat Trigger angenommen, NICHT
  = Mail zugestellt (n8n versendet async). **Ausgehende Payload-Struktur an n8n unverändert.**
- **Secret-Leak**: Monitoring-Key raus aus dem Client-Bundle → Client loggt über neue Route
  `/api/monitoring`; Key nur noch aus `process.env.MONITORING_API_KEY`.
- **Analytics P1** (`analytics/page.tsx`): las durchgängig nicht existierende camelCase-Spalten
  (`datum`/`summeBrutto`/`faelligAm`/`vermittlerId`/`erstelltDurch`) → dauerhaft 0 €. Jetzt
  korrekt via `getDatum()` (rechnungsdatum/angebotsdatum), `brutto_gesamt`, `faellig_bis`,
  `vermittler_id`, `erstellt_von` (Text-Name).

Verifiziert: `tsc --noEmit` grün.

### ⚠️ Deploy-Action nötig
- **`MONITORING_API_KEY` in den Vercel-Env-Variablen setzen** (war vorher hardcoded, jetzt
  aus Env) — sonst stoppt das Monitoring in Prod still. Wert steht in lokaler `.env.local`.

### Bewusst NICHT gemacht (offene High-Cluster, nächste Kandidaten)
- **Echte Auth + restriktive RLS** — wichtigste offene Baustelle; braucht Login-Flow +
  Provider-Entscheidung (würde die App sonst komplett aussperren).
- **Belegnummern atomar (D4)**: delivery-note `count+1` (Kollision nach Löschung, nutzt zudem
  `LI-` statt `LS-`); `generateInvoiceNumber` ignoriert Rechnungstyp; alle count-basiert.
- **buildPosData Multiline-Verlust (G1)** `rechnungen/[id]:439` (mehrzeilige Beschreibung).
- **Feld-Fotos/erledigt-Flags per Array-Index (H2)** `lieferscheine/[id]:336-353`.
- Kein reverse_charge-UI-Toggle in rechnungen/[id] (nur Vererbung aus Angebot).
- CreateInvoiceDialog `netto*1.2` (Preview, low); Analytics-PIN `1234` (low); Cashflow-
  Bucket-Semantik inkonsistent (medium).

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
