# NEXTSTEPS – Lassel GmbH AN-Suite
Stand: 23.04.2026

## 🟥 OFFEN – wichtigste Baustellen für nächste Session

### 1. Zoho → App: Angebot-Erzeugung
User berichtet: Beim Anlegen eines Angebots aus Zoho werden **manche
Felder nicht gematcht**, und beim **2. mal Überarbeiten** werden
Änderungen nicht übernommen. Muss analysiert werden.

Ansatzpunkte:
- `src/app/api/webhooks/offer/route.ts` — Mapping von Zoho-Feldnamen
  auf unsere DB-Spalten prüfen. Gibt's neue Zoho-Felder die wir
  nicht mappen?
- Beim 2. Überarbeiten (= Zoho sendet Update statt Insert): nutzt
  unser Webhook `upsert` oder prüft auf Ticket-Nr.? Falls insert,
  wäre Duplikat → vermutlich wird nur der erste Eintrag aktualisiert.
- n8n-Flow-Seite: welcher Payload wird von Zoho an uns geschickt?
  n8n-Execution-Log als Referenz nehmen.

### 2. Alte Baustellen aus früheren Sessions
n8n-Versand/Ablage-Flows (siehe unten), Teilzahlungen-Tabelle, API
Logs Seite. Größtenteils unverändert seit 2026-04-21.

---

## ✅ HEUTE (23.04.2026) – Mega-Session: State-Reliability + UX-Polish

### Autosave-Overhaul auf allen 3 Detail-Pages (AN/RE/LI)
Der größte Themen-Komplex der Session. Wir haben einen fiesen
Phantom-Overwrite-Bug gejagd: User tippte, Werte verschwanden nach
click-out-click-in. Logs zeigten eindeutig:
1. Save läuft los mit richtigen Werten
2. Browser-Extension (classifier.js) triggert React-Reparenting
3. Component unmounted mid-save
4. Remount liest `useQuery`-cache (stale, pre-save-Werte, null für
   adress-felder)
5. Init-Effect `setOffer(stale)` → useEffect `[offer, positions]`
   feuert → autosave **mit nullwerten** → **überschreibt DB**

**Defensive Schutzschichten die jetzt alle drei Detail-Pages haben:**

- **`pendingChangesDuringSave`-Flag** (Race-Schutz): tippen während
  Save läuft → Dirty-Flag → nach Save nochmal speichern. Sonst ging
  zuletzt getippte Zeichen verloren.

- **`justInitialized`-Flag** (Phantom-Schutz): der ERSTE State-Change
  nach dem init kommt vom `setOffer(existingOffer)` selbst, nicht
  vom User. Autosave-useEffect skippt diesen einen. Verhindert, dass
  Remount auf stale-cache direkt einen Autosave mit null-Werten
  raustriggert.

- **`invalidateQueries(['offer'|'invoice'|'deliveryNote', id])` nach
  Save**: Cache ist direkt nach Save frisch → ein Remount liest die
  korrekten DB-Werte statt stale-cache.

- **Save-on-Blur** (`onBlurCapture` auf Form-Grid-Containern): jede
  Feld-Verlassen-Geste flusht den pending Debounce sofort, statt 1s
  zu warten. Protect gegen Tab-Close mitten in der Debounce-Fenster.

- **Functional `setState`-Form überall**: alle 28+ `setOffer({
  ...offer, X })` → `setOffer(prev => ({ ...prev, X }))` umgestellt
  (via sed). Defensiv gegen stale-closure in React 19 concurrent
  rendering.

- **`autoComplete="off"`** auf allen 10 Adress-Inputs im Angebot
  (kunde_*, objekt_*, hausinhabung). Blockt Opera GX's aggressiven
  Password-Manager der Felder beim Refocus zurücksetzen wollte.

### Rechnung-spezifisch: acquireAutosaveLock
Neuer Helper für direkte DB-Writes (`handleMarkAsPaid`,
`handleStorno`, `handleAddTeilzahlung`, `deleteTeilzahlung`):
1) Cancel pending autosave-Timer
2) Wait bis laufender autosave fertig ist
3) Acquire Lock, direct-write machen, Lock freigeben

Verhinderte Race: "Als bezahlt markieren" konnte von parallel
laufendem Autosave mit stale state (status='offen') überschrieben
werden.

