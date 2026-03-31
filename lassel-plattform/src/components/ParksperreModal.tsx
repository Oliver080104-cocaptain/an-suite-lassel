'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Loader2, Send, Car, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  angebotsnummer?: string
  objektAdresse?: string
}

export default function ParksperreModal({ open, onClose, angebotsnummer, objektAdresse }: Props) {
  const [emailAn, setEmailAn] = useState('post@ma46.wien.gv.at')
  const [betreff, setBetreff] = useState('')
  const [nachricht, setNachricht] = useState('')
  const [absenderId, setAbsenderId] = useState('')
  const [kiPrompt, setKiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [dateien, setDateien] = useState<File[]>([])

  const { data: mitarbeiter = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data } = await supabase.from('mitarbeiter').select('id, name, rolle').eq('aktiv', true).order('name')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const generateText = async (zusatzAnweisung?: string) => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ki/email-generieren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ: 'parksperre', objektAdresse, angebotsnummer, zusatzAnweisung }),
      })
      if (res.ok) {
        const data = await res.json()
        setNachricht(data.text || '')
      }
    } catch (err) {
      console.error('Generation error:', err)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (open) {
      setBetreff(`Antrag auf Parkraumsperre – ${objektAdresse || '[Adresse]'}`)
      if (!nachricht) generateText()
    }
  }, [open, objektAdresse])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setDateien(prev => [...prev, ...files].slice(0, 3))
    e.target.value = ''
  }

  const handleSenden = async () => {
    setSending(true)
    try {
      const absender = (mitarbeiter as any[]).find((m: any) => m.id === absenderId)?.name || ''
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typ: 'parksperre', angebotsnummer, objektAdresse,
          emailAn, betreff, nachricht, absender,
          timestamp: new Date().toISOString()
        }),
      }).catch(console.error)
      toast.success('Parksperre-Antrag versendet')
      onClose()
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[92vh] max-h-[92vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 rounded-lg p-2 flex-shrink-0">
              <Car className="h-5 w-5 text-white" />
            </div>
            <DialogTitle className="text-lg font-semibold">Parksperre beantragen</DialogTitle>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Empfänger + Absender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Senden an</Label>
              <Input value={emailAn} onChange={e => setEmailAn(e.target.value)} className="mt-1" />
              <p className="text-xs text-slate-400 mt-1">MA46 – Parkraum und Straßenrecht</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Absender (Mitarbeiter)</Label>
              <Select value={absenderId} onValueChange={v => setAbsenderId(v || '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Mitarbeiter auswählen..." /></SelectTrigger>
                <SelectContent>
                  {(mitarbeiter as any[]).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Betreff */}
          <div>
            <Label className="text-sm font-medium text-slate-700">Betreff</Label>
            <Input value={betreff} onChange={e => setBetreff(e.target.value)} className="mt-1" />
          </div>

          {/* Nachricht */}
          <div>
            <Label className="text-sm font-medium text-slate-700">Nachricht</Label>
            {generating ? (
              <div className="flex items-center gap-2 mt-3 h-[200px] bg-slate-50 rounded-lg border border-slate-200 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="text-sm text-slate-500">Text wird generiert...</span>
              </div>
            ) : (
              <Textarea
                value={nachricht}
                onChange={e => setNachricht(e.target.value)}
                rows={9}
                className="mt-1 resize-none font-mono text-sm"
              />
            )}
            <p className="text-xs text-slate-400 mt-1">{nachricht.length} Zeichen</p>
          </div>

          {/* Screenshots Upload */}
          <div>
            <Label className="text-sm font-medium text-slate-700">Anhänge (max. 3 Dateien)</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {dateien.map((f, i) => (
                <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs">
                  <Paperclip className="w-3 h-3 text-blue-600" />
                  <span className="text-blue-700 max-w-[120px] truncate">{f.name}</span>
                  <button onClick={() => setDateien(d => d.filter((_, j) => j !== i))} className="text-blue-400 hover:text-blue-600 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {dateien.length < 3 && (
                <label className="cursor-pointer flex items-center gap-1.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors">
                  <Paperclip className="w-3 h-3" />
                  Datei hinzufügen
                  <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFileChange} />
                </label>
              )}
            </div>
          </div>

          {/* KI-Assistent */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-sm text-blue-900">KI-Assistent</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={kiPrompt}
                onChange={e => setKiPrompt(e.target.value)}
                placeholder='z.B. "Zeitraum 2 Wochen" oder "Formeller"'
                className="text-sm"
                onKeyDown={e => { if (e.key === 'Enter' && kiPrompt.trim()) { generateText(kiPrompt); setKiPrompt('') } }}
              />
              <Button
                disabled={generating || !kiPrompt.trim()}
                onClick={() => { generateText(kiPrompt); setKiPrompt('') }}
                className="bg-blue-600 hover:bg-blue-700 shrink-0"
                size="sm"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generieren'}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSenden} disabled={sending} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Antrag absenden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
