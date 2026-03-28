/**
 * Diagnose + Schema-Fix für lieferscheine
 * npx tsx --env-file=.env.local scripts/fix-schema.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SRK      = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function pgRestRpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SRK,
      'Authorization': `Bearer ${SRK}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

async function pgRestGet(table: string) {
  const res = await fetch(`${BASE_URL}/rest/v1/${table}?limit=1`, {
    headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}` },
  })
  const text = await res.text()
  return { status: res.status, body: text.slice(0, 200) }
}

async function main() {
  console.log('=== PostgREST Schema-Diagnose ===\n')

  // 1. Test: lieferscheine direkt abfragen
  const ls = await pgRestGet('lieferscheine')
  console.log(`GET /lieferscheine: HTTP ${ls.status} → ${ls.body}`)

  // 2. Test: lieferschein_positionen direkt abfragen
  const lsp = await pgRestGet('lieferschein_positionen')
  console.log(`GET /lieferschein_positionen: HTTP ${lsp.status} → ${lsp.body}`)

  // 3. Versuche pg_notify via RPC
  console.log('\n--- Versuche Schema-Cache reload ---')
  const notify1 = await pgRestRpc('pg_notify', { channel: 'pgrst', payload: 'reload schema' })
  console.log(`RPC pg_notify (channel/payload): HTTP ${notify1.status} → ${notify1.body.slice(0, 200)}`)

  const notify2 = await pgRestRpc('pg_notify', { '"channel"': 'pgrst', '"payload"': 'reload schema' })
  console.log(`RPC pg_notify (quoted): HTTP ${notify2.status} → ${notify2.body.slice(0, 200)}`)

  // 4. Versuche über supabase-js rpc
  const { data: d1, error: e1 } = await supabase.rpc('pg_notify', { channel: 'pgrst', payload: 'reload schema' } as any)
  console.log(`supabase.rpc pg_notify: data=${JSON.stringify(d1)}, error=${e1?.message}`)

  // 5. Warte 2s dann nochmal lieferscheine abrufen
  await new Promise(r => setTimeout(r, 2000))
  const ls2 = await pgRestGet('lieferscheine')
  console.log(`\nGET /lieferscheine (nach reload): HTTP ${ls2.status} → ${ls2.body}`)

  // 6. information_schema über existierende Funktion abfragen
  const { data: d2, error: e2 } = await supabase
    .from('information_schema.tables' as any)
    .select('table_name')
    .eq('table_schema', 'public')
    .in('table_name', ['lieferscheine', 'lieferschein_positionen'])
  console.log(`\ninformation_schema query: data=${JSON.stringify(d2)}, error=${e2?.message}`)
}

main().catch(console.error)