### EmailVorschauModal generisch gemacht — docType
Vorher nur für Angebot. Jetzt unterstützt `docType: 'angebot' |
'rechnung'` mit gemeinsamer UI, Signatur-Logik, KI-Gen. Pro Typ:
- Andere Webhook-URL + default Betreff + PDF-Pfad
- Payload-Shape (`offerId` vs `rechnungsId` usw.)
- Optionale `extraPayload`-Prop zum Mit-Schicken von
  ticket_refs, positionen, summen etc.

**Rechnung-versenden** ruft jetzt den Modal statt direkt zu feuern.
User-Flow identisch mit Angebot-Versand.

### ParksperreModal Architektur-Umbau
Der Modal hatte zwei Bugs:
1. Falsche Webhook-URL (feuerte gegen Angebot-Endpoint)
2. Datei-Upload über Vercel-Body → 4.5MB Limit → 502

**Lösung:**
- Client lädt Dateien **direkt in Supabase Storage** (`parksperre-
  anhaenge` Bucket, Migration 018). Keine Vercel-Body-Grenze.
- Server-Route `/api/parksperre-senden` bekommt nur JSON mit
  URLs + Mail-Text. Triggert n8n server-zu-server (kein CORS-
  Problem).
- UI-Style identisch zu EmailVorschauModal: Signatur-Dropdown,
  KI-Prompt-Card, File-Upload-Section.
- Fallback-URL-Chain: versucht erst UUID, dann custom-path. Falls
  beide fehlschlagen: aussagekräftige Fehlermeldung mit n8n-Status.
- KI-Prompt überarbeitet: keine Platzhalter `[Ihr Name]` mehr, Text
  endet nach dem letzten inhaltlichen Satz (Signatur wird
  angehängt).

### Signaturen-Verwaltung
Neuer shared Dialog `SignaturenVerwaltenDialog.tsx`:
- Liste aller DB-Signaturen (aus `signaturen`-Tabelle, Migration
  015)
- Inline-Edit, Aktiv/Inaktiv-Toggle, Löschen
- Neue-Signatur-Formular oben
- Eingebunden in EmailVorschauModal + ParksperreModal über
  **"Verwalten"**-Button. Mitarbeiter-abgeleitete und Builtin-
  Signaturen sind read-only, erscheinen nicht in diesem Dialog.

### Soft-Delete Konsistenz + 30-Tage-Auto-Cleanup
Vorher: Angebot hatte soft-delete (`geloescht_am`), Rechnung +
Lieferschein **hard-delete** → Papierkorb zeigte die nie.

**Jetzt einheitlich:**
- Alle drei Tabellen haben `geloescht_am` (Migration 017)
- List-Pages filtern `.is('geloescht_am', null)`
- `linkedInvoices`/`linkedDeliveryNotes` im Angebot-Detail filtern
  auch → Papierkorb-Docs tauchen nicht mehr als "verknüpft" auf
- Delete-Mutations machen `UPDATE geloescht_am` statt `DELETE`
- Papierkorb-Page zeigt alle drei Typen nebeneinander

**Auto-Cleanup:** Neuer Vercel-Cron `/api/cron/cleanup-papierkorb`
läuft täglich 03:00 UTC, löscht endgültig was > **30 Tagen** im
Papierkorb liegt (vorher war die UI-Lüge "10 Tage", ohne Job
dahinter). Inkl. zugehöriger Positions + Teilzahlungen.

### Lieferschein-Positionen in Zoho CRM übertragen (neuer Flow)
Button "Lieferschein Pos in Zoho übertragen" feuert jetzt ZWEI
Webhooks parallel via Promise.allSettled:
- `b15d8baa-…` (alt, Workdrive-Upload)
- `5e4e9681-…` (neu, Zoho-CRM-Ticket-Update)

Beide bekommen Positions-Array + editUrl + angebot.ticketId.

### Rechnung aus Angebot — Positionen wieder übernommen
War kaputt wegen ID-Mismatch: Angebot-`savePositions` macht
delete+insert → neue IDs in DB nach jedem autosave, local state
behielt alte. Dialog schickte alte IDs → Filter in
handleCreateInvoice fand keine → leere Rechnung.

Fix: Dialog bekommt jetzt `existingPositions` (aus useQuery, frisch
nach Invalidate) statt local-state. Plus Defensive Fallback: wenn
IDs trotzdem nicht matchen, werden ALLE DB-Positionen genommen.

