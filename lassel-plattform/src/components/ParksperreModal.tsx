'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, Send, Car, Paperclip, X, Plus, Settings } from 'lucide-react'
import { toast } from 'sonner'
import SignaturenVerwaltenDialog from '@/components/SignaturenVerwaltenDialog'

interface Props {
  open: boolean
  onClose: () => void
  angebotsnummer?: string
  objektAdresse?: string
}

// Gleiche Signaturen wie in EmailVorschauModal — beim nächsten Refactor
// bitte in eine gemeinsame `signaturen.ts` auslagern (DRY), aktuell
// bewusst dupliziert um beide Modals unabhängig änderbar zu halten.
const SIGNATUREN: Record<string, string> = {
  'Nikolas Schmadlak': `Mit freundlichen Grüßen\nNikolas Schmadlak\nInnendienst\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25\nTel.: +43 660 3877214\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`,
  'Christoph Kribala': `Mit freundlichen Grüßen\nChristoph Kribala\nInnendienst\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25\nTel.: +43 660 1887474\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`,
  'Reinhard Lassel': `Mit freundlichen Grüßen\nReinhard Lassel\nGeschäftsführung\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25\nTel.: +43 660 8060050\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`,
}
const BUILTIN_SIGNATUREN = Object.entries(SIGNATUREN).map(([name, text]) => ({
  id: `builtin:${name}`,
  name,
  text,
}))

// Server-side API-Route bündelt Upload + n8n-Versand. Client-seitiger Upload
// zu Supabase Storage scheiterte an fehlendem Bucket (nur service-role kann
// anlegen), direkter n8n-Call scheiterte an CORS. Beides gelöst durch Proxy.
const PARKSPERRE_API = '/api/parksperre-senden'

