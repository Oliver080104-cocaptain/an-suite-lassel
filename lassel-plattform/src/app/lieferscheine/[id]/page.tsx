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
import { Save, Loader2, ArrowLeft, Download } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import DeliveryNotePositionsTable from '@/components/deliveryNotes/DeliveryNotePositionsTable'

interface DeliveryNotePosition {
  id?: string
  pos: number
  produktId?: string
  produktName: string
  beschreibung: string
  menge: number | string
  einheit: string
}

const defaultDeliveryNote = {
  lieferscheinNummer: '',
  datum: format(new Date(), 'yyyy-MM-dd'),
  status: 'entwurf',
  kundeName: '',
  uidnummer: '',
  kundeStrasse: '',
  kundePlz: '',
  kundeOrt: '',
  kundeAnsprechpartner: '',
  objektBezeichnung: '',
  erstelltDurch: '',
  bemerkung: '',
  ticketNumber: '',
  ticketId: '',
  geschaeftsfallNummer: '',
  referenzAngebotNummer: '',
  referenzAngebotId: '',
  pdfUrl: '',
  source: 'manual',
}

export default function DeliveryNoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const rawId = params?.id as string
  const isNew = rawId === 'neu'
  const deliveryNoteId = isNew ? null : rawId

  const [deliveryNote, setDeliveryNote] = useState({ ...defaultDeliveryNote })
  const [positions, setPositions] = useState<DeliveryNotePosition[]>([{
    pos: 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk'
  }])
  const [saving, setSaving] = useState(false)
  const [uploadingToZoho, setUploadingToZoho] = useState(false)

  const dnInitialized = useRef(false)
  const posInitialized = useRef(false)
  const autoSaveLock = useRef(false)

  // Load delivery note
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

  // Load positions
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

  // Load mitarbeiter for dropdown
  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data } = await supabase.from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  // Init from loaded data
  useEffect(() => {
    if (existingDN && !dnInitialized.current) {
      setDeliveryNote({
        ...defaultDeliveryNote,
        lieferscheinNummer: (existingDN as any).lieferscheinnummer || '',
        datum: (existingDN as any).lieferdatum || defaultDeliveryNote.datum,
        status: (existingDN as any).status || 'offen',
        kundeName: (existingDN as any).kunde_name || '',
        kundeStrasse: (existingDN as any).kunde_strasse || '',
        kundePlz: (existingDN as any).kunde_plz || '',
        kundeOrt: (existingDN as any).kunde_ort || '',
        objektBezeichnung: (existingDN as any).objekt_adresse || '',
        ticketNumber: (existingDN as any).ticket_nummer || '',
        bemerkung: (existingDN as any).notizen || '',
        pdfUrl: (existingDN as any).pdf_url || '',
        referenzAngebotId: (existingDN as any).angebot_id || '',
      })
      dnInitialized.current = true
    }
  }, [existingDN])

  useEffect(() => {
    if (existingPositions.length > 0 && !posInitialized.current) {
      setPositions((existingPositions as any[]).map((p: any) => ({
        id: p.id,
        pos: p.position,
        produktName: p.beschreibung || '',
        beschreibung: '',
        menge: p.menge || 1,
        einheit: p.einheit || 'Stk',
      })))
      posInitialized.current = true
    }
  }, [existingPositions])

  // Auto-save on visibility change
  useEffect(() => {
    if (isNew) return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && deliveryNoteId && deliveryNote.kundeName && !autoSaveLock.current) {
        autoSaveLock.current = true
        performAutoSave().finally(() => { autoSaveLock.current = false })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (deliveryNoteId && deliveryNote.kundeName && !autoSaveLock.current) {
        autoSaveLock.current = true
        performAutoSave().finally(() => { autoSaveLock.current = false })
      }
    }
  }, [deliveryNote, positions, isNew, deliveryNoteId])

  const buildDNData = (dn: typeof defaultDeliveryNote) => ({
    lieferscheinnummer: dn.lieferscheinNummer,
    status: dn.status,
    kunde_name: dn.kundeName,
    kunde_strasse: dn.kundeStrasse || null,
    kunde_plz: dn.kundePlz || null,
    kunde_ort: dn.kundeOrt || null,
    lieferdatum: dn.datum,
    objekt_adresse: dn.objektBezeichnung || null,
    ticket_nummer: dn.ticketNumber || null,
    notizen: dn.bemerkung || null,
    pdf_url: dn.pdfUrl || null,
    angebot_id: (dn as any).referenzAngebotId || null,
  })

  const buildDNPosData = (p: DeliveryNotePosition, lsId: string) => ({
    lieferschein_id: lsId,
    position: p.pos,
    beschreibung: p.produktName || p.beschreibung || '-',
    menge: parseFloat(p.menge as string) || 1,
    einheit: p.einheit,
  })

  const performAutoSave = async () => {
    if (!deliveryNoteId || !deliveryNote.kundeName) return
    try {
      await supabase.from('lieferscheine').update(buildDNData(deliveryNote)).eq('id', deliveryNoteId)
      await savePositions(deliveryNoteId, positions, existingPositions)
    } catch (err) {
      console.error('Auto-save error:', err)
    }
  }

  const generateLieferscheinNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('lieferscheine').select('lieferscheinnummer').ilike('lieferscheinnummer', `LI-${year}%`)
    const nextNum = (data?.length || 0) + 1
    return `LI-${year}-${String(nextNum).padStart(5, '0')}`
  }

  const savePositions = async (targetId: string, currentPositions: DeliveryNotePosition[], existingPosData: any[]) => {
    const toDelete = existingPosData.filter(ep => !currentPositions.find(p => p.id === ep.id))
    const toUpdate = currentPositions.filter(p => p.id && existingPosData.find(ep => ep.id === p.id))
    const toCreate = currentPositions.filter(p => !p.id)

    await Promise.all([
      ...toDelete.map(p => supabase.from('lieferschein_positionen').delete().eq('id', p.id)),
      ...toUpdate.map(p => supabase.from('lieferschein_positionen').update(buildDNPosData(p, targetId)).eq('id', p.id!)),
    ])
    if (toCreate.length > 0) {
      await supabase.from('lieferschein_positionen').insert(toCreate.map(p => ({ ...buildDNPosData(p, targetId), id: undefined })))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let savedId = deliveryNoteId
      const dnCopy = { ...deliveryNote }

      if (isNew) {
        dnCopy.lieferscheinNummer = await generateLieferscheinNumber()
        setDeliveryNote(dnCopy)
        const { data, error } = await supabase.from('lieferscheine').insert([buildDNData(dnCopy)]).select().single()
        if (error) throw error
        savedId = data.id
        router.replace(`/lieferscheine/${savedId}`)
      } else {
        const { error } = await supabase.from('lieferscheine').update(buildDNData(dnCopy)).eq('id', deliveryNoteId!)
        if (error) throw error
      }

      await savePositions(savedId!, positions, isNew ? [] : existingPositions)
      queryClient.invalidateQueries({ queryKey: ['deliveryNotes'] })
      queryClient.invalidateQueries({ queryKey: ['deliveryNote', savedId] })
      toast.success('Lieferschein gespeichert')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndUploadToZoho = async () => {
    setSaving(true)
    setUploadingToZoho(true)
    try {
      let savedId = deliveryNoteId
      const dnCopy = { ...deliveryNote }

      if (isNew) {
        dnCopy.lieferscheinNummer = await generateLieferscheinNumber()
        dnCopy.status = 'erstellt'
        setDeliveryNote(dnCopy)
        const { data, error } = await supabase.from('lieferscheine').insert([buildDNData(dnCopy)]).select().single()
        if (error) throw error
        savedId = data.id
        router.replace(`/lieferscheine/${savedId}`)
      } else {
        const { error } = await supabase.from('lieferscheine').update(buildDNData(dnCopy)).eq('id', deliveryNoteId!)
        if (error) throw error
      }

      await savePositions(savedId!, positions, isNew ? [] : existingPositions)

      // Trigger Zoho webhook
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/b15d8baa-e8ec-4d8a-aa85-0865048b9c31', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lieferscheinId: savedId,
          lieferscheinNummer: dnCopy.lieferscheinNummer,
          pdfUrl: dnCopy.pdfUrl,
          fileName: `${dnCopy.lieferscheinNummer}.pdf`,
          ticketNumber: dnCopy.ticketNumber,
          datum: dnCopy.datum,
          status: dnCopy.status,
          kundeName: dnCopy.kundeName,
          objektBezeichnung: dnCopy.objektBezeichnung,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Zoho webhook failed:', err))

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

  if (loadingDN) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-4">
            <Link href="/lieferscheine">
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Alle Lieferscheine
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {isNew ? 'Neuer Lieferschein' : (deliveryNote.lieferscheinNummer || 'Lieferschein')}
              </h1>
              {!isNew && (
                <span className={`inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${deliveryNote.status === 'erstellt' ? 'bg-purple-100 text-purple-800' :
                    deliveryNote.status === 'geliefert' ? 'bg-emerald-100 text-emerald-800' :
                    'bg-slate-100 text-slate-600'}`}>
                  {deliveryNote.status}
                </span>
              )}
            </div>
          </div>
          <Button onClick={handleSaveAndUploadToZoho} disabled={saving || uploadingToZoho} className="bg-purple-600 hover:bg-purple-700 text-white">
            {(saving || uploadingToZoho) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            <span className="hidden sm:inline">Speichern & in Zoho ablegen</span>
            <span className="sm:hidden">Speichern</span>
          </Button>
        </div>

        {/* Main 3-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Left 2 cols: Empfänger + Objekt */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Empfänger</h2>
                {deliveryNote.ticketId && (
                  <a
                    href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${deliveryNote.ticketId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700" title="In Zoho öffnen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Name (Hausverwaltung / Kunde)</Label>
                  <Input value={deliveryNote.kundeName || ''} onChange={e => setDeliveryNote(p => ({ ...p, kundeName: e.target.value }))} placeholder="z.B. PAUL Vienna Office GmbH" className="mt-1" />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input value={deliveryNote.kundeStrasse || ''} onChange={e => setDeliveryNote(p => ({ ...p, kundeStrasse: e.target.value }))} placeholder="Straße und Hausnummer" className="mt-1" />
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={deliveryNote.uidnummer || ''} onChange={e => setDeliveryNote(p => ({ ...p, uidnummer: e.target.value }))} placeholder="z.B. ATU12345678" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={deliveryNote.kundePlz || ''} onChange={e => setDeliveryNote(p => ({ ...p, kundePlz: e.target.value }))} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={deliveryNote.kundeOrt || ''} onChange={e => setDeliveryNote(p => ({ ...p, kundeOrt: e.target.value }))} placeholder="Ort" className="mt-1" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Lieferadresse)</h2>
              <div className="space-y-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input value={deliveryNote.objektBezeichnung || ''} onChange={e => setDeliveryNote(p => ({ ...p, objektBezeichnung: e.target.value }))} placeholder="z.B. Hauptstraße 50, 2020 Magersdorf" className="mt-1" />
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input value={deliveryNote.kundeAnsprechpartner || ''} onChange={e => setDeliveryNote(p => ({ ...p, kundeAnsprechpartner: e.target.value }))} placeholder="Name des Ansprechpartners" className="mt-1" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Anmerkungen</h2>
              <Textarea
                value={deliveryNote.bemerkung || ''}
                onChange={e => setDeliveryNote(p => ({ ...p, bemerkung: e.target.value }))}
                rows={4}
                placeholder="Weitere Hinweise zum Lieferschein..."
                className="resize-none"
              />
            </Card>
          </div>

          {/* Right sidebar: Lieferschein-Daten */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Lieferschein-Daten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Lieferdatum</Label>
                  <Input type="date" value={deliveryNote.datum || ''} onChange={e => setDeliveryNote(p => ({ ...p, datum: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Erstellt durch</Label>
                  <Select value={deliveryNote.erstelltDurch || ''} onValueChange={v => setDeliveryNote(p => ({ ...p, erstelltDurch: v ?? '' }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Mitarbeiter auswählen..." /></SelectTrigger>
                    <SelectContent>
                      {(mitarbeiterList as any[]).map((m: any) => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={deliveryNote.status || 'entwurf'} onValueChange={v => setDeliveryNote(p => ({ ...p, status: v ?? 'entwurf' }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entwurf">Entwurf</SelectItem>
                      <SelectItem value="erstellt">Erstellt</SelectItem>
                      <SelectItem value="geliefert">Geliefert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ticket-Nr.</Label>
                  <Input value={deliveryNote.ticketNumber || ''} onChange={e => setDeliveryNote(p => ({ ...p, ticketNumber: e.target.value }))} placeholder="Ticket-Nummer" className="mt-1" />
                </div>
                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input value={deliveryNote.geschaeftsfallNummer || ''} onChange={e => setDeliveryNote(p => ({ ...p, geschaeftsfallNummer: e.target.value }))} placeholder="Geschäftsfallnummer" className="mt-1" />
                </div>
                {deliveryNote.referenzAngebotNummer && (
                  <div>
                    <Label>Referenz Angebot</Label>
                    <div className="mt-1">
                      <Link href={`/angebote/${deliveryNote.referenzAngebotId}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium">
                        {deliveryNote.referenzAngebotNummer}
                      </Link>
                    </div>
                  </div>
                )}
                {deliveryNote.pdfUrl && (
                  <div>
                    <Label>PDF</Label>
                    <div className="mt-1">
                      <a href={deliveryNote.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 underline truncate block">
                        PDF öffnen
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Positionen */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
          <DeliveryNotePositionsTable positions={positions} onChange={setPositions} />
        </Card>

        {/* PDF Preview */}
        {!isNew && (
          <div className="rounded-xl border border-slate-200 bg-white shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Lieferschein-Vorschau</h2>
              <a href={`/api/pdf/lieferschein/${deliveryNoteId}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF speichern
                </Button>
              </a>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-inner" style={{ aspectRatio: '1 / 1.414' }}>
              <iframe src={`/api/pdf/lieferschein/${deliveryNoteId}`} className="w-full h-full" title="Lieferschein-Vorschau" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
