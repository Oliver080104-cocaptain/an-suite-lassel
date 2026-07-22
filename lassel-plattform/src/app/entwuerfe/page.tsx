'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Inbox, Check, X, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'

/**
 * Entwürfe — Vorschläge, die über die API bzw. aus Claude hereingekommen sind.
 *
 * Ein Entwurf ist KEIN Beleg: er hat keine Nummer, taucht in keiner
 * Angebotsliste auf und in keiner Auswertung. Erst die Übernahme legt ein
 * echtes Angebot im Status "Entwurf" an.
 *
 * Bewusst KEINE Weiterleitung auf die Angebotsseite nach der Übernahme: deren
 * Öffnen startet den Autosave-Zyklus, und das soll eine bewusste Handlung
 * bleiben. Stattdessen wird die Nummer mit einem Link angezeigt.
 *
 * Die Seite spricht /api/entwuerfe an, nicht Supabase direkt — die Tabelle
 * hat RLS ohne Policy und ist mit dem Anon-Key nicht erreichbar. Das ist
 * Absicht: ein Vorschlag, den der Browser direkt umschreiben könnte, wäre
 * keine Freigabe.
 */

const MITARBEITER = ['Nikolas Schmadlak', 'Christoph Kribala', 'Reinhard Lassel']

interface Entwurf {
  id: string
  erstellt_am: string
  zustand: 'offen' | 'uebernommen' | 'verworfen'
  herkunft?: string | null
  notiz?: string | null
  daten: {
    kunde?: { name?: string }
    objekt?: { bezeichnung?: string; adresse?: string }
    reverseCharge?: boolean
    positionen?: { titel?: string; menge?: number; einheit?: string; einzelpreisNetto?: number; rabattProzent?: number; ustSatz?: number }[]
  }
  entschieden_am?: string | null
  entschieden_von?: string | null
  erzeugte_beleg_id?: string | null
  erzeugte_nummer?: string | null
  fehler?: string | null
}

const euro = (n: number) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(n) ? n : 0)

/** Vorschau der Summe. Maßgeblich rechnet der Server bei der Übernahme. */
function summeNetto(e: Entwurf): number {
  return (e.daten?.positionen || []).reduce((s, p) => {
    const zeile = (Number(p.menge) || 0) * (Number(p.einzelpreisNetto) || 0)
    return s + zeile * (1 - (Number(p.rabattProzent) || 0) / 100)
  }, 0)
}

