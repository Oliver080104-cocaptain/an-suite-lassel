/**
 * LASSEL GMBH – DATENIMPORT AUS BASE44 CSV EXPORTS
 *
 * Ausführen: npm run import-data
 *
 * Legt CSV-Dateien aus /datenimport/ in Supabase an.
 * Verwendet upsert – kann beliebig oft wiederholt werden.
 *
 * Reihenfolge wegen Foreign Keys:
 *  1. hausverwaltungen        (keine FK)
 *  2. mitarbeiter             (keine FK)
 *  3. vermittler              (keine FK)
 *  4. produkte                (keine FK)
 *  5. offers                  (FK: hausverwaltungen, mitarbeiter, vermittler)
 *  6. offer_positions         (FK: offers)
 *  7. invoices                (FK: offers, mitarbeiter, vermittler)
 *  8. invoice_positions       (FK: invoices)
 *  9. delivery_notes          (FK: offers, mitarbeiter)
 * 10. delivery_note_positions (FK: delivery_notes)  ← Migration 003
 * 11. teilzahlungen           (FK: invoices)        ← Migration 003
 * 12. textvorlagen            (keine FK)           ← Migration 003
 * 13. tickets                 (keine FK)
 * 14. einstellungen/firma     (update)
 *
 * Übersprungen (kein Supabase-Äquivalent):
 * - SevDeskUmsatz_export.csv  → Externer Buchhaltungsexport
 */

import 'dotenv/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import Papa from 'papaparse'

// ============================================================
// SETUP
// ============================================================

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IMPORT_DIR = path.join(process.cwd(), 'datenimport')

// In-Memory ID-Maps: CSV-ID → Supabase UUID
const idMap = {
  hausverwaltungen: new Map<string, string>(),
  mitarbeiter: new Map<string, string>(),
  vermittler: new Map<string, string>(),
  produkte: new Map<string, string>(),
  offers: new Map<string, string>(),
  invoices: new Map<string, string>(),
  delivery_notes: new Map<string, string>(),
}

// ============================================================
// HELPERS
// ============================================================

function csvDateiExistiert(filename: string): boolean {
  return fs.existsSync(path.join(IMPORT_DIR, filename))
}

function leseCSV(filename: string): Record<string, string>[] {
  const filePath = path.join(IMPORT_DIR, filename)
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  ${filename} nicht gefunden – überspringe`)
    return []
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  if (result.errors.length > 0) {
    console.warn(`  ⚠️  Parse-Warnungen in ${filename}:`, result.errors.slice(0, 3))
  }
  return result.data
}

function parseDecimal(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  return parseFloat(val.replace(',', '.')) || 0
}

function parseInteger(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  return parseInt(val, 10) || 0
}

function parseBoolean(val: string | undefined): boolean {
  if (!val) return true
  return !['false', '0', 'nein', 'inactive', 'inaktiv'].includes(val.toLowerCase())
}

function parseDate(val: string | undefined): string | null {
  if (!val || val.trim() === '') return null
  // Verschiedene Datumsformate normalisieren
  const d = new Date(val.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1'))
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function firstOf(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k]
  }
  return ''
}

function log(msg: string) {
  console.log(`  ${msg}`)
}

// ============================================================
// 1. HAUSVERWALTUNGEN
// ============================================================

async function importHausverwaltungen() {
  console.log('\n📦 Importiere Hausverwaltungen...')
  const rows = leseCSV('Customer_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID', '_id')
    const name = firstOf(row, 'name', 'Name', 'firma', 'Firma', 'hausverwaltung')
    if (!name) { skipped++; continue }

    const data = {
      name: name.trim(),
      strasse: firstOf(row, 'strasse', 'street', 'address') || null,
      plz: firstOf(row, 'plz', 'zip', 'postleitzahl') || null,
      ort: firstOf(row, 'ort', 'city', 'stadt') || null,
      ustIdNr: firstOf(row, 'uid', 'uid_nummer', 'uidnummer', 'vatId') || null,
      email: firstOf(row, 'email', 'Email', 'e_mail') || null,
      telefon: firstOf(row, 'telefon', 'phone', 'tel') || null,
      ansprechpartner: firstOf(row, 'ansprechpartner', 'ansprechperson', 'contact') || null,
    }

    const { data: result, error } = await supabase
      .from('customers')
      .insert(data)
      .select('id')
      .single()

    if (error) {
      log(`❌ Hausverwaltung '${name}': ${error.message}`)
    } else {
      if (csvId && result) idMap.hausverwaltungen.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 2. MITARBEITER
// ============================================================

async function importMitarbeiter() {
  console.log('\n👷 Importiere Mitarbeiter...')
  const rows = leseCSV('Mitarbeiter_export.csv')
  if (!rows.length) return

  let imported = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID')
    const name = firstOf(row, 'name', 'Name', 'vollname', 'full_name')
    if (!name) continue

    const nameParts = name.trim().split(' ')
    const vorname = nameParts[0] || name.trim()
    const nachname = nameParts.slice(1).join(' ') || ''
    const data = {
      vorname,
      nachname,
      email: firstOf(row, 'email', 'Email') || null,
      rolle: firstOf(row, 'rolle', 'role', 'position') || 'techniker',
      aktiv: parseBoolean(firstOf(row, 'aktiv', 'active', 'status')),
    }

    const { data: result, error } = await supabase
      .from('mitarbeiter')
      .insert(data)
      .select('id')
      .single()

    if (error) {
      log(`❌ Mitarbeiter '${name}': ${error.message}`)
    } else {
      if (csvId && result) idMap.mitarbeiter.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert`)
}

