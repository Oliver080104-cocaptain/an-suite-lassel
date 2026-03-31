/**
 * LASSEL STAMMDATEN IMPORT
 * Importiert Mitarbeiter, Vermittler und Textvorlagen aus CSV
 *
 * Ausführen: npx tsx --env-file=.env.local scripts/import-stammdaten.ts
 *
 * Upsert-sicher: überspringt bereits vorhandene Einträge (by name/email)
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function log(msg: string) {
  console.log(msg)
}

function parseCSV(filename: string): Record<string, string>[] {
  const filepath = path.join(process.cwd(), 'datenimport', filename)
  if (!fs.existsSync(filepath)) {
    log(`⚠️  Datei nicht gefunden: ${filepath}`)
    return []
  }
  const content = fs.readFileSync(filepath, 'utf-8')
  const lines = content.split('\n')
  if (lines.length < 2) return []

  // Parse header
  const header = parseCSVLine(lines[0])

  const rows: Record<string, string>[] = []
  let i = 1
  while (i < lines.length) {
    // Collect multi-line CSV record (fields may contain newlines inside quotes)
    let record = lines[i]
    while (i + 1 < lines.length && !isCompleteCSVRecord(record, header.length)) {
      i++
      record += '\n' + lines[i]
    }
    const values = parseCSVLine(record)
    if (values.some(v => v.trim())) {
      const row: Record<string, string> = {}
      header.forEach((h, idx) => {
        row[h.trim()] = (values[idx] || '').trim()
      })
      rows.push(row)
    }
    i++
  }
  return rows
}

function isCompleteCSVRecord(line: string, expectedCols: number): boolean {
  const cols = parseCSVLine(line)
  return cols.length >= expectedCols
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ============================================================
// MITARBEITER
// ============================================================
async function importMitarbeiter() {
  log('\n👷 Importiere Mitarbeiter...')

  const { data: existing } = await supabase.from('mitarbeiter').select('email, vorname, nachname')
  const existingEmails = new Set((existing || []).map(m => m.email?.toLowerCase()).filter(Boolean))
  const existingNames = new Set((existing || []).map(m => `${m.vorname} ${m.nachname}`.toLowerCase()))

  const rows = parseCSV('Mitarbeiter_export.csv')
  log(`  ${rows.length} Einträge in CSV gefunden`)

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const fullName = row['name'] || ''
    const email = row['email'] || null
    if (!fullName) continue

    // Skip already existing
    if (email && existingEmails.has(email.toLowerCase())) {
      log(`  ⏭️  Übersprungen (existiert): ${fullName}`)
      skipped++
      continue
    }
    if (existingNames.has(fullName.toLowerCase())) {
      log(`  ⏭️  Übersprungen (existiert): ${fullName}`)
      skipped++
      continue
    }

    const nameParts = fullName.trim().split(' ')
    const vorname = nameParts[0] || fullName.trim()
    const nachname = nameParts.slice(1).join(' ') || ''
    const abteilung = row['abteilung'] || 'Innendienst'
    const aktiv = row['aktiv'] !== 'false'

    const { error } = await supabase.from('mitarbeiter').insert({
      vorname,
      nachname,
      email: email || null,
      rolle: abteilung,
      aktiv,
    })

    if (error) {
      log(`  ❌ ${fullName}: ${error.message}`)
    } else {
      log(`  ✅ ${fullName} (${email || 'keine E-Mail'})`)
      imported++
    }
  }

  log(`  → ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// VERMITTLER
// ============================================================
async function importVermittler() {
  log('\n🤝 Importiere Vermittler...')

  const { data: existing } = await supabase.from('vermittler').select('name')
  const existingNames = new Set((existing || []).map(v => v.name?.toLowerCase()).filter(Boolean))

  const rows = parseCSV('Vermittler_export.csv')
  log(`  ${rows.length} Einträge in CSV gefunden`)

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const name = row['name']?.trim()
    if (!name) continue

    if (existingNames.has(name.toLowerCase())) {
      log(`  ⏭️  Übersprungen (existiert): ${name}`)
      skipped++
      continue
    }

    const provisionssatz = parseFloat(row['provisionssatz'] || '0') || 0

    const insertData: Record<string, unknown> = {
      name,
      email: row['email'] || null,
      telefon: row['telefon'] || null,
      notizen: row['notizen'] || null,
    }

    // Try to add provisionssatz if column exists
    if (provisionssatz > 0) {
      insertData['provisionssatz'] = provisionssatz
    }

    const { error } = await supabase.from('vermittler').insert(insertData)

    if (error) {
      // Maybe provisionssatz column doesn't exist — retry without it
      if (error.message.includes('provisionssatz') || error.message.includes('column')) {
        delete insertData['provisionssatz']
        const { error: error2 } = await supabase.from('vermittler').insert(insertData)
        if (error2) {
          log(`  ❌ ${name}: ${error2.message}`)
          continue
        }
      } else {
        log(`  ❌ ${name}: ${error.message}`)
        continue
      }
    }

    log(`  ✅ ${name} (${provisionssatz}% Provision)`)
    imported++
  }

  log(`  → ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// TEXTVORLAGEN
// ============================================================
async function importTextvorlagen() {
  log('\n📄 Importiere Textvorlagen...')

  const { data: existing } = await supabase.from('textvorlagen').select('name')
  const existingTitles = new Set((existing || []).map(t => t.name?.toLowerCase().trim()).filter(Boolean))

  const rows = parseCSV('DescriptionTemplate_export.csv')
  log(`  ${rows.length} Einträge in CSV gefunden`)

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const name = row['name']?.trim()
    const text = row['text'] || ''
    const kategorie = row['kategorie'] || 'allgemein'
    const sortierung = parseInt(row['sortierung'] || '0') || 0

    if (!name) continue

    if (existingTitles.has(name.toLowerCase())) {
      log(`  ⏭️  Übersprungen (existiert): ${name}`)
      skipped++
      continue
    }

    const { error } = await supabase.from('textvorlagen').insert({
      name,
      inhalt: text,
      kategorie,
    })

    if (error) {
      log(`  ❌ ${name}: ${error.message}`)
    } else {
      log(`  ✅ ${name} [${kategorie || 'allgemein'}]`)
      imported++
    }
  }

  log(`  → ${imported} importiert, ${skipped} übersprungen`)
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('🚀 Lassel Stammdaten Import')
  log('============================')

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log('❌ Fehler: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY nicht gesetzt')
    log('   Ausführen mit: npx tsx --env-file=.env.local scripts/import-stammdaten.ts')
    process.exit(1)
  }

  await importMitarbeiter()
  await importVermittler()
  await importTextvorlagen()

  log('\n✨ Import abgeschlossen!')
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err)
  process.exit(1)
})
