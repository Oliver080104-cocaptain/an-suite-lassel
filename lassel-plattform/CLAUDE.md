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

## Session 2026-07-22 — E-Mail-Versand raus aus n8n, rein in Microsoft Graph

### ⚠️ AKTUELL AKTIV: Modus "n8n" — es hat sich für die Anwender NICHTS geändert
`EMAIL_VERSAND_MODUS` steuert den Versandweg, Default ist **`n8n`**:

| Wert | Verhalten |
|---|---|
| `n8n` (Default) | `/api/email/senden` ist ein dünner Proxy und stößt die **bestehenden, unveränderten** n8n-Flows mit exakt dem bisherigen Payload an (inkl. `email`-Block und `attachments[]`). n8n versendet und legt in Zoho ab. |
| `graph` | Die Plattform versendet selbst über Microsoft 365 und stößt danach den **reduzierten** Zoho-Flow an. |

Umstellen: `EMAIL_VERSAND_MODUS=graph` in Vercel setzen, sobald die `MS_GRAPH_*`-Werte
hinterlegt sind. Zurück geht es genauso schnell — der n8n-Pfad bleibt im Code.
Einzige inhaltliche Abweichung im n8n-Modus: `nachrichtHtml` wird HTML-escaped
(n8n setzt den Text roh ins Markup, ein `<` aus dem KI-Text hat die Mail bisher
zerlegt). Für Text ohne Sonderzeichen ist das Ergebnis identisch.


**Problem:** Der n8n-Flow hat PDF und Skizzen nicht zuverlässig mitgeschickt.
Drei parallele Zweige wurden per `Merge`-nach-Position zusammengeführt — kam
einer zu spät oder leer, ging die Mail ohne Anhang raus. Der Node „Bilder
extrahieren" las außerdem noch `body.email.attachments` (Base64), während die
App seit `c48c25f` `body.attachments[].url` schickt. Und `res.ok` vom Webhook
hieß nur „Trigger angenommen", nicht „mit Anhang zugestellt".

**Neu:** Versand läuft synchron in der Plattform.

- **`src/lib/graph-mail.ts`** — Graph-Client (plain fetch, kein SDK).
  Client-Credentials mit Token-Cache im Modul-Scope (`expires_in − 300 s`),
  429-/5xx-Retry mit `Retry-After`. Zwei Versandwege:
  `sendMail` inline bis 2,5 MB Rohanhänge, darüber Entwurf → `createUploadSession`
  → Chunks à 3,75 MB → `/send`, mit Draft-Cleanup im Fehlerfall.
  Graph-Fehlercodes werden in verständliche deutsche Meldungen übersetzt.
- **`src/lib/zip.ts`** — ZIP-Writer ohne Dependency (Methode „stored"; JPG/PNG/PDF
  komprimieren ohnehin nicht). UTF-8-Flag für Umlaut-Dateinamen, Dubletten-
  Entdopplung, Pfad-Abflachung. Ersetzt den n8n-Compression-Node, Archivname
  bleibt `Skizzen.zip`.
- **`src/app/api/email/senden/route.ts`** — PDF von `/api/pdf/{typ}/{id}` holen
  (Retry + `%PDF`-Signaturprüfung, weil die Route Fehler als Text-Body liefert),
  Anhänge aus dem Bucket nachladen (nur Supabase-Host erlaubt → kein offener
  Proxy), zippen, senden. `runtime='nodejs'`, `maxDuration=60` in der Datei —
  `vercel.json` deckt nur `/api/pdf/**` ab.
- **`EmailVorschauModal`** ruft jetzt `/api/email/senden` statt der n8n-Webhooks.
  Status-Update weiterhin ERST nach bestätigtem Versand. KI-Text wird jetzt
  HTML-escaped (vorher ging er roh ins Markup).
- **`handleSendOffer` in `angebote/[id]` entfernt** — toter Code ohne Aufrufer,
  der aber den Mail-Webhook `ab34322b` mit Payload ohne `email`-Block feuerte.
- **`n8n/angebot-zoho-ablage.reduziert.json`** + `n8n/README.md` — der auf den
  WorkDrive-Upload reduzierte Flow, Webhook-URL unverändert.

Verifiziert: `tsc --noEmit` grün, `next build` grün, ZIP gegen `Expand-Archive`
getestet, keine neuen Lint-Findings (angebote/[id] sogar 89→87 Errors).

