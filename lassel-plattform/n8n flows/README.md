# n8n flows — neu gebaut

Dieser Ordner enthält überarbeitete n8n-Flows. Der Ordner [n8n/](../n8n/)
daneben bleibt unangetastet — dort liegen die reduzierten Zoho-Ablage-Flows
für die Graph-Umstellung.

| Datei | Zweck |
|---|---|
| `angebot-aus-zoho-ticket.json` | Zoho-Ticket → Angebot in der Angebotssuite |
| `test-payload.js` | prüft den Code-Node ohne n8n und ohne echte Belege |

---

## `angebot-aus-zoho-ticket.json`

Ersetzt den bisherigen Flow hinter
`https://n8n.srv1367876.hstgr.cloud/webhook/84ce7001-d1d3-445f-b45b-03133c1faba2`.
**Webhook-Pfad und Node-IDs sind unverändert** — die Deluge-Funktion
`angebot_erstellen1` in Zoho muss nicht angefasst werden.

```
Webhook
  → Ticket laden                 (Pflicht, 3 Versuche)
  → Kunde laden                  (darf fehlschlagen)
  → Hausverwaltung laden         (darf fehlschlagen)
  → Angebots-Payload bauen       (Code)
  → AN-Suite: Angebot anlegen    (3 Versuche, Wiederholung ist gefahrlos)
  → Zoho: Projektstatus setzen   (darf fehlschlagen)
```

Eine Kette statt drei paralleler Zweige mit Merge. Das ist die eigentliche
Änderung — alles Weitere folgt daraus.

### Was vorher schiefging und jetzt anders ist

**1. Der Merge hat die nachgeladenen Daten weggeworfen.**
`Fetch ID Ticket`, `Fetch Kunden` und `Fetch HV` liefen in einen
`Merge`-Node mit *Combine by Position*. Alle drei Zoho-Antworten haben `data`
auf oberster Ebene; beim Zusammenführen kollidieren die Schlüssel und einer
gewinnt. Account und Hausverwaltung wurden also abgerufen und dann verworfen —
im letzten Lauf kam deshalb `kunde.name: ""` und `hausverwaltungName: ""` an,
und die Plattform musste über ihre Fallback-Kette auf die Objekt-Gasse
ausweichen.

Jetzt liest der Code-Node jede Quelle explizit über `$('Ticket laden')`,
`$('Kunde laden')`, `$('Hausverwaltung laden')`. Keine Kollision möglich, und
die Reihenfolge der Antworten spielt keine Rolle mehr.

**2. Ein leerer Lookup hat den Lauf gekippt.**
`Fetch HV` baute seine URL aus `Zust_ndige_Hausverwaltung.id`. Ist das Feld
leer — bei Direktkunden der Normalfall — brach die Expression, der
Error-Ausgang war nicht verdrahtet, und je nach Timing blieb ein Merge-Eingang
leer. Das war der zweite „mal geht's, mal nicht"-Faktor.

Jetzt liefert die Expression bei fehlendem Lookup eine harmlose URL, der Node
steht auf *Continue (using regular output)*, und der Code-Node behandelt
„nicht geladen" als Normalfall. **Ein 404 an diesen beiden Nodes ist erwartet
und kein Fehler** — er heißt nur, dass es zu diesem Ticket keine
Hausverwaltung bzw. keinen Objekt-Account gibt.

**3. Reverse Charge und Steuersatz wurden verworfen.**
Zoho schickt `reverseCharge` und `steuerWert` im Body mit; der alte Code-Node
hat beides ignoriert und jede Position hart mit 20 % angelegt. Bei einem
Reverse-Charge-Ticket war das falsche Steuer auf einem echten Beleg. Beides
geht jetzt durch: `angebot.reverseCharge` und `positionen[].ustSatz`.

**4. `gueltigBis` überschrieb den fachlichen Standard.**
Der alte Node rechnete 30 Tage. Seit 27.07.2026 gilt: zwei Monate ab
Angebotsdatum, gesetzt von `gueltigBisDefault()` in der Plattform. Ein
mitgeschicktes Datum hat dort Vorrang — der Flow hat den Standard also jedes
Mal ausgehebelt. Das Feld ist raus, die Plattform entscheidet.

**5. Das Angebotsdatum war der geplante Arbeitsbeginn.**
`datum: ticket.Startdatum` → daraus hätte die Plattform auch die Gültigkeit
gerechnet. Jetzt: Erstellungstag, in Wiener Zeit (`DateTime` aus Luxon; UTC
wäre zwischen 00:00 und 02:00 der Vortag).

**6. Die `callbackUrl` zeigte ins Leere.**
Sie verwies auf `/webhook-test/…` einer *anderen* n8n-Instanz
(`lasselgmbh.app.n8n.cloud` statt `srv1367876`). Test-Webhooks existieren nur,
solange der Flow im Editor auf „Test" steht. Die Plattform ruft die URL
synchron auf, jeder Angebotsanlage hing also ein toter HTTP-Call an. Feld
entfernt.

