@AGENTS.md

## Stand — hier zuerst lesen (2026-07-22)

**Was live ist und wie es geschaltet ist:**

| Bereich | Zustand | Schalter / Voraussetzung |
|---|---|---|
| E-Mail-Versand Angebot/Rechnung | läuft über **n8n** wie bisher | `EMAIL_VERSAND_MODUS` (Default `n8n`, alternativ `graph`) |
| Versand über Microsoft Graph | fertig, **nicht aktiv** | `MS_GRAPH_*` setzen, dann Modus auf `graph` |
| Lese-API `/api/v1/**` | fertig, **inaktiv ohne Token** | `API_TOKEN_READ` |
| MCP-Server `/api/mcp` | fertig, 9 Tools | derselbe Token, als Custom Connector eintragen |
| Entwurfsraum (Schreibzugriff) | fertig, unter „Sonstiges → Entwürfe" | `API_TOKEN_WRITE` + `SUPABASE_SERVICE_ROLE_KEY` |
| Belegnummern | atomar über `naechste_belegnummer()` | Migrationen 023 + 025, eingespielt |
| Zoho-Ablage nach Graph-Versand | **abgeschaltet** | `N8N_ZOHO_WEBHOOK_ANGEBOT` / `_RECHNUNG` |

**Drei Fallen, die man kennen muss, bevor man hier etwas ändert:**

1. **Die Detailseiten sind eingefrorene Snapshots.** `angebote/[id]`, `rechnungen/[id]`
   und `lieferscheine/[id]` kopieren den Beleg EINMAL in den React-State
   (Init-Guard-Refs, nie zurückgesetzt) und schreiben bei jedem Autosave den
   KOMPLETTEN Datensatz plus alle Positionen zurück — beim Angebot als
   delete-then-insert. Wer nebenher schreibt, verliert. Deshalb schreibt die API
   nicht direkt, sondern über den Entwurfsraum.
2. **Das Repo-Schema ist nicht die Wahrheit.** `supabase/schema.sql` und die
   Migrationen beschreiben nicht den Ist-Stand der Produktionsdatenbank; allein
   `rechnungen` hat rund 21 Spalten, die in keiner SQL-Datei stehen. Deshalb der
   Schema-Drift-Retry an fünf Stellen — und deshalb selektiert die API `*` und
   filtert die Ausgabefelder in JavaScript.
3. **Es gibt keine Authentifizierung.** RLS ist überall `Allow all`, der Anon-Key
   steht im Browser-Bundle. Jede Regel in einer Route ist damit eine Konvention,
   keine Grenze. Ausnahmen sind `beleg_entwuerfe` und `belegnummern_kreise`:
   RLS an, keine Policy, nur über Server-Routen mit Service-Role erreichbar.

**Was noch manuell zu tun ist:** siehe „Offene TODOs" ganz unten.

## Monitoring Status (Stand 2026-05-04)

- `src/lib/monitoring.ts` live (project_slug: `lassel`, ingest:
  `https://cc-monitoring.vercel.app/api/ingest`)
- Top 5 kritische Stellen instrumentiert — Commit `1f13904`
- 9 Warnings instrumentiert — Commit `1808853`
- Noch offen (Runde 3): 9 Errors + 5 Info-Stellen

### Heartbeat

- `/api/heartbeat-ping` live (Bearer `CRON_SECRET`)
- Vercel Cron `*/5 * * * *` in `vercel.json` aktiv

## Session 2026-07-22

Vier Blöcke, in dieser Reihenfolge entstanden: Versand-Umbau → Lese-API + MCP →
Bestandsbugs → Entwurfsraum. Commits `2b34949`, `ce0272d`, `fec1a98`, `6f88850`,
`211e70c`.

### Teil 1 — E-Mail-Versand raus aus n8n, rein in Microsoft Graph

#### ⚠️ AKTUELL AKTIV: Modus "n8n" — es hat sich für die Anwender NICHTS geändert
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

#### ⚠️ Deploy-Action nötig
1. **Azure-App-Registrierung** anlegen, Anwendungsberechtigungen `Mail.Send`
   **und** `Mail.ReadWrite`, Admin-Consent erteilen. PowerShell zum Einschränken
   auf `office@hoehenarbeiten-lassel.at` steht im Kopf von `src/lib/graph-mail.ts`.
2. **Vercel-Env:** `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`,
   `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_SENDER`.