// ============================================================
// 3. VERMITTLER
// ============================================================

async function importVermittler() {
  console.log('\n🤝 Importiere Vermittler...')
  const rows = leseCSV('Vermittler_export.csv')
  if (!rows.length) return

  let imported = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID')
    const name = firstOf(row, 'name', 'Name')
    if (!name) continue

    const data: Record<string, unknown> = {
      name: name.trim(),
      email: firstOf(row, 'email', 'Email') || null,
      telefon: firstOf(row, 'telefon', 'phone') || null,
      notizen: firstOf(row, 'notizen', 'notes') || null,
    }

    const { data: result, error } = await supabase
      .from('vermittler')
      .insert(data)
      .select('id')
      .single()

    if (error) {
      log(`❌ Vermittler '${name}': ${error.message}`)
    } else {
      if (csvId && result) idMap.vermittler.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert`)
}

// ============================================================
// 4. PRODUKTE
// ============================================================

async function importProdukte() {
  console.log('\n🛠️  Importiere Produkte...')
  const rows = leseCSV('Product_export.csv')
  if (!rows.length) return

  let imported = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID')
    const name = firstOf(row, 'name', 'Name', 'produktname', 'product_name')
    if (!name) continue

    const data = {
      produktName: name.trim(),
      artikelnummer: firstOf(row, 'artikelnummer', 'article_number', 'sku') || null,
      beschreibung: firstOf(row, 'beschreibung', 'description') || null,
      einheit: firstOf(row, 'einheit', 'unit') || 'Stk',
      standardpreisNetto: parseDecimal(firstOf(row, 'einzelpreis', 'preis', 'price', 'standardpreisNetto')),
      steuersatz: parseDecimal(firstOf(row, 'mwst_satz', 'mwst', 'vat', 'steuersatz')) || 20,
      produktKategorie: firstOf(row, 'kategorie', 'category') || null,
      aktiv: parseBoolean(firstOf(row, 'aktiv', 'active', 'status')),
    }

    const { data: result, error } = await supabase
      .from('products')
      .upsert(data, { onConflict: 'produktName' })
      .select('id')
      .single()

    if (error) {
      log(`❌ Produkt '${name}': ${error.message}`)
    } else {
      if (csvId && result) idMap.produkte.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert`)
}

