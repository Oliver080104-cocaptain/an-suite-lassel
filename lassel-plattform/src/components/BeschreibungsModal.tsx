'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Sparkles, Mic, Calculator, Check } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onSave: (text: string) => void
  title?: string
  onPriceUpdate?: (preis: number) => void
  objektAdresse?: string
}

export default function BeschreibungsModal({ open, onOpenChange, value, onSave, title, onPriceUpdate, objektAdresse }: Props) {
  const router = useRouter()
  const [text, setText] = useState(value)
  const [kiInput, setKiInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [kalkulation, setKalkulation] = useState<{
    positionen: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number; gesamt: number }[]
    gesamtNetto: number
    aufschluesselung: string
  } | null>(null)
  const [kiLoading, setKiLoading] = useState(false)

  React.useEffect(() => {
    if (open) {
      setText(value)
      setKiInput('')
      setKalkulation(null)
    }
  }, [open, value])

  const { data: vorlagen = [] } = useQuery({
    queryKey: ['textvorlagen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('textvorlagen').select('*').order('kategorie').order('name')
      if (error) throw error
      return data || []
    }
  })

  const handleSave = () => {
    onSave(text)
    onOpenChange(false)
  }

  function startRecording() {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Spracheingabe nur in Chrome verfügbar')
      return
    }
    const recognition = new (window as any).webkitSpeechRecognition()
    recognition.lang = 'de-AT'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => setIsRecording(false)
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setKiInput(transcript)
      handleKiKalkulation(transcript)
    }
    recognition.onerror = () => setIsRecording(false)
    recognition.start()
  }

  async function handleKiKalkulation(input?: string) {
    const eingabe = input || kiInput
    if (!eingabe.trim()) return
    setKiLoading(true)
    try {
      const res = await fetch('/api/ki/kalkulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eingabe, objektAdresse }),
      })
      const data = await res.json()
      if (data.kalkulation) setKalkulation(data.kalkulation)
      if (data.beschreibungstext) setText(data.beschreibungstext)
    } catch (err) {
      console.error('Kalkulation error:', err)
    } finally {
      setKiLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-8 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-xl">{title || 'Beschreibung bearbeiten'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">

          {/* LINKS: Beschreibungstext + Vorlagen */}
          <div className="flex flex-col p-6 border-r overflow-hidden">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <label className="font-medium text-sm">Beschreibungstext</label>
              <button
                onClick={() => router.push('/einstellungen/textvorlagen')}
                className="text-xs text-blue-600 hover:underline"
              >
                Vorlagen verwalten
              </button>
            </div>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 resize-none font-mono text-sm leading-relaxed min-h-0"
              placeholder="Beschreibungstext eingeben..."
            />

            <div className="mt-4 flex-shrink-0">
              <p className="text-xs font-medium text-gray-500 mb-2">Schnellvorlagen:</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {(vorlagen as any[]).length === 0 ? (
                  <p className="text-xs text-slate-400">Keine Vorlagen vorhanden</p>
                ) : (vorlagen as any[]).map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => setText(v.inhalt || v.text || '')}
                    className="text-xs px-3 py-1.5 rounded-full border hover:bg-orange-50 hover:border-orange-300 transition-colors text-left"
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RECHTS: KI-Kalkulator */}
          <div className="flex flex-col p-6 bg-gray-50 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 flex-shrink-0">
              <div className="bg-[#E85A1B] rounded-lg p-1.5">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold">KI-Kalkulator</span>
            </div>

            {/* Eingabe */}
            <div className="bg-white rounded-xl border p-4 mb-4 flex-shrink-0">
              <label className="text-sm font-medium mb-2 block">
                Beschreibe die Arbeit (Sprache oder Text):
              </label>
              <Textarea
                value={kiInput}
                onChange={(e) => setKiInput(e.target.value)}
                placeholder='z.B. "Taubenabwehr 50m² Netz, 30lfm Spitzen, Anfahrt 15km, 2 Mitarbeiter 3 Stunden"'
                rows={3}
                className="text-sm mb-3 resize-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleKiKalkulation() }}
              />
              <div className="flex gap-2">
                <Button
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={startRecording}
                  className="gap-2 flex-1"
                >
                  {isRecording ? (
                    <>
                      <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      Aufnahme läuft...
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Einsprechen
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleKiKalkulation()}
                  disabled={kiLoading || !kiInput.trim()}
                  className="bg-[#E85A1B] hover:bg-[#c94d17] gap-2 flex-1"
                  size="sm"
                >
                  {kiLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4" />
                  )}
                  Berechnen
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Strg+Enter zum Berechnen · Spricht Deutsch (Österreich)
              </p>
            </div>

            {/* Kalkulations-Ergebnis */}
            {kalkulation && (
              <div className="bg-white rounded-xl border overflow-hidden flex-shrink-0">
                <div className="bg-[#E85A1B] text-white px-4 py-3 flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  <span className="font-semibold text-sm">Kalkulation</span>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm mb-3">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 text-gray-500 font-medium text-xs">Position</th>
                        <th className="text-right py-1 text-gray-500 font-medium text-xs">Menge</th>
                        <th className="text-right py-1 text-gray-500 font-medium text-xs">€/Einh.</th>
                        <th className="text-right py-1 text-gray-500 font-medium text-xs">Gesamt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kalkulation.positionen.map((p, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 text-gray-700 text-xs">{p.bezeichnung}</td>
                          <td className="py-2 text-right text-gray-600 text-xs">{p.menge} {p.einheit}</td>
                          <td className="py-2 text-right text-gray-600 text-xs">{p.einzelpreis.toFixed(2)} €</td>
                          <td className="py-2 text-right font-medium text-xs">{p.gesamt.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="font-semibold text-sm">Gesamt Netto:</span>
                    <span className="text-xl font-bold text-[#E85A1B]">
                      {kalkulation.gesamtNetto.toFixed(2)} €
                    </span>
                  </div>

                  {kalkulation.aufschluesselung && (
                    <p className="text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded leading-relaxed">
                      {kalkulation.aufschluesselung}
                    </p>
                  )}

                  {onPriceUpdate && (
                    <Button
                      onClick={() => {
                        onPriceUpdate(kalkulation.gesamtNetto)
                        toast.success(`Preis übernommen: ${kalkulation.gesamtNetto.toFixed(2)} € netto`)
                      }}
                      className="w-full mt-3 bg-green-600 hover:bg-green-700 gap-2"
                      size="sm"
                    >
                      <Check className="h-4 w-4" />
                      Preis übernehmen ({kalkulation.gesamtNetto.toFixed(2)} €)
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-8 py-4 flex justify-end gap-3 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white px-8">
            Übernehmen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
