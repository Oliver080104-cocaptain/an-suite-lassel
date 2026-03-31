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
import { Save, Loader2, Send, Truck, Receipt, Car, FileText, Download, ChevronDown, Plus } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import OfferPositionsTable from '@/components/offers/OfferPositionsTable'
import OfferSummary from '@/components/offers/OfferSummary'
import StatusBadge from '@/components/shared/StatusBadge'
import EmailVorschauModal from '@/components/EmailVorschauModal'
import ParksperreModal from '@/components/ParksperreModal'

export default function OfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string
  const isNew = id === 'neu'
  const offerId = isNew ? null : id

  const [offer, setOffer] = useState<any>({
    angebotsnummer: '',
    angebotsdatum: format(new Date(), 'yyyy-MM-dd'),
    gueltig_bis: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    status: 'entwurf',
    kunde_name: '',
    kunde_uid: '',
    kunde_strasse: '',
    kunde_plz: '',
    kunde_ort: '',
    objekt_bezeichnung: '',
    objekt_adresse: '',
    objekt_plz: '',
    objekt_ort: '',
    hausinhabung: '',
    erstellt_von: '',
    skizzen_link: '',
    fusszeile: '',
    // UI-only fields (not saved to DB)
    ansprechpartner: '',
    geschaeftsfallNummer: '',
    // DB fields
    ticket_nummer: '',
    zoho_ticket_id: '',
    reverse_charge: false,
    notizen: '',
    pdf_url: '',
    vermittler_id: null,
    netto_gesamt: 0,
    mwst_gesamt: 0,
    brutto_gesamt: 0,
  })

  const [positions, setPositions] = useState<any[]>([{
    pos: 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk',
    einzelpreisNetto: 0, rabattProzent: 0, ustSatz: 20, gesamtNetto: 0, gesamtBrutto: 0
  }])

  const [vorlagenOpen, setVorlagenOpen] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [parksperreModalOpen, setParksperreModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingDeliveryNote, setCreatingDeliveryNote] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [uploadingToZoho, setUploadingToZoho] = useState(false)
  const autoSaveLock = useRef(false)
  const positionsInitialized = useRef(false)
  const offerInitialized = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: existingOffer, isLoading: loadingOffer } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: async () => {
      if (!offerId) return null
      const { data, error } = await supabase.from('angebote').select('*').eq('id', offerId).single()
      if (error) throw error
      return data
    },
    enabled: !!offerId
  })

  const { data: existingPositions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['offerPositions', offerId],
    queryFn: async () => {
      if (!offerId) return []
      const { data, error } = await supabase.from('angebot_positionen').select('*').eq('angebot_id', offerId).order('position')
      if (error) throw error
      return data || []
    },
    enabled: !!offerId
  })

  const { data: linkedInvoices = [] } = useQuery({
    queryKey: ['linkedInvoices', offerId],
    queryFn: async () => {
      if (!offerId) return []
      const { data, error } = await supabase.from('rechnungen').select('*').eq('angebot_id', offerId)
      if (error) return []
      return data || []
    },
    enabled: !!offerId
  })

  const { data: linkedDeliveryNotes = [] } = useQuery({
    queryKey: ['linkedDeliveryNotes', offerId],
    queryFn: async () => {
      if (!offerId) return []
      const { data, error } = await supabase.from('lieferscheine').select('*').eq('angebot_id', offerId)
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
      const { data, error } = await supabase.from('vermittler').select('*').order('name')
      if (error) throw error
      return data || []
    }
  })

  const { data: vorlagenList = [] } = useQuery({
    queryKey: ['textvorlagen'],
    queryFn: async () => {
      const { data } = await supabase.from('textvorlagen').select('*').order('name')
      return data || []
    }
  })

  const { data: companySettingsData } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('einstellungen').select('*').limit(1).single()
      if (error) return {}
      return data || {}
    }
  })

  useEffect(() => {
    if (existingOffer && !offerInitialized.current) {
      setOffer({
        ...existingOffer,
        gueltig_bis: existingOffer.gueltig_bis || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        objekt_plz: existingOffer.objekt_plz || '',
        objekt_ort: existingOffer.objekt_ort || '',
        erstellt_von: existingOffer.erstellt_von || '',
        skizzen_link: existingOffer.skizzen_link || '',
        hausinhabung: existingOffer.hausinhabung || '',
        fusszeile: existingOffer.fusszeile || '',
        objekt_bezeichnung: existingOffer.objekt_bezeichnung || '',
      })
      offerInitialized.current = true
    }
  }, [existingOffer])

  useEffect(() => {
    if (existingPositions.length > 0 && !positionsInitialized.current) {
      const mapped = existingPositions
        .map((p: any, i: number) => {
          const lines = (p.beschreibung || '').split('\n')
          return {
            id: p.id,
            pos: i + 1,
            produktName: lines[0] || '',
            beschreibung: lines.slice(1).join('\n'),
            menge: p.menge,
            einheit: p.einheit || 'Stk',
            einzelpreisNetto: p.einzelpreis,
            rabattProzent: p.rabatt_prozent,
            ustSatz: p.mwst_satz,
            gesamtNetto: p.gesamtpreis,
            gesamtBrutto: 0,
          }
        })
        .filter((p: any) => p.produktName?.trim() || parseFloat(p.einzelpreisNetto) > 0)
      setPositions(mapped.length > 0 ? mapped : [{
        pos: 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk',
        einzelpreisNetto: 0, rabattProzent: 0, ustSatz: 20, gesamtNetto: 0, gesamtBrutto: 0
      }])
      positionsInitialized.current = true
    }
  }, [existingPositions])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (isNew) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && offerId && offer.kunde_name) {
        handleAutoSave()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (offerId && offer.kunde_name) handleAutoSave()
    }
  }, [offer, positions, isNew, offerId])

  // Debounced autosave: 2 seconds after last change
  useEffect(() => {
    if (isNew || !offerId || !offerInitialized.current) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      handleAutoSave()
    }, 2000)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [offer, positions])

  const totals = useMemo(() => {
    const netto_gesamt = positions.reduce((sum: number, p: any) => {
      const menge = parseFloat(p.menge) || 0
      const einzelpreis = parseFloat(p.einzelpreisNetto) || 0
      const rabatt = parseFloat(p.rabattProzent) || 0
      return sum + (menge * einzelpreis * (1 - rabatt / 100))
    }, 0)
    const mwst_gesamt = positions.reduce((sum: number, p: any) => {
      const menge = parseFloat(p.menge) || 0
      const einzelpreis = parseFloat(p.einzelpreisNetto) || 0
      const rabatt = parseFloat(p.rabattProzent) || 0
      const nettoPos = menge * einzelpreis * (1 - rabatt / 100)
      const mwst_satz = parseFloat(p.ustSatz) || 20
      return sum + (nettoPos * (mwst_satz / 100))
    }, 0)
    return { netto_gesamt, mwst_gesamt, brutto_gesamt: netto_gesamt + mwst_gesamt }
  }, [positions])

  const buildOfferData = (offerState: any) => ({
    angebotsnummer: offerState.angebotsnummer,
    angebotsdatum: offerState.angebotsdatum,
    gueltig_bis: offerState.gueltig_bis,
    status: offerState.status || 'entwurf',
    kunde_name: offerState.kunde_name || '',
    kunde_uid: offerState.kunde_uid || null,
    kunde_strasse: offerState.kunde_strasse || null,
    kunde_plz: offerState.kunde_plz || null,
    kunde_ort: offerState.kunde_ort || null,
    objekt_bezeichnung: offerState.objekt_bezeichnung || null,
    objekt_adresse: offerState.objekt_adresse || null,
    objekt_plz: offerState.objekt_plz || null,
    objekt_ort: offerState.objekt_ort || null,
    hausinhabung: offerState.hausinhabung || null,
    erstellt_von: offerState.erstellt_von || null,
    skizzen_link: offerState.skizzen_link || null,
    fusszeile: offerState.fusszeile || null,
    ticket_nummer: offerState.ticket_nummer || null,
    zoho_ticket_id: offerState.zoho_ticket_id || null,
    reverse_charge: offerState.reverse_charge || false,
    notizen: offerState.notizen || null,
    pdf_url: offerState.pdf_url || null,
    vermittler_id: offerState.vermittler_id || null,
    netto_gesamt: offerState.netto_gesamt || 0,
    mwst_gesamt: offerState.mwst_gesamt || 0,
    brutto_gesamt: offerState.brutto_gesamt || 0,
  })

  const handleAutoSave = async () => {
    if (isNew || !offerId || autoSaveLock.current) return
    autoSaveLock.current = true
    try {
      await supabase.from('angebote').update(buildOfferData({ ...offer, ...totals })).eq('id', offerId)
      const posToSave = positions.filter((p: any) => p.produktName?.trim() || p.beschreibung?.trim())
      await savePositions(offerId, posToSave, existingPositions)
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
      angebot_id: targetOfferId,
      position: pos.pos ?? pos.position,
      beschreibung: pos.produktName
        ? (pos.beschreibung ? `${pos.produktName}\n${pos.beschreibung}` : pos.produktName)
        : (pos.beschreibung || ''),
      menge: parseFloat(pos.menge) || 0,
      einheit: pos.einheit || 'Stk',
      einzelpreis: parseFloat(pos.einzelpreisNetto ?? pos.einzelpreis) || 0,
      rabatt_prozent: parseFloat(pos.rabattProzent ?? pos.rabatt_prozent) || 0,
      mwst_satz: parseFloat(pos.ustSatz ?? pos.mwst_satz) || 20,
      gesamtpreis: parseFloat(pos.gesamtNetto ?? pos.gesamtpreis) || 0,
    })

    await Promise.all([
      ...toDelete.map((p: any) => supabase.from('angebot_positionen').delete().eq('id', p.id)),
      ...toUpdate.map((p: any) => supabase.from('angebot_positionen').update(buildPosData(p)).eq('id', p.id)),
      ...(toCreate.length > 0 ? [supabase.from('angebot_positionen').insert(toCreate.map(buildPosData))] : [])
    ])
  }

  const generateOfferNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('angebote').select('angebotsnummer').like('angebotsnummer', `AN-${year}-%`)
    const nextNumber = (data?.length || 0) + 1
    return `AN-${year}-${String(nextNumber).padStart(5, '0')}`
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let savedOffer: any
      const offerData = buildOfferData({ ...offer, ...totals })
      if (isNew) {
        offerData.angebotsnummer = await generateOfferNumber()
        const { data, error } = await supabase.from('angebote').insert(offerData).select().single()
        if (error) throw error
        savedOffer = data
      } else {
        const { error } = await supabase.from('angebote').update(offerData).eq('id', offerId)
        if (error) throw error
        savedOffer = { ...offerData, id: offerId }
      }
      const posToSave = positions.filter((p: any) => p.produktName?.trim() || p.beschreibung?.trim())
      await savePositions(savedOffer.id, posToSave, isNew ? [] : existingPositions)
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
    if (positions.length === 0 || !positions[0].beschreibung) {
      toast.error('Mindestens eine Position erforderlich')
      return
    }
    setSaving(true)
    setUploadingToZoho(true)
    try {
      let savedOffer: any
      const offerData = buildOfferData({ ...offer, ...totals })
      if (isNew) {
        offerData.angebotsnummer = await generateOfferNumber()
        const { data, error } = await supabase.from('angebote').insert(offerData).select().single()
        if (error) throw error
        savedOffer = data
        router.replace(`/angebote/${savedOffer.id}`)
      } else {
        const { error } = await supabase.from('angebote').update(offerData).eq('id', offerId)
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
          angebotNummer: savedOffer.angebotsnummer,
          pdfUrl: `${window.location.origin}/api/pdf/angebot/${savedOffer.id}`,
          editUrl,
          ticketId: savedOffer.zoho_ticket_id,
          ticketNumber: savedOffer.ticket_nummer,
          dealId: savedOffer.dealId,
          geschaeftsfallNummer: offer.geschaeftsfallNummer,
          datum: savedOffer.angebotsdatum,
          gueltigBis: savedOffer.gueltig_bis,
          status: savedOffer.status,
          rechnungsempfaengerName: savedOffer.kunde_name,
          objektBezeichnung: savedOffer.objekt_bezeichnung,
          erstellt_von: offer.erstellt_von,
          summen: totals,
          skizzenLink: offer.skizzen_link,
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
      const year = new Date().getFullYear()
      const liPrefix = `LI-${year}-`
      const { data: lastLi } = await supabase.from('lieferscheine').select('lieferscheinnummer')
        .like('lieferscheinnummer', `${liPrefix}%`)
        .order('lieferscheinnummer', { ascending: false })
        .limit(1).maybeSingle()
      const lieferscheinnummer = lastLi?.lieferscheinnummer
        ? `${liPrefix}${String(parseInt(lastLi.lieferscheinnummer.replace(liPrefix, ''), 10) + 1).padStart(5, '0')}`
        : `${liPrefix}00001`

      const { data: deliveryNote, error } = await supabase.from('lieferscheine').insert({
        lieferscheinnummer,
        angebot_id: offer.id || offerId,
        kunde_name: offer.kunde_name,
        kunde_strasse: offer.kunde_strasse,
        kunde_plz: offer.kunde_plz,
        kunde_ort: offer.kunde_ort,
        objekt_adresse: offer.objekt_bezeichnung || offer.objekt_adresse,
        lieferdatum: format(new Date(), 'yyyy-MM-dd'),
        ticket_nummer: offer.ticket_nummer,
        status: 'entwurf'
      }).select().single()
      if (error) throw error

      const { data: dbPositions } = await supabase.from('angebot_positionen')
        .select('*').eq('angebot_id', offerId).order('position')
      const posForLi = (dbPositions || []).filter((p: any) => p.beschreibung?.trim() || p.menge)
      if (posForLi.length > 0) {
        await supabase.from('lieferschein_positionen').insert(
          posForLi.map((p: any) => ({
            lieferschein_id: deliveryNote.id,
            position: p.position,
            beschreibung: p.beschreibung || '',
            menge: p.menge,
            einheit: p.einheit || 'Stk'
          }))
        )
      }

      try {
        const editUrl = `${window.location.origin}/lieferscheine/${deliveryNote.id}`
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/5e4e9681-a79e-42be-a1d0-309bfdc36909', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'lieferschein_erstellt',
            lieferscheinId: deliveryNote.id,
            lieferscheinNummer: lieferscheinnummer,
            editUrl,
            angebot: {
              angebotId: offer.id,
              angebotNummer: offer.angebotsnummer,
              ticketNumber: offer.ticket_nummer,
              ticketId: offer.zoho_ticket_id,
              geschaeftsfallNummer: offer.geschaeftsfallNummer,
              skizzenLink: offer.skizzen_link
            },
            kunde: { name: offer.kunde_name, strasse: offer.kunde_strasse, plz: offer.kunde_plz, ort: offer.kunde_ort },
            objekt: { bezeichnung: offer.objekt_bezeichnung || offer.objekt_adresse },
            erstelltDurch: offer.erstellt_von,
            positionen: posForLi.map((p: any, i: number) => ({
              pos: i + 1,
              produktName: p.beschreibung?.split('\n')[0] || '',
              beschreibung: p.beschreibung,
              menge: p.menge,
              einheit: p.einheit
            })),
            timestamp: new Date().toISOString()
          })
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
      const year = new Date().getFullYear()
      const rePrefix = `RE-${year}-`
      const { data: lastRe } = await supabase.from('rechnungen').select('rechnungsnummer')
        .like('rechnungsnummer', `${rePrefix}%`)
        .order('rechnungsnummer', { ascending: false })
        .limit(1).maybeSingle()
      const rechnungsnummer = lastRe?.rechnungsnummer
        ? `${rePrefix}${String(parseInt(lastRe.rechnungsnummer.replace(rePrefix, ''), 10) + 1).padStart(5, '0')}`
        : `${rePrefix}00001`

      const { data: invoice, error } = await supabase.from('rechnungen').insert({
        rechnungsnummer,
        rechnungstyp: 'normal',
        angebot_id: offer.id || offerId,
        referenz_angebot_id: offer.id || offerId,
        referenz_angebot_nummer: offer.angebotsnummer || null,
        kunde_name: offer.kunde_name,
        kunde_strasse: offer.kunde_strasse,
        kunde_plz: offer.kunde_plz,
        kunde_ort: offer.kunde_ort,
        rechnung_an_hi: offer.rechnungAnHI || false,
        hausinhabung: offer.hausinhabung || null,
        objekt_adresse: offer.objekt_bezeichnung || offer.objekt_adresse,
        rechnungsdatum: format(new Date(), 'yyyy-MM-dd'),
        faellig_bis: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        zahlungskondition: '30 Tage netto',
        zahlungsziel_tage: 30,
        leistungszeitraum_von: null,
        leistungszeitraum_bis: null,
        ticket_nummer: offer.ticket_nummer,
        status: 'entwurf',
        netto_gesamt: totals.netto_gesamt,
        mwst_gesamt: totals.mwst_gesamt,
        brutto_gesamt: totals.brutto_gesamt,
      }).select().single()
      if (error) throw error

      const { data: dbPositions } = await supabase.from('angebot_positionen')
        .select('*').eq('angebot_id', offerId).order('position')
      const posForRe = (dbPositions || []).filter((p: any) => p.beschreibung?.trim() || p.menge)
      if (posForRe.length > 0) {
        await supabase.from('rechnung_positionen').insert(
          posForRe.map((p: any) => ({
            rechnung_id: invoice.id,
            position: p.position,
            beschreibung: p.beschreibung || '',
            menge: parseFloat(p.menge) || 0,
            einheit: p.einheit || 'Stk',
            einzelpreis: parseFloat(p.einzelpreis) || 0,
            rabatt_prozent: parseFloat(p.rabatt_prozent) || 0,
            mwst_satz: parseFloat(p.mwst_satz) || 20,
            gesamtpreis: parseFloat(p.gesamtpreis) || 0,
          }))
        )
      }

      try {
        const editUrl = `${window.location.origin}/rechnungen/${invoice.id}`
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/47c3bc5b-17e6-4c07-bd72-71a546d023d5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rechnungsId: invoice.id,
            rechnungsNummer: invoice.rechnungsnummer,
            rechnungstyp: 'normal',
            editUrl,
            angebot: {
              angebotId: offer.id,
              angebotNummer: offer.angebotsnummer,
              ticketNumber: offer.ticket_nummer,
              ticketId: offer.zoho_ticket_id,
              geschaeftsfallNummer: offer.geschaeftsfallNummer
            },
            rechnung: {
              datum: invoice.rechnungsdatum,
              faelligAm: invoice.faellig_bis,
              zahlungskondition: '30 Tage netto',
              zahlungszielTage: 30
            },
            kunde: { name: offer.kunde_name, strasse: offer.kunde_strasse, plz: offer.kunde_plz, ort: offer.kunde_ort },
            objekt: { bezeichnung: offer.objekt_bezeichnung || offer.objekt_adresse },
            positionen: (dbPositions || []).map((p: any, i: number) => ({
              pos: i + 1,
              produktName: p.beschreibung?.split('\n')[0] || '',
              menge: p.menge,
              einheit: p.einheit,
              einzelpreisNetto: p.einzelpreis,
              ustSatz: p.mwst_satz,
              gesamtNetto: p.gesamtpreis
            })),
            summen: { netto: totals.netto_gesamt, ust: totals.mwst_gesamt, brutto: totals.brutto_gesamt },
            timestamp: new Date().toISOString()
          })
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
      await supabase.from('angebote').update({ status: 'versendet' }).eq('id', offerId)
      setOffer({ ...offer, status: 'versendet' })
      try {
        const editUrl = `${window.location.origin}/angebote/${offerId}`
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId, angebotNummer: offer.angebotsnummer, editUrl, status: 'versendet', timestamp: new Date().toISOString() })
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
              <h1 className="text-3xl font-bold text-slate-900">{isNew ? 'Neues Angebot' : offer.angebotsnummer || 'Angebot'}</h1>
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
                {!isNew && (
                  <a href={`/api/pdf/angebot/${offerId}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="gap-2 w-full sm:w-auto">
                      <Download className="h-4 w-4" />
                      PDF herunterladen
                    </Button>
                  </a>
                )}
              </div>
              {!isNew && (
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button
                    variant="outline"
                    onClick={() => setParksperreModalOpen(true)}
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
                    onClick={() => setEmailModalOpen(true)}
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
                {offer.zoho_ticket_id && (
                  <a href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${offer.zoho_ticket_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700" title="In Zoho öffnen">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Name (Hausverwaltung / Kunde)</Label>
                  <Input value={offer.kunde_name || ''} onChange={(e) => setOffer({ ...offer, kunde_name: e.target.value })} placeholder="z.B. PAUL Vienna Office GmbH" className="mt-1" />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input value={offer.kunde_strasse || ''} onChange={(e) => setOffer({ ...offer, kunde_strasse: e.target.value })} placeholder="Straße und Hausnummer" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={offer.kunde_plz || ''} onChange={(e) => setOffer({ ...offer, kunde_plz: e.target.value })} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={offer.kunde_ort || ''} onChange={(e) => setOffer({ ...offer, kunde_ort: e.target.value })} placeholder="Ort" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={offer.kunde_uid || ''} onChange={(e) => setOffer({ ...offer, kunde_uid: e.target.value })} placeholder="z.B. ATU12345678" className="mt-1" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input value={offer.objekt_bezeichnung || ''} onChange={(e) => setOffer({ ...offer, objekt_bezeichnung: e.target.value })} placeholder="z.B. Hauptstraße 50, 2020 Magersdorf" className="mt-1" />
                </div>
                <div>
                  <Label>Objektadresse (Straße und Nummer)</Label>
                  <Input value={offer.objekt_adresse || ''} onChange={(e) => setOffer({ ...offer, objekt_adresse: e.target.value })} placeholder="z.B. Rauscherstraße 251" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Objekt PLZ</Label>
                    <Input value={offer.objekt_plz || ''} onChange={(e) => setOffer({ ...offer, objekt_plz: e.target.value })} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Objekt Ort</Label>
                    <Input value={offer.objekt_ort || ''} onChange={(e) => setOffer({ ...offer, objekt_ort: e.target.value })} placeholder="Ort" className="mt-1" />
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
                  <Input type="date" value={offer.angebotsdatum || ''} onChange={(e) => setOffer({ ...offer, angebotsdatum: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Gültig bis</Label>
                  <Input type="date" value={offer.gueltig_bis || ''} onChange={(e) => setOffer({ ...offer, gueltig_bis: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Angebot erstellt von</Label>
                  <Input value={offer.erstellt_von || ''} onChange={(e) => setOffer({ ...offer, erstellt_von: e.target.value })} placeholder="z.B. Reinhard Lassel" className="mt-1" />
                </div>
                <div className={offer.vermittler_id ? 'p-3 bg-orange-50 border-2 border-orange-300 rounded-lg' : ''}>
                  <Label>Vermittler</Label>
                  <Select value={offer.vermittler_id || ''} onValueChange={(value) => setOffer({ ...offer, vermittler_id: value || null })}>
                    <SelectTrigger className={offer.vermittler_id ? 'mt-1 border-orange-300 bg-white' : 'mt-1'}><SelectValue placeholder="Vermittler auswählen (optional)..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Kein Vermittler</SelectItem>
                      {(vermittlerList as any[]).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} ({v.provisionssatz || 10}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {offer.vermittler_id && (vermittlerList as any[]).find((v: any) => v.id === offer.vermittler_id) && (
                    <p className="text-xs text-orange-700 font-medium mt-2">
                      Vermittler-Provision: {(vermittlerList as any[]).find((v: any) => v.id === offer.vermittler_id)?.provisionssatz || 10}% wird an Vermittler gezahlt
                    </p>
                  )}
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mt-1">
                    <Select
                      value={offer.status || 'entwurf'}
                      onValueChange={async (v) => {
                        setOffer({ ...offer, status: v })
                        if (v === 'angenommen' && offerId) {
                          try {
                            await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/2c51d71e-b55d-493d-aafb-1443d1d100cc', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                  angebotId: offerId,
                  angebotNummer: offer.angebotsnummer,
                  status: 'angenommen',
                  ticketId: offer.zoho_ticket_id,
                  ticketNumber: offer.ticket_nummer,
                  geschaeftsfallNummer: offer.geschaeftsfallNummer,
                  rechnungsempfaengerName: offer.kunde_name,
                  objektBezeichnung: offer.objekt_bezeichnung || offer.objekt_adresse,
                  summeBrutto: offer.brutto_gesamt,
                  datum: offer.angebotsdatum,
                  timestamp: new Date().toISOString()
                })
                            })
                          } catch (e) { console.error('Webhook Fehler:', e) }
                        }
                      }}
                    >
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entwurf">Entwurf</SelectItem>
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
                  <Input value={offer.ticket_nummer || ''} onChange={(e) => setOffer({ ...offer, ticket_nummer: e.target.value })} placeholder="Ticket-Nummer" className="mt-1" />
                </div>
                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input value={offer.geschaeftsfallNummer || ''} onChange={(e) => setOffer({ ...offer, geschaeftsfallNummer: e.target.value })} placeholder="Geschäftsfallnummer (optional)" className="mt-1" />
                </div>
                <div>
                  <Label>Skizzen Link</Label>
                  <Input value={offer.skizzen_link || ''} onChange={(e) => setOffer({ ...offer, skizzen_link: e.target.value })} placeholder="Zoho Workdrive Link" className="mt-1" />
                  {offer.skizzen_link && (
                    <a href={offer.skizzen_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block">Link öffnen</a>
                  )}
                </div>
              </div>
            </Card>

            {!isNew && ((linkedInvoices as any[]).length > 0 || (linkedDeliveryNotes as any[]).length > 0) && (() => {
              const activeInvoices = (linkedInvoices as any[]).filter(inv => inv.rechnungstyp !== 'storno' && inv.status !== 'storniert')
              const bereitsFakturiert = activeInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.brutto_gesamt) || 0), 0)
              const angebotsbrutto = offer.brutto_gesamt || 0
              const offenerBetrag = angebotsbrutto - bereitsFakturiert
              return (
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Verknüpfte Dokumente</h2>
                  <div className="space-y-4">
                    {(linkedInvoices as any[]).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rechnungen</p>
                        <div className="space-y-1">
                          {(linkedInvoices as any[]).map((inv: any) => (
                            <Link key={inv.id} href={`/rechnungen/${inv.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group">
                              <span className="text-sm font-medium text-blue-600 group-hover:underline">{inv.rechnungsnummer}</span>
                              <div className="flex items-center gap-2">
                                {inv.brutto_gesamt ? <span className="text-xs text-slate-500">{new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(inv.brutto_gesamt)}</span> : null}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'bezahlt' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'offen' ? 'bg-blue-100 text-blue-700' : inv.status === 'storniert' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{inv.status}</span>
                              </div>
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
                              <span className="text-sm font-medium text-blue-600 group-hover:underline">{dn.lieferscheinnummer}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dn.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{dn.status}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {bereitsFakturiert > 0 && (
                      <div className="border-t pt-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Bereits fakturiert (brutto)</span>
                          <span className="font-medium">{new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(bereitsFakturiert)}</span>
                        </div>
                        {angebotsbrutto > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Offener Betrag</span>
                            <span className={`font-semibold ${offenerBetrag <= 0 ? 'text-emerald-600' : 'text-[#E85A1B]'}`}>
                              {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(offenerBetrag)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )
            })()}
          </div>
        </div>

        {/* Positionen */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
          <OfferPositionsTable positions={positions} onChange={setPositions} objektAdresse={offer.objekt_adresse || offer.objekt_bezeichnung || ''} />
        </Card>

        {/* Anmerkungen + Steueroptionen + Zusammenfassung */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Anmerkungen zum Angebot</h2>
            <Textarea
              value={offer.notizen || ''}
              onChange={(e) => setOffer({ ...offer, notizen: e.target.value })}
              placeholder="Optionale Anmerkungen, die im Angebot angezeigt werden..."
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-2">Zeilenumbrüche werden in der PDF übernommen.</p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Steueroptionen</h2>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reverseCharge"
                checked={offer.reverse_charge || false}
                onCheckedChange={(checked) => setOffer({ ...offer, reverse_charge: checked })}
              />
              <label htmlFor="reverseCharge" className="text-sm font-medium leading-none cursor-pointer">
                Ohne 20% UST (Reverse Charge / Ausnahme)
              </label>
            </div>
          </Card>

          <OfferSummary positions={positions} reverseCharge={offer.reverse_charge} />
        </div>

        {/* Fußzeile – volle Breite */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">Fußzeile</h2>
            </div>
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setVorlagenOpen(!vorlagenOpen)}>
                Weitere Vorlagen <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
              {vorlagenOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                  {(vorlagenList as any[]).map((v: any) => (
                    <button
                      key={v.id}
                      onClick={() => { setOffer({ ...offer, fusszeile: v.inhalt || v.text || '' }); setVorlagenOpen(false) }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <div className="font-medium text-sm">{v.name}</div>
                      <div className="text-xs text-slate-500 truncate">{(v.inhalt || v.text || '').substring(0, 55)}</div>
                    </button>
                  ))}
                  <button
                    onClick={() => { router.push('/einstellungen/textvorlagen'); setVorlagenOpen(false) }}
                    className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" /> Neue Vorlage hinzufügen
                  </button>
                </div>
              )}
            </div>
          </div>
          <Textarea
            value={offer.fusszeile || ''}
            onChange={(e) => setOffer({ ...offer, fusszeile: e.target.value })}
            placeholder="Leer lassen für Standard-Fußtext aus Einstellungen..."
            rows={4}
          />
          <p className="text-xs text-slate-400 mt-1">Leer = Standard-Fußtext aus Einstellungen wird verwendet</p>
        </Card>

        {/* PDF Preview */}
        {offerId && (
          <div className="rounded-xl border border-slate-200 bg-white shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Angebots-Vorschau</h2>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-inner p-8" style={{ aspectRatio: '1 / 1.414' }}>
              <iframe src={`/api/pdf/angebot/${offerId}`} className="w-full h-full" title="Angebots-Vorschau" />
            </div>
          </div>
        )}
      </div>

      {offerId && (
        <>
          <EmailVorschauModal
            open={emailModalOpen}
            onClose={() => setEmailModalOpen(false)}
            offerId={offerId}
            angebotsnummer={offer.angebotsnummer || ''}
            kundeName={offer.kunde_name || ''}
            objektAdresse={offer.objekt_adresse || offer.objekt_bezeichnung || ''}
            bruttoGesamt={totals.brutto_gesamt}
            erstelltVon={offer.erstellt_von || ''}
            emailAn={offer.emailAngebot || offer.kunde_email || ''}
            onSent={() => {
              setOffer({ ...offer, status: 'versendet' })
              queryClient.invalidateQueries({ queryKey: ['offers'] })
            }}
          />
          <ParksperreModal
            open={parksperreModalOpen}
            onClose={() => setParksperreModalOpen(false)}
            angebotsnummer={offer.angebotsnummer || ''}
            objektAdresse={offer.objekt_adresse || offer.objekt_bezeichnung || ''}
          />
        </>
      )}
    </div>
  )
}