// ============================================================
// 5. ANGEBOTE
// ============================================================

async function importAngebote() {
  console.log('\n📄 Importiere Angebote...')
  const rows = leseCSV('Offer_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID')
    const nummer = firstOf(row, 'angebotsnummer', 'angebotNummer', 'offer_number', 'nummer')
    const kundeName = firstOf(row, 'kunde_name', 'kundeName', 'rechnungsempfaengerName', 'customer_name', 'kunde')

    if (!nummer || !kundeName) { skipped++; continue }

    // FK Auflösung
    const hvCsvId = firstOf(row, 'hausverwaltung_id', 'hausverwaltungId', 'customer_id')
    const maId = firstOf(row, 'erstellt_von_id', 'erstelltVon', 'mitarbeiter_id', 'assignee_id')
    const vmId = firstOf(row, 'vermittler_id', 'vermittlerId')

    // Status-Mapping Base44 → Supabase ENUM
    const statusRaw = firstOf(row, 'status', 'Status').toLowerCase()
    const statusMap: Record<string, string> = {
      draft: 'entwurf', entwurf: 'entwurf',
      open: 'offen', offen: 'offen',
      sent: 'versendet', versendet: 'versendet',
      final: 'final',
      accepted: 'angenommen', angenommen: 'angenommen',
      rejected: 'abgelehnt', abgelehnt: 'abgelehnt',
      archived: 'archiviert', archiviert: 'archiviert',
    }
    const status = (statusMap[statusRaw] ?? 'entwurf') as string

    const data = {
      angebotNummer: nummer.trim(),
      status,
      rechnungsempfaengerName: kundeName.trim(),
      rechnungsempfaengerStrasse: firstOf(row, 'kunde_strasse', 'rechnungsempfaengerStrasse', 'strasse') || null,
      rechnungsempfaengerPlz: firstOf(row, 'kunde_plz', 'rechnungsempfaengerPlz', 'plz') || null,
      rechnungsempfaengerOrt: firstOf(row, 'kunde_ort', 'rechnungsempfaengerOrt', 'ort') || null,
      uidnummer: firstOf(row, 'kunde_uid', 'uidnummer', 'uid') || null,
      customerId: (hvCsvId && idMap.hausverwaltungen.get(hvCsvId)) || null,
      datum: parseDate(firstOf(row, 'angebotsdatum', 'datum', 'date')) || new Date().toISOString().split('T')[0],
      gueltigBis: parseDate(firstOf(row, 'gueltig_bis', 'gueltigBis', 'valid_until')) || null,
      erstelltDurch: null,
      vermittlerId: (vmId && idMap.vermittler.get(vmId)) || null,
      objektStrasse: firstOf(row, 'objekt_adresse', 'objektStrasse', 'object_address') || null,
      objektBezeichnung: firstOf(row, 'objekt_bezeichnung', 'objektBezeichnung') || null,
      ticketNumber: firstOf(row, 'ticket_nummer', 'ticketNumber', 'geschaeftsfallNummer') || null,
      ticketId: firstOf(row, 'zoho_ticket_id', 'ticketId') || null,
      reverseCharge: parseBoolean(firstOf(row, 'reverse_charge', 'reverseCharge')),
      source: firstOf(row, 'source') || 'import',
      summeNetto: parseDecimal(firstOf(row, 'netto_gesamt', 'nettoGesamt', 'netto')),
      summeUst: parseDecimal(firstOf(row, 'mwst_gesamt', 'mwstGesamt', 'mwst')),
      summeBrutto: parseDecimal(firstOf(row, 'brutto_gesamt', 'bruttoGesamt', 'brutto', 'total')),
      pdfUrl: firstOf(row, 'pdf_url', 'pdfUrl') || null,
      bemerkung: firstOf(row, 'notizen', 'bemerkung', 'notes') || null,
    }

    const { data: result, error } = await supabase
      .from('offers')
      .insert(data)
      .select('id')
      .single()

    if (error) {
      log(`❌ Angebot '${nummer}': ${error.message}`)
    } else {
      if (csvId && result) idMap.offers.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert, ${skipped} übersprungen (fehlende Pflichtfelder)`)
}

// ============================================================
// 6. ANGEBOT POSITIONEN
// ============================================================

async function importAngebotPositionen() {
  console.log('\n📋 Importiere Angebot-Positionen...')
  const rows = leseCSV('OfferPosition_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0

  // Batch-Insert für Performance
  const batch: object[] = []

  for (const row of rows) {
    const angebotCsvId = firstOf(row, 'offerId', 'angebot_id', 'angebotId', 'offer_id')
    const angebotId = angebotCsvId ? idMap.offers.get(angebotCsvId) : null
    if (!angebotId) { skipped++; continue }

    const beschreibung = firstOf(row, 'beschreibung', 'description', 'produktName', 'name')
    if (!beschreibung) { skipped++; continue }

    const menge = parseDecimal(firstOf(row, 'menge', 'quantity', 'qty')) || 1
    const einzelpreis = parseDecimal(firstOf(row, 'einzelpreis', 'unit_price', 'preis'))
    const mwst_satz = parseDecimal(firstOf(row, 'mwst_satz', 'mwst', 'vat')) || 20
    const rabatt = parseDecimal(firstOf(row, 'rabatt_prozent', 'rabatt', 'discount'))
    const netto = menge * einzelpreis * (1 - rabatt / 100)
    const gesamtpreis = Math.round(netto * (1 + mwst_satz / 100) * 100) / 100

    batch.push({
      offerId: angebotId,
      pos: parseInteger(firstOf(row, 'position', 'pos', 'sort_order')) || batch.length + 1,
      produktId: null,
      produktName: null,
      beschreibung: beschreibung.trim(),
      menge,
      einheit: firstOf(row, 'einheit', 'unit') || 'Stk',
      einzelpreisNetto: einzelpreis,
      ustSatz: mwst_satz,
      rabattProzent: rabatt,
      gesamtNetto: netto,
      gesamtBrutto: gesamtpreis,
    })
    imported++
  }

  if (batch.length > 0) {
    // In Chunks von 100
    for (let i = 0; i < batch.length; i += 100) {
      const chunk = batch.slice(i, i + 100)
      const { error } = await supabase.from('offer_positions').insert(chunk)
      if (error) log(`❌ Chunk ${i / 100 + 1}: ${error.message}`)
    }
  }

  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 7. RECHNUNGEN
// ============================================================

async function importRechnungen() {
  console.log('\n🧾 Importiere Rechnungen...')
  const rows = leseCSV('Invoice_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID')
    const nummer = firstOf(row, 'rechnungsNummer', 'rechnungsnummer', 'rechnungNummer', 'invoice_number', 'nummer')
    const kundeName = firstOf(row, 'kunde_name', 'kundeName', 'customer_name', 'kunde')

    if (!nummer || !kundeName) { skipped++; continue }

    const angebotCsvId = firstOf(row, 'angebot_id', 'angebotId', 'offer_id')
    const maId = firstOf(row, 'erstellt_von_id', 'erstelltVon', 'mitarbeiter_id')
    const vmId = firstOf(row, 'vermittler_id', 'vermittlerId')

    const data = {
      rechnungsNummer: nummer.trim(),
      rechnungstyp: firstOf(row, 'rechnungstyp', 'invoice_type') || 'rechnung',
      referenzAngebotId: (angebotCsvId && idMap.offers.get(angebotCsvId)) || null,
      status: firstOf(row, 'status') || 'offen',
      kundeName: kundeName.trim(),
      kundeStrasse: firstOf(row, 'kunde_strasse', 'strasse') || null,
      kundePlz: firstOf(row, 'kunde_plz', 'plz') || null,
      kundeOrt: firstOf(row, 'kunde_ort', 'ort') || null,
      uidnummer: firstOf(row, 'kunde_uid', 'uidnummer') || null,
      datum: parseDate(firstOf(row, 'rechnungsdatum', 'datum', 'date')) || new Date().toISOString().split('T')[0],
      faelligAm: parseDate(firstOf(row, 'faellig_bis', 'faelligBis', 'due_date')) || null,
      erstelltDurch: null,
      vermittlerId: (vmId && idMap.vermittler.get(vmId)) || null,
      objektBezeichnung: firstOf(row, 'objekt_adresse', 'objektBeschreibung') || null,
      ticketNumber: firstOf(row, 'ticket_nummer', 'ticketNumber') || null,
      summeNetto: parseDecimal(firstOf(row, 'netto_gesamt', 'netto')),
      summeUst: parseDecimal(firstOf(row, 'mwst_gesamt', 'mwst')),
      summeBrutto: parseDecimal(firstOf(row, 'brutto_gesamt', 'brutto', 'total')),
      pdfUrl: firstOf(row, 'pdf_url', 'pdfUrl') || null,
      bemerkung: firstOf(row, 'notizen', 'notes') || null,
    }

    const { data: result, error } = await supabase
      .from('invoices')
      .insert(data)
      .select('id')
      .single()

    if (error) {
      log(`❌ Rechnung '${nummer}': ${error.message}`)
    } else {
      if (csvId && result) idMap.invoices.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 8. RECHNUNG POSITIONEN
// ============================================================

async function importRechnungPositionen() {
  console.log('\n📋 Importiere Rechnung-Positionen...')
  const rows = leseCSV('InvoicePosition_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0
  const batch: object[] = []

  for (const row of rows) {
    const rechnungCsvId = firstOf(row, 'invoiceId', 'rechnung_id', 'rechnungId', 'invoice_id')
    const rechnungId = rechnungCsvId ? idMap.invoices.get(rechnungCsvId) : null
    if (!rechnungId) { skipped++; continue }

    const beschreibung = firstOf(row, 'beschreibung', 'description', 'name')
    if (!beschreibung) { skipped++; continue }

    const menge = parseDecimal(firstOf(row, 'menge', 'quantity')) || 1
    const einzelpreis = parseDecimal(firstOf(row, 'einzelpreis', 'unit_price'))
    const mwst_satz = parseDecimal(firstOf(row, 'mwst_satz', 'mwst', 'vat')) || 20
    const rabatt = parseDecimal(firstOf(row, 'rabatt_prozent', 'rabatt'))
    const netto = menge * einzelpreis * (1 - rabatt / 100)
    const gesamtpreis = Math.round(netto * (1 + mwst_satz / 100) * 100) / 100

    batch.push({
      invoiceId: rechnungId,
      pos: parseInteger(firstOf(row, 'position', 'pos')) || batch.length + 1,
      produktName: firstOf(row, 'produktName') || null,
      beschreibung: beschreibung.trim(),
      menge,
      einheit: firstOf(row, 'einheit', 'unit') || 'Stk',
      einzelpreisNetto: parseDecimal(firstOf(row, 'einzelpreisNetto')) || einzelpreis,
      ustSatz: parseDecimal(firstOf(row, 'ustSatz')) || mwst_satz,
      rabattProzent: parseDecimal(firstOf(row, 'rabattProzent')) || rabatt,
      gesamtNetto: parseDecimal(firstOf(row, 'gesamtNetto')) || netto,
      gesamtBrutto: parseDecimal(firstOf(row, 'gesamtBrutto')) || gesamtpreis,
    })
    imported++
  }

  for (let i = 0; i < batch.length; i += 100) {
    const { error } = await supabase.from('invoice_positions').insert(batch.slice(i, i + 100))
    if (error) log(`❌ Chunk ${i / 100 + 1}: ${error.message}`)
  }

  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 9. LIEFERSCHEINE
// ============================================================

async function importLieferscheine() {
  console.log('\n🚚 Importiere Lieferscheine...')
  const rows = leseCSV('DeliveryNote_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const csvId = firstOf(row, 'id', 'Id', 'ID')
    const nummer = firstOf(row, 'lieferscheinnummer', 'lieferscheinNummer', 'delivery_number', 'nummer')
    const kundeName = firstOf(row, 'kunde_name', 'kundeName', 'customer_name')

    if (!nummer || !kundeName) { skipped++; continue }

    const angebotCsvId = firstOf(row, 'angebot_id', 'angebotId', 'offer_id')
    const maId = firstOf(row, 'erstellt_von_id', 'erstelltVon', 'mitarbeiter_id')

    const data = {
      lieferscheinNummer: nummer.trim(),
      referenzAngebotId: (angebotCsvId && idMap.offers.get(angebotCsvId)) || null,
      status: firstOf(row, 'status') || 'offen',
      kundeName: kundeName.trim(),
      kundeStrasse: firstOf(row, 'kunde_strasse', 'strasse') || null,
      kundePlz: firstOf(row, 'kunde_plz', 'plz') || null,
      kundeOrt: firstOf(row, 'kunde_ort', 'ort') || null,
      datum: parseDate(firstOf(row, 'lieferdatum', 'datum', 'date')) || new Date().toISOString().split('T')[0],
      erstelltDurch: null,
      objektBezeichnung: firstOf(row, 'objekt_adresse', 'objektStrasse') || null,
      ticketNumber: firstOf(row, 'ticket_nummer', 'ticketNumber') || null,
      pdfUrl: firstOf(row, 'pdf_url', 'pdfUrl') || null,
    }

    const { data: result, error } = await supabase
      .from('delivery_notes')
      .insert(data)
      .select('id')
      .single()

    if (error) {
      log(`❌ Lieferschein '${nummer}': ${error.message}`)
    } else {
      if (csvId && result) idMap.delivery_notes.set(csvId, result.id)
      imported++
    }
  }
  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 10. TICKETS
// ============================================================

async function importTickets() {
  console.log('\n🎫 Importiere Tickets...')
  const rows = leseCSV('Ticket_export.csv')
  if (!rows.length) return

  let imported = 0

  for (const row of rows) {
    const zohoId = firstOf(row, 'zoho_id', 'zohoId', 'ticketIdZoho', 'id')
    if (!zohoId) continue

    const data = {
      zoho_id: zohoId,
      ticketnummer: firstOf(row, 'ticketnummer', 'ticketNumber', 'ticket_number') || null,
      projektstatus: firstOf(row, 'projektstatus', 'status', 'Status') || null,
      kunde_gasse: firstOf(row, 'kunde_gasse', 'kundeGasse', 'objekt_adresse', 'adresse') || null,
      gasse_zusatz: firstOf(row, 'gasse_zusatz', 'gasseZusatz') || null,
      bezirk: firstOf(row, 'bezirk', 'district') || null,
      hausinhabung: firstOf(row, 'hausinhabung') || null,
      ansprechperson: firstOf(row, 'ansprechperson', 'ansprechpartner') || null,
      dienstleistungen: firstOf(row, 'dienstleistungen') || null,
      skizzen_link: firstOf(row, 'skizzen_link', 'skizzenLink') || null,
      workdrive_id: firstOf(row, 'workdrive_id', 'workdriveID') || null,
      foto_ordner_id: firstOf(row, 'foto_ordner_id', 'fotoOrdnerID') || null,
      auftragssumme: parseDecimal(firstOf(row, 'auftragssumme')) || null,
      search_index: firstOf(row, 'search_index') || null,
      aktiv: parseBoolean(firstOf(row, 'aktiv', 'active', 'status')),
    }

    const { error } = await supabase
      .from('tickets')
      .upsert(data, { onConflict: 'ticketnummer' })

    if (error) {
      log(`❌ Ticket '${zohoId}': ${error.message}`)
    } else {
      imported++
    }
  }
  log(`✅ ${imported} importiert`)
}

// ============================================================
// 10b. LIEFERSCHEIN POSITIONEN (Migration 003)
// ============================================================

async function importLieferscheinPositionen() {
  console.log('\n📋 Importiere Lieferschein-Positionen...')
  const rows = leseCSV('DeliveryNotePosition_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0
  const batch: object[] = []

  for (const row of rows) {
    const lsCsvId = firstOf(row, 'lieferschein_id', 'lieferscheinId', 'delivery_note_id', 'deliveryNoteId')
    const lieferscheinId = lsCsvId ? idMap.delivery_notes.get(lsCsvId) : null
    if (!lieferscheinId) { skipped++; continue }

    const beschreibung = firstOf(row, 'beschreibung', 'description', 'name', 'artikel')
    if (!beschreibung) { skipped++; continue }

    batch.push({
      deliveryNoteId: lieferscheinId,
      pos: parseInteger(firstOf(row, 'position', 'pos', 'sort_order')) || batch.length + 1,
      beschreibung: beschreibung.trim(),
      produktName: null,
      menge: parseDecimal(firstOf(row, 'menge', 'quantity', 'qty')) || 1,
      einheit: firstOf(row, 'einheit', 'unit') || 'Stk',
    })
    imported++
  }

  for (let i = 0; i < batch.length; i += 100) {
    const { error } = await supabase.from('delivery_note_positions').insert(batch.slice(i, i + 100))
    if (error) log(`❌ Chunk ${i / 100 + 1}: ${error.message}`)
  }

  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 11b. TEILZAHLUNGEN / PARTIAL PAYMENTS (Migration 003)
// ============================================================

async function importTeilzahlungen() {
  console.log('\n💰 Importiere Teilzahlungen...')
  const rows = leseCSV('PartialPayment_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0
  const batch: object[] = []

  for (const row of rows) {
    const rechnungCsvId = firstOf(row, 'rechnung_id', 'rechnungId', 'invoice_id', 'invoiceId')
    const rechnungId = rechnungCsvId ? idMap.invoices.get(rechnungCsvId) : null
    if (!rechnungId) { skipped++; continue }

    const betrag = parseDecimal(firstOf(row, 'betrag', 'amount', 'summe'))
    if (!betrag) { skipped++; continue }

    batch.push({
      rechnung_id: rechnungId,
      betrag,
      datum: parseDate(firstOf(row, 'datum', 'date', 'paid_at')) || new Date().toISOString().split('T')[0],
      zahlungsart: firstOf(row, 'zahlungsart', 'payment_type', 'type') || 'überweisung',
      referenz: firstOf(row, 'referenz', 'reference', 'zahlungsreferenz') || null,
      notizen: firstOf(row, 'notizen', 'notes') || null,
    })
    imported++
  }

  for (let i = 0; i < batch.length; i += 100) {
    const { error } = await supabase.from('teilzahlungen').insert(batch.slice(i, i + 100))
    if (error) log(`❌ Chunk ${i / 100 + 1}: ${error.message}`)
  }

  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// 11c. TEXTVORLAGEN / DESCRIPTION TEMPLATES (Migration 003)
// ============================================================

async function importTextvorlagen() {
  console.log('\n📝 Importiere Textvorlagen...')
  const rows = leseCSV('DescriptionTemplate_export.csv')
  if (!rows.length) return

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const titel = firstOf(row, 'name', 'titel', 'title', 'bezeichnung')
    const inhalt = firstOf(row, 'text', 'inhalt', 'content', 'beschreibung', 'template')
    if (!titel || !inhalt) { skipped++; continue }

    const data = {
      name: titel.trim(),
      text: inhalt.trim(),
      kategorie: firstOf(row, 'kategorie', 'category', 'typ') || 'allgemein',
    }

    const { error } = await supabase
      .from('textvorlagen')
      .upsert(data, { onConflict: 'name' })

    if (error) {
      log(`❌ Textvorlage '${titel}': ${error.message}`)
    } else {
      imported++
    }
  }
  log(`✅ ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// SEVDESK UMSATZ – nur Zusammenfassung ausgeben
// ============================================================

async function logSevDeskUmsatz() {
  const rows = leseCSV('SevDeskUmsatz_export.csv')
  if (!rows.length) return

  console.log(`\n📊 SevDeskUmsatz: ${rows.length} Zeilen gefunden`)
  console.log('   → Wird nicht importiert (externer Buchhaltungsexport)')
  console.log('   → Bei Bedarf manuell in sevDesk oder DATEV übertragen')
}

// ============================================================
// 11. FIRMEN-EINSTELLUNGEN
// ============================================================

async function importEinstellungen() {
  console.log('\n⚙️  Importiere Einstellungen...')
  const rows = leseCSV('CompanySettings_export.csv')
  if (!rows.length) return

  const row = rows[0] // Nur erste Zeile relevant

  const firma = {
    name: firstOf(row, 'name', 'firma', 'company_name') || 'Lassel GmbH',
    strasse: firstOf(row, 'strasse', 'street', 'address') || 'Hetzmannsdorf 25',
    plz: firstOf(row, 'plz', 'zip') || '2041',
    ort: firstOf(row, 'ort', 'city') || 'Wullersdorf',
    land: firstOf(row, 'land', 'country') || 'Österreich',
    uid: firstOf(row, 'uid', 'uid_nummer', 'vatId') || '',
    email: firstOf(row, 'email', 'Email') || '',
    telefon: firstOf(row, 'telefon', 'phone') || '',
    iban: firstOf(row, 'iban', 'IBAN') || '',
    bic: firstOf(row, 'bic', 'BIC') || '',
    bank: firstOf(row, 'bank') || '',
    logo_url: firstOf(row, 'logo_url', 'logo') || '',
  }

  const { error } = await supabase
    .from('einstellungen')
    .update({ value: firma })
    .eq('key', 'firma')

  if (error) {
    log(`❌ Firmen-Einstellungen: ${error.message}`)
  } else {
    log('✅ Firmen-Einstellungen aktualisiert')
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🚀 Lassel GmbH – Datenimport aus Base44 CSV Exports')
  console.log('='.repeat(55))

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Fehlende Environment Variables. Bitte .env.local prüfen.')
    process.exit(1)
  }

  if (!fs.existsSync(IMPORT_DIR)) {
    console.error(`❌ Verzeichnis '${IMPORT_DIR}' nicht gefunden.`)
    console.error('   Bitte CSV-Dateien in /datenimport/ ablegen.')
    process.exit(1)
  }

  const csvFiles = fs.readdirSync(IMPORT_DIR).filter(f => f.endsWith('.csv'))
  console.log(`📁 Gefundene CSV-Dateien: ${csvFiles.join(', ') || 'keine'}`)

  // Import-Reihenfolge (Foreign Keys beachten!)
  await importHausverwaltungen()
  await importMitarbeiter()
  await importVermittler()
  await importProdukte()
  await importAngebote()
  await importAngebotPositionen()
  await importRechnungen()
  await importRechnungPositionen()
  await importLieferscheine()
  await importLieferscheinPositionen()  // Migration 003
  await importTeilzahlungen()           // Migration 003
  await importTextvorlagen()            // Migration 003
  await importTickets()
  await importEinstellungen()
  await logSevDeskUmsatz()              // nur Info, kein Import

  console.log('\n' + '='.repeat(55))
  console.log('✅ Import abgeschlossen!')
  console.log('\nID-Maps (CSV → Supabase):')
  for (const [table, map] of Object.entries(idMap)) {
    if (map.size > 0) console.log(`  ${table}: ${map.size} Einträge gemappt`)
  }
}

main().catch((err) => {
  console.error('\n💥 Unerwarteter Fehler:', err)
  process.exit(1)
})
