# API v1 + MCP-Anbindung

Lesezugriff auf die Angebotssuite — als REST-API und als MCP-Server für Claude.

## Einrichtung

Zwei Umgebungsvariablen in Vercel:

```bash
# Tokens erzeugen, NICHT selbst ausdenken:
openssl rand -hex 32
```

| Variable | Zweck |
|---|---|
| `API_TOKEN_READ` | Lesezugriff. |
| `API_TOKEN_WRITE` | Lesen **und** Entwürfe anlegen. Nur setzen, wenn der Agent Angebote vorschlagen können soll. |

Der MCP-Connector bekommt genau eines der beiden. Mit `API_TOKEN_READ` ist er
physisch schreibunfähig; mit `API_TOKEN_WRITE` kann er Entwürfe anlegen, aber
weiterhin keinen Beleg erzeugen — das Übernehmen liegt außerhalb seiner Reichweite.

Der Entwurfsraum braucht zusätzlich `SUPABASE_SERVICE_ROLE_KEY`: die Tabellen
`beleg_entwuerfe` und `belegnummern_kreise` haben RLS ohne Policy, ein Anon-Client
bekäme dort wortlos leere Ergebnisse. Fehlt der Key, antworten die
Entwurfs-Endpunkte mit einem klaren 500 statt still zu versagen.

**Ohne gesetztes Token antwortet die API mit `503`.** Sie steht nie offen — auch nicht
versehentlich nach einem Deploy, bei dem die Variable vergessen wurde.

## Authentifizierung

```
Authorization: Bearer <API_TOKEN_READ>
```

Fehlt der Header oder passt das Token nicht: `401` mit
`WWW-Authenticate: Bearer error="invalid_token"`. Das ist bewusst ein echter
Transport-401 — Claude löst den Anmeldehinweis nur dann aus, ein `200` mit
Fehlerobjekt würde stillschweigend als Tool-Ergebnis durchgereicht.

## Endpunkte

Alle unter `/api/v1/`, alle `GET`, alle mit Bearer-Token.

| Pfad | Parameter | Liefert |
|---|---|---|
| `health` | — | Erreichbarkeit, ob Service-Role oder Anon-Key genutzt wird |
| `angebote` | `limit`, `offset`, `status`, `suche`, `von`, `bis` | Liste |
| `angebote/{nr\|uuid}` | — | Beleg mit Positionen |
| `angebote/{nr\|uuid}/pdf-url` | — | PDF-Link |
| `rechnungen` … | wie oben | |
| `lieferscheine` … | wie oben | |
| `produkte` | `suche`, `limit`, `offset` | Produktkatalog |
| `stammdaten` | `art=vermittler\|mitarbeiter\|hausverwaltungen\|textvorlagen` | Stammdaten |
| `kennzahlen` | `jahr` | Aggregierte Jahreszahlen |
| `suche` | `q`, `limit` | Über alle drei Belegarten |

`limit` ist auf 100 gedeckelt, Standard 20. Belegdetails akzeptieren sowohl die
Belegnummer (`AN-2026-00107`) als auch die UUID.

```bash
curl -H "Authorization: Bearer $API_TOKEN_READ" \
  "https://lasselgmbh-angebotssuite.co-captain.at/api/v1/rechnungen?status=offen&limit=5"
```

### Fehlerformat

```json
{ "error": { "code": "nicht-gefunden", "message": "angebot \"AN-9999\" wurde nicht gefunden." } }
```

## MCP-Server

Endpunkt: `https://<domain>/api/mcp`, Transport **Streamable HTTP**, stateless.

### In claude.ai einbinden

1. Einstellungen → Connectors → **Custom Connector hinzufügen**
2. URL: `https://lasselgmbh-angebotssuite.co-captain.at/api/mcp`
3. Request-Header: Name `Authorization`, Wert `Bearer <API_TOKEN_READ>`

Der Wert wird **1:1** gesendet — das Wort `Bearer` samt Leerzeichen muss mit
eingetippt werden, sonst kommt beim Server nur der nackte Token an.