### Parksperre Mail-Body/KI
- KI-Prompt für `typ='parksperre'`: explizit "KEINE Grußformel am
  Ende, KEINE Platzhalter, Signatur wird angehängt"
- Fallback-Template endet nach letztem inhaltlichen Satz
- Kein doppeltes "Mit freundlichen Grüßen" mehr

### Rechnungsversand Payload-Erweiterung
EmailVorschauModal nimmt jetzt optionale `extraPayload` Prop. Beim
Rechnung-versenden schickt rechnungen/[id]/page.tsx mit:
ticketId, ticketNumber, referenzAngebotId/Nummer, stornoVonRechnung,
kunde-full (strasse/plz/ort/uid/ansprechpartner), objekt-full,
bemerkung, positionen, summen (netto/ust/brutto).

### UI/UX Polish
- **EditableDocNumber**: Pencil-Button war versteckt (`opacity-0`),
  User kannten Edit-Feature nicht. Jetzt dauerhaft sichtbar mit
  Hover-Effekt + Tooltip.
- **Analytics Mitarbeiter-Verwaltung**: leere Einträge aus der
  mitarbeiter-Tabelle (historische Datenmüll) werden gefiltert,
  "Leere Einträge löschen" Button räumt auf.
- **Mitarbeiter-Insert**: Schema-Drift-Fallback + Split
  Vorname/Nachname (andere Software nutzt dieselbe Tabelle mit
  NOT NULL `vorname`).
- **Leistungszeitraum Chips**: Einzelne Tage entfernbar (waren
  vorher nur Read-only-Labels). "Alle löschen"-Link bleibt.
- **Signatur-Management-Dialog** mit CRUD für DB-Signaturen.
- **Save-on-Blur** für alle 3 Detail-Pages. Save startet beim
  Feld-Verlassen (nicht erst 1s Debounce). Schützt vor Datenverlust
  bei Tab-Close.
- **Layout-Stretch**: Rechts-/Links-Spalten in Detail-Seiten
  schließen bündig ab — `flex flex-col` auf Spalten-Wrapper,
  `flex-1` auf letzter Karte. Kein Weißraum mehr unter kürzerer
  Spalte.

### Migrationen (alle idempotent)
- `014_rechnungen_vermittler_id.sql` — UUID FK zu vermittler
- `015_signaturen.sql` — eigene Signatur-Tabelle + RLS
- `016_lieferscheine_referenz_angebot_nummer.sql` — Spalte nach
  Analog zu Rechnung
- `017_rechnungen_lieferscheine_geloescht_am.sql` — Soft-Delete
  + Partial Indexe
- `018_parksperre_anhaenge_bucket.sql` — Storage-Bucket + Policies
  für anon upload/read
- `019_mitarbeiter_aktiv.sql` — `aktiv`, `email`, `telefon`,
  `rolle` auf mitarbeiter

### Kritische Vercel-Env-Vars (müssen gesetzt sein)
- `CRON_SECRET` — zufälliger String, für Papierkorb-Cron-Auth
- `SUPABASE_SERVICE_ROLE_KEY` — für Cron + Parksperre-Storage-Setup

### Kleinigkeiten
- Rechnung/Lieferschein list: Soft-Delete, Toast
  "in Papierkorb verschoben"
- Analytics-Query filtert gelöschte Rechnungen
- Cache-Invalidate auch für `linkedInvoices`/`linkedDeliveryNotes`
  beim Löschen einer Rechnung/Lieferschein → offene Angebot-Detail-
  Seiten sehen sofort die Änderung
- PDF-URL bei E-Mail-Versand immer absolut (war relativ → n8n konnte
  nicht fetchen)

---

## 📋 WICHTIGE REGELN für nächste Session

- **Bei direkten `supabase.update()`-Writes IMMER** `acquireAutosaveLock()`
  aufrufen vor dem Write. Sonst race mit autosave der stale state
  zurückschreiben kann.
- **`setOffer`/`setInvoice`/`setDn` IMMER** in functional form
  `(prev: any) => ({ ...prev, X: ... })`. Niemals object-spread
  `{ ...offer, X }`.
- **Nach jedem autosave** `queryClient.invalidateQueries([key, id])`
  aufrufen. Sonst liest Remount stale cache.
- **`justInitialized.current = true`** nach jedem
  `setOffer(existingOffer)` im init-useEffect. Autosave-useEffect
  skippt dann den ersten state-change.