3. ~~Migration 022~~ — am 2026-07-22 eingespielt, Bucket verifiziert.
4. **Reduzierten n8n-Flow importieren**, danach `N8N_ZOHO_WEBHOOK_ANGEBOT` setzen
   (siehe `n8n/README.md`). Beide Zoho-Webhook-Variablen sind absichtlich leer
   vorbelegt — feuert die Plattform einen Flow, dessen Mail-Nodes noch aktiv
   sind, bekommt der Kunde den Beleg doppelt.
5. **Rechnungs-Flow `/webhook/rechnung-versenden` genauso reduzieren**, erst
   danach `N8N_ZOHO_WEBHOOK_RECHNUNG` setzen.

#### Härtung nach adversarialem Review
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

#### Bewusst NICHT gemacht
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

### Teil 2 — Lese-API v1 + MCP-Server

Volle Doku: `docs/api-v1.md`.

- **`/api/v1/**`** (`src/app/api/v1/[...pfad]/route.ts`) — ein Catch-all-Handler
  für alle Endpunkte, damit Auth, Limits und Fehlerformat garantiert überall
  gleich sind. Bearer-Token aus `API_TOKEN_READ`, fail-closed (503 ohne Token).
  Endpunkte: health, angebote/rechnungen/lieferscheine (Liste + Detail +
  pdf-url), produkte, stammdaten, kennzahlen, suche.
- **`/api/mcp`** (`src/app/api/mcp/route.ts`) — MCP-Server, Streamable HTTP,
  stateless, 9 Tools (7 lesende, dazu `angebot_entwurf_anlegen` und
  `entwuerfe_auflisten` aus Teil 4). **Handgeschrieben statt `mcp-handler`**: das Paket pinnt
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

### Teil 3 — Bestandsbugs behoben

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

#### Nicht angefasst, bewusst
- **`visibilitychange` speichert bedingungslos** (`rechnungen/[id]`, `lieferscheine/[id]`).
  Jeder Tab-Wechsel schreibt den kompletten Beleg zurück. Nach den Fixes oben
  nicht mehr destruktiv, aber unnötig. Sauber wäre ein Dirty-Guard.

### Teil 4 — Entwurfsraum: Schreibzugriff für die API

Volle Doku: `docs/api-v1.md`. Der Agent kann jetzt Angebote **vorschlagen**;
ein Mensch macht daraus per Klick einen Beleg.

**Warum nicht direkt schreiben:** Die Detailseiten halten den Beleg als einmalig
eingefrorenen React-Snapshot (Init-Guards werden nie zurückgesetzt) und schreiben
bei jedem Autosave den kompletten Datensatz plus alle Positionen zurück — beim
Angebot als delete-then-insert. Ein API-Write wäre spurlos weg, sobald jemand den
Beleg offen hat. Eine Zeile in `beleg_entwuerfe` kann in keinem dieser Pfade
liegen, weil die Tabelle dort nicht vorkommt.

**Neu:**
- `supabase/migrations/023_belegnummern_kreise.sql` — atomare Nummernvergabe per
  `INSERT … ON CONFLICT DO UPDATE … RETURNING`, aus `MAX()` geseedet, mit Trigger
  der handgesetzte Nummern nachzieht. Die elf `COUNT+1`-Generatoren im UI bleiben
  unangetastet und laufen parallel weiter.
- `supabase/migrations/024_beleg_entwuerfe.sql` — Entwurfstabelle, **RLS ohne
  Policy**. Damit kommt der Anon-Key aus dem Browser-Bundle nicht heran; das ist
  der Unterschied zu allen anderen Tabellen mit ihrer „Allow all"-Policy.
- `src/lib/entwuerfe.ts` — zod-Validierung (strikt: unbekannte Felder → 422) und
  die Übernahme. Der Zustandswechsel läuft als bedingtes UPDATE mit `.select()`
  und geprüfter Zeilenzahl; ohne `.select()` liefert supabase-js bei null
  getroffenen Zeilen `error === null` und ein Konflikt sähe wie Erfolg aus.
  Schlägt etwas nach dem Anspruch fehl, wird der Entwurf wieder freigegeben.
- `src/lib/belegnummer.ts`, `src/app/api/entwuerfe/route.ts` (UI, tokenfrei,
  Herkunftsprüfung), `src/app/entwuerfe/page.tsx` (Freigabe-Oberfläche).