### ⚠️ Deploy-Action nötig
1. **Azure-App-Registrierung** anlegen, Anwendungsberechtigungen `Mail.Send`
   **und** `Mail.ReadWrite`, Admin-Consent erteilen. PowerShell zum Einschränken
   auf `office@hoehenarbeiten-lassel.at` steht im Kopf von `src/lib/graph-mail.ts`.
2. **Vercel-Env:** `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`,
   `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_SENDER`.
3. **Migration 022 ausführen** (`email-anhaenge`-Bucket) — steht seit 2026-06-17 offen.
4. **Reduzierten n8n-Flow importieren**, danach `N8N_ZOHO_WEBHOOK_ANGEBOT` setzen
   (siehe `n8n/README.md`). Beide Zoho-Webhook-Variablen sind absichtlich leer
   vorbelegt — feuert die Plattform einen Flow, dessen Mail-Nodes noch aktiv
   sind, bekommt der Kunde den Beleg doppelt.
5. **Rechnungs-Flow `/webhook/rechnung-versenden` genauso reduzieren**, erst
   danach `N8N_ZOHO_WEBHOOK_RECHNUNG` setzen.

### Härtung nach adversarialem Review
Ein Finder-/Verifier-Panel über die neuen Dateien brachte u.a. diese echten
Befunde, alle behoben:
- **ZIP-Entdopplung kollidierte mit sich selbst**: bei „Skizze.jpg", „Skizze.jpg",
  „Skizze (2).jpg" entstanden zwei gleichnamige Einträge — beim Empfänger bricht
  `Expand-Archive` ab bzw. eine Datei geht verloren. `uniqueNames` merkt sich
  jetzt die VERGEBENEN Namen. Dazu Längenbegrenzung auf 200 Byte (vorher hätte
  ein 70.000-Zeichen-Name das Archiv strukturell zerstört, weil das
  Namenslängen-Feld nur 16 Bit hat). Alle Fälle gegen `Expand-Archive` getestet.
- **5xx-Retry auf `/sendMail` und `/messages/{id}/send` entfernt**: beide sind
  nicht idempotent, ein 503 hinter dem Gateway kann bereits zugestellt bedeuten
  → Retry hätte die Mail doppelt geschickt. 429 wird weiter wiederholt, Chunk-
  PUTs auch (identischer Byte-Bereich, damit idempotent).
- **401 verwirft jetzt den Token-Cache** — vorher blieb eine warme Instanz bis
  zum Token-Ablauf blockiert.
- **Zeitbudget** deckt jetzt den ganzen Request ab, nicht nur die Vorbereitung.
  Der Zoho-Aufruf nach dem Versand wird übersprungen, wenn keine Zeit mehr
  bleibt — sonst hätte ein Abschneiden der Function eine bereits versendete
  Mail als Fehler dargestellt und der Sachbearbeiter hätte erneut gesendet.
- **Anhang-Allowlist** war fail-open und nur auf den Host beschränkt. Jetzt
  Pflicht-Konfiguration plus Pfadprüfung auf `/storage/v1/object/public/email-anhaenge/`
  — vorher wäre `…supabase.co/rest/v1/kunden?select=*` ein gültiger „Anhang"
  gewesen, also die Kundentabelle per Mail nach außen.
- **Beleg-Prüfung + Origin-Check** vor dem Versand, `badRequest` loggt jetzt.
- **Kein PII mehr ans externe Monitoring** (Empfängeradresse und Betreff raus).

### Bewusst NICHT gemacht
- **Echte Authentifizierung vor `/api/email/senden`.** Die Route ist wie alle
  anderen in dieser App unauthentifiziert; Origin-Check und Beleg-Prüfung sind
  Plausibilitätsschranken, kein Zugriffsschutz. Wer die URL kennt und eine
  gültige Beleg-ID hat, kann Mails über das Firmenpostfach auslösen. Das ist
  dieselbe Lücke wie beim bisherigen offenen n8n-Webhook, aber sie wandert
  damit in die Plattform — der offene Punkt „echte Auth + RLS" aus dem Audit
  2026-07-13 wird dadurch dringlicher.
- **Parkraumsperre-Mail** (`/api/parksperre-senden` → n8n) läuft weiter über n8n.
  Gleiches Anhang-Risiko; Umstellung auf `sendMail()` wären ~20 Zeilen.