- **Shared DB mit anderer Software** — Schema-Drift ist NORMAL,
  defensive inserts mit retry-on-"Could not find column" Pattern
  nutzen.
- **n8n-Webhooks mit Sonderzeichen im Pfad** — immer URL-encoden
  oder direkt die UUID verwenden (aus Flow-JSON `webhookId`).
- **File-Uploads > 4MB** — NICHT über Vercel-Body-Route. Direkt
  zu Supabase Storage mit public bucket + anon-policy, dann nur
  URLs an den Server schicken.
- **Migrationen sofort anwenden** — User führt sie oft erst später
  aus, daher IMMER defensive Fallbacks im Client.

---

## 🟥 OFFEN – n8n Flows für Versand & Zoho-Ablage (6-7 Flows)

Das große verbleibende Integrations-Thema. App-seitig ist alles vorbereitet
(PDF-Binaries via api2pdf, Webhook-Endpoints live, "Speichern & in Zoho ablegen"-
Buttons existieren) — was fehlt sind die passenden n8n-Workflows, die zwischen
App, Zoho Mail/Workdrive und Supabase vermitteln.

### Versand-Flows (App → n8n → Zoho Mail)
- [ ] **Angebot versenden** – Webhook hört auf "Angebot versenden"-Button aus
      `src/components/EmailVorschauModal.tsx`; Payload enthält Empfänger, Betreff,
      Body, `pdf_url`. n8n muss PDF von `pdf_url` fetchen, an Kunden mailen, dann
      Status im Supabase-Datensatz auf `versendet` setzen.
- [ ] **Rechnung versenden** – Analog für Rechnungen. Status-Update:
      `status: 'offen'`. Email-Kontext aus `invoice.email_rechnung`.
- [ ] **Lieferschein versenden** (falls benötigt) – gleiche Struktur.

### Zoho-Ablage-Flows (App → n8n → Zoho Workdrive)
- [ ] **Angebot in Zoho ablegen** – Webhook wird vom
      "Speichern & in Zoho ablegen"-Button getriggert. n8n lädt PDF-Binary
      von `api/pdf/angebot/<id>` (jetzt echte PDF, kein HTML mehr!), uploaded
      in den richtigen Zoho Workdrive Ordner nach Ticket/Geschäftsfallnummer,
      setzt `pdf_url` auf Workdrive-Link.
- [ ] **Rechnung in Zoho ablegen** – Analog.
- [ ] **Lieferschein in Zoho ablegen** – Analog (+ Positionen ins Ticket spiegeln,
      `syncPositionsToTicket()` ruft bereits den Lieferschein-Webhook).

### Gemeinsam / Querschnitt
- [ ] Webhook-Secret-Header `lassel-2026-secure-webhook` in jedem Flow prüfen.
- [ ] Error-Handling: wenn n8n fehlschlägt, Fehler an `/api/webhooks/log` zurück,
      damit er in der API-Logs-Seite auftaucht.
- [ ] PDF-Dateinamen konsistent: `Angebot_AN-2026-00063.pdf`, etc. (von der
      PDF-Route via `Content-Disposition` bereits so gesetzt).

## ✅ HEUTE (21.04.2026) – Erledigt

### Rechnung-Page Großputz
- ✅ 2-Spalten-Grid balanciert: Angebotsdaten/Rechnungsdaten gesplittet in
      zwei Karten ("Angebotsdaten" + "Referenzen & Links", "Rechnungsdaten" +
      "Metadaten & Referenzen") → beide Spalten enden auf gleicher Höhe
- ✅ "Verknüpfte Dokumente" als **Full-Width-Karte** aus der rechten Spalte
      extrahiert (Angebot + Lieferschein)
- ✅ HI-Section auf AN-Detail: bei aktiviertem "Rechnung an HI" nur noch
      **UID-Feld** (Name/Straße/PLZ/Ort/Hausverwaltung entfernt – waren Duplikate)
- ✅ Leistungszeitraum: **X-Reset-Button** + "Alle löschen"-Link im Popover
      (aktuell kein Weg zu clearen existierte)
- ✅ Lieferschein-Detail: Feld "Objektbezeichnung" entfernt (Duplikat von
      "Objektadresse")

### Arbeitstage als Array (Leistungszeitraum smart)
- ✅ Migration 012: `rechnungen.arbeitstage JSONB` (Liste einzelner ISO-Tage)
- ✅ Defensiver Fallback im Client: useRef-Flag cached "column missing", damit
      auch ohne Migration 012 der Save funktioniert (nur arbeitstage wird dann
      nicht persistiert)