export default function EntwuerfePage() {
  const queryClient = useQueryClient()
  const [zustand, setZustand] = useState<'offen' | 'uebernommen' | 'verworfen' | 'alle'>('offen')
  const [bearbeiter, setBearbeiter] = useState(MITARBEITER[0])
  const [laeuft, setLaeuft] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['entwuerfe', zustand],
    queryFn: async () => {
      const res = await fetch(`/api/entwuerfe?zustand=${zustand}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      return json as { anzahl: number; entwuerfe: Entwurf[] }
    },
    refetchInterval: 60_000,
  })

  const entscheiden = async (id: string, aktion: 'uebernehmen' | 'verwerfen') => {
    setLaeuft(id)
    try {
      const res = await fetch('/api/entwuerfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, aktion, entschiedenVon: bearbeiter }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)

      if (aktion === 'uebernehmen') {
        toast.success(`Angebot ${json.angebotsnummer} angelegt`)
      } else {
        toast.success('Entwurf verworfen')
      }
      await queryClient.invalidateQueries({ queryKey: ['entwuerfe'] })
      await queryClient.invalidateQueries({ queryKey: ['offers'] })
    } catch (err) {
      toast.error('Fehler: ' + (err as Error).message)
    } finally {
      setLaeuft(null)
    }
  }

  const entwuerfe = data?.entwuerfe || []

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-orange-50 p-3 rounded-lg">
            <Inbox className="w-8 h-8 text-[#E85A1B]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Entwürfe</h1>
            <p className="text-sm text-slate-500">
              Vorschläge aus der Schnittstelle. Ein Entwurf ist noch kein Angebot — erst die
              Übernahme legt einen Beleg mit Nummer an.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 my-6">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Anzeigen</label>
            <Select value={zustand} onValueChange={(v) => setZustand(v as typeof zustand)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="uebernommen">Übernommen</SelectItem>
                <SelectItem value="verworfen">Verworfen</SelectItem>
                <SelectItem value="alle">Alle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Ich entscheide als</label>
            <Select value={bearbeiter} onValueChange={(v) => setBearbeiter(v || MITARBEITER[0])}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MITARBEITER.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Card className="p-6 border-red-200 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-900">Entwürfe konnten nicht geladen werden</p>
                <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>
              </div>
            </div>
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Wird geladen…
          </div>
        )}

        {!isLoading && !error && entwuerfe.length === 0 && (
          <Card className="p-12 text-center text-slate-500">
            Keine Entwürfe in dieser Ansicht.
          </Card>
        )}

        <div className="space-y-4">
          {entwuerfe.map((e) => {
            const positionen = e.daten?.positionen || []
            const netto = summeNetto(e)
            const busy = laeuft === e.id
            return (
              <Card key={e.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">
                        {e.daten?.kunde?.name || '(ohne Kundenname)'}
                      </span>
                      {e.zustand === 'offen' && <Badge className="bg-orange-100 text-[#c94d17]">Offen</Badge>}
                      {e.zustand === 'uebernommen' && <Badge className="bg-green-100 text-green-800">Übernommen</Badge>}
                      {e.zustand === 'verworfen' && <Badge className="bg-slate-200 text-slate-600">Verworfen</Badge>}
                      {e.daten?.reverseCharge && <Badge variant="outline">Reverse Charge</Badge>}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {e.daten?.objekt?.bezeichnung || e.daten?.objekt?.adresse || 'kein Objekt angegeben'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(e.erstellt_am).toLocaleString('de-AT')}
                      {e.herkunft ? ` · ${e.herkunft}` : ''}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-semibold text-slate-900">{euro(netto)}</div>
                    <div className="text-xs text-slate-400">netto, {positionen.length} Position(en)</div>
                  </div>
                </div>

                {e.notiz && (
                  <p className="mt-3 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-900">
                    {e.notiz}
                  </p>
                )}

                <div className="mt-4 border-t pt-3 space-y-1">
                  {positionen.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex justify-between gap-4 text-sm">
                      <span className="text-slate-700 truncate">{p.titel}</span>
                      <span className="text-slate-500 whitespace-nowrap">
                        {p.menge} {p.einheit} × {euro(Number(p.einzelpreisNetto) || 0)}
                      </span>
                    </div>
                  ))}
                  {positionen.length > 8 && (
                    <p className="text-xs text-slate-400">… und {positionen.length - 8} weitere</p>
                  )}
                </div>

                {e.fehler && (
                  <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {e.fehler}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm text-slate-500">
                    {e.zustand === 'uebernommen' && e.erzeugte_nummer && (
                      <Link
                        href={`/angebote/${e.erzeugte_beleg_id}`}
                        className="inline-flex items-center gap-1 text-[#E85A1B] hover:underline"
                      >
                        {e.erzeugte_nummer} öffnen <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {e.zustand !== 'offen' && e.entschieden_von && (
                      <span className="ml-2 text-xs text-slate-400">
                        durch {e.entschieden_von}
                      </span>
                    )}
                  </div>

                  {e.zustand === 'offen' && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => entscheiden(e.id, 'verwerfen')}
                      >
                        <X className="w-4 h-4 mr-1" /> Verwerfen
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        className="bg-[#E85A1B] hover:bg-[#c94d17] text-white"
                        onClick={() => entscheiden(e.id, 'uebernehmen')}
                      >
                        {busy
                          ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          : <Check className="w-4 h-4 mr-1" />}
                        Als Angebot übernehmen
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