- PDF wird weiterhin per HTTP von der eigenen Route geholt statt den HTML-Builder
  zu extrahieren. Spart einen großen Refactor der beiden PDF-Routen, kostet
  einen Netzwerk-Hop. Funktioniert nur, weil `/api/pdf/**` öffentlich ist —
  bei einer späteren Auth-Härtung muss das mitwandern.

## Session 2026-07-22 (3) — Bestandsbugs behoben

Sieben verifizierte Bugs, alle mit Wirkung auf echte Geschäftsdaten.

**1. Teilfaktura blähte den Rechnungsbetrag auf** (`rechnungen/[id]:totals`).
Bei Anzahlung/Teilrechnung trägt die Rechnung die Abschlagszeile PLUS alle
Angebotspositionen zum vollen Preis — die stehen nur als Referenz drauf. `totals`
summierte stumpf über alle Positionen, und der Autosave schrieb das eine Sekunde
nach dem Öffnen in `netto_gesamt/mwst_gesamt/brutto_gesamt`. Eine Anzahlung über
3.000 € wurde damit allein durchs Ansehen zu 15.600 € brutto. Jetzt ist
`teilbetrag_netto` maßgeblich; 7/7 Testfälle inkl. Reverse Charge und gemischter
Steuersätze geprüft, normale Rechnungen rechnen unverändert.

**2. Mehrzeilige Positionsbeschreibungen gingen verloren** (`rechnungen/[id]:buildPosData`).
Die DB-Spalte trägt `"Produktname\nLangtext"`; beim Speichern schrieb die Rechnung
nur `p.produktName`. Der Langtext war eine Sekunde nach dem Öffnen aus Datenbank
und PDF verschwunden. Angebot und Lieferschein machten es bereits richtig — die
Zusammensetzung ist jetzt in allen drei Fällen gleich.

**3. Phantom-Save beim Öffnen jeder Rechnung** (`rechnungen/[id]`, faelligAm-Effect).
Der Effect erzeugte bei jedem Laden ein neues `invoice`-Objekt, auch wenn sich
nichts änderte. Das hebelte den `justInitialized`-Schutz aus und war der Auslöser
für 1 und 2. Gibt jetzt dieselbe Referenz zurück, wenn der Wert stimmt.

**4. Storno-Rechnung war nicht speicherbar** (`rechnungen/[id]:774`).
Geschrieben wurde `storno_von_rechnung_id` (UUID) — eine Spalte, die in keiner
Migration existiert. Gelesen und gespeichert wird `storno_von` (Belegnummer).
Der Insert schlug fehl, und selbst wenn er durchging, blockierte die
Storno-Pflichtprüfung jedes weitere Speichern.

**5. Teilfaktura-Felder wurden nie geladen** (`rechnungen/[id]`).
`teilbetrag_netto`, `teilbetrag_brutto`, `ist_schlussrechnung` und
`bereits_fakturiert_netto` fehlten im Ladepfad und in `buildRechnungData`. Eine
aus dem Angebot erzeugte Anzahlung ließ sich deshalb nicht speichern
("Teilbetrag > 0 erforderlich"). Jetzt geladen und persistiert.

**6. Anzahlung zu Reverse-Charge-Angebot wies 20 % USt aus** (`angebote/[id]:843`).
Die Abschlagszeile hatte hart `mwst_satz: 20`. Nutzt jetzt `effRate`, das direkt
darüber bereits Reverse-Charge-bewusst berechnet wird.

**7. Vier Webhooks legten bei Duplikaten unbegrenzt neue Datensätze an.**
`webhooks/offer`, `sammelrechnung`, `product` und `vermittler` suchten den
bestehenden Datensatz per `.maybeSingle()` ohne `.limit(1)`. Existiert bereits ein
Duplikat, wirft PostgREST, `existing` ist undefined, der Code läuft in den
INSERT-Zweig — und legt bei **jedem** weiteren Aufruf einen weiteren Datensatz an.
`webhooks/invoice` hatte den Fix samt Kommentar schon, die anderen vier nicht.

Nebenbei: `emailAn` im Rechnungs-Versandmodal las `invoice.kunde_email`, der State
ist aber camelCase — der Fallback griff nie.

Verifiziert: `tsc`, `eslint` (beide Detailseiten haben jetzt WENIGER Findings als
vorher), `next build`, plus 7 Rechenfälle für die Teilfaktura-Summen.

