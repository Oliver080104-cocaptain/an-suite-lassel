/**
 * Importiert Produkte aus Product_export.csv in die Supabase products-Tabelle.
 * Ausführen: npx tsx scripts/import-products.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Einfacher CSV-Parser (kein papaparse nötig)
function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Header
  const headers = parseCsvLine(lines[0])

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim() })
    return row
  }).filter(r => r.produktName)
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let inQuotes = false
  let current = ''

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
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

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const csvPath = path.join(process.cwd(), '..', 'Daten Import', 'Product_export.csv')
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Datei nicht gefunden: ${csvPath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCsv(content)

  console.log(`📦 ${rows.length} Produkte gefunden. Importiere...`)

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const produktName = row.produktName?.trim()
    if (!produktName || row.is_sample === 'true') { skipped++; continue }

    const { error } = await supabase.from('products').upsert({
      produktName,
      beschreibung: row.beschreibung || null,
      einheit: row.einheit || 'Stk',
      standardpreisNetto: parseFloat(row.standardpreisNetto || '0') || 0,
      steuersatz: parseInt(row.steuersatz || '20') || 20,
      produktKategorie: row.produktKategorie || null,
      produkttyp: row.produkttyp || null,
      artikelnummer: row.artikelnummer || null,
      aktiv: row.aktiv !== 'false',
    }, { onConflict: 'produktName' })

    if (error) {
      console.warn(`  ⚠️  ${produktName}: ${error.message}`)
      skipped++
    } else {
      console.log(`  ✓ ${produktName}`)
      imported++
    }
  }

  console.log(`\n✅ Fertig: ${imported} importiert, ${skipped} übersprungen`)
}

main().catch(console.error)