> Die Header-Konfiguration (`static_headers`) ist bei Anthropic als Beta
> gekennzeichnet und wird schrittweise ausgerollt. Erscheint der Abschnitt
> „Request headers" im Dialog nicht, geht die Anbindung über Claude Code:
> ```
> claude mcp add --transport http lassel https://<domain>/api/mcp \
>   --header "Authorization: Bearer <token>"
> ```

### Verfügbare Tools

| Tool | Zweck |
|---|---|
| `belege_suchen` | Volltextsuche über Belegnummer, Kunde, Objekt |
| `belege_auflisten` | Liste je Belegart, gefiltert nach Status und Zeitraum |
| `beleg_details` | Einzelbeleg mit Positionen und Summen |
| `kennzahlen_abrufen` | Jahreszahlen, offene und überfällige Rechnungen |
| `produkte_suchen` | Produktkatalog |
| `stammdaten_abrufen` | Vermittler, Mitarbeiter, Hausverwaltungen, Textvorlagen |
| `pdf_link` | URL zum PDF eines Belegs |
| `angebot_entwurf_anlegen` | Angebot vorschlagen (braucht `API_TOKEN_WRITE`) |
| `entwuerfe_auflisten` | eigene Vorschläge und ihr Zustand |

Übernehmen und Verwerfen sind bewusst **keine** Tools. Ein Agent kann damit
vorschlagen, aber nichts freigeben.

### Lokal testen

```bash
API_TOKEN_READ=test npx next dev -p 3000
npx @modelcontextprotocol/inspector       # → http://127.0.0.1:6274
```
Im Inspector „Streamable HTTP", URL `http://localhost:3000/api/mcp`, Header setzen.

Für einen Test gegen das echte claude.ai braucht es einen HTTPS-Tunnel
(`cloudflared tunnel --url http://localhost:3000`) — Anthropic ruft Connectors
von eigener Infrastruktur aus auf und erreicht `localhost` nicht.

## Schreibzugriff: der Entwurfsraum

Die API schreibt **niemals** in `angebote`, `rechnungen` oder `lieferscheine`.
Sie kennt genau ein schreibendes Verb: *Entwurf anlegen*.

```
Agent ──POST /api/v1/entwuerfe──▶ beleg_entwuerfe (Vorschlag, keine Nummer)
                                        │
Mensch ──/entwuerfe → "Übernehmen"──────┘
                                        ▼
                              angebote (Status "Entwurf", source "api")
```

| Endpunkt | Wer | Zweck |
|---|---|---|
| `POST /api/v1/entwuerfe` | Agent, Schreib-Token | Vorschlag ablegen. Antwortet `201` mit `entwurfId` und den gerechneten Summen. |
| `GET /api/v1/entwuerfe` | Agent | eigene Vorschläge und ihr Zustand |
| `GET /api/entwuerfe` | Oberfläche | Liste für die Seite `/entwuerfe`, ohne Token |
| `POST /api/entwuerfe` | Oberfläche | `{id, aktion: "uebernehmen"\|"verwerfen", entschiedenVon}` |

**Warum das die Kollision vermeidet:** Die Detailseiten halten einen Beleg als
einmalig eingefrorenen React-Snapshot und schreiben bei jedem Autosave den
kompletten Datensatz plus alle Positionen zurück — beim Angebot als
delete-then-insert. Eine Zeile in `beleg_entwuerfe` kann in keinem dieser Pfade
liegen, weil die Tabelle dort schlicht nicht vorkommt.

**Was die Übernahme bewusst nicht tut:** keine n8n-Webhooks feuern, keine
Weiterleitung auf die Detailseite, kein `pdf_url` setzen, keinen Status außer
`entwurf` vergeben. All das gehört einer bewussten Handlung eines Menschen —
sonst schlägt eine Agenten-Aktion ungebremst bis nach Zoho durch.

**Was gegen Doppelübernahme schützt:** Der Zustandswechsel läuft als bedingtes
`UPDATE … WHERE zustand = 'offen'` mit `.select()` und geprüfter Zeilenzahl.
Ohne `.select()` liefert supabase-js bei null getroffenen Zeilen `error === null`
— zwei Sachbearbeiter am selben Stapel erzeugten zwei identische Angebote, ohne
dass jemand einen Fehler sähe.