- MCP: `angebot_entwurf_anlegen`, `entwuerfe_auflisten`. Übernehmen und Verwerfen
  sind bewusst KEINE Tools.

**Bewusst nicht in der Übernahme:** keine n8n-Webhooks, keine Weiterleitung auf
die Detailseite (deren Öffnen startet den Autosave-Zyklus), kein `pdf_url`, kein
Status außer `entwurf`.

**Fachliche Festlegung (2026-07-22):** Ein Rechnungs-**Entwurf** zählt NICHT als
fakturiert. Die Regel steht jetzt an einer Stelle (`fakturierteRechnungen` in
`angebote/[id]`) statt wie vorher dreifach dupliziert: Stornos, stornierte
Rechnungen und Entwürfe sind ausgeschlossen. Vorher setzte ein Entwurf das
Angebot sofort auf „vollständig fakturiert" und kürzte über
`bereits_fakturiert_netto` dauerhaft eine spätere Schlussrechnung — bei einem
verworfenen Entwurf wurde damit zu wenig fakturiert.

**Nötig zum Aktivieren:** `SUPABASE_SERVICE_ROLE_KEY` und `API_TOKEN_WRITE`
setzen. Migrationen 023 + 024 sind seit 2026-07-22 eingespielt und verifiziert
(Zähler standen exakt auf AN 109 / RE 60 / LI 58, also den höchsten vergebenen
Nummern).

**Gegen die Produktivdatenbank durchgespielt:** Entwurf anlegen (Summen 810 /
162 / 972 korrekt), Anzeige über UI-Route und MCP-Tool, Verwerfen, und beide
Konfliktfälle (zweites Verwerfen sowie Übernehmen eines entschiedenen Entwurfs)
liefern 409 statt eines stillen Erfolgs. Testdatensatz wieder entfernt.
**Noch nicht durchgespielt: die Übernahme selbst** — sie legt ein echtes Angebot
mit Nummer an; dieser Schritt gehört einem Menschen im UI.

Verifiziert: 17 Validierungs- und Rechenfälle (Rabatt, Reverse Charge, gemischte
Sätze, untergeschobene Felder), 8 Routenprüfungen gegen den Dev-Server
(Token-Trennung, 422-Text, 403 bei fremdem Origin, MCP-Tool-Fehler statt Crash).
Die SQL-Migrationen konnten mangels lokaler Postgres-Instanz nicht ausgeführt
werden — sie sind idempotent, brauchen aber einen ersten Lauf unter Aufsicht.

### Teil 5 — Breite Fehlersuche: 59 bestätigte Funde, 5 davon behoben

Ein Finder-/Verifier-Panel über zehn Linsen (Geld, Persistenz, Folgebelege, PDF,
ein-/ausgehende Webhooks, UI-State, Löschen, Auswertungen, Lieferscheine) hat
69 Funde gemeldet; bei 59 haben **beide** unabhängigen Prüfer bestätigt.
Behoben wurden die fünf mit dem klarsten Schaden-/Aufwand-Verhältnis:

1. **PDFs schrieben hart „zzgl. Umsatzsteuer 20 %"** neben einen rate-genau
   gerechneten Betrag. Bei einer 10 %-Position stimmte der Satz nicht zum
   Betrag, bei gemischten Sätzen fehlte die getrennte Ausweisung ganz — nach
   § 11 UStG ein formal mangelhafter Beleg. Neu: `ustNachSaetzen()` in
   `money.ts`, beide PDF-Routen weisen je Satz eine Zeile aus. Weicht die
   Gruppensumme vom Kopfbetrag ab (Teilfaktura), wird eine Zeile mit dem
   effektiven Satz gedruckt statt zu lügen. 7 Rechenfälle geprüft, Quersumme
   stimmt jeweils mit `computeTotals` überein.
2. **Storno einer Anzahlung vervielfachte den Gutschriftsbetrag.**
   `handleStorno` kopierte ALLE Positionen negativ — auch die Angebotszeilen,
   die bei Teilfaktura nur als Referenz mitlaufen. Aus dem Storno einer
   3.600-€-Anzahlung wurde eine Gutschrift über 19.200 €. Derselbe
   Wurzelfehler wie in Teil 3; jetzt wird bei Anzahlung/Teilrechnung nur die
   Abschlagszeile storniert. Nebenbei: der Langtext bleibt erhalten.