export default function ParksperreModal({ open, onClose, angebotsnummer, objektAdresse }: Props) {
  const queryClient = useQueryClient()
  const [emailAn, setEmailAn] = useState('post@ma46.wien.gv.at')
  const [betreff, setBetreff] = useState('')
  const [nachricht, setNachricht] = useState('')
  const [signaturId, setSignaturId] = useState('')
  const [kiPrompt, setKiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [dateien, setDateien] = useState<File[]>([])
  const [newSigOpen, setNewSigOpen] = useState(false)
  const [verwaltenOpen, setVerwaltenOpen] = useState(false)
  const [newSigName, setNewSigName] = useState('')
  const [newSigText, setNewSigText] = useState('')
  const [savingSig, setSavingSig] = useState(false)

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter-aktiv'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      if (!error && data && data.length > 0) return data
      const fb = await supabase.from('mitarbeiter').select('*').order('name')
      return fb.data || []
    },
    staleTime: 60 * 1000,
  })

  const { data: dbSignaturen = [] } = useQuery({
    queryKey: ['signaturen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('signaturen').select('*').eq('aktiv', true).order('name')
      if (error) return []
      return data || []
    },
    staleTime: 60 * 1000,
  })

  const allSignaturen = (() => {
    const byName = new Map<string, { id: string; name: string; text: string }>()
    for (const s of BUILTIN_SIGNATUREN) byName.set(s.name, s)
    for (const m of (mitarbeiterList as any[])) {
      if (!m?.name) continue
      const text = SIGNATUREN[m.name]
        || `Mit freundlichen Grüßen\n${m.name}\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25, 2041 Wullersdorf\nE-Mail: office@hoehenarbeiten-lassel.at`
      byName.set(m.name, { id: m.id, name: m.name, text })
    }
    for (const s of (dbSignaturen as any[])) {
      if (!s?.name) continue
      byName.set(s.name, { id: `sig:${s.id}`, name: s.name, text: s.text || '' })
    }
    return Array.from(byName.values())
  })()

  const selectedSig = allSignaturen.find(s => s.id === signaturId)
  const signaturText = selectedSig?.text || ''

  const handleSaveNewSignatur = async () => {
    const name = newSigName.trim()
    const text = newSigText.trim()
    if (!name || !text) { toast.error('Name und Signatur-Text sind Pflicht'); return }
    setSavingSig(true)
    try {
      const { data, error } = await supabase.from('signaturen').insert({ name, text, aktiv: true }).select().single()
      if (error) throw error
      toast.success('Signatur gespeichert')
      await queryClient.invalidateQueries({ queryKey: ['signaturen'] })
      setSignaturId(`sig:${data.id}`)
      setNewSigOpen(false); setNewSigName(''); setNewSigText('')
    } catch (err: any) {
      const msg = err?.message || 'Unbekannter Fehler'
      if (/signaturen/i.test(msg) && /does not exist|not found|schema cache/i.test(msg)) {
        toast.error('Tabelle fehlt — bitte Migration 015_signaturen.sql ausführen')
      } else {
        toast.error('Fehler beim Speichern: ' + msg)
      }
    } finally {
      setSavingSig(false)
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, objektAdresse])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setDateien(prev => [...prev, ...files].slice(0, 3))
    e.target.value = ''
  }

  /**
   * Lädt Anhänge direkt aus dem Browser in den public Bucket
   * `parksperre-anhaenge` (Migration 018). Umgeht Vercel's 4.5MB
   * Body-Limit — war vorher die Ursache für 502 beim Senden mit
   * größeren Skizzen. Returnt [{url, name}] für den Webhook.
   */
  const uploadAttachmentsDirect = async (): Promise<{ url: string; name: string }[]> => {
    if (dateien.length === 0) return []
    const results: { url: string; name: string }[] = []
    for (const f of dateien) {
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${Date.now()}-${safeName}`
      const { error } = await supabase.storage
        .from('parksperre-anhaenge')
        .upload(path, f, { upsert: false, contentType: f.type || 'application/octet-stream' })
      if (error) {
        // Bucket fehlt → klarer Hinweis auf Migration 018
        if (/bucket not found/i.test(error.message || '')) {
          throw new Error(
            'Storage-Bucket fehlt. Bitte Migration 018_parksperre_anhaenge_bucket.sql in Supabase ausführen.'
          )
        }
        throw new Error(`Upload fehlgeschlagen für ${f.name}: ${error.message}`)
      }
      const { data } = supabase.storage.from('parksperre-anhaenge').getPublicUrl(path)
      results.push({ url: data.publicUrl, name: f.name })
    }
    return results
  }

  const handleSenden = async () => {
    if (!emailAn.trim()) { toast.error('Empfänger-E-Mail fehlt'); return }
    if (!signaturId) { toast.error('Bitte eine Signatur auswählen'); return }
    setSending(true)
    try {
      // 1) Anhänge zuerst direkt nach Supabase — keine Vercel-Body-Grenze.
      const attachments = await uploadAttachmentsDirect()

      // 2) HTML-Body zusammenbauen (escaped + \n → <br>).
      const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      const bodyHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
          ${escapeHtml(nachricht)}
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; color: #555;">
            ${escapeHtml(signaturText)}
          </div>
        </div>
      `.trim()

      // 3) JSON-POST an Proxy-Route — die triggert n8n server-to-server
      //    (umgeht CORS) und hat keine Body-Größen-Sorgen weil wir nur
      //    noch die URLs + Mail-Text schicken.
      const resp = await fetch(PARKSPERRE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          angebotsnummer,
          objektAdresse,
          attachments,
          email: {
            to: emailAn,
            subject: betreff,
            body: bodyHtml,
            mitarbeiter: selectedSig?.name || '',
            signatur: signaturText,
          },
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        const extra = err?.n8nStatus ? ` (n8n ${err.n8nStatus})` : ''
        throw new Error((err?.error || `HTTP ${resp.status}`) + extra)
      }

      toast.success('Parksperre-Antrag versendet')
      onClose()
    } catch (err: any) {
      toast.error('Fehler: ' + (err?.message || 'unbekannt'))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[92vh] max-h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-8 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="bg-blue-600 rounded-lg p-1.5 inline-flex">
              <Car className="h-5 w-5 text-white" />
            </span>
            Parksperre beantragen
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-8 pb-4 space-y-6">
          {/* Empfänger */}
          <div>
            <Label className="font-semibold">Senden an: <span className="text-red-500">*</span></Label>
            <Input
              value={emailAn}
              onChange={e => setEmailAn(e.target.value)}
              placeholder="post@ma46.wien.gv.at"
              className="mt-2"
            />
            <p className="text-xs text-slate-400 mt-1">MA46 – Parkraum und Straßenrecht (Wien)</p>
          </div>

          {/* Betreff */}
          <div>
            <Label className="font-semibold">Betreff:</Label>
            <Input value={betreff} onChange={e => setBetreff(e.target.value)} className="mt-2" />
          </div>

          {/* Nachricht + KI */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">Nachricht:</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => generateText()}
                disabled={generating}
                className="text-[#E85A1B] hover:bg-orange-50 gap-1.5"
              >
                {generating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />
                }
                Neu generieren
              </Button>
            </div>
            {generating ? (
              <div className="flex items-center gap-2 h-[180px] bg-slate-50 rounded-lg border border-slate-200 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="text-sm text-slate-500">Text wird generiert…</span>
              </div>
            ) : (
              <Textarea
                value={nachricht}
                onChange={e => setNachricht(e.target.value)}
                rows={9}
                className="resize-none font-mono text-sm"
              />
            )}
            <p className="text-xs text-slate-400 mt-1">{nachricht.length} Zeichen</p>

            {/* KI-Prompt-Feld */}
            <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-sm text-blue-900">KI-Assistent</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={kiPrompt}
                  onChange={e => setKiPrompt(e.target.value)}
                  placeholder='z.B. "Zeitraum 2 Wochen" oder "Formeller"'
                  className="text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && kiPrompt.trim()) {
                      generateText(kiPrompt)
                      setKiPrompt('')
                    }
                  }}
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

          {/* Signatur */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">Signatur auswählen: <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setVerwaltenOpen(true)} className="gap-1">
                  <Settings className="w-4 h-4" />
                  Verwalten
                </Button>
                <Button variant="outline" size="sm" onClick={() => setNewSigOpen(v => !v)} className="gap-1">
                  <Plus className="w-4 h-4" />
                  Neue Signatur
                </Button>
              </div>
            </div>
            <Select
              key={`signatur-select-${allSignaturen.length}`}
              value={signaturId}
              onValueChange={v => setSignaturId(v || '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={allSignaturen.length === 0 ? 'Signaturen werden geladen…' : 'Signatur auswählen…'} />
              </SelectTrigger>
              <SelectContent>
                {allSignaturen.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">Keine Signaturen vorhanden</div>
                ) : (
                  allSignaturen.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {newSigOpen && (
              <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={newSigName} onChange={e => setNewSigName(e.target.value)} placeholder="z.B. Max Mustermann" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Signatur-Text</Label>
                  <Textarea
                    value={newSigText}
                    onChange={e => setNewSigText(e.target.value)}
                    rows={5}
                    placeholder={'Mit freundlichen Grüßen\nMax Mustermann\n…'}
                    className="mt-1 resize-none font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => { setNewSigOpen(false); setNewSigName(''); setNewSigText('') }} disabled={savingSig}>
                    Abbrechen
                  </Button>
                  <Button size="sm" onClick={handleSaveNewSignatur} disabled={savingSig || !newSigName.trim() || !newSigText.trim()} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white">
                    {savingSig ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Speichern
                  </Button>
                </div>
              </div>
            )}
            {signaturText && (
              <Textarea readOnly value={signaturText} rows={5} className="mt-2 resize-none bg-slate-50 text-sm font-mono" />
            )}
          </div>

          {/* Skizzen / Anhänge */}
          <div>
            <Label className="font-semibold">Anhänge (Skizzen, max. 3 Dateien):</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {dateien.map((f, i) => (
                <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs">
                  <Paperclip className="w-3 h-3 text-blue-600" />
                  <span className="text-blue-700 max-w-[160px] truncate" title={f.name}>{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setDateien(d => d.filter((_, j) => j !== i))}
                    className="text-blue-400 hover:text-blue-600 ml-1"
                    disabled={sending}
                  >
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
            {dateien.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Dateien werden beim Senden hochgeladen und per URL an n8n übergeben (Zip-Anhang).
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-8 py-4 flex justify-end gap-3 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose} disabled={sending}>Abbrechen</Button>
          <Button
            onClick={handleSenden}
            disabled={sending || !emailAn.trim() || !signaturId}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Antrag absenden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <SignaturenVerwaltenDialog open={verwaltenOpen} onClose={() => setVerwaltenOpen(false)} />
    </>
  )
}