### Nicht angefasst, bewusst
- **`linkedInvoices` zählt Rechnungs-Entwürfe als fakturiert** (`angebote/[id]:131-146`).
  Ein Entwurf setzt das Angebot sofort auf „vollständig fakturiert" und kürzt über
  `bereits_fakturiert_netto` eine spätere Schlussrechnung. Ob ein Entwurf zählen
  soll, ist eine fachliche Entscheidung — bitte klären.
- **`visibilitychange` speichert bedingungslos** (`rechnungen/[id]`, `lieferscheine/[id]`).
  Jeder Tab-Wechsel schreibt den kompletten Beleg zurück. Nach den Fixes oben
  nicht mehr destruktiv, aber unnötig. Sauber wäre ein Dirty-Guard.

## Session 2026-07-22 (2) — Lese-API v1 + MCP-Server

Volle Doku: `docs/api-v1.md`.

- **`/api/v1/**`** (`src/app/api/v1/[...pfad]/route.ts`) — ein Catch-all-Handler
  für alle Endpunkte, damit Auth, Limits und Fehlerformat garantiert überall
  gleich sind. Bearer-Token aus `API_TOKEN_READ`, fail-closed (503 ohne Token).
  Endpunkte: health, angebote/rechnungen/lieferscheine (Liste + Detail +
  pdf-url), produkte, stammdaten, kennzahlen, suche.
- **`/api/mcp`** (`src/app/api/mcp/route.ts`) — MCP-Server, Streamable HTTP,
  stateless, 7 Tools. **Handgeschrieben statt `mcp-handler`**: das Paket pinnt
  zod ^3 (Projekt hat ^4.3.6), und der SDK-Transport erwartet Node-req/res statt
  Web-Request. Sind ~150 Zeilen ohne Dependency-Risiko.
- **`src/lib/api-core.ts`** — Auth (timing-safe), Fehlerformat, Feld-Whitelist.
- **`src/lib/api-belege.ts`** — Feld-Freigaben und Lesezugriffe je Belegart,
  inkl. `hinweise[]` zu Reverse Charge / Teilfaktura / Schlussrechnung.

**Drift-fest gebaut:** die API selektiert `*` und filtert die Ausgabefelder in
JavaScript. Eine Spalte, die es in Prod nicht gibt, fehlt dann in der Antwort,
statt die Abfrage mit 400 zu killen. Ebenso läuft der `geloescht_am`-Filter in
JS — `.is('geloescht_am', null)` würde auf Tabellen ohne die Spalte scheitern.

**Bewusst nur lesend.** Gründe im Code dokumentiert: Autosave überschreibt jeden
API-Write nach ~1 s lautlos; Belegnummern sind nicht atomar; Schema-Drift; die
Teilfaktura-Summenlogik. `mitarbeiter` wird nur mit `id/name/aktiv` ausgeliefert
(shared mit Tourenplaner), `tickets` gar nicht.

Verifiziert gegen den laufenden Dev-Server mit echten Daten: MCP-Handshake
(initialize/tools/list/tools/call/ping, 401 mit `WWW-Authenticate`, 202 auf
Notifications, 405 auf GET, 400 bei unbekannter Protokollversion), alle sieben
Tools, Feld-Whitelists, Fehlerpfade.

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
- [x] ~~n8n-Node "Bilder extrahieren" auf URL-Download umstellen~~ — hinfällig,
      der Mailversand läuft seit 2026-07-22 nicht mehr über n8n.
- [ ] **Rechnungs-Flow `/webhook/rechnung-versenden` reduzieren** (Mail-Nodes raus),
      danach `N8N_ZOHO_WEBHOOK_RECHNUNG` in Vercel setzen — siehe `n8n/README.md`.
- [ ] Monitoring Runde 3: Errors + Info einbauen (9 + 5 Stellen)
- [ ] Lieferscheinnummer Race Condition fix (DB-Constraint statt
      Frontend-Count in `api/webhooks/delivery-note`)
- [ ] Webhook-Invoice Schema-Drift Retry (analog zu
      `upsertAngebotSafe` im Offer-Webhook)
- [ ] Tourenplaner Ticket-Sync silent fix
      (`syncPositionsToTicket` in `lieferscheine/[id]/page.tsx` —
      derzeit nur `console.error`, User merkt Sync-Fail nicht)
