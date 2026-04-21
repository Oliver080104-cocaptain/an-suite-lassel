This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Änderungsprotokoll — Session 2026-04-15

Stand nach dieser Session. Alles gebaut (`npm run build` grün) und deploy-bereit via `vercel --prod`.

### Feature-Ergänzungen

- **Geschäftsfallnummer im PDF-Header** für Angebot, Lieferschein und Rechnung. Wird unter „Ihr Ansprechpartner" eingeblendet, sobald in der DB gesetzt. Preview + echtes PDF sind automatisch synchron, weil die Detail-Seite iframe-basiert den PDF-Endpoint rendert.
  - Dateien: `src/app/api/pdf/angebot/[id]/route.ts`, `src/app/api/pdf/lieferschein/[id]/route.ts`, `src/app/api/pdf/rechnung/[id]/route.ts`
- **Positionen-Auswahl beim Erzeugen einer Rechnung aus einem Angebot.** Bei Rechnungstyp „normal" zeigt der `CreateInvoiceDialog` eine Checkbox-Liste aller Angebots-Positionen (alle vorausgewählt). Netto/USt/Brutto der Rechnung werden auf Basis der **tatsächlich übernommenen** Positionen neu berechnet — damit stimmen Positionen und Totals auch nach Teil-Abwahl überein.
  - Dateien: `src/components/CreateInvoiceDialog.tsx`, `src/app/angebote/[id]/page.tsx` (handleCreateInvoice)
- **KI-E-Mail-Vorschau mit 3 Stil-Buttons.** Über der Nachricht: „Formell" (Standard, kompakt, per Sie), „Ausführlicher" (formell + mehr Kontext, 8–12 Sätze) und „Lockerer" (freundlich-direkt, kürzere Form, startet mit „Hallo …"). Aktiver Stil ist orange hervorgehoben, Klick regeneriert den Text via OpenAI (Fallback auf Template ohne API-Key).
  - Dateien: `src/components/EmailVorschauModal.tsx`, `src/app/api/ki/email-generieren/route.ts`
- **Editierbare Dokumentnummern im Detail-Header.** Neues generisches Component `EditableDocNumber`: Stift-Icon on-hover → Inline-Edit mit Enter/Esc und DB-seitigem Uniqueness-Check. Eingebaut in Angebot (`AN-`), Lieferschein (`LI-`) und Rechnung (`RE-`).
  - Dateien: `src/components/shared/EditableDocNumber.tsx`, `src/app/angebote/[id]/page.tsx`, `src/app/lieferscheine/[id]/page.tsx`, `src/app/rechnungen/[id]/page.tsx`

### Bugfixes

- **RLS-Violation beim Lieferschein/Rechnung-Erzeugen aus Angebot** (`new row violates row-level security policy`). Ursache: In Produktion fehlten die „Allow all"-Policies auf `lieferschein_positionen` und `rechnung_positionen`. Behoben in Migration 010/011 (siehe unten).
- **`id: undefined`-Leak im Supabase-Insert** führte zu 400 Bad Request beim Speichern neuer Rechnungs-/Lieferschein-Positionen, weil PostgREST den Key trotz undefined-Wert im `columns=`-Hint erhielt. Entfernt in `src/app/rechnungen/[id]/page.tsx` und `src/app/lieferscheine/[id]/page.tsx`.
- **Rechnungen-Übersichtsliste zeigte „Kein Kunde" + „€ 0,00".** Ursache: `InvoiceListItem` las camelCase-Felder, DB liefert snake_case. Fix mit Mapping-Fallback-Block oben im Component (`src/components/invoices/InvoiceListItem.tsx`).
- **Vermittler-Dropdown im Angebot nicht beim ersten Öffnen auswählbar.** Ursache: Radix `Select` sammelt Items beim Mount, die Query war aber noch nicht fertig. Fix: `key={\`vermittler-select-${list.length}\`}` am `Select` — remount sobald Daten da sind. Gleicher Fix für Signatur-Dropdown im `EmailVorschauModal`.
- **Vermittler-Dropdown zeigte Namen statt UUID** (schon zuvor gefixt, aber hier zur Dokumentation).

### Migrationen

Folgende SQL-Migrationen **müssen im Supabase SQL Editor ausgeführt werden**, sie laufen nicht automatisch mit dem Vercel-Deploy:

- `supabase/migrations/009_rechnungen_geschaeftsfallnummer.sql` — neue Spalte `rechnungen.geschaeftsfallnummer`.
- `supabase/migrations/010_fix_rls_positionen.sql` — RLS-Policies für *_positionen reparieren (idempotent).
- `supabase/migrations/011_prod_db_sync.sql` — **empfohlen, konsolidiert 009 + 010** und ergänzt zusätzlich:
  - `vermittler.aktiv` Spalte (Ursache für 400 auf `?aktiv=eq.true`)
  - `teilzahlungen` Tabelle (Ursache für 404 beim Laden der Teilzahlungen)
  - `NOTIFY pgrst, 'reload schema'` am Ende

Wenn 011 läuft, sind 009 und 010 mit abgedeckt — nur eine Migration nötig.

### Bekanntes, offenes Thema

- **Verknüpfte Rechnung RE-2026-00056 zeigt €6.000 obwohl Angebot auf €1.439,99 reduziert wurde.** Kein Code-Bug: Die Rechnung wurde zu einem früheren Zeitpunkt mit dem damaligen Angebots-Brutto angelegt. Die neue Totals-Berechnung (siehe Feature-Punkt oben) verhindert diesen Mismatch ab jetzt. Stale Rechnung bei Bedarf stornieren oder im Papierkorb löschen.