3. **Schlussrechnungs-PDF zog stornierte, gelöschte und Entwurfs-Anzahlungen
   ab** — der Kunde bekam einen Restbetrag, der um eine nie fakturierte
   Anzahlung zu niedrig war. Jetzt dieselbe Regel wie `fakturierteRechnungen`.
4. **`produkt_id` wurde nie in den State geladen** (`angebote/[id]`). Der Fix
   aus Teil 3 (Feld in `buildPosData` aufnehmen) lief für jedes bereits
   gespeicherte Angebot ins Leere, weil delete-then-insert nur schreibt, was
   im State steht. Jetzt im Init-Effect ergänzt.
5. **Statusfilter der Angebotsliste nutzte `draft`** — der DB-Wert ist
   `entwurf`. Der häufigste Status war nicht filterbar; `offen`, `final` und
   `archiviert` fehlten ganz.

#### Nachtrag: die restlichen Funde wurden ebenfalls abgearbeitet
In fünf Blöcken, je ein Commit: `976e249` (eingehende Webhooks), `063ab86`
(Persistenz), `de96ed4` (PDF), `52e25d0` (Angebot), `47fbd29` (Papierkorb,
Analytics, Sonstiges) und ein Abschluss-Commit für die Einzelfunde.
Die Liste unten ist damit erledigt und dient nur noch als Historie.

<details>
<summary>Ursprüngliche Liste der offenen Funde</summary>

- **Stale-Cache in `savePositions`** (`rechnungen/[id]`, `lieferscheine/[id]`):
  neu hinzugefügte Positionen werden nach dem ersten Autosave nie wieder
  aktualisiert, weil gegen den nie invalidierten React-Query-Cache verglichen
  wird. Oberfläche zeigt 850 €, DB behält 0 €.
- **`bereits_fakturiert_netto` wird gespeichert, aber im PDF nie abgezogen** —
  der CreateInvoiceDialog sagt dem Anwender ausdrücklich das Gegenteil.
- **Anzahlungs-PDF: Positionsliste summiert sich nicht zum Summenblock**
  (die Referenzzeilen stehen mit vollem Preis drin).
- **`OfferListItem` „Rechnung"-Button** erzeugt eine 0-€-Rechnung ohne
  Kopfdaten — ein völlig anderer Beleg als der Dialog-Pfad.
- **PDF liest `company_settings`**, in die die Einstellungen-Seite nie
  schreibt → geänderte Bankdaten erreichen die Rechnung nie.
- **Webhooks verschlucken Positions-Insert-Fehler** (offer, invoice,
  sammelrechnung) → Beleg mit Summen, aber ohne Zeilen, n8n bekommt 200.
- **`delivery-note`-Webhook ist nicht idempotent** und speichert
  `zoho_ticket_id` nicht → jeder Aufruf ein neuer Lieferschein.
- **Ausgehende n8n-Aufrufe prüfen `res.ok` nicht** → „erfolgreich in Zoho
  abgelegt", obwohl der Flow tot ist.
- **Lieferschein wird ohne Nummer gespeichert**, Zoho bekommt trotzdem eine.
- **`syncPositionsToTicket` splittet den bereits gesplitteten State erneut**
  → Produktname im Tourenplaner-Ticket leer.
- **Fotos und Erledigt-Haken per Array-Index** → wandern beim Umsortieren.
- **Papierkorb: endgültiges Löschen meldet Erfolg, löscht nur die Positionen.**
- **UID verschwindet, sobald eine Hausinhabung eingetragen ist**
  (`adressblock.ts:45` setzt sie hart auf `''`, `uid_von_hi` liest niemand).
- **Storno-/Gutschrifts-PDF fordert zur Überweisung auf.**
- **Rabatte tauchen in keinem PDF auf** → Menge × Einzelpreis ≠ Gesamtpreis.
- **Analytics: offene Forderungen nur aus dem gewählten Jahr** → am 1. Januar
  fallen alle Altforderungen aus der Mahnübersicht.
- **`invalidateQueries(['invoices'])` trifft die Liste nicht**, die an
  `['rechnungen']` hängt → Listen bleiben bis zu 5 Minuten veraltet.
- **Query-Key-Kollisionen**: `['vermittler']`/`['mitarbeiter']` liegen unter
  demselben Schlüssel mit unterschiedlich gefilterten Abfragen.

</details>

### Teil 6 — Alle 59 Funde abgearbeitet

