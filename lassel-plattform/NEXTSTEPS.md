# NEXTSTEPS – Lassel GmbH AN-Suite
Stand: 31.03.2026

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
