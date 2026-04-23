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
import { Send, Paperclip, Sparkles, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  /** ID des Dokuments (angebote.id oder rechnungen.id). */
  docId: string
  /** Dokumentnummer wie "AN-2026-00059" oder "RE-2026-00012". */
  docNummer: string
  /** Dokumenttyp steuert Betreff-Default, Supabase-Table, Webhook + PDF-Pfad.
   *  Default 'angebot' für Backward-Compat zu bestehenden Aufrufen. */
  docType?: 'angebot' | 'rechnung'
  kundeName: string
  objektAdresse?: string
  bruttoGesamt?: number
  erstelltVon?: string
  emailAn?: string
  onSent?: () => void
}

const DOC_CONFIG = {
  angebot: {
    tabelle: 'angebote',
    statusUpdate: 'versendet',
    pdfPath: 'angebot',
    pdfFilePrefix: 'Angebot',
    webhook: 'https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf',
    betreff: (nr: string) => `Ihr Angebot ${nr}`,
    kiTyp: 'angebot',
  },
  rechnung: {
    tabelle: 'rechnungen',
    statusUpdate: 'offen',
    pdfPath: 'rechnung',
    pdfFilePrefix: 'Rechnung',
    webhook: 'https://n8n.srv1367876.hstgr.cloud/webhook/rechnung-versenden',
    betreff: (nr: string) => `Ihre Rechnung ${nr}`,
    kiTyp: 'rechnung',
  },
} as const

const SIGNATUREN: Record<string, string> = {
  'Nikolas Schmadlak': `Mit freundlichen Grüßen\nNikolas Schmadlak\nInnendienst\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25\nTel.: +43 660 3877214\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`,
  'Christoph Kribala': `Mit freundlichen Grüßen\nChristoph Kribala\nInnendienst\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25\nTel.: +43 660 1887474\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`,
  'Reinhard Lassel': `Mit freundlichen Grüßen\nReinhard Lassel\nGeschäftsführung\n\nHöhenarbeiten Lassel GmbH\nHetzmannsdorf 25\nTel.: +43 660 8060050\nE-Mail: office@hoehenarbeiten-lassel.at\nInternet: www.hoehenarbeiten-lassel.at`,
}

// Standard-Signaturen (werden immer im Dropdown angeboten, auch wenn
// mitarbeiter-Tabelle leer ist). ID-Prefix `builtin:` um sie von
// Mitarbeiter-UUIDs und DB-Signaturen zu unterscheiden.
const BUILTIN_SIGNATUREN = Object.entries(SIGNATUREN).map(([name, text]) => ({
  id: `builtin:${name}`,
  name,
  text,
}))

