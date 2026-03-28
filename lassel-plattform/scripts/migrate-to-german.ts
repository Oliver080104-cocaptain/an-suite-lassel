/**
 * MIGRATION: Englische Supabase-Tabellen → Deutsche Tabellen
 *
 * Ausführen:
 *   npx tsx --env-file=.env.local scripts/migrate-to-german.ts
 *
 * Migriert:
 *   products                → produkte
 *   offers                  → angebote
 *   invoices                → rechnungen
 *   delivery_notes          → lieferscheine
 *   offer_positions         → angebot_positionen
 *   invoice_positions       → rechnung_positionen
 *   delivery_note_positions → lieferschein_positionen
 *
 * WICHTIG: Quelltabellen haben MongoDB-IDs (24-char hex), keine UUIDs.
 * Daher werden neue UUIDs generiert und ID-Mappings in Memory gehalten.
 * Idempotent: prüft ob Daten bereits existieren (via unique columns).
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── ID-Mappings (alteId → neue UUID) ────────────────────────────────────────
const productIdMap   = new Map<string, string>()
const offerIdMap     = new Map<string, string>()
const invoiceIdMap   = new Map<string, string>()
const deliveryIdMap  = new Map<string, string>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`  ${msg}`) }

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

function str(v: unknown): string   { return v ? String(v).trim() : '' }
function num(v: unknown): number   { return v ? parseFloat(String(v).replace(',', '.')) || 0 : 0 }
function bool(v: unknown): boolean { return !['false', '0', 'nein', 'inactive', 'inaktiv'].includes(String(v).toLowerCase()) }

function parseDate(v: unknown): string | null {
  if (!v) return null
  const d = new Date(String(v).replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1'))
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

async function countRows(table: string): Promise<number> {
  const { count: n, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) return -1
  return n ?? 0
}

async function getAllRows(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select('*')
  if (error) { log(`❌ SELECT ${table}: ${error.message}`); return [] }
  return data || []
}

async function upsertBatch(
  destTable: string,
  rows: Record<string, unknown>[],
  conflictCol: string
): Promise<{ ok: number; fail: number }> {
  let ok = 0, fail = 0
  const CHUNK = 50

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from(destTable)
      .upsert(chunk as any, { onConflict: conflictCol, ignoreDuplicates: true })

    if (error) {
      log(`❌ Chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(rows.length / CHUNK)}: ${error.message}`)
      fail += chunk.length
    } else {
      ok += chunk.length
    }
  }
  return { ok, fail }
}

// ─── 1. products → produkte ───────────────────────────────────────────────────

async function migrateProdukte() {
  console.log('\n🛠️   products → produkte')

  // Bereits migrierte laden (Abgleich via name)
  const existing = await getAllRows('produkte')
  const existingByName = new Map(existing.map((r) => [str(r.name).toLowerCase(), str(r.id)]))

  const src = await getAllRows('products')
  if (!src.length) { log('ℹ️  Keine Daten in products'); return }
  log(`Quelle: ${src.length} Zeilen | Spalten: ${Object.keys(src[0]).join(', ')}`)

  const rows: Record<string, unknown>[] = []

  for (const row of src) {
    const name = str(pick(row, 'name', 'produktName', 'Name', 'produktname'))
    if (!name) continue

    // Prüfen ob bereits migriert
    const existingId = existingByName.get(name.toLowerCase())
    if (existingId) {
      productIdMap.set(str(row.id), existingId)
      continue
    }

    const newId = randomUUID()
    productIdMap.set(str(row.id), newId)

    rows.push({
      id: newId,
      name,
      beschreibung: str(pick(row, 'beschreibung', 'description')) || null,
      einheit: str(pick(row, 'einheit', 'unit')) || 'Stk',
      einzelpreis: num(pick(row, 'einzelpreis', 'standardpreisNetto', 'preis', 'price')),
      mwst_satz: num(pick(row, 'mwst_satz', 'steuersatz', 'mwst', 'vat')) || 20,
      kategorie: str(pick(row, 'kategorie', 'produktKategorie', 'category')) || null,
      aktiv: bool(pick(row, 'aktiv', 'active', 'status')),
    })
  }

  if (!rows.length) { log(`ℹ️  Alle ${src.length} bereits migriert`); return }
  const { ok, fail } = await upsertBatch('produkte', rows, 'id')
  log(`✅ ${ok} neu migriert, ⚠️  ${fail} Fehler, ℹ️  ${src.length - rows.length} bereits vorhanden`)
}

// ─── 2. offers → angebote ─────────────────────────────────────────────────────

async function migrateAngebote() {
  console.log('\n📄  offers → angebote')

  // Bereits migrierte laden (Abgleich via angebotsnummer)
  const existing = await getAllRows('angebote')
  const existingByNr = new Map(existing.map((r) => [str(r.angebotsnummer), str(r.id)]))

  const src = await getAllRows('offers')
  if (!src.length) { log('ℹ️  Keine Daten in offers'); return }
  log(`Quelle: ${src.length} Zeilen | Spalten: ${Object.keys(src[0]).join(', ')}`)

  const statusMap: Record<string, string> = {
    draft: 'entwurf', entwurf: 'entwurf',
    open: 'offen', offen: 'offen',
    sent: 'versendet', versendet: 'versendet',
    final: 'final',
    accepted: 'angenommen', angenommen: 'angenommen',
    rejected: 'abgelehnt', abgelehnt: 'abgelehnt',
    archived: 'archiviert', archiviert: 'archiviert',
    in_bearbeitung: 'entwurf',
  }

  const rows: Record<string, unknown>[] = []

  for (const row of src) {
    const nummer = str(pick(row, 'angebotNummer', 'angebotsnummer', 'nummer', 'offer_number'))
    const kundeName = str(pick(row, 'rechnungsempfaengerName', 'kundeName', 'kunde_name', 'customer_name'))

    if (!nummer || !kundeName) continue

    // Prüfen ob bereits migriert
    const existingId = existingByNr.get(nummer)
    if (existingId) {
      offerIdMap.set(str(row.id), existingId)
      continue
    }

    const newId = randomUUID()
    offerIdMap.set(str(row.id), newId)

    const statusRaw = str(pick(row, 'status')).toLowerCase()
    const status = statusMap[statusRaw] ?? 'entwurf'

    rows.push({
      id: newId,
      angebotsnummer: nummer,
      status,
      kunde_name: kundeName,
      kunde_strasse: str(pick(row, 'rechnungsempfaengerStrasse', 'kundeStrasse', 'kunde_strasse')) || null,
      kunde_plz:    str(pick(row, 'rechnungsempfaengerPlz', 'kundePlz', 'kunde_plz')) || null,
      kunde_ort:    str(pick(row, 'rechnungsempfaengerOrt', 'kundeOrt', 'kunde_ort')) || null,
      kunde_uid:    str(pick(row, 'uidnummer', 'uid', 'kunde_uid')) || null,
      angebotsdatum: parseDate(pick(row, 'datum', 'angebotsdatum', 'date')) || new Date().toISOString().split('T')[0],
      gueltig_bis:  parseDate(pick(row, 'gueltigBis', 'gueltig_bis', 'valid_until')) || null,
      objekt_adresse:    str(pick(row, 'objektStrasse', 'objekt_adresse', 'object_address')) || null,
      objekt_bezeichnung: str(pick(row, 'objektBezeichnung', 'objekt_bezeichnung')) || null,
      ticket_nummer: str(pick(row, 'ticketNumber', 'ticket_nummer')) || null,
      zoho_ticket_id: str(pick(row, 'ticketId', 'zoho_ticket_id', 'ticketIdentifikation')) || null,
      reverse_charge: bool(pick(row, 'reverseCharge', 'reverse_charge')),
      netto_gesamt:  num(pick(row, 'summeNetto', 'netto_gesamt', 'netto')),
      mwst_gesamt:   num(pick(row, 'summeUst', 'mwst_gesamt', 'mwst')),
      brutto_gesamt: num(pick(row, 'summeBrutto', 'brutto_gesamt', 'brutto', 'total')),
      pdf_url:   str(pick(row, 'pdfUrl', 'pdf_url')) || null,
      notizen:   str(pick(row, 'bemerkung', 'notizen', 'notes')) || null,
      geloescht_am: row.deleted_at ? parseDate(row.deleted_at) : null,
    })
  }

  // Deduplizieren nach angebotsnummer (bei doppelten Einträgen in der Quelle)
  const dedupMap = new Map<string, Record<string, unknown>>()
  for (const r of rows) dedupMap.set(str(r.angebotsnummer), r)
  const dedupedRows = Array.from(dedupMap.values())
  if (dedupedRows.length < rows.length)
    log(`ℹ️  ${rows.length - dedupedRows.length} Duplikate entfernt (gleiche Angebotsnummer)`)

  // offerIdMap korrigieren: alle Duplikate auf die finale UUID zeigen lassen
  const nummerToFinalId = new Map(dedupedRows.map(r => [str(r.angebotsnummer), str(r.id)]))
  for (const row of src) {
    const nummer = str(pick(row, 'angebotNummer', 'angebotsnummer', 'nummer', 'offer_number'))
    const finalId = nummerToFinalId.get(nummer)
    if (finalId) offerIdMap.set(str(row.id), finalId)
  }

  if (!dedupedRows.length) { log(`ℹ️  Alle ${src.length} bereits migriert`); return }
  const { ok, fail } = await upsertBatch('angebote', dedupedRows, 'angebotsnummer')
  log(`✅ ${ok} neu migriert, ⚠️  ${fail} Fehler, ℹ️  ${src.length - dedupedRows.length} bereits vorhanden/doppelt`)
}

// ─── 3. invoices → rechnungen ─────────────────────────────────────────────────

async function migrateRechnungen() {
  console.log('\n🧾  invoices → rechnungen')

  const existing = await getAllRows('rechnungen')
  const existingByNr = new Map(existing.map((r) => [str(r.rechnungsnummer), str(r.id)]))

  const src = await getAllRows('invoices')
  if (!src.length) { log('ℹ️  Keine Daten in invoices'); return }
  log(`Quelle: ${src.length} Zeilen | Spalten: ${Object.keys(src[0]).join(', ')}`)

  const rows: Record<string, unknown>[] = []

  for (const row of src) {
    const nummer = str(pick(row, 'rechnungsNummer', 'rechnungsnummer', 'invoice_number', 'nummer'))
    const kundeName = str(pick(row, 'kundeName', 'kunde_name', 'customer_name'))

    if (!nummer || !kundeName) continue

    const existingId = existingByNr.get(nummer)
    if (existingId) {
      invoiceIdMap.set(str(row.id), existingId)
      continue
    }

    const newId = randomUUID()
    invoiceIdMap.set(str(row.id), newId)

    const angebotNewId = str(pick(row, 'referenzAngebotId', 'angebotId', 'offer_id'))
    const angebotUUID = angebotNewId ? (offerIdMap.get(angebotNewId) ?? null) : null

    rows.push({
      id: newId,
      rechnungsnummer: nummer,
      angebot_id: angebotUUID,
      status: str(pick(row, 'status')) || 'offen',
      kunde_name: kundeName,
      kunde_strasse: str(pick(row, 'kundeStrasse', 'kunde_strasse')) || null,
      kunde_plz:    str(pick(row, 'kundePlz', 'kunde_plz')) || null,
      kunde_ort:    str(pick(row, 'kundeOrt', 'kunde_ort')) || null,
      kunde_uid:    str(pick(row, 'uidnummer', 'kunde_uid')) || null,
      rechnungsdatum: parseDate(pick(row, 'datum', 'rechnungsdatum', 'date')) || new Date().toISOString().split('T')[0],
      faellig_bis: parseDate(pick(row, 'faelligAm', 'faellig_bis', 'due_date')) || null,
      objekt_adresse: str(pick(row, 'objektBezeichnung', 'objekt_adresse')) || null,
      ticket_nummer:  str(pick(row, 'ticketNumber', 'ticket_nummer')) || null,
      netto_gesamt:   num(pick(row, 'summeNetto', 'netto_gesamt')),
      mwst_gesamt:    num(pick(row, 'summeUst', 'mwst_gesamt')),
      brutto_gesamt:  num(pick(row, 'summeBrutto', 'brutto_gesamt', 'total')),
      pdf_url:  str(pick(row, 'pdfUrl', 'pdf_url')) || null,
      notizen:  str(pick(row, 'bemerkung', 'notizen')) || null,
    })
  }

  if (!rows.length) { log(`ℹ️  Alle ${src.length} bereits migriert`); return }
  const { ok, fail } = await upsertBatch('rechnungen', rows, 'id')
  log(`✅ ${ok} neu migriert, ⚠️  ${fail} Fehler, ℹ️  ${src.length - rows.length} bereits vorhanden`)
}

// ─── 4. delivery_notes → lieferscheine ───────────────────────────────────────

async function migrateLieferscheine() {
  console.log('\n🚚  delivery_notes → lieferscheine')

  const existing = await getAllRows('lieferscheine')
  const existingByNr = new Map(existing.map((r) => [str(r.lieferscheinnummer), str(r.id)]))

  const src = await getAllRows('delivery_notes')
  if (!src.length) { log('ℹ️  Keine Daten in delivery_notes'); return }
  log(`Quelle: ${src.length} Zeilen`)

  const rows: Record<string, unknown>[] = []

  for (const row of src) {
    const nummer = str(pick(row, 'lieferscheinNummer', 'lieferscheinnummer', 'nummer', 'number'))
                || `LS-MIGR-${str(row.id).slice(0, 8)}`
    const kundeName = str(pick(row, 'kundeName', 'kunde_name', 'customer_name'))

    const existingId = existingByNr.get(nummer)
    if (existingId) {
      deliveryIdMap.set(str(row.id), existingId)
      continue
    }

    const newId = randomUUID()
    deliveryIdMap.set(str(row.id), newId)

    const angebotOldId = str(pick(row, 'referenzAngebotId', 'referenzangebotid', 'angebotId', 'offer_id'))
    const angebotUUID  = angebotOldId ? (offerIdMap.get(angebotOldId) ?? null) : null

    rows.push({
      id: newId,
      lieferscheinnummer: nummer,
      angebot_id:  angebotUUID,
      status:      str(pick(row, 'status')) || 'offen',
      kunde_name:  kundeName || 'Unbekannt',
      kunde_strasse: str(pick(row, 'kundeStrasse', 'kunde_strasse')) || null,
      kunde_plz:    str(pick(row, 'kundePlz', 'kunde_plz')) || null,
      kunde_ort:    str(pick(row, 'kundeOrt', 'kunde_ort')) || null,
      lieferdatum:  parseDate(pick(row, 'datum', 'lieferdatum', 'date')) || new Date().toISOString().split('T')[0],
      objekt_adresse: str(pick(row, 'objektBezeichnung', 'objektStrasse', 'objekt_adresse')) || null,
      ticket_nummer:  str(pick(row, 'ticketNumber', 'ticket_nummer')) || null,
      pdf_url:  str(pick(row, 'pdfUrl', 'pdf_url')) || null,
      notizen:  str(pick(row, 'bemerkung', 'notizen')) || null,
    })
  }

  const dedupMap = new Map<string, Record<string, unknown>>()
  for (const r of rows) dedupMap.set(str(r.lieferscheinnummer), r)
  const dedupedRows = Array.from(dedupMap.values())

  if (!dedupedRows.length) { log(`ℹ️  Alle ${src.length} bereits migriert`); return }
  const { ok, fail } = await upsertBatch('lieferscheine', dedupedRows, 'lieferscheinnummer')
  log(`✅ ${ok} neu migriert, ⚠️  ${fail} Fehler, ℹ️  ${src.length - dedupedRows.length} bereits vorhanden/doppelt`)
}

// ─── 5. offer_positions → angebot_positionen ─────────────────────────────────

async function migrateAngebotPositionen() {
  console.log('\n📋  offer_positions → angebot_positionen')

  const src = await getAllRows('offer_positions')
  if (!src.length) { log('ℹ️  Keine Daten'); return }
  log(`Quelle: ${src.length} Zeilen`)

  const rows = src
    .map((row) => {
      const angebotOldId = str(pick(row, 'offerId', 'offer_id', 'angebotId'))
      const angebotUUID  = offerIdMap.get(angebotOldId)
      if (!angebotUUID) return null

      const menge     = num(pick(row, 'menge', 'quantity')) || 1
      const ep        = num(pick(row, 'einzelpreisNetto', 'einzelpreis'))
      const mwst      = num(pick(row, 'ustSatz', 'mwst_satz', 'mwst')) || 20
      const rabatt    = num(pick(row, 'rabattProzent', 'rabatt_prozent'))
      const gesamtnetto = menge * ep * (1 - rabatt / 100)
      const gesamtbrutto = Math.round(gesamtnetto * (1 + mwst / 100) * 100) / 100

      return {
        id: randomUUID(),
        angebot_id:   angebotUUID,
        position:     num(pick(row, 'pos', 'position')) || 1,
        beschreibung: str(pick(row, 'beschreibung', 'description', 'produktName', 'name')) || '-',
        menge,
        einheit:      str(pick(row, 'einheit', 'unit')) || 'Stk',
        einzelpreis:  ep,
        mwst_satz:    mwst,
        rabatt_prozent: rabatt,
        gesamtpreis:  num(pick(row, 'gesamtBrutto', 'gesamtNetto')) || gesamtbrutto,
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (!rows.length) { log('⚠️  Keine IDs gemappt (offerIdMap leer?)'); return }

  // Bestehende Positionen für diese Angebote löschen (Idempotenz)
  const parentIds = [...new Set(rows.map(r => r.angebot_id as string))]
  const { error: delErr } = await supabase.from('angebot_positionen').delete().in('angebot_id', parentIds)
  if (delErr) log(`⚠️  Löschen bestehender Positionen: ${delErr.message}`)
  else log(`🗑️  Bestehende Positionen für ${parentIds.length} Angebote gelöscht`)

  const { ok, fail } = await upsertBatch('angebot_positionen', rows, 'id')
  log(`✅ ${ok} migriert, ⚠️  ${fail} Fehler`)
}

// ─── 6. invoice_positions → rechnung_positionen ──────────────────────────────

async function migrateRechnungPositionen() {
  console.log('\n📋  invoice_positions → rechnung_positionen')

  const src = await getAllRows('invoice_positions')
  if (!src.length) { log('ℹ️  Keine Daten'); return }
  log(`Quelle: ${src.length} Zeilen`)

  const rows = src
    .map((row) => {
      const invoiceOldId = str(pick(row, 'invoiceId', 'invoice_id', 'rechnungId'))
      const rechnungUUID = invoiceIdMap.get(invoiceOldId)
      if (!rechnungUUID) return null

      const menge  = num(pick(row, 'menge', 'quantity')) || 1
      const ep     = num(pick(row, 'einzelpreisNetto', 'einzelpreis'))
      const mwst   = num(pick(row, 'ustSatz', 'mwst_satz')) || 20
      const rabatt = num(pick(row, 'rabattProzent', 'rabatt_prozent'))
      const gesamt = Math.round(menge * ep * (1 - rabatt / 100) * (1 + mwst / 100) * 100) / 100

      return {
        id: randomUUID(),
        rechnung_id:  rechnungUUID,
        position:     num(pick(row, 'pos', 'position')) || 1,
        beschreibung: str(pick(row, 'beschreibung', 'description', 'produktName')) || '-',
        menge,
        einheit:      str(pick(row, 'einheit', 'unit')) || 'Stk',
        einzelpreis:  ep,
        mwst_satz:    mwst,
        rabatt_prozent: rabatt,
        gesamtpreis:  num(pick(row, 'gesamtBrutto', 'gesamtNetto')) || gesamt,
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (!rows.length) { log('⚠️  Keine IDs gemappt (invoiceIdMap leer?)'); return }

  // Bestehende Positionen löschen (Idempotenz)
  const parentIds = [...new Set(rows.map(r => r.rechnung_id as string))]
  const { error: delErr } = await supabase.from('rechnung_positionen').delete().in('rechnung_id', parentIds)
  if (delErr) log(`⚠️  Löschen: ${delErr.message}`)
  else log(`🗑️  Bestehende Positionen für ${parentIds.length} Rechnungen gelöscht`)

  const { ok, fail } = await upsertBatch('rechnung_positionen', rows, 'id')
  log(`✅ ${ok} migriert, ⚠️  ${fail} Fehler`)
}

// ─── 7. delivery_note_positions → lieferschein_positionen ────────────────────

async function migrateLieferscheinPositionen() {
  console.log('\n📋  delivery_note_positions → lieferschein_positionen')

  const src = await getAllRows('delivery_note_positions')
  if (!src.length) { log('ℹ️  Keine Daten'); return }
  log(`Quelle: ${src.length} Zeilen`)

  const rows = src
    .map((row) => {
      const dnOldId = str(pick(row, 'deliveryNoteId', 'delivery_note_id', 'lieferscheinId'))
      const lsUUID  = deliveryIdMap.get(dnOldId)
      if (!lsUUID) return null

      return {
        id: randomUUID(),
        lieferschein_id: lsUUID,
        position:    num(pick(row, 'pos', 'position')) || 1,
        beschreibung: str(pick(row, 'beschreibung', 'description', 'produktName', 'name')) || '-',
        menge:  num(pick(row, 'menge', 'quantity')) || 1,
        einheit: str(pick(row, 'einheit', 'unit')) || 'Stk',
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (!rows.length) { log('⚠️  Keine IDs gemappt (deliveryIdMap leer?)'); return }

  // Bestehende Positionen löschen (Idempotenz)
  const parentIds = [...new Set(rows.map(r => r.lieferschein_id as string))]
  const { error: delErr } = await supabase.from('lieferschein_positionen').delete().in('lieferschein_id', parentIds)
  if (delErr) log(`⚠️  Löschen: ${delErr.message}`)
  else log(`🗑️  Bestehende Positionen für ${parentIds.length} Lieferscheine gelöscht`)

  const { ok, fail } = await upsertBatch('lieferschein_positionen', rows, 'id')
  log(`✅ ${ok} migriert, ⚠️  ${fail} Fehler`)
}

// ─── Finale Zählung ───────────────────────────────────────────────────────────

async function printCounts() {
  console.log('\n📊  Datensätze in deutschen Tabellen:')
  const tables = [
    'produkte',
    'angebote',
    'angebot_positionen',
    'rechnungen',
    'rechnung_positionen',
    'lieferscheine',
    'lieferschein_positionen',
  ]
  for (const t of tables) {
    const n = await countRows(t)
    const icon = n < 0 ? '❌' : n === 0 ? '⚠️ ' : '✅'
    console.log(`  ${icon}  ${t.padEnd(28)} ${n < 0 ? 'Fehler' : n}`)
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function reloadPostgRESTSchema() {
  // Attempt to notify PostgREST to reload its schema cache.
  // Uses the Supabase Management API if SUPABASE_ACCESS_TOKEN is set,
  // otherwise prints the manual fix command.
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  const projectRef  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').split('.')[0].replace('https://', '')

  if (accessToken && projectRef) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" }),
      })
      if (res.ok) {
        log('✅ PostgREST Schema-Cache neu geladen (Management API)')
        return
      }
    } catch {}
  }

  // Fallback: instruct user to run manually
  log('ℹ️  Schema-Cache Reload: Bitte in Supabase SQL Editor ausführen:')
  log("   NOTIFY pgrst, 'reload schema';")
  log('   Danach Skript erneut starten.')
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Migration: Englische → Deutsche Supabase-Tabellen')
  console.log(`  URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log('═══════════════════════════════════════════════════════════')

  console.log('\n🔄  PostgREST Schema-Cache...')
  await reloadPostgRESTSchema()

  // Reihenfolge wegen FK-Abhängigkeiten!
  await migrateProdukte()
  await migrateAngebote()
  await migrateRechnungen()
  await migrateLieferscheine()
  await migrateAngebotPositionen()
  await migrateRechnungPositionen()
  await migrateLieferscheinPositionen()

  await printCounts()

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ✅ Migration abgeschlossen')
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
