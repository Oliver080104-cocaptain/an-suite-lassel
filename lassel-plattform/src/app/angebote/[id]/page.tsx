'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Save, Loader2, Send, Truck, Receipt, Car, FileText } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import OfferPositionsTable from '@/components/offers/OfferPositionsTable'
import OfferSummary from '@/components/offers/OfferSummary'
import StatusBadge from '@/components/shared/StatusBadge'

export default function OfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string
  const isNew = id === 'neu'
  const offerId = isNew ? null : id

  const [offer, setOffer] = useState<any>({
    angebotNummer: '',
    datum: format(new Date(), 'yyyy-MM-dd'),
    gueltigBis: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    status: 'draft',
    rechnungsempfaengerName: '',
    uidnummer: '',
    rechnungsempfaengerStrasse: '',
    rechnungsempfaengerPlz: '',
    rechnungsempfaengerOrt: '',
    objektBezeichnung: '',
    objektStrasse: '',
    objektPlz: '',
    objektOrt: '',
    hausinhabung: '',
    ansprechpartner: '',
    geschaeftsfallNummer: '',
    erstelltDurch: '',
    bemerkung: '',
    anmerkungen: '',
    ticketId: '',
    ticketNumber: '',
    source: 'manual',
    n8nWebhookUrl: '',
    reverseCharge: false
  })

  const [positions, setPositions] = useState<any[]>([{
    pos: 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk',
    einzelpreisNetto: 0, rabattProzent: 0, ustSatz: 20, gesamtNetto: 0, gesamtBrutto: 0
  }])

  const [saving, setSaving] = useState(false)
  const [creatingDeliveryNote, setCreatingDeliveryNote] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [uploadingToZoho, setUploadingToZoho] = useState(false)
  const autoSaveLock = useRef(false)
  const positionsInitialized = useRef(false)
  const offerInitialized = useRef(false)

  const { data: existingOffer, isLoading: loadingOffer } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: async () => {
      if (!offerId) return null
      const { data, error } = await supabase.from('offers').select('*').eq('id', offerId).single()
      if (error) throw error
      return data
    },
    enabled: !!offerId
  })

  const { data: existingPositions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['offerPositions', offerId],
    queryFn: async () => {
      if (!offerId) return []
      const { data, error } = await supabase.from('offer_positions').select('*').eq('offerId', offerId).order('pos')
      if (error) throw error
      return data || []
    },
    enabled: !!offerId
  })

  const { data: linkedInvoices = [] } = useQuery({
    queryKey: ['linkedInvoices', offerId],
    queryFn: async () => {
      if (!offerId) return []
      const { data, error } = await supabase.from('invoices').select('*').eq('referenzAngebotId', offerId)
      if (error) return []
      return data || []
    },
    enabled: !!offerId
  })

  const { data: linkedDeliveryNotes = [] } = useQuery({
    queryKey: ['linkedDeliveryNotes', offerId],
    queryFn: async () => {
      if (!offerId) return []
      const { data, error } = await supabase.from('delivery_notes').select('*').eq('referenzAngebotId', offerId)
      if (error) return []
      return data || []
    },
    enabled: !!offerId
  })

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      if (error) throw error
      return data || []
    }
  })

  const { data: vermittlerList = [] } = useQuery({
    queryKey: ['vermittler'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vermittler').select('*').eq('status', 'aktiv').order('name')
      if (error) throw error
      return data || []
    }
  })

  const { data: companySettingsData } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*').limit(1).single()
      if (error) return {}
      return data || {}
    }
  })

  useEffect(() => {
    if (existingOffer && !offerInitialized.current) {
      setOffer(existingOffer)
      offerInitialized.current = true
    }
  }, [existingOffer])

  useEffect(() => {
    if (existingPositions.length > 0 && !positionsInitialized.current) {
      setPositions(existingPositions)
      positionsInitialized.current = true
    }
  }, [existingPositions])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (isNew) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && offerId && offer.rechnungsempfaengerName) {
        handleAutoSave()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (offerId && offer.rechnungsempfaengerName) handleAutoSave()
    }
  }, [offer, positions, isNew, offerId])

  const totals = useMemo(() => {
    const summeNetto = positions.reduce((sum: number, p: any) => sum + (parseFloat(p.gesamtNetto) || 0), 0)
    const summeRabatt = positions.reduce((sum: number, p: any) => {
      const menge = parseFloat(p.menge) || 0
      const einzelpreis = parseFloat(p.einzelpreisNetto) || 0
      const rabatt = parseFloat(p.rabattProzent) || 0
      return sum + (menge * einzelpreis * (rabatt / 100))
    }, 0)
    const summeUst = positions.reduce((sum: number, p: any) => {
      const gesamtNetto = parseFloat(p.gesamtNetto) || 0
      const ustSatz = parseFloat(p.ustSatz) || 20
      return sum + (gesamtNetto * (ustSatz / 100))
    }, 0)
    return { summeNetto, summeRabatt, summeUst, summeBrutto: summeNetto + summeUst }
  }, [positions])

  const handleAutoSave = async () => {
    if (isNew || !offerId || autoSaveLock.current) return
    autoSaveLock.current = true
    try {
      await supabase.from('offers').update({ ...offer, ...totals }).eq('id', offerId)
      await savePositions(offerId, positions, existingPositions)
    } catch (error) {
      console.error('Auto-save error:', error)
    } finally {
      autoSaveLock.current = false
    }
  }

  const savePositions = async (targetOfferId: string, currentPositions: any[], currentExistingPositions: any[]) => {
    const existingPosIds = currentExistingPositions.map((p: any) => p.id)
    const toDelete = currentExistingPositions.filter((ep: any) => !currentPositions.find((p: any) => p.id === ep.id))
    const toUpdate = currentPositions.filter((p: any) => p.id && existingPosIds.includes(p.id))
    const toCreate = currentPositions.filter((p: any) => !p.id)

    const buildPosData = (pos: any) => ({
      offerId: targetOfferId,
      pos: pos.pos,
      produktId: pos.produktId,
      produktName: pos.produktName,
      beschreibung: pos.beschreibung || '',
      menge: parseFloat(pos.menge) || 0,
      einheit: pos.einheit,
      einzelpreisNetto: parseFloat(pos.einzelpreisNetto) || 0,
      rabattProzent: parseFloat(pos.rabattProzent) || 0,
      ustSatz: parseFloat(pos.ustSatz) || 20,
      gesamtNetto: parseFloat(pos.gesamtNetto) || 0,
      gesamtBrutto: parseFloat(pos.gesamtBrutto) || 0
    })

    await Promise.all([
      ...toDelete.map((p: any) => supabase.from('offer_positions').delete().eq('id', p.id)),
      ...toUpdate.map((p: any) => supabase.from('offer_positions').update(buildPosData(p)).eq('id', p.id)),
      ...(toCreate.length > 0 ? [supabase.from('offer_positions').insert(toCreate.map(buildPosData))] : [])
    ])
  }

  const generateOfferNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('offers').select('angebotNummer').like('angebotNummer', `AN-${year}-%`)
    const nextNumber = (data?.length || 0) + 1
    return `AN-${year}-${String(nextNumber).padStart(5, '0')}`
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let savedOffer: any
      const offerData = { ...offer, ...totals }
      if (isNew) {
        offerData.angebotNummer = await generateOfferNumber()
        const { data, error } = await supabase.from('offers').insert(offerData).select().single()
        if (error) throw error
        savedOffer = data
      } else {
        const { error } = await supabase.from('offers').update(offerData).eq('id', offerId)
        if (error) throw error
        savedOffer = { ...offerData, id: offerId }
      }
      await savePositions(savedOffer.id, positions, isNew ? [] : existingPositions)
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      queryClient.invalidateQueries({ queryKey: ['offer', savedOffer.id] })
      queryClient.invalidateQueries({ queryKey: ['offerPositions', savedOffer.id] })
      toast.success(isNew ? 'Angebot erstellt' : 'Angebot gespeichert')
      if (isNew) router.replace(`/angebote/${savedOffer.id}`)
    } catch (error: any) {
      toast.error('Fehler beim Speichern: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndUploadToZoho = async () => {
    if (positions.length === 0 || !positions[0].produktName) {
      toast.error('Mindestens eine Position erforderlich')
      return
    }
    setSaving(true)
    setUploadingToZoho(true)
    try {
      let savedOffer: any
      const offerData = { ...offer, ...totals }
      if (isNew) {
        offerData.angebotNummer = await generateOfferNumber()
        const { data, error } = await supabase.from('offers').insert(offerData).select().single()
        if (error) throw error
        savedOffer = data
        router.replace(`/angebote/${savedOffer.id}`)
      } else {
        const { error } = await supabase.from('offers').update(offerData).eq('id', offerId)
        if (error) throw error
        savedOffer = { ...offerData, id: offerId }
      }
      await savePositions(savedOffer.id, positions, isNew ? [] : existingPositions)

      const editUrl = `${window.location.origin}/angebote/${savedOffer.id}`
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fccf5130-51b2-4e66-8aa2-84d29da4862a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: savedOffer.id,
          angebotNummer: savedOffer.angebotNummer,
          pdfUrl: savedOffer.pdfUrl,
          editUrl,
          ticketId: savedOffer.ticketId,
          ticketNumber: savedOffer.ticketNumber,
          dealId: savedOffer.dealId,
          geschaeftsfallNummer: savedOffer.geschaeftsfallNummer,
          datum: savedOffer.datum,
          gueltigBis: savedOffer.gueltigBis,
          status: savedOffer.status,
          rechnungsempfaengerName: savedOffer.rechnungsempfaengerName,
          objektBezeichnung: savedOffer.objektBezeichnung,
          erstelltDurch: savedOffer.erstelltDurch,
          summen: totals,
          skizzenLink: savedOffer.Skizzen_Link,
          timestamp: new Date().toISOString()
        })
      }).catch(console.error)

      queryClient.invalidateQueries({ queryKey: ['offers'] })
      toast.success('PDF erfolgreich in Zoho abgespeichert')
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    } finally {
      setSaving(false)
      setUploadingToZoho(false)
    }
  }

  const handleCreateDeliveryNote = async () => {
    if (!offerId) { toast.error('Angebot muss zuerst gespeichert werden'); return }
    setCreatingDeliveryNote(true)
    toast.loading('Lieferschein wird erstellt...')
    try {
      const lieferscheinNummer = offer.angebotNummer?.replace('AN-', 'LI-')
      const { data: deliveryNote, error } = await supabase.from('delivery_notes').insert({
        lieferscheinNummer,
        ticketIdentifikation: offer.ticketId || offer.ticketNumber,
        source: 'manual',
        ticketId: offer.ticketId,
        ticketNumber: offer.ticketNumber,
        geschaeftsfallNummer: offer.geschaeftsfallNummer,
        referenzAngebotNummer: offer.angebotNummer,
        referenzAngebotId: offer.id || offerId,
        kundeName: offer.rechnungsempfaengerName,
        uidnummer: offer.uidnummer,
        kundeStrasse: offer.rechnungsempfaengerStrasse,
        kundePlz: offer.rechnungsempfaengerPlz,
        kundeOrt: offer.rechnungsempfaengerOrt,
        kundeAnsprechpartner: offer.ansprechpartner,
        hausinhabung: offer.hausinhabung,
        objektStrasse: offer.objektStrasse,
        objektBezeichnung: offer.objektBezeichnung,
        datum: format(new Date(), 'yyyy-MM-dd'),
        erstelltDurch: offer.erstelltDurch,
        bemerkung: offer.bemerkung,
        status: 'entwurf'
      }).select().single()
      if (error) throw error

      await supabase.from('delivery_note_positions').insert(
        positions.map((pos: any) => ({
          deliveryNoteId: deliveryNote.id,
          pos: pos.pos, produktName: pos.produktName,
          beschreibung: pos.beschreibung || '', menge: pos.menge, einheit: pos.einheit
        }))
      )

      try {
        const editUrl = `${window.location.origin}/lieferscheine/${deliveryNote.id}`
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/5e4e9681-a79e-42be-a1d0-309bfdc36909', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'lieferschein_erstellt', lieferscheinId: deliveryNote.id, editUrl, timestamp: new Date().toISOString() })
        })
      } catch (e) { console.error('Webhook fehlgeschlagen:', e) }

      toast.dismiss()
      toast.success('Lieferschein erstellt - Weiterleitung...')
      router.push(`/lieferscheine/${deliveryNote.id}`)
    } catch (error: any) {
      toast.dismiss()
      toast.error('Fehler: ' + error.message)
      setCreatingDeliveryNote(false)
    }
  }

  const handleCreateInvoice = async () => {
    if (!offerId) { toast.error('Angebot muss zuerst gespeichert werden'); return }
    setCreatingInvoice(true)
    toast.loading('Rechnung wird erstellt...')
    try {
      const rechnungsNummer = offer.angebotNummer?.replace('AN-', 'RE-')
      const { data: invoice, error } = await supabase.from('invoices').insert({
        rechnungsNummer,
        rechnungstyp: 'normal',
        ticketId: offer.ticketId,
        ticketNumber: offer.ticketNumber,
        objektBezeichnung: offer.objektBezeichnung,
        referenzAngebotNummer: offer.angebotNummer,
        referenzAngebotId: offer.id || offerId,
        kundeName: offer.rechnungsempfaengerName,
        uidnummer: offer.uidnummer,
        kundeStrasse: offer.rechnungsempfaengerStrasse,
        kundePlz: offer.rechnungsempfaengerPlz,
        kundeOrt: offer.rechnungsempfaengerOrt,
        kundeAnsprechpartner: offer.ansprechpartner,
        hausinhabung: offer.hausinhabung,
        objektStrasse: offer.objektStrasse,
        objektPlz: offer.objektPlz,
        objektOrt: offer.objektOrt,
        datum: format(new Date(), 'yyyy-MM-dd'),
        zahlungskondition: '14 Tage netto',
        zahlungszielTage: 14,
        faelligAm: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
        erstelltDurch: offer.erstelltDurch,
        bemerkung: offer.bemerkung,
        status: 'entwurf',
        summeNetto: totals.summeNetto,
        summeRabatt: totals.summeRabatt,
        summeUst: totals.summeUst,
        summeBrutto: totals.summeBrutto
      }).select().single()
      if (error) throw error

      await supabase.from('invoice_positions').insert(
        positions.map((pos: any) => ({
          invoiceId: invoice.id,
          pos: pos.pos, produktName: pos.produktName, beschreibung: pos.beschreibung || '',
          menge: parseFloat(pos.menge) || 0, einheit: pos.einheit,
          einzelpreisNetto: parseFloat(pos.einzelpreisNetto) || 0,
          rabattProzent: parseFloat(pos.rabattProzent) || 0,
          ustSatz: parseFloat(pos.ustSatz) || 20,
          gesamtNetto: parseFloat(pos.gesamtNetto) || 0,
          gesamtBrutto: parseFloat(pos.gesamtBrutto) || 0,
          teilfakturaProzent: 100, bereitsFakturiert: 0
        }))
      )

      try {
        const editUrl = `${window.location.origin}/rechnungen/${invoice.id}`
        await fetch('https://lasselgmbh.app.n8n.cloud/webhook/47c3bc5b-17e6-4c07-bd72-71a546d023d5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rechnungsId: invoice.id, editUrl, timestamp: new Date().toISOString() })
        })
      } catch (e) { console.error('Webhook fehlgeschlagen:', e) }

      toast.dismiss()
      toast.success('Rechnung erstellt - Weiterleitung...')
      router.push(`/rechnungen/${invoice.id}`)
    } catch (error: any) {
      toast.dismiss()
      toast.error('Fehler: ' + error.message)
      setCreatingInvoice(false)
    }
  }

  const handleSendOffer = async () => {
    if (!offerId) { toast.error('Angebot muss zuerst gespeichert werden'); return }
    try {
      await supabase.from('offers').update({ status: 'versendet' }).eq('id', offerId)
      setOffer({ ...offer, status: 'versendet' })
      try {
        const editUrl = `${window.location.origin}/angebote/${offerId}`
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId, angebotNummer: offer.angebotNummer, editUrl, status: 'versendet', timestamp: new Date().toISOString() })
        })
      } catch (e) { console.error('Webhook fehlgeschlagen:', e) }
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      toast.success('Angebot versendet')
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    }
  }

  if (loadingOffer || loadingPositions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const createdAt = offer.created_at || offer.created_date

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-3 rounded-lg">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <Link href="/angebote" className="text-sm text-slate-500 hover:text-slate-700">← Alle Angebote</Link>
              <h1 className="text-3xl font-bold text-slate-900">{isNew ? 'Neues Angebot' : offer.angebotNummer || 'Angebot'}</h1>
              <p className="text-sm text-slate-600 mt-1">
                {isNew ? 'Angebot erstellen' : (createdAt ? `Erstellt am ${format(new Date(createdAt), 'dd.MM.yyyy')}` : '')}
              </p>
            </div>
          </div>
          <div className="ml-auto">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {!isNew && <StatusBadge status={offer.status} />}
                <Button
                  onClick={handleSaveAndUploadToZoho}
                  disabled={saving || uploadingToZoho}
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                >
                  {(saving || uploadingToZoho) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Speichern & in Zoho ablegen
                </Button>
              </div>
              {!isNew && (
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast.info('Parksperre-Dialog wird geöffnet...')
                    }}
                    className="border-blue-200 text-blue-700 hover:bg-blue-50 flex-1 sm:flex-none"
                    size="sm"
                  >
                    <Car className="w-4 h-4 mr-2" />
                    Parksperre beantragen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCreateDeliveryNote}
                    disabled={creatingDeliveryNote}
                    className="border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 flex-1 sm:flex-none"
                    size="sm"
                  >
                    {creatingDeliveryNote ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
                    Lieferschein erzeugen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCreateInvoice}
                    disabled={creatingInvoice}
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex-1 sm:flex-none"
                    size="sm"
                  >
                    {creatingInvoice ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Receipt className="w-4 h-4 mr-2" />}
                    Rechnung erzeugen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSendOffer}
                    className="border-green-200 text-green-700 hover:bg-green-50 flex-1 sm:flex-none"
                    size="sm"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Angebot versenden
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Left: Rechnungsempfänger + Objekt */}
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Rechnungsempfänger</h2>
                {offer.ticketId && (
                  <a href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${offer.ticketId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700" title="In Zoho öffnen">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Name (Hausverwaltung / Kunde)</Label>
                  <Input value={offer.rechnungsempfaengerName || ''} onChange={(e) => setOffer({ ...offer, rechnungsempfaengerName: e.target.value })} placeholder="z.B. PAUL Vienna Office GmbH" className="mt-1" />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input value={offer.rechnungsempfaengerStrasse || ''} onChange={(e) => setOffer({ ...offer, rechnungsempfaengerStrasse: e.target.value })} placeholder="Straße und Hausnummer" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={offer.rechnungsempfaengerPlz || ''} onChange={(e) => setOffer({ ...offer, rechnungsempfaengerPlz: e.target.value })} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={offer.rechnungsempfaengerOrt || ''} onChange={(e) => setOffer({ ...offer, rechnungsempfaengerOrt: e.target.value })} placeholder="Ort" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={offer.uidnummer || ''} onChange={(e) => setOffer({ ...offer, uidnummer: e.target.value })} placeholder="z.B. ATU12345678" className="mt-1" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input value={offer.objektBezeichnung || ''} onChange={(e) => setOffer({ ...offer, objektBezeichnung: e.target.value })} placeholder="z.B. Hauptstraße 50, 2020 Magersdorf" className="mt-1" />
                </div>
                <div>
                  <Label>Objektadresse (Straße und Nummer)</Label>
                  <Input value={offer.objektStrasse || ''} onChange={(e) => setOffer({ ...offer, objektStrasse: e.target.value })} placeholder="z.B. Rauscherstraße 251" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Objekt PLZ</Label>
                    <Input value={offer.objektPlz || ''} onChange={(e) => setOffer({ ...offer, objektPlz: e.target.value })} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Objekt Ort</Label>
                    <Input value={offer.objektOrt || ''} onChange={(e) => setOffer({ ...offer, objektOrt: e.target.value })} placeholder="Ort" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Hausinhabung (HI)</Label>
                  <Input value={offer.hausinhabung || ''} onChange={(e) => setOffer({ ...offer, hausinhabung: e.target.value })} placeholder="Name des Eigentümers (optional)" className="mt-1" />
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Angebotsdaten */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Angebotsdaten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Angebotsdatum</Label>
                  <Input type="date" value={offer.datum || ''} onChange={(e) => setOffer({ ...offer, datum: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Gültig bis</Label>
                  <Input type="date" value={offer.gueltigBis || ''} onChange={(e) => setOffer({ ...offer, gueltigBis: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Angebot erstellt von</Label>
                  <Select value={offer.erstelltDurch || ''} onValueChange={(value) => setOffer({ ...offer, erstelltDurch: value })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Mitarbeiter auswählen..." /></SelectTrigger>
                    <SelectContent>
                      {(mitarbeiterList as any[]).map((m: any) => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={offer.vermittlerId ? 'p-3 bg-orange-50 border-2 border-orange-300 rounded-lg' : ''}>
                  <Label>Vermittler</Label>
                  <Select value={offer.vermittlerId || ''} onValueChange={(value) => setOffer({ ...offer, vermittlerId: value || null })}>
                    <SelectTrigger className={offer.vermittlerId ? 'mt-1 border-orange-300 bg-white' : 'mt-1'}><SelectValue placeholder="Vermittler auswählen (optional)..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Kein Vermittler</SelectItem>
                      {(vermittlerList as any[]).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} ({v.provisionssatz || 10}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {offer.vermittlerId && (vermittlerList as any[]).find((v: any) => v.id === offer.vermittlerId) && (
                    <p className="text-xs text-orange-700 font-medium mt-2">
                      Vermittler-Provision: {(vermittlerList as any[]).find((v: any) => v.id === offer.vermittlerId)?.provisionssatz || 10}% wird an Vermittler gezahlt
                    </p>
                  )}
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mt-1">
                    <Select
                      value={offer.status || 'draft'}
                      onValueChange={async (v) => {
                        setOffer({ ...offer, status: v })
                        if (v === 'angenommen' && offerId) {
                          try {
                            await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/2c51d71e-b55d-493d-aafb-1443d1d100cc', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ angebotId: offerId, angebotNummer: offer.angebotNummer, status: 'angenommen', timestamp: new Date().toISOString() })
                            })
                          } catch (e) { console.error('Webhook Fehler:', e) }
                        }
                      }}
                    >
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                        <SelectItem value="ready_for_pdf">Bereit für PDF</SelectItem>
                        <SelectItem value="final">Final</SelectItem>
                        <SelectItem value="versendet">Versendet</SelectItem>
                        <SelectItem value="angenommen">Angenommen</SelectItem>
                        <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                        <SelectItem value="abgelaufen">Abgelaufen</SelectItem>
                        <SelectItem value="storniert">Storniert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Ticket-Nr.</Label>
                  <Input value={offer.ticketNumber || ''} onChange={(e) => setOffer({ ...offer, ticketNumber: e.target.value })} placeholder="Ticket-Nummer" className="mt-1" />
                </div>
                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input value={offer.geschaeftsfallNummer || ''} onChange={(e) => setOffer({ ...offer, geschaeftsfallNummer: e.target.value })} placeholder="Geschäftsfallnummer (optional)" className="mt-1" />
                </div>
                <div>
                  <Label>Skizzen Link</Label>
                  <Input value={offer.Skizzen_Link || ''} onChange={(e) => setOffer({ ...offer, Skizzen_Link: e.target.value })} placeholder="Zoho Workdrive Link" className="mt-1" />
                  {offer.Skizzen_Link && (
                    <a href={offer.Skizzen_Link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block">Link öffnen</a>
                  )}
                </div>
                <div>
                  <Label>PDF Link</Label>
                  <Input value={offer.pdfUrl || ''} onChange={(e) => setOffer({ ...offer, pdfUrl: e.target.value })} placeholder="PDF Link (wird automatisch gesetzt)" className="mt-1" readOnly />
                  {offer.pdfUrl && (
                    <a href={offer.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block">PDF öffnen</a>
                  )}
                </div>
              </div>
            </Card>

            {!isNew && ((linkedInvoices as any[]).length > 0 || (linkedDeliveryNotes as any[]).length > 0) && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Verknüpfte Dokumente</h2>
                <div className="space-y-4">
                  {(linkedInvoices as any[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rechnungen</p>
                      <div className="space-y-1">
                        {(linkedInvoices as any[]).map((inv: any) => (
                          <Link key={inv.id} href={`/rechnungen/${inv.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group">
                            <span className="text-sm font-medium text-blue-600 group-hover:underline">{inv.rechnungsNummer}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'bezahlt' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'offen' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{inv.status}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {(linkedDeliveryNotes as any[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Lieferscheine</p>
                      <div className="space-y-1">
                        {(linkedDeliveryNotes as any[]).map((dn: any) => (
                          <Link key={dn.id} href={`/lieferscheine/${dn.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group">
                            <span className="text-sm font-medium text-blue-600 group-hover:underline">{dn.lieferscheinNummer}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dn.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{dn.status}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Positionen */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
          <OfferPositionsTable positions={positions} onChange={setPositions} />
        </Card>

        {/* Anmerkungen + Steueroptionen + Zusammenfassung */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Anmerkungen zum Angebot</h2>
            <Textarea
              value={offer.anmerkungen || ''}
              onChange={(e) => setOffer({ ...offer, anmerkungen: e.target.value })}
              placeholder="Optionale Anmerkungen, die im Angebot angezeigt werden..."
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-2">Zeilenumbrüche werden in der PDF übernommen. Feld kann leer bleiben.</p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Steueroptionen</h2>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reverseCharge"
                checked={offer.reverseCharge || false}
                onCheckedChange={(checked) => setOffer({ ...offer, reverseCharge: checked })}
              />
              <label htmlFor="reverseCharge" className="text-sm font-medium leading-none cursor-pointer">
                Ohne 20% UST (Reverse Charge / Ausnahme)
              </label>
            </div>
          </Card>

          <OfferSummary positions={positions} reverseCharge={offer.reverseCharge} />
        </div>

        {/* PDF Preview */}
        {offerId && (
          <div className="overflow-x-auto bg-gray-200 rounded-xl p-6">
            <div style={{ width: '794px', margin: '0 auto' }}>
              <iframe
                src={`/api/pdf/angebot/${offerId}`}
                style={{ width: '794px', height: '1123px', border: 'none', display: 'block' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
