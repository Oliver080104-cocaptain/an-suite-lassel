import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Vercel Cron Job — läuft täglich um 03:00 UTC (siehe vercel.json).
 * Löscht alle Dokumente im Papierkorb endgültig, die seit mehr als
 * RETENTION_DAYS dort liegen (geloescht_am < NOW() - 30d).
 *
 * Authentifizierung: Vercel setzt bei Cron-Calls automatisch den Header
 * `authorization: Bearer $CRON_SECRET`. Wir prüfen dagegen. Aufrufe
 * ohne korrekten Bearer werden abgelehnt.
 *
 * Auch manuell aufrufbar via GET mit demselben Header (z.B. zum Testen).
 */

const RETENTION_DAYS = 30

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Bearer-Check. CRON_SECRET muss als Vercel Env-Variable gesetzt sein.
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-env-missing' }, { status: 500 })
  }
  // Service-Role um RLS zu umgehen (ist Cron, kein User-Request).
  const supabase = createClient(supabaseUrl, serviceKey)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)
  const cutoffIso = cutoff.toISOString()

  const result = {
    cutoff: cutoffIso,
    angebote: { deleted: 0, positionsDeleted: 0 },
    rechnungen: { deleted: 0, positionsDeleted: 0 },
    lieferscheine: { deleted: 0, positionsDeleted: 0 },
    errors: [] as string[],
  }

  // Angebote + zugehörige Positionen
  try {
    const { data: angeboteToDelete } = await supabase
      .from('angebote')
      .select('id')
      .not('geloescht_am', 'is', null)
      .lt('geloescht_am', cutoffIso)
    const ids = (angeboteToDelete || []).map((a: any) => a.id)
    if (ids.length > 0) {
      const { error: posErr, count: posCount } = await supabase
        .from('angebot_positionen')
        .delete({ count: 'exact' })
        .in('angebot_id', ids)
      if (posErr) result.errors.push(`angebot_positionen: ${posErr.message}`)
      else result.angebote.positionsDeleted = posCount || 0
      const { error: delErr } = await supabase
        .from('angebote')
        .delete()
        .in('id', ids)
      if (delErr) result.errors.push(`angebote: ${delErr.message}`)
      else result.angebote.deleted = ids.length
    }
  } catch (e: any) {
    result.errors.push(`angebote-cleanup: ${e.message}`)
  }

  // Rechnungen + zugehörige Positionen + Teilzahlungen
  try {
    const { data: rechnungenToDelete } = await supabase
      .from('rechnungen')
      .select('id')
      .not('geloescht_am', 'is', null)
      .lt('geloescht_am', cutoffIso)
    const ids = (rechnungenToDelete || []).map((r: any) => r.id)
    if (ids.length > 0) {
      const { error: posErr, count: posCount } = await supabase
        .from('rechnung_positionen')
        .delete({ count: 'exact' })
        .in('rechnung_id', ids)
      if (posErr) result.errors.push(`rechnung_positionen: ${posErr.message}`)
      else result.rechnungen.positionsDeleted = posCount || 0
      // teilzahlungen best-effort (ON DELETE CASCADE in Migration 011 sollte das eh abfedern)
      await supabase.from('teilzahlungen').delete().in('rechnung_id', ids)
      const { error: delErr } = await supabase
        .from('rechnungen')
        .delete()
        .in('id', ids)
      if (delErr) result.errors.push(`rechnungen: ${delErr.message}`)
      else result.rechnungen.deleted = ids.length
    }
  } catch (e: any) {
    result.errors.push(`rechnungen-cleanup: ${e.message}`)
  }

  // Lieferscheine + zugehörige Positionen
  try {
    const { data: lieferscheineToDelete } = await supabase
      .from('lieferscheine')
      .select('id')
      .not('geloescht_am', 'is', null)
      .lt('geloescht_am', cutoffIso)
    const ids = (lieferscheineToDelete || []).map((l: any) => l.id)
    if (ids.length > 0) {
      const { error: posErr, count: posCount } = await supabase
        .from('lieferschein_positionen')
        .delete({ count: 'exact' })
        .in('lieferschein_id', ids)
      if (posErr) result.errors.push(`lieferschein_positionen: ${posErr.message}`)
      else result.lieferscheine.positionsDeleted = posCount || 0
      const { error: delErr } = await supabase
        .from('lieferscheine')
        .delete()
        .in('id', ids)
      if (delErr) result.errors.push(`lieferscheine: ${delErr.message}`)
      else result.lieferscheine.deleted = ids.length
    }
  } catch (e: any) {
    result.errors.push(`lieferscheine-cleanup: ${e.message}`)
  }

  return NextResponse.json(result)
}
