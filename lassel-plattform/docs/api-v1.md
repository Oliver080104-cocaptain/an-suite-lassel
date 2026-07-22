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
| `API_TOKEN_READ` | Lesezugriff. Dieses Token bekommt der MCP-Connector. |
| `API_TOKEN_WRITE` | Vorbereitung für spätere Schreib-Endpunkte. Aktuell ohne Wirkung, kann leer bleiben. |

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

### Lokal testen

```bash
API_TOKEN_READ=test npx next dev -p 3000
npx @modelcontextprotocol/inspector       # → http://127.0.0.1:6274
```
Im Inspector „Streamable HTTP", URL `http://localhost:3000/api/mcp`, Header setzen.

Für einen Test gegen das echte claude.ai braucht es einen HTTPS-Tunnel
(`cloudflared tunnel --url http://localhost:3000`) — Anthropic ruft Connectors
von eigener Infrastruktur aus auf und erreicht `localhost` nicht.

## Warum nur lesend

Vier Gründe, alle im Code belegt. Sie müssen gelöst sein, bevor ein
Schreib-Endpunkt entstehen darf:

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
