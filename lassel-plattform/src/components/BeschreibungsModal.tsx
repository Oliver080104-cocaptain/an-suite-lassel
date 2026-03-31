'use client'

import React, { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Sparkles, Mic, MicOff, Calculator, Check } from 'lucide-react'
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
  const [fehlende, setFehlende] = useState<string[]>([])
  const [kiLoading, setKiLoading] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  React.useEffect(() => {
    if (open) {
      setText(value)
      setKiInput('')
      setKalkulation(null)
      setFehlende([])
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

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setKiLoading(true)
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'recording.webm')
          const res = await fetch('/api/ki/transkription', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            setKiInput(data.text)
            handleKiKalkulation(data.text)
          }
        } catch (err) {
          console.error('Transkription error:', err)
          toast.error('Spracheingabe fehlgeschlagen')
        } finally {
          setKiLoading(false)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Mikrofon error:', err)
      toast.error('Mikrofon nicht verfügbar')
    }
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
      setFehlende(data.fehlende_angaben || [])
    } catch (err) {
      console.error('Kalkulation error:', err)
    } finally {
      setKiLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">{title || 'Beschreibung bearbeiten'}</DialogTitle>
        </DialogHeader>

        {/* Body: 2 columns */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* LEFT: Beschreibungstext */}
          <div className="flex flex-col p-6 border-r overflow-hidden" style={{ width: '50%', minWidth: 0 }}>
            {/* Label row */}
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <span className="text-sm font-semibold text-slate-800">Beschreibungstext</span>
              <button
                onClick={() => router.push('/einstellungen/textvorlagen')}
                className="text-xs text-blue-600 hover:underline whitespace-nowrap ml-2"
              >
                Vorlagen verwalten
              </button>
            </div>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-sm leading-relaxed resize-none"
              style={{ flex: '1 1 0', minHeight: 0 }}
              placeholder="Beschreibungstext eingeben..."
            />

            {/* Schnellvorlagen */}
            <div className="mt-4 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Schnellvorlagen</p>
              <div className="flex flex-wrap gap-2" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                {(vorlagen as any[]).length === 0 ? (
                  <p className="text-xs text-slate-400">Keine Vorlagen vorhanden</p>
                ) : (vorlagen as any[]).map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => setText(v.inhalt || v.text || '')}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 hover:bg-orange-50 hover:border-orange-300 transition-colors whitespace-nowrap"
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: KI-Kalkulator */}
          <div className="flex flex-col p-6 bg-slate-50 overflow-y-auto" style={{ width: '50%', minWidth: 0 }}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-5 flex-shrink-0">
              <div className="bg-[#E85A1B] rounded-lg p-1.5 flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-slate-900">KI-Kalkulator</span>
            </div>

            {/* Eingabe-Box */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5 flex-shrink-0">
              <p className="text-sm font-medium text-slate-700 mb-3">
                Beschreibe die Arbeit (Sprache oder Text):
              </p>
              <Textarea
                value={kiInput}
                onChange={(e) => setKiInput(e.target.value)}
                placeholder='z.B. "Taubenabwehr 50m² Netz, 30lfm Spitzen, Anfahrt 15km, 2 Mitarbeiter 3 Stunden"'
                rows={4}
                className="text-sm resize-none w-full mb-3"
                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleKiKalkulation() }}
              />
              <div className="flex gap-3">
                <Button
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleRecording}
                  disabled={kiLoading}
                  className="gap-2 flex-1"
                >
                  {isRecording ? (
                    <>
                      <MicOff className="h-4 w-4 flex-shrink-0" />
                      Aufnahme stoppen
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 flex-shrink-0" />
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
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <Calculator className="h-4 w-4 flex-shrink-0" />
                  )}
                  Berechnen
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">Strg+Enter zum Berechnen · Transkription via Whisper</p>
            </div>

            {/* Kalkulations-Ergebnis */}
            {kalkulation && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-shrink-0">
                <div className="bg-[#E85A1B] text-white px-4 py-3 flex items-center gap-2">
                  <Calculator className="h-4 w-4 flex-shrink-0" />
                  <span className="font-semibold text-sm">Kalkulation</span>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm mb-3">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1.5 text-xs text-slate-500 font-medium">Position</th>
                        <th className="text-right py-1.5 text-xs text-slate-500 font-medium">Menge</th>
                        <th className="text-right py-1.5 text-xs text-slate-500 font-medium">€/Einh.</th>
                        <th className="text-right py-1.5 text-xs text-slate-500 font-medium">Gesamt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kalkulation.positionen.map((p, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 text-xs text-slate-700">{p.bezeichnung}</td>
                          <td className="py-2 text-right text-xs text-slate-600 whitespace-nowrap">{p.menge} {p.einheit}</td>
                          <td className="py-2 text-right text-xs text-slate-600 whitespace-nowrap">{p.einzelpreis.toFixed(2)} €</td>
                          <td className="py-2 text-right text-xs font-semibold whitespace-nowrap">{p.gesamt.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="font-semibold text-sm text-slate-800">Gesamt Netto:</span>
                    <span className="text-2xl font-bold text-[#E85A1B]">
                      {kalkulation.gesamtNetto.toFixed(2)} €
                    </span>
                  </div>

                  {kalkulation.aufschluesselung && (
                    <p className="text-xs text-slate-500 mt-3 bg-slate-50 p-3 rounded-lg leading-relaxed">
                      {kalkulation.aufschluesselung}
                    </p>
                  )}

                  {fehlende.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                      <p className="text-xs font-medium text-yellow-700 mb-1">⚠️ Fehlende Angaben:</p>
                      {fehlende.map((f, i) => (
                        <p key={i} className="text-xs text-yellow-600">• {f}</p>
                      ))}
                    </div>
                  )}

                  {onPriceUpdate && (
                    <Button
                      onClick={() => {
                        onPriceUpdate(kalkulation.gesamtNetto)
                        toast.success(`Preis übernommen: ${kalkulation.gesamtNetto.toFixed(2)} € netto`)
                      }}
                      className="w-full mt-4 bg-green-600 hover:bg-green-700 gap-2"
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
        <div className="border-t px-6 py-4 flex justify-end gap-3 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white px-10">
            Übernehmen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
