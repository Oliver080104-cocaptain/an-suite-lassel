'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save, Loader2, Download, Plus, Trash2, FileText, Send } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import DeliveryNotePositionsTable from '@/components/deliveryNotes/DeliveryNotePositionsTable'
import EditableDocNumber from '@/components/shared/EditableDocNumber'

interface DNPosition {
  id?: string
  pos: number
  produktId?: string
  produktName: string
  beschreibung: string
  menge: number | string
  einheit: string
}

const defaultDN = {
  lieferscheinnummer: '',
  lieferdatum: format(new Date(), 'yyyy-MM-dd'),
  status: 'entwurf',
  kunde_name: '',
  kunde_strasse: '',
  kunde_plz: '',
  kunde_ort: '',
  kunde_uid: '',
  objekt_bezeichnung: '',
  objekt_adresse: '',
  ansprechpartner: '',
  erstellt_von: '',
  ticket_nummer: '',
  zoho_ticket_id: '',
  geschaeftsfallnummer: '',
  notizen: '',
  pdf_url: '',
  angebot_id: '',
  referenz_angebot_nummer: '',
}

export default function DeliveryNoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const rawId = params?.id as string
  const isNew = rawId === 'neu'
  const deliveryNoteId = isNew ? null : rawId

  const [dn, setDn] = useState({ ...defaultDN })
  const [positions, setPositions] = useState<DNPosition[]>([{ pos: 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk' }])
  const [saving, setSaving] = useState(false)
  const [uploadingToZoho, setUploadingToZoho] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(0)

  const dnInitialized = useRef(false)
  const posInitialized = useRef(false)
  const autoSaveLock = useRef(false)
  // Dirty-Flag für Race-Schutz: gesetzt wenn während eines laufenden Saves
  // getippt wird. Nach dem Save wird dann nochmal gespeichert (Bugfix 2026-04-23 v2).
  const pendingChangesDuringSave = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref auf die IMMER latest performAutoSave — damit der Save-Callback
  // keinen stale Closure mit veraltetem dn/positions nutzt.
  const performAutoSaveRef = useRef<() => Promise<void>>(async () => {})

  const { data: existingDN, isLoading: loadingDN } = useQuery({
    queryKey: ['deliveryNote', deliveryNoteId],
    queryFn: async () => {
      if (!deliveryNoteId) return null
      const { data, error } = await supabase.from('lieferscheine').select('*').eq('id', deliveryNoteId).single()
      if (error) throw error
      return data
    },
    enabled: !!deliveryNoteId,
  })

  const { data: existingPositions = [] } = useQuery({
    queryKey: ['deliveryNotePositions', deliveryNoteId],
    queryFn: async () => {
      if (!deliveryNoteId) return []
      const { data, error } = await supabase.from('lieferschein_positionen').select('*').eq('lieferschein_id', deliveryNoteId).order('position')
      if (error) throw error
      return data || []
    },
    enabled: !!deliveryNoteId,
  })

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data } = await supabase.from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (existingDN && !dnInitialized.current) {
      setDn({
        ...defaultDN,
        lieferscheinnummer: (existingDN as any).lieferscheinnummer || '',
        lieferdatum: (existingDN as any).lieferdatum || defaultDN.lieferdatum,
        status: (existingDN as any).status || 'entwurf',
        kunde_name: (existingDN as any).kunde_name || '',
        kunde_strasse: (existingDN as any).kunde_strasse || '',
        kunde_plz: (existingDN as any).kunde_plz || '',
        kunde_ort: (existingDN as any).kunde_ort || '',
        kunde_uid: (existingDN as any).kunde_uid || '',
        objekt_bezeichnung: (existingDN as any).objekt_bezeichnung || '',
        objekt_adresse: (existingDN as any).objekt_adresse || '',
        ansprechpartner: (existingDN as any).ansprechpartner || '',
        erstellt_von: (existingDN as any).erstellt_von || '',
        ticket_nummer: (existingDN as any).ticket_nummer || '',
        zoho_ticket_id: (existingDN as any).zoho_ticket_id || '',
        geschaeftsfallnummer: (existingDN as any).geschaeftsfallnummer || '',
        notizen: (existingDN as any).notizen || '',
        pdf_url: (existingDN as any).pdf_url || '',
        angebot_id: (existingDN as any).angebot_id || '',
        referenz_angebot_nummer: (existingDN as any).referenz_angebot_nummer || '',
      })
      dnInitialized.current = true
    }
  }, [existingDN])

  useEffect(() => {
    if (existingPositions.length > 0 && !posInitialized.current) {
      setPositions((existingPositions as any[]).map((p: any, i: number) => {
        const raw = (p.beschreibung || '') as string
        const [firstLine, ...rest] = raw.split('\n')
        return {
          id: p.id,
          pos: i + 1,
          produktName: firstLine || '',
          beschreibung: rest.join('\n'),
          menge: p.menge || 1,
          einheit: p.einheit || 'Stk',
        }
      }))
      posInitialized.current = true
    }
  }, [existingPositions])

  /**
   * Synchroner "Flush": bricht den pending Debounce ab und startet sofort
   * einen autosave. Wird von onBlurCapture auf dem Form-Grid aufgerufen,
   * damit der Save nicht erst 1 sec nach Feldwechsel losläuft.
   */
  const flushAutoSaveNow = () => {
    if (isNew || !deliveryNoteId || !dnInitialized.current) return
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    triggerAutoSave()
  }

  // Zentrale Auto-Save-Trigger-Funktion mit Race-Schutz.
  const triggerAutoSave = () => {
    if (autoSaveLock.current) {
      pendingChangesDuringSave.current = true
      return
    }
    autoSaveLock.current = true
    pendingChangesDuringSave.current = false
    performAutoSaveRef.current().finally(() => {
      autoSaveLock.current = false
      if (pendingChangesDuringSave.current) {
        pendingChangesDuringSave.current = false
        setTimeout(triggerAutoSave, 50)
      }
    })
  }

  // Debounced autosave
  useEffect(() => {
    if (isNew || !deliveryNoteId || !dnInitialized.current) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(triggerAutoSave, 1000)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [dn, positions])

  // Autosave on visibility change
  useEffect(() => {
    if (isNew) return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && deliveryNoteId && dn.kunde_name && !autoSaveLock.current) {
        autoSaveLock.current = true
        performAutoSave().finally(() => { autoSaveLock.current = false })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [dn, positions, isNew, deliveryNoteId])

  const buildDNData = () => ({
    lieferscheinnummer: dn.lieferscheinnummer,
    status: dn.status,
    kunde_name: dn.kunde_name,
    kunde_strasse: dn.kunde_strasse || null,
    kunde_plz: dn.kunde_plz || null,
    kunde_ort: dn.kunde_ort || null,
    kunde_uid: dn.kunde_uid || null,
    objekt_adresse: dn.objekt_adresse || null,
    ansprechpartner: dn.ansprechpartner || null,
    lieferdatum: dn.lieferdatum,
    erstellt_von: dn.erstellt_von || null,
    ticket_nummer: dn.ticket_nummer || null,
    zoho_ticket_id: dn.zoho_ticket_id || null,
    geschaeftsfallnummer: dn.geschaeftsfallnummer || null,
    notizen: dn.notizen || null,
    pdf_url: dn.pdf_url || null,
    angebot_id: dn.angebot_id || null,
    referenz_angebot_nummer: dn.referenz_angebot_nummer || null,
  })

  // Schema-Drift-Fallback: Set von Spalten, die in der Prod-DB (noch) fehlen.
  // Wird beim ersten "Could not find the 'X' column"-Error pro Spalte
  // befüllt, ab dann wird die Spalte nicht mehr mitgeschickt. Reset bei
  // Tab-Reload. Analog zu rechnungen/[id]/page.tsx (Bugfix 2026-04-23).
  const missingLieferscheinColumns = useRef<Set<string>>(new Set())

  const missingColumnFromError = (message: string | undefined): string | null => {
    if (!message) return null
    const match = message.match(/Could not find the '([^']+)' column/i)
    return match ? match[1] : null
  }

  const stripMissingColumns = (data: Record<string, unknown>) => {
    const clean: Record<string, unknown> = { ...data }
    for (const col of missingLieferscheinColumns.current) delete clean[col]
    return clean
  }

  const updateLieferscheinSafe = async (id: string, data: Record<string, unknown>) => {
    let payload = stripMissingColumns(data)
    for (let i = 0; i < 5; i++) {
      const { error } = await supabase.from('lieferscheine').update(payload).eq('id', id)
      if (!error) return
      const missingCol = missingColumnFromError(error.message)
      if (!missingCol || !(missingCol in payload)) throw error
      console.warn(`[lieferscheine.update] retry ohne '${missingCol}'. Grund:`, error.message)
      missingLieferscheinColumns.current.add(missingCol)
      payload = stripMissingColumns(data)
    }
    throw new Error('[lieferscheine.update] zu viele Schema-Drift-Retries abgebrochen')
  }

  const insertLieferscheinSafe = async (data: Record<string, unknown>) => {
    let payload = stripMissingColumns(data)
    for (let i = 0; i < 5; i++) {
      const resp = await supabase.from('lieferscheine').insert([payload]).select().single()
      if (!resp.error) return resp.data
      const missingCol = missingColumnFromError(resp.error.message)
      if (!missingCol || !(missingCol in payload)) throw resp.error
      console.warn(`[lieferscheine.insert] retry ohne '${missingCol}'. Grund:`, resp.error.message)
      missingLieferscheinColumns.current.add(missingCol)
      payload = stripMissingColumns(data)
    }
    throw new Error('[lieferscheine.insert] zu viele Schema-Drift-Retries abgebrochen')
  }

  const buildPosData = (p: DNPosition, lsId: string) => {
    // DB-Feld `beschreibung` enthält "Produktname\nBeschreibung" (analog Angebot)
    const combined = p.produktName
      ? (p.beschreibung ? `${p.produktName}\n${p.beschreibung}` : p.produktName)
      : (p.beschreibung || '')
    return {
      lieferschein_id: lsId,
      position: p.pos,
      beschreibung: combined,
      menge: parseFloat(p.menge as string) || 1,
      einheit: p.einheit || 'Stk',
    }
  }

  const performAutoSave = async () => {
    if (!deliveryNoteId || !dn.kunde_name) return
    try {
      await updateLieferscheinSafe(deliveryNoteId, buildDNData())
      await savePositions(deliveryNoteId, positions, existingPositions)
      await syncPositionsToTicket()
      setPreviewVersion((v) => v + 1)
    } catch (err) {
      console.error('Auto-save error:', err)
    }
  }
  // Ref auf latest performAutoSave — damit triggerAutoSave (z.B. nach dem
  // Finally-Block) den frischen Closure-State liest, nicht den stale von
  // vor dem Save-Start.
  performAutoSaveRef.current = performAutoSave

  /**
   * Wenn der Lieferschein eine Ticketnummer hat, spiegeln wir die Positionen
   * als `angebotspositionen` direkt in das Ticket im Tourenplaner — gleiche
   * Supabase DB. Best-effort: Fehler schlucken, damit der eigentliche Save
   * nicht failt.
   */
  const syncPositionsToTicket = async () => {
    if (!dn.ticket_nummer?.trim()) return
    try {
      const { data: ticket } = await supabase
        .from('tickets')
        .select('id, angebotspositionen')
        .eq('ticketnummer', dn.ticket_nummer.trim())
        .maybeSingle()
      if (!ticket?.id) return
      const existingFotosByPos: Record<string, any[]> = {}
      const existingErledigtByPos: Record<string, boolean> = {}
      if (Array.isArray(ticket.angebotspositionen)) {
        ticket.angebotspositionen.forEach((p: any, i: number) => {
          const key = String(i)
          existingFotosByPos[key] = Array.isArray(p?.fotos) ? p.fotos : []
          existingErledigtByPos[key] = !!p?.erledigt
        })
      }
      const newPositions = positions.map((p, i) => {
        const lines = (p.beschreibung || '').split('\n')
        return {
          produktName: lines[0] || '',
          beschreibung: lines.slice(1).join('\n'),
          menge: parseFloat(p.menge as string) || 1,
          einheit: p.einheit || 'Stk',
          erledigt: existingErledigtByPos[String(i)] ?? false,
          fotos: existingFotosByPos[String(i)] ?? [],
        }
      })
      await supabase
        .from('tickets')
        .update({ angebotspositionen: newPositions })
        .eq('id', ticket.id)
    } catch (err) {
      console.error('Ticket-Sync fehlgeschlagen:', err)
    }
  }

  const savePositions = async (targetId: string, current: DNPosition[], existing: any[]) => {
    const toDelete = existing.filter(ep => !current.find(p => p.id === ep.id))
    const toUpdate = current.filter(p => p.id && existing.find(ep => ep.id === p.id))
    const toCreate = current.filter(p => !p.id)
    await Promise.all([
      ...toDelete.map(p => supabase.from('lieferschein_positionen').delete().eq('id', p.id)),
      ...toUpdate.map(p => supabase.from('lieferschein_positionen').update(buildPosData(p, targetId)).eq('id', p.id!)),
    ])
    if (toCreate.length > 0) {
      const { data: inserted } = await supabase
        .from('lieferschein_positionen')
        .insert(toCreate.map(p => buildPosData(p, targetId)))
        .select()
      // IDs zurück in State mergen, sonst werden die Positionen bei nächstem
      // Auto-Save als "toCreate" dupliziert.
      if (inserted && inserted.length > 0) {
        setPositions(prev => prev.map(p => {
          if (p.id) return p
          const match = inserted.find((i: any) => i.position === p.pos)
          return match ? { ...p, id: match.id } : p
        }))
      }
    }
  }

  const generateNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('lieferscheine').select('lieferscheinnummer').ilike('lieferscheinnummer', `LI-${year}%`)
    const nextNum = (data?.length || 0) + 1
    return `LI-${year}-${String(nextNum).padStart(5, '0')}`
  }

  const handleSaveAndZoho = async () => {
    setSaving(true)
    setUploadingToZoho(true)
    try {
      let savedId = deliveryNoteId
      const dnCopy = { ...dn }

      if (isNew) {
        dnCopy.lieferscheinnummer = await generateNumber()
        setDn(dnCopy)
        const inserted = await insertLieferscheinSafe(buildDNData())
        savedId = inserted.id
        router.replace(`/lieferscheine/${savedId}`)
      } else {
        await updateLieferscheinSafe(deliveryNoteId!, buildDNData())
      }

      await savePositions(savedId!, positions, isNew ? [] : existingPositions)
      await syncPositionsToTicket()

      // PDF Link explizit setzen (nicht mehr automatisch beim PDF-Render)
      const pdfLink = `${window.location.origin}/api/pdf/lieferschein/${savedId}`
      await supabase.from('lieferscheine').update({ pdf_url: pdfLink }).eq('id', savedId!)
      setDn((prev: any) => ({ ...prev, pdf_url: pdfLink }))

      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/b15d8baa-e8ec-4d8a-aa85-0865048b9c31', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lieferscheinId: savedId,
          lieferscheinNummer: dnCopy.lieferscheinnummer,
          pdfUrl: `${window.location.origin}/api/pdf/lieferschein/${savedId}`,
          ticketId: dnCopy.zoho_ticket_id,
          ticketNumber: dnCopy.ticket_nummer,
          datum: dnCopy.lieferdatum,
          status: dnCopy.status,
          kundeName: dnCopy.kunde_name,
          objektBezeichnung: dnCopy.objekt_adresse || dnCopy.objekt_bezeichnung,
          erstelltDurch: dnCopy.erstellt_von,
          referenzAngebotNummer: dnCopy.referenz_angebot_nummer,
          timestamp: new Date().toISOString()
        })
      }).catch(e => console.error('Zoho webhook failed:', e))

      queryClient.invalidateQueries({ queryKey: ['deliveryNotes'] })
      queryClient.invalidateQueries({ queryKey: ['deliveryNote', savedId] })
      toast.success('Gespeichert & in Zoho abgelegt')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    } finally {
      setSaving(false)
      setUploadingToZoho(false)
    }
  }

  /**
   * Überträgt die aktuellen Lieferschein-Positionen + Daten in Zoho
   * (n8n Webhook) und spiegelt sie ins Ticket im Tourenplaner.
   * Speichert vorher nicht — geht davon aus dass der Autosave läuft.
   */
  const pushToZohoOnly = async () => {
    if (!deliveryNoteId) {
      toast.error('Lieferschein muss zuerst gespeichert werden')
      return
    }
    setUploadingToZoho(true)
    try {
      // Sicherstellen dass aktueller State persistiert ist
      await updateLieferscheinSafe(deliveryNoteId, buildDNData())
      await savePositions(deliveryNoteId, positions, existingPositions)
      await syncPositionsToTicket()

      // Positionen einmal für beide Webhooks aufbereiten.
      const positionenForWebhook = positions.map(p => {
        const lines = (p.beschreibung || '').split('\n')
        return {
          pos: p.pos,
          produktName: lines[0] || '',
          beschreibung: lines.slice(1).join('\n'),
          menge: parseFloat(p.menge as string) || 1,
          einheit: p.einheit || 'Stk',
        }
      })
      const editUrl = `${window.location.origin}/lieferscheine/${deliveryNoteId}`

      // Beide n8n-Flows parallel anstoßen:
      // 1) b15d8baa — Workdrive-Ablage + generic Lieferschein-Event
      // 2) 5e4e9681 — Zoho CRM Ticket updaten (Lieferschein_Formular Subform + Projektstatus)
      await Promise.allSettled([
        fetch('https://n8n.srv1367876.hstgr.cloud/webhook/b15d8baa-e8ec-4d8a-aa85-0865048b9c31', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lieferscheinId: deliveryNoteId,
            lieferscheinNummer: dn.lieferscheinnummer,
            pdfUrl: `${window.location.origin}/api/pdf/lieferschein/${deliveryNoteId}`,
            ticketId: dn.zoho_ticket_id,
            ticketNumber: dn.ticket_nummer,
            datum: dn.lieferdatum,
            status: dn.status,
            kundeName: dn.kunde_name,
            objektBezeichnung: dn.objekt_adresse || dn.objekt_bezeichnung,
            erstelltDurch: dn.erstellt_von,
            referenzAngebotNummer: dn.referenz_angebot_nummer,
            editUrl,
            positionen: positionenForWebhook,
            timestamp: new Date().toISOString(),
          }),
        }),
        fetch('https://n8n.srv1367876.hstgr.cloud/webhook/5e4e9681-a79e-42be-a1d0-309bfdc36909', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lieferscheinId: deliveryNoteId,
            lieferscheinNummer: dn.lieferscheinnummer,
            editUrl,
            angebot: {
              ticketId: dn.zoho_ticket_id || null,
              ticketNumber: dn.ticket_nummer || null,
              angebotId: dn.angebot_id || null,
              referenzAngebotNummer: dn.referenz_angebot_nummer || null,
            },
            positionen: positionenForWebhook,
            timestamp: new Date().toISOString(),
          }),
        }),
      ])
      toast.success('In Zoho & Tourenplaner übertragen')
    } catch (err: any) {
      console.error('Push to Zoho error:', err)
      toast.error('Fehler bei Übertragung: ' + err.message)
    } finally {
      setUploadingToZoho(false)
    }
  }

  const updatePosition = (i: number, field: keyof DNPosition, value: any) => {
    setPositions(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  const addPosition = () => {
    setPositions(prev => [...prev, { pos: prev.length + 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk' }])
  }

  const deletePosition = (i: number) => {
    setPositions(prev => prev.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, pos: idx + 1 })))
  }

  if (loadingDN) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 p-3 rounded-lg">
              <FileText className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <Link href="/lieferscheine" className="text-sm text-slate-500 hover:text-slate-700">← Alle Lieferscheine</Link>
              {isNew ? (
                <h1 className="text-3xl font-bold text-slate-900">Neuer Lieferschein</h1>
              ) : (
                <EditableDocNumber
                  value={dn.lieferscheinnummer || ''}
                  table="lieferscheine"
                  column="lieferscheinnummer"
                  id={deliveryNoteId || ''}
                  expectedPrefix="LI-"
                  placeholder="Lieferschein"
                  onSaved={(next) => {
                    setDn((prev: any) => ({ ...prev, lieferscheinnummer: next }))
                    setPreviewVersion((v) => v + 1)
                  }}
                />
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={handleSaveAndZoho} disabled={saving || uploadingToZoho} className="bg-blue-600 hover:bg-blue-700">
              {(saving || uploadingToZoho) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Speichern & in Zoho ablegen
            </Button>
            {!isNew && (
              <Button
                onClick={pushToZohoOnly}
                disabled={saving || uploadingToZoho}
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-2"
              >
                {uploadingToZoho ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Lieferschein Positionen in Zoho übertragen
              </Button>
            )}
            {!isNew && (
              <Button
                variant="outline"
                className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!dn.pdf_url}
                title={dn.pdf_url ? 'PDF herunterladen' : "Zuerst 'Speichern & in Zoho ablegen' klicken"}
                onClick={() => {
                  if (dn.pdf_url) window.open(`/api/pdf/lieferschein/${deliveryNoteId}?download=1`, '_blank')
                }}
              >
                <Download className="h-4 w-4" />
                📄 PDF herunterladen
              </Button>
            )}
          </div>
        </div>

        {/* 2-column layout — onBlurCapture flusht pending autosave sobald
            ein Feld verlassen wird. Schützt gegen Datenverlust bei Tab-Close
            innerhalb der 1s-Debounce-Fenster. */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
          onBlurCapture={flushAutoSaveNow}
        >

          {/* Left */}
          <div className="space-y-6">
            {/* Empfänger */}
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Empfänger</h2>
                {dn.zoho_ticket_id && (
                  <a href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${dn.zoho_ticket_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700" title="In Zoho öffnen">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Name (Hausverwaltung / Kunde)</Label>
                  <Input value={dn.kunde_name} onChange={e => setDn(p => ({ ...p, kunde_name: e.target.value }))} placeholder="z.B. PAUL Vienna Office GmbH" className="mt-1" />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input value={dn.kunde_strasse} onChange={e => setDn(p => ({ ...p, kunde_strasse: e.target.value }))} placeholder="Straße und Hausnummer" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={dn.kunde_plz} onChange={e => setDn(p => ({ ...p, kunde_plz: e.target.value }))} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={dn.kunde_ort} onChange={e => setDn(p => ({ ...p, kunde_ort: e.target.value }))} placeholder="Ort" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={dn.kunde_uid} onChange={e => setDn(p => ({ ...p, kunde_uid: e.target.value }))} placeholder="z.B. ATU12345678" className="mt-1" />
                </div>
              </div>
            </Card>

            {/* Objekt */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="space-y-4">
                <div>
                  <Label>Objektadresse</Label>
                  <Input value={dn.objekt_adresse} onChange={e => setDn(p => ({ ...p, objekt_adresse: e.target.value }))} placeholder="z.B. Hauptstraße 50, 2020 Magersdorf" className="mt-1" />
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input value={dn.ansprechpartner} onChange={e => setDn(p => ({ ...p, ansprechpartner: e.target.value }))} placeholder="z.B. Max Mustermann" className="mt-1" />
                </div>
              </div>
            </Card>
          </div>

          {/* Right */}
          <div className="space-y-6">
            {/* Lieferscheindaten */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Lieferscheindaten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Lieferdatum</Label>
                  <Input type="date" value={dn.lieferdatum} onChange={e => setDn(p => ({ ...p, lieferdatum: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Erstellt durch</Label>
                  <Input
                    value={dn.erstellt_von || ''}
                    onChange={e => setDn(p => ({ ...p, erstellt_von: e.target.value }))}
                    placeholder="z.B. Reinhard Lassel"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={dn.status || 'entwurf'} onValueChange={v => setDn(p => ({ ...p, status: v || 'entwurf' }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entwurf">Entwurf</SelectItem>
                      <SelectItem value="erstellt">Erstellt</SelectItem>
                      <SelectItem value="versendet">Versendet</SelectItem>
                      <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ticket-Nr.</Label>
                  <Input value={dn.ticket_nummer} onChange={e => setDn(p => ({ ...p, ticket_nummer: e.target.value }))} placeholder="Ticket-Nummer" className="mt-1" />
                </div>
                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input value={dn.geschaeftsfallnummer} onChange={e => setDn(p => ({ ...p, geschaeftsfallnummer: e.target.value }))} placeholder="Geschäftsfallnummer (optional)" className="mt-1" />
                </div>
                <div>
                  <Label>PDF Link</Label>
                  <Input
                    value={dn.pdf_url || ''}
                    readOnly
                    placeholder="Wird nach 'Speichern & in Zoho ablegen' generiert"
                    className="mt-1 bg-slate-50"
                  />
                  {dn.pdf_url && (
                    <a href={dn.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block">PDF öffnen</a>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Verknüpfte Dokumente – volle Breite */}
        {dn.angebot_id && (
          <Card className="p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Verknüpfte Dokumente</h2>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Angebot</p>
              <Link href={`/angebote/${dn.angebot_id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group">
                <span className="text-sm font-medium text-blue-600 group-hover:underline">
                  {dn.referenz_angebot_nummer || 'Angebot öffnen'}
                </span>
                <span className="text-xs text-slate-400">Angebot →</span>
              </Link>
            </div>
          </Card>
        )}

        {/* Positionen – ohne Preise (gleicher Look wie Angebot) */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
          <DeliveryNotePositionsTable
            positions={positions as any}
            onChange={(updated) => setPositions(updated.map((p: any, i: number) => ({ ...p, pos: i + 1 })))}
          />
        </Card>

        {/* Anmerkungen */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Anmerkungen</h2>
          <Textarea
            value={dn.notizen}
            onChange={e => setDn(p => ({ ...p, notizen: e.target.value }))}
            rows={4}
            placeholder="Optionale Anmerkungen zum Lieferschein..."
          />
        </Card>

        {/* PDF Vorschau */}
        {!isNew && (
          <div className="rounded-xl border border-slate-200 bg-white shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Lieferschein-Vorschau</h2>
            </div>
            <div className="rounded-lg bg-slate-100 overflow-x-auto flex justify-center p-4">
              <iframe
                src={`/api/pdf/lieferschein/${deliveryNoteId}?preview=1&v=${previewVersion}`}
                title="Lieferschein-Vorschau"
                className="bg-white shadow-md"
                scrolling="no"
                style={{ width: '794px', minHeight: '1123px', border: 'none', flexShrink: 0 }}
                onLoad={(e) => {
                  const iframe = e.currentTarget
                  try {
                    const body = iframe.contentDocument?.body
                    if (body) iframe.style.height = `${body.scrollHeight}px`
                  } catch {}
                }}
              />
            </div>
            <div className="mt-3 text-right">
              <a
                href={`/api/pdf/lieferschein/${deliveryNoteId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                🔗 PDF in neuem Tab öffnen
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