**Belegnummern** kommen aus `naechste_belegnummer()` (Migration 023), einem
`INSERT … ON CONFLICT DO UPDATE … RETURNING` — unter Postgres atomar. Die elf
bestehenden `COUNT+1`-Generatoren im UI bleiben unangetastet; ein Trigger zieht
den Zähler nach, wenn eine Nummer an diesem Weg vorbei gesetzt wird. Beide
Verfahren laufen deshalb parallel, ohne sich zu überholen.

**Validierung** ist strikt: unbekannte Felder werden mit `422` abgelehnt, nicht
geschluckt. Ein Agent, der sich ein Feld ausdenkt, soll das erfahren — sonst
meldet er dem Anwender „gespeichert", während die Hälfte verworfen wurde.
Untergeschobene Felder wie `status` oder `angebotsnummer` fallen damit
automatisch durch.

### Nötige Migrationen

`023_belegnummern_kreise.sql` und `024_beleg_entwuerfe.sql` im Supabase
SQL-Editor ausführen. Bis dahin antworten die Entwurfs-Endpunkte mit einer
Meldung, die genau das sagt.

## Warum weiterhin kein Ändern bestehender Belege

Vier Gründe, alle im Code belegt. Sie müssen gelöst sein, bevor ein
änderndernder Endpunkt entstehen darf:

1. **Autosave überschreibt jeden API-Write lautlos.**
   `angebote/[id]/page.tsx` (`handleAutoSave`) schreibt eine Sekunde nach jeder
   UI-Änderung den kompletten Datensatz, `savePositions` löscht danach alle
   Positionen und legt sie neu an. Analog `rechnungen/[id]/page.tsx`. Hat jemand
   den Beleg offen, ist eine API-Änderung nach einer Sekunde weg — ohne Fehler.
2. **Belegnummern sind nicht atomar.** Sie werden an zehn Stellen über `COUNT+1`
   vergeben. Ein zusätzlicher paralleler Schreiber erhöht die Kollisionsrate;
   das Rettungsnetz ist nur der `UNIQUE`-Constraint.
3. **Schema-Drift.** `schema.sql` und die Migrationen beschreiben nicht den
   Ist-Stand der Produktionsdatenbank — allein bei `rechnungen` schreibt der Code
   rund 21 Spalten, die in keiner SQL-Datei stehen. Deshalb selektiert die API
   `*` und filtert die Ausgabe in JavaScript.
4. **Teilfaktura.** Bei Abschlagsrechnungen stehen alle Originalpositionen zum
   Vollpreis in der Rechnung, während der Kopf nur den Teilbetrag trägt. Jede
   Summen-Neuberechnung über die Positionen sprengt den Betrag.

## Bewusst nicht enthalten

- **Schreiben in `mitarbeiter` und `tickets`** — beide Tabellen gehören
  faktisch dem Tourenplaner. `mitarbeiter` wird nur mit `id`, `name`, `aktiv`
  ausgeliefert; Kontaktdaten Dritter gehören nicht in ein Kontextfenster.
- **E-Mail-Versand und Statuswechsel** — beides löst Webhooks nach Zoho aus.
- **Ein generischer Tabellen-Endpunkt** (`/api/v1/{tabelle}`) — er würde die
  Feld-Whitelist aushebeln, an der interne Notizen und Zoho-IDs hängen.
- **Ein Schema-Endpunkt** — die Datenbankstruktur muss nicht abrufbar sein.

## Einordnung

Die API ist ab Tag eins besser geschützt als die Anwendung selbst. Der
Supabase-Anon-Key liegt weiterhin im Browser-Bundle, die RLS-Policies sind
durchgängig `USING(true)`, und `/api/pdf/**` sowie `/api/ki/*` sind
unauthentifiziert. **Diese API härtet sich selbst, nicht die Datenbank** — der
offene Punkt „echte Authentifizierung + restriktive RLS" aus dem Audit vom
2026-07-13 bleibt unverändert bestehen.
