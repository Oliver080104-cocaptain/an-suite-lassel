# n8n-Flows

## Aktueller Stand: die Flows laufen unverändert weiter

`EMAIL_VERSAND_MODUS` steht auf **`n8n`** (Default). Solange das so ist, ändert
sich an den Flows nichts: `/api/email/senden` stößt die bestehenden Flows mit
exakt dem bisherigen Payload an, n8n versendet und legt in Zoho ab.

Die reduzierten JSONs in diesem Ordner werden erst gebraucht, wenn auf
`EMAIL_VERSAND_MODUS=graph` umgestellt wird. **Vorher nicht importieren** —
sonst versendet niemand mehr die Mail.

## Was sich beim Umstellen ändert

Der E-Mail-Versand von Angeboten und Rechnungen läuft dann **nicht mehr über
n8n**, sondern direkt aus der Plattform über die Microsoft Graph API
(`src/app/api/email/senden/route.ts` → `src/lib/graph-mail.ts`).

Grund: der n8n-Flow hat die Anhänge nicht zuverlässig mitgeschickt. Das PDF und
die hochgeladenen Skizzen liefen über drei parallele Zweige, die per
`Merge`-Node nach Position zusammengeführt wurden — kam ein Zweig zu spät oder
leer zurück, ging die Mail ohne Anhang raus. Zusätzlich las der Node
„Bilder extrahieren" noch `body.email.attachments` als Base64, während die App
längst `body.attachments[].url` schickt. Ein 2xx vom Webhook bedeutete nur
„n8n hat den Trigger angenommen", nicht „die Mail ist mit Anhang zugestellt".

Jetzt passiert alles synchron in einem Request: PDF rendern, Anhänge laden, zu
`Skizzen.zip` bündeln, über Graph versenden. Schlägt ein Schritt fehl, bekommt
der User einen Fehler und der Beleg-Status bleibt unverändert.

## `angebot-zoho-ablage.reduziert.json`

Der auf den Zoho-Zweig reduzierte Flow. Behalten wurde:

```
Webhook ──┬─→ Payload vorbereiten ──┐
          ├─→ Access Token holen  ──┼─→ Daten für Upload sammeln → Combine for Upload → UPLOAD TO WORKDRIVE
          └─→ Angebot herunterladen ┘
```

Entfernt wurden alle Mail-Nodes (`Code in JavaScript2`, `Bilder extrahieren`,
`Aggregate`, `PDF URL downloaden`, `Compression1`, `Code in JavaScript3`,
`Merge2`, `Merge3`, `If1`, beide Outlook-Nodes) sowie die beiden bereits
unverbundenen Reste `Normalize Payload` und `HTTP Request2`.

Geändert wurde nur eine Zeile Logik: „Payload vorbereiten" nimmt den Dateinamen
jetzt aus `pdfFileName` und fällt auf `angebotNummer` **oder** `rechnungsNummer`
zurück — vorher hätte eine Rechnung als `Angebot.pdf` im WorkDrive gelegen.

**Webhook-URL und Node-IDs sind unverändert**, damit die bestehende
Produktions-URL weiter funktioniert.

Zusätzlich prüft „Payload vorbereiten" jetzt, dass `pdfUrl` auf die
Angebotssuite zeigt, und säubert den Dateinamen. Der Webhook ist öffentlich
erreichbar; ohne diese Prüfung könnte jeder eine Fremddatei unter einem
existierenden Namen in den WorkDrive legen (der Upload läuft mit
`override-name-exist=true`) oder n8n interne Hosts abrufen lassen.

### Einspielen — Reihenfolge ist wichtig

1. n8n → den bestehenden Flow „email versand angebot" öffnen
2. `…` (oben rechts) → *Import from File* → diese JSON wählen
3. Prüfen, dass der Sub-Workflow „Zoho Workdrive Credential 2" noch verknüpft ist
4. In „Payload vorbereiten" die Konstante `ERLAUBTE_BASIS` auf die tatsächliche
   Produktions-Domain der Angebotssuite anpassen, falls sie abweicht
