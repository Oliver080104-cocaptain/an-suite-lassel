import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logEvent } from '@/lib/monitoring'

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
    if (!process.env.CRON_SECRET) {
      await logEvent('critical', 'cron-cleanup',
        'CRITICAL: Cron Cleanup fehlgeschlagen — CRON_SECRET fehlt',
        {}
      )
    }
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

  /**
   * Loescht eine Belegart endgueltig.
   *
   * Reihenfolge und Granularitaet sind entscheidend: vorher wurden erst die
   * Positionen der GANZEN Charge geloescht und danach die Belege als ein
   * einziges `.in('id', ids)`-Statement. Scheiterte das an einem
   * Fremdschluessel (rechnungen/lieferscheine verweisen auf angebote), waren
   * die Positionen ALLER Belege der Charge weg, kein einziger Beleg geloescht,
   * und im Papierkorb standen Karteileichen, deren Betraege nicht mehr zu
   * ihren Positionen passten.
   *
   * Jetzt je Beleg: erst der Hauptdatensatz, dann seine Positionen. Ein
   * blockierter Beleg stoppt die anderen nicht.
   */
  const raeumeAuf = async (
    haupt: string,
    positionen: string,
    fk: string,
    ziel: { deleted: number; positionsDeleted: number },
    vorabRaeumen?: (id: string) => Promise<void>
  ) => {
    try {
      const { data } = await supabase
        .from(haupt)
        .select('id')
        .not('geloescht_am', 'is', null)
        .lt('geloescht_am', cutoffIso)
      for (const zeile of (data || []) as { id: string }[]) {
        if (vorabRaeumen) await vorabRaeumen(zeile.id)
        const { error: delErr } = await supabase.from(haupt).delete().eq('id', zeile.id)
        if (delErr) {
          result.errors.push(`${haupt} ${zeile.id}: ${delErr.message}`)
          continue
        }
        ziel.deleted += 1
        const { count } = await supabase
          .from(positionen)
          .delete({ count: 'exact' })
          .eq(fk, zeile.id)
        ziel.positionsDeleted += count || 0
      }
    } catch (e) {
      result.errors.push(`${haupt}-cleanup: ${(e as Error).message}`)
    }
  }

  // Reihenfolge: Lieferscheine und Rechnungen zuerst, danach Angebote —
  // sonst blockieren die Folgebelege jedes Angebot per Fremdschluessel.
  await raeumeAuf('lieferscheine', 'lieferschein_positionen', 'lieferschein_id', result.lieferscheine)
  await raeumeAuf('rechnungen', 'rechnung_positionen', 'rechnung_id', result.rechnungen, async (id) => {
    // teilzahlungen best-effort (ON DELETE CASCADE in Migration 011 sollte das eh abfedern)
    await supabase.from('teilzahlungen').delete().eq('rechnung_id', id)
  })
  await raeumeAuf('angebote', 'angebot_positionen', 'angebot_id', result.angebote)

  if (result.errors.length > 0) {
    await logEvent('error', 'cron-cleanup',
      `Cron Cleanup mit Fehlern: ${result.errors.join(', ')}`,
      { errors: result.errors }
    )
  } else {
    await logEvent('info', 'cron-cleanup',
      `Cron Cleanup OK — ${result.angebote?.deleted} Angebote, ${result.rechnungen?.deleted} Rechnungen gelöscht`,
      { result }
    )
  }

  return NextResponse.json(result)
}