Fünf thematische Blöcke plus ein Abschluss-Commit. Die Muster, die dabei
mehrfach auftraten und beim Weiterbauen wichtig sind:

**1. `supabase-js` wirft nicht.** Es liefert `{ error }`. An sieben Stellen
wurde der Rückgabewert nicht ausgewertet, also lief immer der Erfolgspfad —
in den vier Beleg-Webhooks, im Papierkorb und im Cron-Cleanup. Folge jeweils:
ein halb geschriebener Zustand mit Erfolgsmeldung. **Jeden `delete()`,
`insert()` und `update()`-Rückgabewert prüfen.**

**2. Beim Löschen zuerst den Hauptdatensatz, dann die Positionen.** Umgekehrt
sind bei einem Fremdschlüssel-Konflikt die Positionen weg und der Beleg
bleibt. Beim Leeren des Papierkorbs außerdem Lieferscheine und Rechnungen vor
den Angeboten.

**3. Der React-Query-Cache ist kein Abbild der Datenbank.** `savePositions`
verglich gegen einen Snapshot, der nie invalidiert wird — eine während der
Sitzung angelegte Position fiel durch alle Filter. Jetzt führt ein Ref die
tatsächlichen DB-IDs mit.

**4. `produktName` und `beschreibung` liegen im State GETRENNT vor.** Die
DB-Spalte trägt `"Titel\nLangtext"`, der Ladepfad zerlegt sie. Wer danach
nochmal splittet, verliert den Titel — passiert an drei Stellen im
Lieferschein.

**5. Zuordnung über Inhalt, nie über den Array-Index.** Die Monteur-Fotos
hingen am Index und wanderten beim Umsortieren auf die falsche Leistung.

**6. Ein neuer Schreibpfad muss alle Kopffelder übernehmen.** Der
„Rechnung"-Button in der Angebotsliste setzte 10 von ~30 Feldern und keine
Summen — eine versendbare 0-Euro-Rechnung.

**7. `res.ok` prüfen.** Neu: `src/lib/zoho-webhook.ts`. Alle neun ausgehenden
n8n-Aufrufe laufen darüber; ein HTTP-Fehler wirft jetzt wie ein
Netzwerkfehler, damit die vorhandenen catch-Blöcke greifen.

**8. Offene Forderungen sind keine Jahresgröße.** Analytics rechnete drei
Cashflow-Kacheln auf das gewählte Jahr — am 1. Januar verschwanden alle
Altforderungen aus der Mahnübersicht.

Verifiziert nach jedem Block: `tsc --noEmit`, `next build`, Lint gegen den
HEAD-Stand. Am Ende **366 statt 371** Lint-Findings, also fünf weniger als
vorher. Dazu die Pagination der API gegen die Produktivdatenbank
durchgeblättert (vier Seiten, keine Doppelten).

### Teil 7 — Restarbeiten: Nummernvergabe, Query-Keys, Dirty-Guard

**Query-Key-Bruch** (aus Teil 6 übersehen): Die Rechnungsliste hängt an
`['rechnungen']`, die Detailseite invalidierte an sieben Stellen `['invoices']`.
React Query matcht per Prefix — die Liste wurde nie getroffen und zeigte bis zu
fünf Minuten den alten Status. Beim Lieferschein dasselbe
(`['lieferscheine']` vs. `['deliveryNotes']`). Beide Schlüssel werden jetzt
invalidiert, weil `['invoices']` zusätzlich von Analytics genutzt wird.

**Belegnummern: alle zehn Generatoren auf die atomare Vergabe umgestellt.**
Vorher zählte jede Stelle selbst; zwei gleichzeitige Anlagen bekamen dieselbe
Nummer, und das einzige Rettungsnetz war der UNIQUE-Constraint mit einer rohen
Postgres-Meldung. Jetzt läuft alles über `naechsteBelegnummer()` →
`naechste_belegnummer()` (Migration 023). Gegen die Produktivdatenbank
geprüft: 20 gleichzeitige Aufrufe, 20 verschiedene Nummern, lückenlos.

Zwei Details dabei:
- **Nummernkreise sind nach TABELLE getrennt, nicht nach Prefix.** Eine
  Anzahlungsrechnung trägt `AN-…` wie ein Angebot, ist aber ein anderer Beleg
  in einer anderen Tabelle. Kreise: `AN`, `RE`, `LI` plus `RE_AN`, `RE_TR`,
  `RE_SR`, `RE_GS` für die Rechnungstypen.