5. Speichern und **Active** lassen
6. **Erst jetzt** in Vercel `N8N_ZOHO_WEBHOOK_ANGEBOT` auf die Webhook-URL setzen

Die Variable ist absichtlich leer vorbelegt. Würde die Plattform den Webhook
feuern, solange der alte Flow mit seinen Outlook-Nodes noch aktiv ist, ginge der
Beleg zweimal an den Kunden. Bis die Variable gesetzt ist, meldet die App nach
dem Versand „Die automatische Zoho-Ablage ist noch nicht eingerichtet."

### Neuer Payload

Die Plattform ruft den Webhook erst **nach** erfolgreichem Mailversand auf, mit:

```json
{
  "offerId": "…", "angebotNummer": "AN-2026-00069",
  "pdfUrl": "https://…/api/pdf/angebot/…", "pdfFileName": "Angebot_AN-2026-00069.pdf",
  "versendetAn": "kunde@example.at", "status": "versendet",
  "timestamp": "2026-07-22T09:34:02.776Z",
  "ticketId": "…", "objekt": {…}, "summen": {…}
}
```

Kein `email`-Block und kein `attachments[]` mehr — die braucht der Flow nicht.

## `rechnung-zoho-ablage.reduziert.json`

Dasselbe für den Rechnungs-Flow (`/webhook/rechnung-versenden`). Der macht
**mehr** als der Angebots-Flow und behält deshalb zwei Zweige:

```
Webhook ──┬─→ Payload vorbereiten ──┐
          ├─→ Access Token holen  ──┼─→ Daten für Upload sammeln → Combine → UPLOAD TO WORKDRIVE
          ├─→ Rechnung herunterladen┘
          └─→ Ticket suchen → „Rechnung noch nicht beglichen"   ← Zoho-CRM-Projektstatus
```

Der Ticket-Zweig (`Ticket suchen` → `PUT /crm/v3/Ticket/{id}` mit
`Projektstatus: "Rechnung noch nicht beglichen"`) hat mit dem Mailversand nichts
zu tun und **bleibt erhalten** — der wäre beim Reduzieren sonst still
verschwunden. Er braucht weiterhin `ticketNumber` im Payload; das liefert
`rechnungen/[id]/page.tsx` über `extraPayload` und die Versand-Route reicht es
durch.

Entfernt: `Code in JavaScript4`, `PDF URL downloaden1`, `Merge4`,
`Final Mail Payload1`, `Rechnung versenden1` (Outlook).

Wie beim Angebot gilt: erst importieren, dann `N8N_ZOHO_WEBHOOK_RECHNUNG` setzen —
und beides erst, wenn `EMAIL_VERSAND_MODUS=graph` aktiv ist.

Der separate Flow `rechnung-zoho-ablage` (`48a021d8-…`, feuert beim Speichern)
ist von alldem nicht betroffen.

## Nicht angefasst

Alle übrigen n8n-Flows bleiben unverändert — sie machen Zoho-Ablage,
Ticket-Sync oder Status-Updates, keinen Mailversand:

| Webhook | Zweck |
|---|---|
| `fccf5130-…` | Angebot: Zoho-Ablage beim Speichern |
| `48a021d8-…` | Rechnung: Zoho-Ablage beim Speichern |
| `47c3bc5b-…` | Rechnung erstellt (aus Angebot) |
| `fd01a47a-…` | Rechnung bezahlt |
| `2c51d71e-…` | Angebot angenommen |
| `b15d8baa-…` | Lieferschein: WorkDrive-Ablage |
| `5e4e9681-…` | Zoho-CRM-Ticket-Update |
| `fb90b972-…` | Lieferschein-Zuweisung |
| `e41b0145-…` | Rustler-Upload |
| `7836c00e-…` | Parkraumsperre-Mail an MA46 |

Der Parkraumsperre-Flow (`/api/parksperre-senden`) verschickt weiterhin über
n8n. Er hängt dieselben Bucket-URLs an und hat damit dasselbe Risiko — die
Umstellung auf `sendMail()` aus `src/lib/graph-mail.ts` wären dort ~20 Zeilen.
