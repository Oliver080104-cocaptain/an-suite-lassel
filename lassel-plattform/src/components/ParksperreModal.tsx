'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Sparkles, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  angebotsnummer?: string
  objektAdresse?: string
}

export default function ParksperreModal({ open, onClose, angebotsnummer, objektAdresse }: Props) {
  const [emailAn, setEmailAn] = useState('ma48@wien.gv.at')
  const [betreff, setBetreff] = useState(`Antrag Parkraumsperre - ${objektAdresse || '[Adresse]'}`)
  const [nachricht, setNachricht] = useState('')
  const [kiPrompt, setKiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)

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
    if (open && !nachricht) generateText()
    if (open) {
      setBetreff(`Antrag Parkraumsperre - ${objektAdresse || '[Adresse]'}`)
    }
  }, [open, objektAdresse])

  const handleSenden = async () => {
    setSending(true)
    try {
      // Fire and forget to n8n or log
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typ: 'parksperre', angebotsnummer, objektAdresse,
          emailAn, betreff, nachricht, timestamp: new Date().toISOString()
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
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Parksperre beantragen</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div>
            <Label className="font-semibold">Senden an:</Label>
            <Input value={emailAn} onChange={e => setEmailAn(e.target.value)} className="mt-1" />
            <p className="text-xs text-gray-400 mt-1">Behörde / Magistrat</p>
          </div>

          <div>
            <Label className="font-semibold">Betreff:</Label>
            <Input value={betreff} onChange={e => setBetreff(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="font-semibold">Nachricht:</Label>
            {generating ? (
              <div className="flex items-center gap-2 mt-3 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Text wird generiert...</span>
              </div>
            ) : (
              <Textarea value={nachricht} onChange={e => setNachricht(e.target.value)} rows={10} className="mt-1 resize-none" />
            )}
            <p className="text-xs text-gray-400 mt-1">{nachricht.length} Zeichen</p>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="font-medium">KI-Assistent</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={kiPrompt}
                onChange={e => setKiPrompt(e.target.value)}
                placeholder='z.B. "Füge Zeitraum hinzu" oder "Formeller"'
                onKeyDown={e => { if (e.key === 'Enter' && kiPrompt.trim()) { generateText(kiPrompt); setKiPrompt('') } }}
              />
              <Button
                disabled={generating || !kiPrompt.trim()}
                onClick={() => { generateText(kiPrompt); setKiPrompt('') }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generieren'}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button onClick={handleSenden} disabled={sending} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white">
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Jetzt versenden
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