- ✅ `formatArbeitstage()` Helper in `src/app/api/pdf/rechnung/[id]/route.ts`:
      rendert Ranges kompakt — `01.04.2026 – 03.04.2026, 05.04.2026, 10.04.2026 – 12.04.2026 (7 Tage)`
- ✅ Calendar-Picker setzt `selectedDates` + `arbeitstage` + `leistungszeitraum_von/_bis`
      (von/bis als min/max für Backward-Compat)
- ✅ Altdaten-Fallback beim Load: wenn nur `leistungszeitraum_von/bis`
      vorhanden → expand to days

### PDF-Vorschau Echtzeit + sauberes Layout
- ✅ `?preview=1` auf allen 3 PDF-Routes → liefert HTML direkt (kein
      api2pdf-Roundtrip) → keine PDF-Viewer-Scrollbars mehr im iframe
- ✅ Iframe auto-resize via `onLoad`-Handler: Höhe = `body.scrollHeight`,
      `scrolling="no"`, Container nur `overflow-x-auto` (kein fester 900px-Header)
- ✅ **Live-Update**: `previewVersion` wird nach jedem Auto-Save gebumpt
      (AN/LI/RE) und nach jedem `EditableDocNumber`-Edit → iframe fetcht neu
- ✅ Debounce-Timing: 2s → 1s auf Rechnungen + Lieferscheine
- ✅ Lieferschein-PDF-CSS auf Angebot-Layout angeglichen (gleiche Schriften,
      Farben, Margins, .ticket-line Style)
- ✅ Rechnung-PDF: `FUSSZEILE TEST` debug-div entfernt, Rechnungstyp jetzt
      nur noch im großen Doc-Title (`ANZAHLUNGSRECHNUNG RE-2026-00059`)

### Positionen-Sync Bug gefixt
- ✅ Nach Insert werden neue DB-IDs direkt in den State gemerget (Rechnung + LI)
      – vorher wurden Positionen bei jedem Auto-Save dupliziert, weil `!p.id`
      immer true blieb

### Grid-System
- ✅ Alle 3 Detail-Seiten (AN/LI/RE) haben jetzt konsistent 2 Karten links
      (Kunde + Objekt) gegenüber 2 Karten rechts → saubere Kanten, keine
      Überhänge mehr

### Infrastruktur
- ✅ Migration 013: `mitarbeiter` + `vermittler` "Allow all" RLS-Policy
      (war nur in schema.sql, fehlte in Prod → 400-Error beim Mitarbeiter-Insert
      in Analytics)

## 🗄️ SUPABASE – Noch auszuführende SQL (beide idempotent)
```sql
-- 012_rechnungen_arbeitstage.sql
ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS arbeitstage JSONB NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';

-- 013_mitarbeiter_rls.sql
ALTER TABLE mitarbeiter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mitarbeiter;
CREATE POLICY "Allow all" ON mitarbeiter FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE vermittler ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON vermittler;
CREATE POLICY "Allow all" ON vermittler FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
```

---

## 🧪 VORIGE SESSION – Test-Sprint

### 1. PDF Generierung E2E testen (AN / LI / RE)
Frisch gepusht via api2pdf — bisher nur Layout-Fix gemacht, kein End-to-End-Test.
- [ ] Vercel Env prüfen: `API2PDF_KEY` ist in Vercel Project Settings gesetzt (lokal ✅)
- [ ] **Angebot:** Neues anlegen → "Speichern & in Zoho ablegen" → PDF Link im Feld erscheint → "📄 PDF herunterladen" → echte PDF-Datei lokal
- [ ] **Lieferschein:** Same flow inkl. "Lieferschein Positionen in Zoho übertragen" Button
- [ ] **Rechnung:** Same flow für jeden Typ einzeln (siehe nächster Punkt)
- [ ] Layout prüfen: Header oben, Spalten "Beschreibung | Menge | Einzelpreis | Gesamtpreis" sauber getrennt, Margins korrekt (15mm/20mm), Logo sichtbar
- [ ] Iframe-Vorschau auf jeder Detail-Seite zeigt das echte PDF inline
- [ ] "🔗 PDF in neuem Tab öffnen" Link unter dem iframe funktioniert
- [ ] Falls Layout noch nicht passt: weitere CSS-Tuning Runde (`@page` margin, container padding)