**7. Der Projektstatus wurde gesetzt, bevor es ein Angebot gab.**
`Angebot in Erstellung` lief parallel zum Rest. Schlug das Anlegen fehl — wie
diese Woche —, stand das Ticket trotzdem auf „Angebot in Erstellung", ohne dass
eines existierte. Der Node steht jetzt am Ende der Kette.

**8. Kein Wiederholungsversuch.**
`Ticket laden` und `AN-Suite: Angebot anlegen` haben jetzt *Retry on Fail*
(3 Versuche, 3 bzw. 5 s Pause). Beim Anlegen ist das gefahrlos: die Plattform
erkennt das Ticket über `zoho_ticket_id` wieder und aktualisiert das
vorhandene Angebot, statt ein zweites anzulegen.

**9. `pinData` entfernt.** Am Webhook-Node klebten die Testdaten vom 14.08.
Bei jedem Testlauf im Editor kam damit dasselbe alte Ticket heraus, egal was
Zoho gerade schickte.

### Kleinere Änderungen im Payload

- **Positions-Beschreibung ist leer.** Die Plattform setzt
  `"produktName\nbeschreibung"` zusammen; vorher stand „Diverse
  Dienstleistungen" und darunter „Diverse Dienstleistungen für
  Stättermayergasse 22" — dasselbe zweimal, und das Objekt steht ohnehin im
  Belegkopf. Wer die alte Zeile zurück will: im Code-Node bei `beschreibung:`
  wieder `dl + ' für ' + gassenName` eintragen.
- **Menge und Einzelpreis** werden aus `quote.Product_Details[i]` übernommen,
  falls Deluge dort etwas gerechnet hat. Steht dort 0, bleibt es bei 0 wie
  bisher.
- **Adressen werden ergänzt statt ersetzt:** Rechnungsadresse aus dem Ticket →
  Hausverwaltungs-Datensatz → Objekt-Account. Objektadresse aus dem
  Gassen-Namen, Lücken aus den `Billing_*`-Feldern des Accounts.
- **`meta.quellen`** ist neu: `{ kundeGeladen, hausverwaltungGeladen }`. Damit
  ist im Payload sichtbar, ob eine Nebenabfrage leer blieb — die Plattform
  ignoriert das Feld.

### Import

1. n8n → den bestehenden Flow öffnen (den mit dem Webhook `84ce7001-…`)
2. `…` oben rechts → **Import from File** → `angebot-aus-zoho-ticket.json`
3. Prüfen, dass an den vier Zoho-Nodes die Credential
   *office@hoehenarbeiten-lassel.at* hängt (`XmCikR828yB5FOwq` — sollte
   automatisch verknüpft sein)
4. Speichern, **Active** lassen

> **Nicht als zweiten Flow importieren und aktivieren.** Zwei aktive Workflows
> mit demselben Webhook-Pfad lehnt n8n ab („webhook path already registered") —
> der alte müsste vorher deaktiviert werden.

### Sicherheitshinweis

Der Header `x-webhook-secret` steht als Klartext in der JSON, damit der Import
ohne Nacharbeit läuft. Damit liegt der Wert jetzt auch im Repo. Wenn das nicht
gewollt ist: in n8n eine **Header-Auth-Credential** anlegen (Name
`x-webhook-secret`, Wert = `WEBHOOK_SECRET` aus Vercel), am Node
*Authentication → Generic → Header Auth* wählen, den `jsonHeaders`-Eintrag auf
`Content-Type` kürzen — und den bisherigen Wert in Vercel rotieren.

### Vorher testen, ohne einen Beleg zu erzeugen

```
node "n8n flows/test-payload.js"
```

Fährt den Code-Node aus der JSON gegen nachgebaute Zoho-Antworten: leerer
HV-Lookup, tote Nebenabfrage, Reverse Charge, 10 % USt, mehrere
Dienstleistungen, gar keine Dienstleistung, totes Ticket, Lookups als String
statt als Objekt. 25 Prüfungen, kein Netzzugriff.

---

## Wichtig: der Flow war nicht die Ursache des 500ers

`record "new" has no field "rechnungsnummer"` kam aus der Datenbank, nicht aus
n8n. Der Trigger `belegnummer_zaehler_nachziehen()` verhindert jedes **Anlegen**
eines Angebots (Details und Fix:
[026_belegnummer_trigger_fix.sql](../supabase/migrations/026_belegnummer_trigger_fix.sql)).
Solange diese Migration nicht im Supabase-SQL-Editor gelaufen ist, scheitert
auch der neue Flow — dann allerdings mit drei Versuchen und einer sichtbar
fehlgeschlagenen Ausführung statt eines stillen Fehlschlags.

Reihenfolge: **erst Migration 026, dann Flow importieren, dann ein neues
Ticket durchschicken.**
