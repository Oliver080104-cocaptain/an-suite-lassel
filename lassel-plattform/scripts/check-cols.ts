import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // Fetch one row to see actual columns
  const { data, error } = await sb.from('lieferschein_positionen').select('*').limit(1)
  console.log('lieferschein_positionen columns (from data):', error?.message || JSON.stringify(data))

  // Try inserting a minimal row to see which columns are required
  const testId = '00000000-0000-0000-0000-000000000001'
  const { error: e2 } = await sb.from('lieferschein_positionen').select('id, lieferschein_id, position, beschreibung, menge, einheit, notizen').limit(1)
  console.log('Column probe (all expected):', e2?.message || 'all exist')

  const { error: e3 } = await sb.from('lieferschein_positionen').select('notizen').limit(1)
  console.log('notizen exists?', e3?.message || 'YES')
}
main().catch(console.error)
