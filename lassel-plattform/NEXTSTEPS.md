# NEXTSTEPS – Lassel GmbH AN-Suite
Stand: 08.04.2026

## 🧪 NÄCHSTE SESSION – Test-Sprint

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