### 2. Neue Rechnungsarten durchprobieren
RIHA-Style Erweiterung — alles via "Rechnung erzeugen" Dialog auf einem Angebot.
- [ ] **Migrationen 005, 006, 007, 008** in Supabase ausgeführt? Verifizieren via:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'rechnungen'
    AND column_name IN ('teilbetrag_netto', 'ist_schlussrechnung', 'storno_von',
                        'ansprechpartner', 'objekt_strasse', 'skonto_aktiv');
  ```
- [ ] **Normal (RE-):** voller Betrag aus Angebot übernommen, Positionen 1:1
- [ ] **Anzahlung (AN-):** Teilbetrag eingeben → Brutto auto, einzelne Pseudo-Position erzeugt, Nummer `AN-2026-XXXXX`
- [ ] **Teilrechnung (TR-):** wie Anzahlung aber `TR-2026-XXXXX`
- [ ] **Schlussrechnung (SR-):** Checkbox "Als Schlussrechnung markieren" → PDF zeigt Block "Bereits in Rechnung gestellt" mit AN-/TR-Auflistung + "Verbleibender Restbetrag"
- [ ] **Gutschrift (GS-):** leere Positionen, manuell befüllen
- [ ] **Storno:** Storno-Felder (Storno von Rechnung + Stornierungsgrund) speichern und im PDF korrekt rendern
- [ ] **Vermittler-Dropdown:** zeigt Namen statt UUID, klickbarer Link auf `/vermittler#<id>`
- [ ] **Skonto:** aktiv-Toggle + Prozent + Tage werden in DB persistiert
- [ ] **Pflichtfeld-Validation:** AN/TR ohne Teilbetrag → Toast-Error, kein Save
- [ ] **Saldo-Anzeige im OfferDetail:** "Bereits fakturiert" + "Offen" + "Vollständig fakturiert ✅" Banner wenn 0
- [ ] **Filter in Rechnungsliste:** Typ-Filter (Normal/Anzahlung/TR/SR/GS/Storno) funktioniert wirklich

### 3. n8n Flows umziehen + testen
Was bisher in Base44 lief, läuft nun gegen die AN-Suite. **Alle Flows anfassen:**
- [ ] Webhook-URLs in n8n auf neue Vercel-Domain umstellen
- [ ] **Outgoing (App → n8n):** Speichern-Buttons feuern Webhooks mit aktualisiertem Payload (jetzt inkl. echter PDF-Binary statt HTML)
  - [ ] Angebot: webhook `fccf5130-...` — Zoho Workdrive Upload prüfen
  - [ ] Rechnung: webhook `47c3bc5b-...` / `48a021d8-...` — beide Endpoints (Standard + manuelles Save&Zoho)
  - [ ] Lieferschein: webhook `b15d8baa-...` — inkl. neuem Push-Button (transferiert Positionen separat)
  - [ ] Sammelrechnung
  - [ ] Produkt anlegen
  - [ ] Vermittler anlegen
  - [ ] Rustler PDF Upload
- [ ] **Incoming (n8n → App):** alle `/api/webhooks/*` Endpoints durchtesten mit echten Zoho-Triggern
  - [ ] `/api/webhooks/offer`
  - [ ] `/api/webhooks/invoice`
  - [ ] `/api/webhooks/delivery-note`
  - [ ] `/api/webhooks/product`
  - [ ] `/api/webhooks/vermittler`
- [ ] **Ticket-Sync (Tourenplaner):** Lieferschein speichern → `tickets.angebotspositionen` wird im Tourenplaner aktualisiert (best-effort, Fehler dürfen Save nicht blockieren)
- [ ] **PDF im Zoho Workdrive prüfen:** öffnet sich als echtes PDF (kein HTML mehr)
- [ ] Webhook-Secret-Header `lassel-2026-secure-webhook` in jedem Flow gesetzt
- [ ] Bei Fehler: API Logs Seite (`/einstellungen/api-logs`) prüfen

## ✅ HEUTE (08.04.2026) — Erledigt