export default function EmailVorschauModal({
  open, onClose, docId, docNummer, docType = 'angebot', kundeName,
  objektAdresse, bruttoGesamt, erstelltVon, emailAn: emailAnProp, onSent
}: Props) {
  const cfg = DOC_CONFIG[docType]
  const queryClient = useQueryClient()
  const [emailAn, setEmailAn] = useState(emailAnProp || '')
  const [betreff, setBetreff] = useState(cfg.betreff(docNummer))
  const [nachricht, setNachricht] = useState('')
  const [signaturId, setSignaturId] = useState('')
  const [kiPrompt, setKiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingStil, setGeneratingStil] = useState<string>('')
  const [stil, setStil] = useState<'formell' | 'ausfuehrlich' | 'locker'>('formell')
  const [sending, setSending] = useState(false)
  const [newSigOpen, setNewSigOpen] = useState(false)
  const [newSigName, setNewSigName] = useState('')
  const [newSigText, setNewSigText] = useState('')
  const [savingSig, setSavingSig] = useState(false)

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter-aktiv'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitarbeiter')
        .select('*')
        .eq('aktiv', true)
        .order('name')
      if (!error && data && data.length > 0) return data
      const fb = await supabase.from('mitarbeiter').select('*').order('name')
      return fb.data || []
    },
    staleTime: 60 * 1000,
  })

  // Eigene Signaturen-Tabelle (Migration 015). Fallback auf leer, wenn die
  // Tabelle noch nicht existiert — dann werden nur Mitarbeiter + Builtin-
  // Signaturen angezeigt.
  const { data: dbSignaturen = [] } = useQuery({
    queryKey: ['signaturen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signaturen')
        .select('*')
        .eq('aktiv', true)
        .order('name')
      if (error) {
        console.warn('[signaturen] load failed:', error.message)
        return []
      }
      return data || []
    },
    staleTime: 60 * 1000,
  })

  /**
   * Einheitliche Liste aller verfügbaren Signaturen für den Dropdown.
   * Quellen: eigene signaturen-Tabelle, Mitarbeiter-Liste, Builtin-Fallback.
   * Deduped by name: DB-Signaturen haben Vorrang vor Builtin-Einträgen.
   */
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

  const selectedSig = allSignaturen.find((s) => s.id === signaturId)
  const selectedMitarbeiter = (mitarbeiterList as any[]).find((m: any) => m.id === signaturId)
  const signaturText = selectedSig?.text || ''

  const handleSaveNewSignatur = async () => {
    const name = newSigName.trim()
    const text = newSigText.trim()
    if (!name || !text) {
      toast.error('Name und Signatur-Text sind Pflicht')
      return
    }
    setSavingSig(true)
    try {
      const { data, error } = await supabase
        .from('signaturen')
        .insert({ name, text, aktiv: true })
        .select()
        .single()
      if (error) throw error
      toast.success('Signatur gespeichert')
      await queryClient.invalidateQueries({ queryKey: ['signaturen'] })
      setSignaturId(`sig:${data.id}`)
      setNewSigOpen(false)
      setNewSigName('')
      setNewSigText('')
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

  const generateEmail = async (
    zusatzAnweisung?: string,
    stilOverride?: 'formell' | 'ausfuehrlich' | 'locker'
  ) => {
    const aktiverStil = stilOverride || stil
    setGenerating(true)
    setGeneratingStil(aktiverStil)
    try {
      const res = await fetch('/api/ki/email-generieren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typ: cfg.kiTyp,
          // Feldname "angebotsnummer" aus Legacy-Gründen in der API beibehalten —
          // trägt bei rechnung einfach die Rechnungsnummer.
          angebotsnummer: docNummer,
          kundeName, objektAdresse, bruttoGesamt, erstelltVon,
          zusatzAnweisung,
          stil: aktiverStil,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setNachricht(data.text || '')
        if (stilOverride) setStil(stilOverride)
      }
    } catch (err) {
      console.error('Email generation error:', err)
    } finally {
      setGenerating(false)
      setGeneratingStil('')
    }
  }

  useEffect(() => {
    if (open && !nachricht) generateEmail(undefined, 'formell')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) {
      setEmailAn(emailAnProp || '')
      setBetreff(cfg.betreff(docNummer))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docNummer, emailAnProp, docType])

  const handleSenden = async () => {
    setSending(true)
    try {
      await supabase.from(cfg.tabelle).update({ status: cfg.statusUpdate }).eq('id', docId)
      // Absolute PDF-URL bauen — n8n braucht http(s)://…
      const pdfUrl = `${window.location.origin}/api/pdf/${cfg.pdfPath}/${docId}`
      const pdfFileName = `${cfg.pdfFilePrefix}_${docNummer}.pdf`

      // Payload leicht unterschiedlich je nach Doc-Type: für angebote nutzen
      // wir offerId/angebotNummer/rechnungsempfaenger (historisch gewachsen);
      // für rechnungen entsprechend rechnungsId/rechnungsNummer/kunde.
      const payload = docType === 'rechnung'
        ? {
            rechnungsId: docId,
            rechnungsNummer: docNummer,
            pdfUrl,
            pdfFileName,
            status: cfg.statusUpdate,
            kunde: { name: kundeName },
            objekt: { bezeichnung: objektAdresse },
            erstelltDurch: erstelltVon,
            email: {
              sendenAn: emailAn,
              betreff,
              nachrichtHtml: `<pre>${nachricht}</pre>`,
              mitarbeiter: selectedMitarbeiter?.name || selectedSig?.name || '',
              signatur: signaturText,
            },
            summen: { brutto: bruttoGesamt },
            timestamp: new Date().toISOString(),
          }
        : {
            offerId: docId,
            angebotNummer: docNummer,
            pdfUrl,
            pdfFileName,
            status: cfg.statusUpdate,
            rechnungsempfaenger: { name: kundeName },
            objekt: { bezeichnung: objektAdresse },
            erstelltDurch: erstelltVon,
            email: {
              sendenAn: emailAn,
              betreff,
              nachrichtHtml: `<pre>${nachricht}</pre>`,
              mitarbeiter: selectedMitarbeiter?.name || selectedSig?.name || '',
              signatur: signaturText,
            },
            summen: { brutto: bruttoGesamt },
            timestamp: new Date().toISOString(),
          }

      await fetch(cfg.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      <DialogContent className="h-[92vh] max-h-[92vh] p-0 overflow-hidden flex flex-col">
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
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">Nachricht:</Label>
              <div className="flex items-center gap-1">
                {([
                  { key: 'formell', label: 'Formell' },
                  { key: 'ausfuehrlich', label: 'Ausführlicher' },
                  { key: 'locker', label: 'Lockerer' },
                ] as const).map((b) => {
                  const active = stil === b.key
                  const busy = generating && generatingStil === b.key
                  return (
                    <Button
                      key={b.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={generating}
                      onClick={() => generateEmail(undefined, b.key)}
                      className={`h-7 px-2.5 text-xs ${
                        active
                          ? 'border-[#E85A1B] bg-[#E85A1B]/10 text-[#E85A1B] hover:bg-[#E85A1B]/15'
                          : ''
                      }`}
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                      {b.label}
                    </Button>
                  )
                })}
              </div>
            </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNewSigOpen((v) => !v)}
                className="gap-1"
              >
                <Plus className="w-4 h-4" />
                Neue Signatur
              </Button>
            </div>
            <Select
              key={`signatur-select-${allSignaturen.length}`}
              value={signaturId}
              onValueChange={(val) => setSignaturId(val || '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  allSignaturen.length === 0
                    ? 'Signaturen werden geladen…'
                    : 'Signatur auswählen...'
                } />
              </SelectTrigger>
              <SelectContent>
                {allSignaturen.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">Keine Signaturen vorhanden</div>
                ) : (
                  allSignaturen.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {newSigOpen && (
              <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={newSigName}
                    onChange={(e) => setNewSigName(e.target.value)}
                    placeholder="z.B. Max Mustermann"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Signatur-Text</Label>
                  <Textarea
                    value={newSigText}
                    onChange={(e) => setNewSigText(e.target.value)}
                    rows={5}
                    placeholder={'Mit freundlichen Grüßen\nMax Mustermann\n…'}
                    className="mt-1 resize-none font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setNewSigOpen(false); setNewSigName(''); setNewSigText('') }}
                    disabled={savingSig}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveNewSignatur}
                    disabled={savingSig || !newSigName.trim() || !newSigText.trim()}
                    className="bg-[#E85A1B] hover:bg-[#c94d17] text-white"
                  >
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
