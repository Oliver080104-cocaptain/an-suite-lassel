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
import { Send, Paperclip, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  offerId: string
  angebotsnummer: string
  kundeName: string
  objektAdresse?: string
  bruttoGesamt?: number
  erstelltVon?: string
  emailAn?: string
  onSent?: () => void
}

export default function EmailVorschauModal({
  open, onClose, offerId, angebotsnummer, kundeName,
  objektAdresse, bruttoGesamt, erstelltVon, emailAn: emailAnProp, onSent
}: Props) {
  const [emailAn, setEmailAn] = useState(emailAnProp || '')
  const [betreff, setBetreff] = useState(`Ihr Angebot ${angebotsnummer}`)
  const [nachricht, setNachricht] = useState('')
  const [signaturId, setSignaturId] = useState('')
  const [kiPrompt, setKiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data } = await supabase.from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const selectedMitarbeiter = (mitarbeiterList as any[]).find((m: any) => m.id === signaturId)
  const signaturText = selectedMitarbeiter
    ? `Mit freundlichen Grüßen\n\n${selectedMitarbeiter.name}\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25, 2041 Wullersdorf\nTel.: +43 660 8060050\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`
    : ''

  const generateEmail = async (zusatzAnweisung?: string) => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ki/email-generieren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ: 'angebot', angebotsnummer, kundeName, objektAdresse, bruttoGesamt, erstelltVon, zusatzAnweisung }),
      })
      if (res.ok) {
        const data = await res.json()
        setNachricht(data.text || '')
      }
    } catch (err) {
      console.error('Email generation error:', err)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (open && !nachricht) generateEmail()
  }, [open])

  useEffect(() => {
    if (open) {
      setEmailAn(emailAnProp || '')
      setBetreff(`Ihr Angebot ${angebotsnummer}`)
    }
  }, [open, angebotsnummer, emailAnProp])

  const handleSenden = async () => {
    setSending(true)
    try {
      await supabase.from('angebote').update({ status: 'versendet' }).eq('id', offerId)
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId, angebotNummer: angebotsnummer, status: 'versendet',
          emailAn, betreff, nachricht, signatur: signaturText,
          timestamp: new Date().toISOString()
        }),
      }).catch(console.error)
      toast.success('E-Mail versendet')
      onSent?.()
      onClose()
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-8 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-[#E85A1B] text-2xl">✉</span> E-Mail Vorschau
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-8 pb-4 space-y-6">
          {/* Senden an */}
          <div>
            <Label className="font-semibold">Senden an:</Label>
            <Input value={emailAn} onChange={e => setEmailAn(e.target.value)} placeholder="empfaenger@email.at" className="mt-1" />
            <p className="text-xs text-gray-400 mt-1">E-Mail-Adresse kann angepasst werden</p>
          </div>

          {/* Betreff */}
          <div>
            <Label className="font-semibold">Betreff:</Label>
            <Input value={betreff} onChange={e => setBetreff(e.target.value)} className="mt-1" />
          </div>

          {/* Nachricht */}
          <div>
            <Label className="font-semibold">Nachricht:</Label>
            {generating ? (
              <div className="flex items-center gap-2 mt-3 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">E-Mail wird generiert...</span>
              </div>
            ) : (
              <Textarea value={nachricht} onChange={e => setNachricht(e.target.value)} rows={8} className="mt-1 resize-none" />
            )}
            <p className="text-xs text-gray-400 mt-1">{nachricht.length} Zeichen</p>
          </div>

          {/* Signatur */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">Signatur auswählen: <span className="text-red-500">*</span></Label>
              <Button variant="outline" size="sm">Eigene Signatur</Button>
            </div>
            <Select value={signaturId} onValueChange={(val) => setSignaturId(val || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Mitarbeiter auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {(mitarbeiterList as any[]).map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {signaturText && (
              <Textarea readOnly value={signaturText} rows={5} className="mt-2 resize-none bg-slate-50 text-sm font-mono" />
            )}
          </div>

          {/* Anhänge */}
          <div>
            <Label className="font-semibold flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Bilder/Anhänge hochladen:
            </Label>
            <div className="flex items-center gap-3 mt-2">
              <label className="cursor-pointer">
                <span className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer">Dateien auswählen</span>
                <input type="file" multiple accept="image/*,.pdf" className="hidden" />
              </label>
              <span className="text-sm text-slate-400">Keine ausgewählt</span>
            </div>
          </div>

          {/* KI-Assistent */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="font-medium">KI-Assistent</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={kiPrompt}
                onChange={e => setKiPrompt(e.target.value)}
                placeholder='z.B. "Beschreibe die Sicherheitsmaßnahmen" oder "Mache den Text formeller"'
                onKeyDown={e => { if (e.key === 'Enter' && kiPrompt.trim()) { generateEmail(kiPrompt); setKiPrompt('') } }}
              />
              <Button
                disabled={generating || !kiPrompt.trim()}
                onClick={() => { generateEmail(kiPrompt); setKiPrompt('') }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generieren'}
              </Button>
            </div>
            <p className="text-xs text-yellow-600 mt-2">
              💡 Tipp: Gib Befehle ein wie "Schreibe einen professionellen Einleitungstext"
            </p>
          </div>

        </div>

        <div className="border-t px-8 py-5 flex justify-end gap-3 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSenden} disabled={sending} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white">
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Jetzt versenden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