### Rechnungssystem-Erweiterung (RIHA-Style)
- ✅ Migration 005: `teilbetrag_netto/brutto`, `ist_schlussrechnung`, `bereits_fakturiert_netto`, `zahlungsstatus` (Spalten in `rechnungen`)
- ✅ Migration 006: `angebote.geschaeftsfallnummer/ansprechpartner`, `lieferscheine.kunde_uid/ansprechpartner/geschaeftsfallnummer`
- ✅ Migration 007: `rechnungen.ansprechpartner`, `objekt_strasse/plz/ort`, `objekt_ansprechpartner`, `skonto_aktiv/prozent/tage`
- ✅ Migration 008: `rechnungen.storno_von` (freier Text)
- ✅ `src/lib/rechnung-typ.ts` — zentrale Typdefinition + Nummerngenerator (RE/AN/TR/SR/GS Prefixes)
- ✅ `src/components/CreateInvoiceDialog.tsx` — Radio-Auswahl, Live-Saldo, Teilbetrag-Eingabe mit Brutto-Auto, Schlussrechnungs-Checkbox
- ✅ Angebot-Detail: "Rechnung erzeugen" öffnet jetzt Dialog statt sofort zu erstellen
- ✅ Schlussrechnung-PDF: Block "Bereits in Rechnung gestellt" mit AN-/TR-Auflistung + "Verbleibender Restbetrag"
- ✅ Vermittler-Dropdown (Angebot + Rechnung): zeigt Namen statt UUID + klickbarer Link
- ✅ Pflichtfeld-Validation für Anzahlung/Teilrechnung/Storno
- ✅ Rechnungsliste: Typ-Filter wirklich aktiv (war nur UI-deko)

### PDF Generierung Umbau
- ✅ `npm install api2pdf` (v2.1.0)
- ✅ `src/lib/pdf-renderer.ts` — zentraler `renderHtmlToPdfResponse(html, fileName, disposition)` Helper
- ✅ Alle 3 PDF-Routes (Angebot/Rechnung/Lieferschein) auf api2pdf umgestellt
- ✅ `window.print()` + `?download=1` Auto-Print Script entfernt (HTML wird jetzt zu echter PDF konvertiert)
- ✅ `Content-Disposition: attachment` bei `?download=1`, `inline` sonst
- ✅ Buffer-Durchreichung: api2pdf-CDN → Vercel-Route → Client (echte `application/pdf` Binary)
- ✅ **Layout-Fix:** doppelte Margins eliminiert (api2pdf: 0, HTML `@page` regelt alles), `header { margin-top: 30mm }` raus, `.container { padding: 0 20mm }` raus, Positions-Header Spalten neu verteilt (55/12/16/17 statt 60/10/15/15)
- ✅ Detail-Seiten: PDF Link Feld in der rechten Karte (initial leer, befüllt nach "Speichern & in Zoho ablegen")
- ✅ "📄 PDF herunterladen" Header-Button — disabled mit Tooltip wenn `pdf_url` null
- ✅ "🔗 PDF in neuem Tab öffnen" Link unter jeder iframe-Vorschau

### Lieferschein UX
- ✅ Neuer Button "Lieferschein Positionen in Zoho übertragen" — speichert + spiegelt Positionen ins Ticket im Tourenplaner + feuert n8n Webhook
- ✅ "Erstellt durch" Select → freier Text-Input
- ✅ Felder ergänzt: UID-Nummer (Empfänger), Ansprechpartner (Objekt), Geschäftsfallnummer
- ✅ `syncPositionsToTicket()` — Tourenplaner-Spiegelung als best-effort (Fehler blockieren Save nicht)

### Vorlagen + Beschreibungs-Modal
- ✅ Vorlagen-Dropdown im Angebot scrollbar (`max-h-[400px]` + `overflow-y-auto`)
- ✅ Schnellvorlagen im BeschreibungsModal: **anhängen statt überschreiben** (`appendText()` mit `\n`-Trenner)
- ✅ Mic-Button links im BeschreibungsModal: Audio → Whisper → Transkript wird an die Beschreibung **angehängt**

### Misc
- ✅ Vermittler-Query Bug gefixt: `eq('status', 'aktiv')` → `eq('aktiv', true)` (Spalte heißt `aktiv` BOOLEAN)
- ✅ Spaltenname `provisionssatz` → `provision_prozent` in Rechnung + Angebot UI (mit Fallback)
- ✅ `print-btn` CSS bleibt drin (toter Code, kein Cleanup)

## 🔴 KRITISCH – Sofort fixen