- **Migration 025 ist nötig**, damit die Detailseiten die Vergabe nutzen
  können: `belegnummern_kreise` hat RLS ohne Policy, der Anon-Key aus dem
  Browser scheitert mit *„new row violates row-level security policy"*.
  025 macht die Funktion `SECURITY DEFINER` (mit festem `search_path`) und
  beschränkt sie auf die bekannten Kreise — die Tabelle selbst bleibt zu.
  Solange 025 fehlt, fällt `naechsteBelegnummer` auf MAX+1 zurück und meldet
  das als Warnung ans Monitoring; gegen die echte Datenbank geprüft, der
  Fallback liefert dieselben Nummern wie der Zähler.

**Dirty-Guard im Autosave** (Rechnung, Lieferschein): `visibilitychange` und
`onBlurCapture` lösten bei jedem Tab-Wechsel einen Save aus, auch ohne
Änderung. Der Kopf wird jetzt nur geschrieben, wenn sich der Payload
tatsächlich unterscheidet. Die **Positionen laufen bewusst weiter** — dort
gibt es preisneutrale Änderungen (Umsortieren, Text, Einheit), die im
Kopf-Payload gar nicht auftauchen und sonst still verlorengingen.

**Migration 025 ist eingespielt und verifiziert** (2026-07-22): unbekannte
Kreise werden abgelehnt, der Anon-Key darf die Funktion aufrufen, die Tabelle
aber weiterhin nicht direkt lesen. Zähler unverändert: AN=109, RE=60, LI=58.

Ebenfalls nachgeholt: `/entwuerfe` war nirgends in der Navigation verlinkt —
die Seite existierte, war aber nur über die direkte URL erreichbar. Jetzt
unter „Sonstiges".

### Was sich für die Anwender ändert

Die Bedienung bleibt gleich — gleiche Seiten, gleiche Knöpfe, gleicher Ablauf.
Sichtbar anders ist aber Folgendes, und das sollte man wissen, bevor jemand
anruft:

**PDFs sehen an vier Stellen anders aus.** Der Steuersatz steht jetzt korrekt
statt pauschal „20 %", bei gemischten Sätzen erscheint pro Satz eine Zeile.
Unter dem Einzelpreis steht bei Rabatt neu „abzgl. X % Rabatt". Ein
vereinbartes Skonto wird ausgewiesen. Storno und Gutschrift fordern nicht mehr
zur Überweisung auf. Bei Anzahlung und Teilrechnung stehen die
Angebotspositionen unter einer Zwischenüberschrift und ohne Preise.

**Die Firmendaten auf der Rechnung können sich ändern.** Das Rechnungs-PDF las
sie bisher aus einer Tabelle, in die die Einstellungen-Seite nie geschrieben
hat — es zeigte also immer die fest hinterlegten Werte. Jetzt kommen sie aus
`company_settings`. **Vor dem ersten Versand einmal die Einstellungen-Seite
prüfen**, besonders IBAN und UID.

**Die Angebots-Statusfilter heißen anders.** „In Bearbeitung" und „Abgelaufen"
gab es in der Datenbank nie; „Entwurf" filterte wegen eines falschen Werts
nicht. Jetzt: Entwurf, Offen, Versendet, Final, Angenommen, Abgelehnt,
Archiviert.

**Analytics zeigt höhere Zahlen bei offenen Forderungen.** Nicht weil etwas
dazugekommen ist — die Kacheln rechneten nur auf das gewählte Jahr, alle
Altforderungen fehlten.

**Neue Rechnungsnummern richten sich nach dem Typ.** Legt man auf der
Rechnungsseite eine Anzahlung an, bekommt sie jetzt `AN-…` statt `RE-…`. Der
Dialog-Weg „Rechnung erzeugen" aus dem Angebot hat das schon immer so gemacht,
die Detailseite nicht — beide Wege sind jetzt gleich.

**Fehler werden sichtbar, die vorher verschluckt wurden.** „Gespeichert & in
Zoho abgelegt" kann jetzt „…die Zoho-Ablage hat aber nicht geklappt" heißen.
Das endgültige Löschen im Papierkorb meldet einen Fehler, wenn Folgebelege
daran hängen. Beides war vorher eine falsche Erfolgsmeldung — die Meldungen
sind neu, das Problem dahinter nicht.

