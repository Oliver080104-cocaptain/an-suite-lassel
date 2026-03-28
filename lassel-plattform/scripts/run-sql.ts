/**
 * Führt SQL direkt über die Supabase Management API aus.
 * Ausführen: npx tsx --env-file=.env.local scripts/run-sql.ts
 */

const PROJECT_REF = 'ntknhomlvvododhtrret'
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function runSQL(sql: string, label: string): Promise<boolean> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (res.ok) {
    const data = await res.json()
    console.log(`✅ ${label}:`, JSON.stringify(data).slice(0, 300))
    return true
  }

  const err = await res.text()
  console.log(`❌ ${label} (HTTP ${res.status}): ${err.slice(0, 400)}`)
  return false
}

async function main() {
  console.log('PROJECT_REF:', PROJECT_REF)
  console.log('SERVICE_ROLE:', SERVICE_ROLE?.slice(0, 30) + '...')
  console.log()

  // 1. Prüfen ob lieferscheine existiert
  await runSQL(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('lieferscheine','lieferschein_positionen');",
    'Tabellen prüfen'
  )

  // 2. Spalten von lieferschein_positionen prüfen
  await runSQL(
    "SELECT column_name FROM information_schema.columns WHERE table_name='lieferschein_positionen' ORDER BY ordinal_position;",
    'lieferschein_positionen Spalten'
  )

  // 3. NOTIFY
  await runSQL("SELECT pg_notify('pgrst', 'reload schema');", 'Schema-Cache reload')
}

main().catch(console.error)