### Fußzeile PDF (Angebot + Rechnung)
- Problem: fusszeile aus DB wird nicht im PDF angezeigt
- Debug: console.log('DEBUG fusszeile:', data?.fusszeile) in beide PDF Routes
- Vercel Logs prüfen ob Spalte geladen wird
- SQL prüfen: SELECT column_name FROM information_schema.columns WHERE table_name = 'angebote' AND column_name = 'fusszeile'

## 🟡 OFFEN – Diese Session begonnen, noch nicht fertig

### Positionen Nummerierung
- Bug: alle Positionen zeigen "1" statt 1,2,3,4
- Fix: .map((p, i) => ({ ...p, position: i + 1 })) beim Laden
- Betrifft: angebote/[id], rechnungen/[id], lieferscheine/[id]

### Email Modal – Empfänger vorausfüllen
- offer.emailAngebot → emailAn State vorausfüllen
- rechnung.email_rechnung → emailAn State vorausfüllen
- useEffect bei isOpen triggern

### Lieferschein Detail Seite
- Prompt bereits erstellt, noch nicht deployed
- Analog zu angebote/[id]/page.tsx aufbauen
- KEINE Preise in Positionen (nur Beschreibung + Menge + Einheit)
- Autosave 2s Debounce
- Zoho Webhook beim Speichern

## 🟢 HEUTE ERLEDIGT

- ✅ Alle Dialogs global 95vw (dialog.tsx)
- ✅ Whisper Cross-Browser Spracheingabe
- ✅ KI-Kalkulator mit Lassel Preislogik
- ✅ PDF Templates exakt wie Base44 (AN, RE, LI)
- ✅ Supabase Realtime Live-Updates auf Listenseiten
- ✅ HI vs. Direktkunde Empfänger Logik in PDFs
- ✅ Rechnung PDF vollständige Feldintegration
- ✅ Alle n8n Flows umgestellt (Base44 → AN Suite):
  - Angebot erzeugen ✅
  - Rechnung erzeugen ✅
  - Sammelrechnung ✅
  - Produkte anlegen ✅
  - Vermittler anlegen ✅
  - Rustler Upload (Angebot aus PDF) ✅
- ✅ Alle Webhook Payloads korrekt gemappt
- ✅ Rechnungen: Leistungszeitraum, Zahlungskondition, HI-Logik
- ✅ Fußtext aus CompanySettings/einstellungen
- ✅ Parksperre Modal vollständig
- ✅ Rechnung Detail Seite (Teilzahlungen, Storno, Status)
- ✅ PDF weiße Vorschau (aspect-ratio A4)
- ✅ Responsive Design + alle Modals volle Breite

## 📋 BACKLOG

- [ ] Stammdaten Import: npx tsx --env-file=.env.local scripts/import-stammdaten.ts
- [ ] Textvorlagen CREATE Bug fixen
- [ ] Lieferschein Detail Seite live deployen
- [ ] Signaturen in Email Modal aus mitarbeiter Tabelle
- [ ] Storno Rechnung implementieren
- [ ] Teilzahlungen Tabelle anlegen
- [ ] API Logs Seite fixen
- [ ] Preise Migration: offer_positions → angebot_positionen
- [ ] Base44 deaktivieren (erst nach vollständigem Test!)

## 🗄️ SUPABASE – Noch auszuführende SQL
```sql
-- Stammdaten Import (falls noch nicht gemacht):
npx tsx --env-file=.env.local scripts/import-stammdaten.ts

-- Teilzahlungen Tabelle:
CREATE TABLE IF NOT EXISTS teilzahlungen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rechnung_id UUID REFERENCES rechnungen(id),
  betrag DECIMAL(10,2) NOT NULL,
  datum DATE NOT NULL,
  zahlungsart TEXT DEFAULT 'Überweisung',
  notiz TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🔗 WICHTIGE URLS
- Live: https://an-suite-lassel.vercel.app
- GitHub: Oliver080104-cocaptain/an-suite-lassel
- Supabase: ntknhomlvvododhtrret.supabase.co
- n8n Lassel: https://n8n.srv1367876.hstgr.cloud

## 🔑 WEBHOOK ENDPOINTS (alle live)
- Angebot: POST /api/webhooks/offer
- Rechnung: POST /api/webhooks/invoice
- Lieferschein: POST /api/webhooks/delivery-note
- Produkt: POST /api/webhooks/product
- Vermittler: POST /api/webhooks/vermittler
- Header: x-webhook-secret: lassel-2026-secure-webhook