**Gelöschte Belege lassen sich nicht mehr per PDF-Link abrufen oder
versenden.** Der Link liefert jetzt einen Hinweis auf den Papierkorb.

Nicht geändert: E-Mail-Versand (läuft weiter über n8n), Zoho-Ablage,
Ticket-Sync, PDF-Layout im Übrigen, Login (gibt es weiterhin keins).

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

### Manuell, außerhalb des Codes
- [ ] **Vercel-Env setzen:** `API_TOKEN_READ`, `API_TOKEN_WRITE`
      (`openssl rand -hex 32`), `SUPABASE_SERVICE_ROLE_KEY`. Ohne die antworten
      API und MCP mit 503 bzw. 500 — sie stehen nie versehentlich offen.
- [ ] **Ein Testversand** an eine eigene Adresse. Die Route
      `/api/email/senden` liegt seit 2026-07-22 im Weg, auch im Modus `n8n`,
      wo sie nur durchreicht. Payload-Gleichheit ist verifiziert (0 Unterschiede
      über 23 Felder), ein Livelauf steht aus.
- [ ] **Firmendaten in den Einstellungen prüfen** (IBAN, UID, Fußtext) — das
      Rechnungs-PDF liest sie seit 2026-07-22 aus `company_settings`, statt
      fest hinterlegte Werte zu drucken. Einmal vor dem nächsten
      Rechnungsversand kontrollieren.
- [ ] **Erste Übernahme im UI** unter `/entwuerfe` durchspielen — der Pfad
      Nummernvergabe → Kopf-Insert → Positionen → Rollback ist der einzige
      ungetestete, weil er einen echten Beleg erzeugt.
- [ ] **MCP-Connector** in claude.ai eintragen: `https://<domain>/api/mcp`,
      Header `Authorization: Bearer <token>` (siehe `docs/api-v1.md`).

### Erledigt am 2026-07-22
- [x] ~~Migration 022 (`email-anhaenge`-Bucket)~~ — eingespielt, Bucket verifiziert.
- [x] ~~Migrationen 023 + 024~~ — eingespielt, Zähler gegen den Bestand geprüft.
- [x] ~~n8n-Node „Bilder extrahieren" auf URL-Download umstellen~~ — hinfällig,
      der Mailversand geht bei Modus `graph` nicht mehr durch n8n.
- [x] ~~Fachliche Frage: zählt ein Rechnungs-Entwurf als fakturiert?~~ — nein,
      entschieden und umgesetzt (`fakturierteRechnungen`).

### Code, offen
- [ ] **Rechnungs-Flow `/webhook/rechnung-versenden` reduzieren** (Mail-Nodes raus),
      danach `N8N_ZOHO_WEBHOOK_RECHNUNG` setzen — nur nötig für Modus `graph`.
      Fertiges JSON liegt in `n8n/rechnung-zoho-ablage.reduziert.json`.
- [ ] **Parkraumsperre-Mail** (`/api/parksperre-senden`) läuft weiter über n8n,
      gleiches Anhang-Risiko. Umstellung auf `sendMail()` wären ~20 Zeilen.
- [x] ~~Dirty-Guard im Autosave~~ — für Rechnung und Lieferschein umgesetzt
      (Kopf nur bei echter Änderung, Positionen laufen weiter). Das Angebot
      braucht keinen: dort feuert `visibilitychange` nur `.flush()`, was ohne
      pending Änderung ein No-op ist.
- [x] ~~Altgeneratoren auf `naechste_belegnummer()` umstellen~~ — alle zehn
      Stellen umgestellt, siehe Teil 7.
- [x] ~~Migration 025 ausführen~~ — eingespielt und verifiziert
      (unbekannte Kreise abgelehnt, Anon darf die Funktion, nicht die Tabelle).
- [ ] **Echte Auth + restriktive RLS** — wichtigster offener Punkt aus dem Audit
      2026-07-13, durch API und MCP dringlicher geworden.
- [ ] Monitoring Runde 3: Errors + Info einbauen (9 + 5 Stellen)
- [ ] Webhook-Invoice Schema-Drift Retry (analog zu
      `upsertAngebotSafe` im Offer-Webhook)
- [ ] Tourenplaner Ticket-Sync silent fix
      (`syncPositionsToTicket` in `lieferscheine/[id]/page.tsx` —
      derzeit nur `console.error`, User merkt Sync-Fail nicht)
