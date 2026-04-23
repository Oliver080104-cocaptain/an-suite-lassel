'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Save, Loader2, Send, Truck, Receipt, Car, FileText, Download, ChevronDown, Plus, Check, X, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import OfferPositionsTable from '@/components/offers/OfferPositionsTable'
import OfferSummary from '@/components/offers/OfferSummary'
import StatusBadge from '@/components/shared/StatusBadge'
import EmailVorschauModal from '@/components/EmailVorschauModal'
import ParksperreModal from '@/components/ParksperreModal'
import CreateInvoiceDialog, { type CreateInvoiceOptions } from '@/components/CreateInvoiceDialog'
import EditableDocNumber from '@/components/shared/EditableDocNumber'
import { generateRechnungsNummer, getTypInfo, type Rechnungstyp } from '@/lib/rechnung-typ'

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
    ansprechpartner: '',
    geschaeftsfallNummer: '',
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
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [previewVersion, setPreviewVersion] = useState(0)
  const [creatingDeliveryNote, setCreatingDeliveryNote] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [uploadingToZoho, setUploadingToZoho] = useState(false)
  const autoSaveLock = useRef(false)
  // Dirty-Flag: wird gesetzt wenn der User tippt während ein Save läuft.
  // Nach dem Save wird dann automatisch nochmal gespeichert, damit keine
  // Eingaben verloren gehen (Bugfix 2026-04-23 v2 — Race im autoSaveLock).
  const pendingChangesDuringSave = useRef(false)
  const positionsInitialized = useRef(false)
  const offerInitialized = useRef(false)
  const statusResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      const { data, error } = await supabase.from('vermittler').select('*').eq('aktiv', true).order('name')
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
        // Mappen DB-Spalte (snake_case) → State-Feld (camelCase)
        geschaeftsfallNummer: existingOffer.geschaeftsfallnummer || '',
        ansprechpartner: existingOffer.ansprechpartner || '',
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

  // Debounced autosave: 1 second after last change, with visible status badge
  const debouncedAutoSave = useDebouncedCallback(() => {
    handleAutoSave()
  }, 1000)

  useEffect(() => {
    if (isNew || !offerId || !offerInitialized.current) return
    debouncedAutoSave()
  }, [offer, positions, isNew, offerId, debouncedAutoSave])

  // Flush pending debounce on tab-hide and on unmount — kein eigener Save-Call,
  // sonst überschreibt ein stale Closure die frischen Eingaben (siehe Bugfix 2026-04-23).
  useEffect(() => {
    if (isNew || !offerId) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') debouncedAutoSave.flush()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      debouncedAutoSave.flush()
    }
  }, [isNew, offerId, debouncedAutoSave])

  useEffect(() => {
    return () => {
      if (statusResetTimer.current) clearTimeout(statusResetTimer.current)
    }
  }, [])

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

  const buildOfferData = (offerState: any) => {
    const data: Record<string, unknown> = {
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
      netto_gesamt: offerState.netto_gesamt || 0,
      mwst_gesamt: offerState.mwst_gesamt || 0,
      brutto_gesamt: offerState.brutto_gesamt || 0,
      geschaeftsfallnummer: offerState.geschaeftsfallNummer || null,
      ansprechpartner: offerState.ansprechpartner || null,
    }
    // vermittler_id nur senden wenn gesetzt — vermeidet PGRST204 wenn Spalte im
    // Schema-Cache fehlt und User keinen Vermittler ausgewählt hat.
    if (offerState.vermittler_id) {
      data.vermittler_id = offerState.vermittler_id
    }
    return data
  }

  const handleAutoSave = async () => {
    if (isNew || !offerId) return
    // Race-Schutz: wenn gerade ein Save läuft, merken wir uns dass noch
    // etwas gespeichert werden muss. Im finally-Block wird dann der nächste
    // Save gestartet — sonst gehen Eingaben die während des Saves getippt
    // wurden verloren.
    if (autoSaveLock.current) {
      pendingChangesDuringSave.current = true
      return
    }
    autoSaveLock.current = true
    pendingChangesDuringSave.current = false
    setSaveStatus('saving')
    try {
      const { error: offerErr } = await supabase
        .from('angebote')
        .update(buildOfferData({ ...offer, ...totals }))
        .eq('id', offerId)
      if (offerErr) throw offerErr
      const posToSave = positions.filter((p: any) => p.produktName?.trim() || p.beschreibung?.trim())
      await savePositions(offerId, posToSave)
      queryClient.invalidateQueries({ queryKey: ['offerPositions', offerId] })
      setPreviewVersion((v) => v + 1)
      setSaveStatus('saved')
    } catch (error) {
      console.error('Auto-save error:', error)
      setSaveStatus('error')
    } finally {
      autoSaveLock.current = false
      if (statusResetTimer.current) clearTimeout(statusResetTimer.current)
      statusResetTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
      // Während des Saves wurde getippt → nochmal speichern über die Debounce.
      // (Debounce ruft die LATEST handleAutoSave auf, die den frischen offer-State
      // aus dem zuletzt gerenderten Closure liest — direkte Rekursion würde
      // dagegen den stale Closure dieser Instanz nutzen.)
      if (pendingChangesDuringSave.current) {
        pendingChangesDuringSave.current = false
        debouncedAutoSave()
      }
    }
  }

  // Delete-then-insert: DB-Zustand wird in einem Rutsch durch local state ersetzt.
  // Vermeidet die Duplikat-Race wo Inserts über N Autosaves nicht mit local IDs synced wurden.
  const savePositions = async (targetOfferId: string, currentPositions: any[]) => {
    const buildPosData = (pos: any, index: number) => ({
      angebot_id: targetOfferId,
      position: index + 1,
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

    const { error: delErr } = await supabase
      .from('angebot_positionen')
      .delete()
      .eq('angebot_id', targetOfferId)
    if (delErr) throw delErr

    if (currentPositions.length > 0) {
      const { error: insErr } = await supabase
        .from('angebot_positionen')
        .insert(currentPositions.map(buildPosData))
      if (insErr) throw insErr
    }
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
      await savePositions(savedOffer.id, posToSave)
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
      const posToSave = positions.filter((p: any) => p.produktName?.trim() || p.beschreibung?.trim())
      await savePositions(savedOffer.id, posToSave)

      // PDF Link wird jetzt explizit geschrieben (nicht mehr beim PDF-Render)
      const pdfLink = `${window.location.origin}/api/pdf/angebot/${savedOffer.id}`
      await supabase.from('angebote').update({ pdf_url: pdfLink }).eq('id', savedOffer.id)
      setOffer((prev: any) => ({ ...prev, pdf_url: pdfLink }))

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
        erstellt_von: offer.erstellt_von || null,
        ansprechpartner: offer.ansprechpartner || null,
        geschaeftsfallnummer: offer.geschaeftsfallNummer || null,
        status: 'entwurf'
      }).select().single()
      if (error) throw error

      const { data: dbPositions, error: posErr } = await supabase.from('angebot_positionen')
        .select('*').eq('angebot_id', offerId).order('position')
      if (posErr) console.error('Fehler beim Laden Angebots-Positionen:', posErr)
      const posForLi = dbPositions || []
      if (posForLi.length > 0) {
        const { error: insErr } = await supabase.from('lieferschein_positionen').insert(
          posForLi.map((p: any, i: number) => ({
            lieferschein_id: deliveryNote.id,
            position: p.position ?? i + 1,
            beschreibung: (p.beschreibung && String(p.beschreibung).trim()) || '(ohne Bezeichnung)',
            menge: parseFloat(p.menge) || 0,
            einheit: p.einheit || 'Stk'
          }))
        )
        if (insErr) { console.error('Lieferschein-Positionen Insert:', insErr); throw insErr }
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

  const handleCreateInvoiceClick = () => {
    if (!offerId) { toast.error('Angebot muss zuerst gespeichert werden'); return }
    setCreateInvoiceOpen(true)
  }

  const handleCreateInvoice = async (opts: CreateInvoiceOptions) => {
    if (!offerId) { toast.error('Angebot muss zuerst gespeichert werden'); return }
    setCreatingInvoice(true)
    toast.loading('Rechnung wird erstellt...')
    try {
      // Bereits fakturiert (netto) — für Schlussrechnung relevant
      const activeInvoices = (linkedInvoices as any[]).filter(
        (inv: any) => inv.rechnungstyp !== 'storno' && inv.status !== 'storniert'
      )
      const bereitsNetto = activeInvoices.reduce(
        (s: number, inv: any) => s + (Number(inv.netto_gesamt) || 0),
        0
      )

      const rechnungsnummer = await generateRechnungsNummer(opts.rechnungstyp as Rechnungstyp)

      // Beträge je nach Typ
      const isTeilOrAnz = opts.rechnungstyp === 'anzahlung' || opts.rechnungstyp === 'teilrechnung'
      const teilNetto = isTeilOrAnz ? (opts.teilbetragNetto ?? 0) : null
      const teilBrutto = teilNetto !== null ? teilNetto * 1.2 : null

      // Positionen vorab laden — wegen optionaler Auswahl im Dialog,
      // damit die Rechnungs-Summen zur tatsächlichen Position-Auswahl passen.
      const { data: dbPositionsPre, error: posPreLoadErr } = await supabase
        .from('angebot_positionen')
        .select('*').eq('angebot_id', offerId).order('position')
      if (posPreLoadErr) console.error('Angebot-Positionen Pre-Load:', posPreLoadErr)

      const filteredDbPositions =
        opts.selectedPositionIds && opts.selectedPositionIds.length >= 0
          ? (dbPositionsPre || []).filter((p: any) =>
              opts.selectedPositionIds!.includes(String(p.id))
            )
          : (dbPositionsPre || [])

      const selectedNetto = filteredDbPositions.reduce(
        (s: number, p: any) => s + (Number(p.gesamtpreis) || 0),
        0
      )
      const selectedMwst = selectedNetto * 0.2
      const selectedBrutto = selectedNetto + selectedMwst

      const insertNetto = isTeilOrAnz
        ? (teilNetto ?? 0)
        : (opts.rechnungstyp === 'gutschrift' ? 0 : selectedNetto)
      const insertMwst = isTeilOrAnz
        ? ((teilNetto ?? 0) * 0.2)
        : (opts.rechnungstyp === 'gutschrift' ? 0 : selectedMwst)
      const insertBrutto = isTeilOrAnz
        ? (teilBrutto ?? 0)
        : (opts.rechnungstyp === 'gutschrift' ? 0 : selectedBrutto)

      const { data: invoice, error } = await supabase.from('rechnungen').insert({
        rechnungsnummer,
        rechnungstyp: opts.rechnungstyp,
        ist_schlussrechnung: opts.istSchlussrechnung,
        bereits_fakturiert_netto: opts.istSchlussrechnung ? bereitsNetto : 0,
        teilbetrag_netto: teilNetto,
        teilbetrag_brutto: teilBrutto,
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
        zahlungskondition: opts.zahlungskondition || '30 Tage netto',
        zahlungsziel_tage: 30,
        leistungszeitraum_von: null,
        leistungszeitraum_bis: null,
        ticket_nummer: offer.ticket_nummer,
        erstellt_von: offer.erstellt_von || null,
        ansprechpartner: offer.ansprechpartner || null,
        geschaeftsfallnummer: offer.geschaeftsfallNummer || null,
        status: 'entwurf',
        zahlungsstatus: 'offen',
        netto_gesamt: insertNetto,
        mwst_gesamt: insertMwst,
        brutto_gesamt: insertBrutto,
      }).select().single()
      if (error) throw error

      // Positionen-Erzeugung: gefilterte Originale aus dem Angebot übernehmen.
      // Bei Anzahlung/Teilrechnung wird zusätzlich eine Abschlags-Zeile vorgelagert.
      const originalPositions = filteredDbPositions.map((p: any, i: number) => ({
        rechnung_id: invoice.id,
        position: p.position ?? i + 1,
        produkt_id: p.produkt_id || null,
        beschreibung: (p.beschreibung && String(p.beschreibung).trim()) || '(ohne Bezeichnung)',
        menge: parseFloat(p.menge) || 0,
        einheit: p.einheit || 'Stk',
        einzelpreis: parseFloat(p.einzelpreis) || 0,
        rabatt_prozent: parseFloat(p.rabatt_prozent) || 0,
        mwst_satz: parseFloat(p.mwst_satz) || 20,
        gesamtpreis: parseFloat(p.gesamtpreis) || 0,
      }))

      let posToInsert: any[] = []

      if (isTeilOrAnz) {
        // Abschlags-Zeile als Position 1, Original-Positionen darunter als Referenz
        posToInsert.push({
          rechnung_id: invoice.id,
          position: 1,
          beschreibung: opts.beschreibung || getTypInfo(opts.rechnungstyp).label,
          menge: 1,
          einheit: 'pausch.',
          einzelpreis: teilNetto ?? 0,
          rabatt_prozent: 0,
          mwst_satz: 20,
          gesamtpreis: teilNetto ?? 0,
        })
        posToInsert.push(
          ...originalPositions.map((p, i) => ({ ...p, position: i + 2 }))
        )
      } else {
        // normal + gutschrift: alle Original-Positionen 1:1 übernehmen
        posToInsert = originalPositions
      }

      if (posToInsert.length > 0) {
        const { error: posInsErr } = await supabase.from('rechnung_positionen').insert(posToInsert)
        if (posInsErr) { console.error('Rechnung-Positionen Insert:', posInsErr); throw posInsErr }
      }

      try {
        const editUrl = `${window.location.origin}/rechnungen/${invoice.id}`
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/47c3bc5b-17e6-4c07-bd72-71a546d023d5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rechnungsId: invoice.id,
            rechnungsNummer: invoice.rechnungsnummer,
            rechnungstyp: opts.rechnungstyp,
            istSchlussrechnung: opts.istSchlussrechnung,
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
            positionen: filteredDbPositions.map((p: any, i: number) => ({
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
      setCreateInvoiceOpen(false)
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
      setOffer((prev: any) => ({ ...prev, status: 'versendet' }))
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
              <div className="flex items-center gap-3">
                {isNew ? (
                  <h1 className="text-3xl font-bold text-slate-900">Neues Angebot</h1>
                ) : (
                  <EditableDocNumber
                    value={offer.angebotsnummer || ''}
                    table="angebote"
                    column="angebotsnummer"
                    id={offerId || ''}
                    expectedPrefix="AN-"
                    placeholder="Angebot"
                    onSaved={(next) => {
                      setOffer((prev: any) => ({ ...prev, angebotsnummer: next }))
                      setPreviewVersion((v) => v + 1)
                    }}
                  />
                )}
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Speichern...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <Check className="w-3 h-3" />
                    Gespeichert
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-red-500">
                    <X className="w-3 h-3" />
                    Fehler beim Speichern
                  </span>
                )}
              </div>
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
                  <Button
                    variant="outline"
                    className="gap-2 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!offer.pdf_url}
                    title={offer.pdf_url ? 'PDF herunterladen' : "Zuerst 'Speichern & in Zoho ablegen' klicken"}
                    onClick={() => {
                      if (offer.pdf_url) window.open(`/api/pdf/angebot/${offerId}?download=1`, '_blank')
                    }}
                  >
                    <Download className="h-4 w-4" />
                    📄 PDF herunterladen
                  </Button>
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
                    onClick={handleCreateInvoiceClick}
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
                  <Input value={offer.kunde_name || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, kunde_name: e.target.value }))} placeholder="z.B. PAUL Vienna Office GmbH" className="mt-1" autoComplete="off" />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input value={offer.kunde_strasse || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, kunde_strasse: e.target.value }))} placeholder="Straße und Hausnummer" className="mt-1" autoComplete="off" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={offer.kunde_plz || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, kunde_plz: e.target.value }))} placeholder="PLZ" className="mt-1" autoComplete="off" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={offer.kunde_ort || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, kunde_ort: e.target.value }))} placeholder="Ort" className="mt-1" autoComplete="off" />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={offer.kunde_uid || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, kunde_uid: e.target.value }))} placeholder="z.B. ATU12345678" className="mt-1" autoComplete="off" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input value={offer.objekt_bezeichnung || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, objekt_bezeichnung: e.target.value }))} placeholder="z.B. Hauptstraße 50, 2020 Magersdorf" className="mt-1" autoComplete="off" />
                </div>
                <div>
                  <Label>Objektadresse (Straße und Nummer)</Label>
                  <Input value={offer.objekt_adresse || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, objekt_adresse: e.target.value }))} placeholder="z.B. Rauscherstraße 251" className="mt-1" autoComplete="off" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Objekt PLZ</Label>
                    <Input value={offer.objekt_plz || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, objekt_plz: e.target.value }))} placeholder="PLZ" className="mt-1" autoComplete="off" />
                  </div>
                  <div>
                    <Label>Objekt Ort</Label>
                    <Input value={offer.objekt_ort || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, objekt_ort: e.target.value }))} placeholder="Ort" className="mt-1" autoComplete="off" />
                  </div>
                </div>
                <div>
                  <Label>Hausinhabung (HI)</Label>
                  <Input value={offer.hausinhabung || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, hausinhabung: e.target.value }))} placeholder="Name des Eigentümers (optional)" className="mt-1" autoComplete="off" />
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
                  <Input type="date" value={offer.angebotsdatum || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, angebotsdatum: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Gültig bis</Label>
                  <Input type="date" value={offer.gueltig_bis || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, gueltig_bis: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Angebot erstellt von</Label>
                  <Input value={offer.erstellt_von || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, erstellt_von: e.target.value }))} placeholder="z.B. Reinhard Lassel" className="mt-1" />
                </div>
                {(() => {
                  const selectedVermittler = (vermittlerList as any[]).find((v: any) => v.id === offer.vermittler_id)
                  const selectedProvision = selectedVermittler?.provision_prozent ?? selectedVermittler?.provisionssatz ?? 10
                  return (
                    <div className={offer.vermittler_id ? 'p-3 bg-orange-50 border-2 border-orange-300 rounded-lg' : ''}>
                      <Label>Vermittler</Label>
                      <Select
                        key={`vermittler-select-${(vermittlerList as any[]).length}`}
                        value={offer.vermittler_id || 'none'}
                        onValueChange={(value) => setOffer((prev: any) => ({ ...prev, vermittler_id: value === 'none' ? null : value }))}
                      >
                        <SelectTrigger className={offer.vermittler_id ? 'mt-1 border-orange-300 bg-white' : 'mt-1'}>
                          <SelectValue placeholder="Vermittler auswählen (optional)...">
                            {selectedVermittler
                              ? `${selectedVermittler.name} (${selectedProvision}%)`
                              : (offer.vermittler_id ? 'Unbekannter Vermittler' : 'Kein Vermittler')}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kein Vermittler</SelectItem>
                          {(vermittlerList as any[]).map((v: any) => (
                            <SelectItem key={v.id} value={v.id}>{v.name} ({v.provision_prozent ?? v.provisionssatz ?? 10}%)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedVermittler && (
                        <p className="text-xs text-orange-700 font-medium mt-2">
                          <Link href={`/vermittler#${selectedVermittler.id}`} className="underline hover:text-orange-900">
                            {selectedVermittler.name}
                          </Link>
                          {' '}— Provision {selectedProvision}% wird an Vermittler gezahlt
                        </p>
                      )}
                    </div>
                  )
                })()}
                <div>
                  <Label>Status</Label>
                  <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mt-1">
                    <Select
                      value={offer.status || 'entwurf'}
                      onValueChange={async (v) => {
                        setOffer((prev: any) => ({ ...prev, status: v }))
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
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Referenzen & Links</h2>
              <div className="space-y-4">
                <div>
                  <Label>Ticket-Nr.</Label>
                  <Input value={offer.ticket_nummer || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, ticket_nummer: e.target.value }))} placeholder="Ticket-Nummer" className="mt-1" />
                </div>
                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input value={offer.geschaeftsfallNummer || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, geschaeftsfallNummer: e.target.value }))} placeholder="Geschäftsfallnummer (optional)" className="mt-1" />
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input value={offer.ansprechpartner || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, ansprechpartner: e.target.value }))} placeholder="z.B. Max Mustermann" className="mt-1" />
                </div>
                <div>
                  <Label>Skizzen Link</Label>
                  <Input value={offer.skizzen_link || ''} onChange={(e) => setOffer((prev: any) => ({ ...prev, skizzen_link: e.target.value }))} placeholder="Zoho Workdrive Link" className="mt-1" />
                  {offer.skizzen_link && (
                    <a href={offer.skizzen_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block">Link öffnen</a>
                  )}
                </div>
                <div>
                  <Label>PDF Link</Label>
                  <Input
                    value={offer.pdf_url || ''}
                    readOnly
                    placeholder="Wird nach 'Speichern & in Zoho ablegen' generiert"
                    className="mt-1 bg-slate-50"
                  />
                  {offer.pdf_url && (
                    <a href={offer.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block">PDF öffnen</a>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Verknüpfte Dokumente – volle Breite */}
        {!isNew && ((linkedInvoices as any[]).length > 0 || (linkedDeliveryNotes as any[]).length > 0) && (() => {
          const activeInvoices = (linkedInvoices as any[]).filter(inv => inv.rechnungstyp !== 'storno' && inv.status !== 'storniert')
          const bereitsFakturiert = activeInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.brutto_gesamt) || 0), 0)
          const angebotsbrutto = offer.brutto_gesamt || 0
          const offenerBetrag = angebotsbrutto - bereitsFakturiert
          return (
            <Card className="p-6 mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Verknüpfte Dokumente</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {(linkedInvoices as any[]).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Verknüpfte Rechnungen</p>
                    <div className="space-y-1">
                      {(linkedInvoices as any[]).map((inv: any) => {
                        const info = getTypInfo(inv.rechnungstyp)
                        return (
                          <Link key={inv.id} href={`/rechnungen/${inv.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${info.badgeBg} ${info.badgeText}`}>{info.prefix}</span>
                              <span className="text-sm font-medium text-blue-600 group-hover:underline truncate">{inv.rechnungsnummer}</span>
                              {inv.ist_schlussrechnung && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">SR</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {inv.brutto_gesamt ? <span className="text-xs text-slate-500">{new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(inv.brutto_gesamt)}</span> : null}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'bezahlt' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'offen' ? 'bg-blue-100 text-blue-700' : inv.status === 'storniert' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{inv.status}</span>
                            </div>
                          </Link>
                        )
                      })}
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
              </div>
              {bereitsFakturiert > 0 && (
                <div className="border-t mt-4 pt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Angebotsbetrag (brutto)</span>
                    <span className="font-medium">{new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(angebotsbrutto)}</span>
                  </div>
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
                  {angebotsbrutto > 0 && offenerBetrag <= 0 && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-medium">
                      ✅ Vollständig fakturiert
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })()}

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
              onChange={(e) => setOffer((prev: any) => ({ ...prev, notizen: e.target.value }))}
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
                onCheckedChange={(checked) => setOffer((prev: any) => ({ ...prev, reverse_charge: checked }))}
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
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 flex flex-col max-h-[400px]">
                  <div className="flex-1 overflow-y-auto">
                    {(vorlagenList as any[]).length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">
                        Keine Vorlagen vorhanden
                      </div>
                    ) : (vorlagenList as any[]).map((v: any) => (
                      <div
                        key={v.id}
                        className="group relative flex items-start gap-2 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <button
                          type="button"
                          onClick={() => { setOffer((prev: any) => ({ ...prev, fusszeile: v.inhalt || v.text || '' })); setVorlagenOpen(false) }}
                          className="flex-1 min-w-0 text-left px-4 py-3"
                        >
                          <div className="font-medium text-sm truncate">{v.name || v.titel}</div>
                          <div className="text-xs text-slate-500 truncate">{(v.inhalt || v.text || '').substring(0, 80)}</div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); router.push('/einstellungen/textvorlagen'); setVorlagenOpen(false) }}
                          title="Vorlage bearbeiten"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 mr-1 mt-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { router.push('/einstellungen/textvorlagen'); setVorlagenOpen(false) }}
                    className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-50 border-t border-slate-200 shrink-0"
                  >
                    <Plus className="h-4 w-4" /> Vorlagen verwalten
                  </button>
                </div>
              )}
            </div>
          </div>
          <Textarea
            value={offer.fusszeile || ''}
            onChange={(e) => setOffer((prev: any) => ({ ...prev, fusszeile: e.target.value }))}
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
            <div className="rounded-lg bg-slate-100 overflow-x-auto flex justify-center p-4">
              <iframe
                src={`/api/pdf/angebot/${offerId}?preview=1&v=${previewVersion}`}
                title="Angebots-Vorschau"
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
                href={`/api/pdf/angebot/${offerId}`}
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
              setOffer((prev: any) => ({ ...prev, status: 'versendet' }))
              queryClient.invalidateQueries({ queryKey: ['offers'] })
            }}
          />
          <ParksperreModal
            open={parksperreModalOpen}
            onClose={() => setParksperreModalOpen(false)}
            angebotsnummer={offer.angebotsnummer || ''}
            objektAdresse={offer.objekt_adresse || offer.objekt_bezeichnung || ''}
          />
          {(() => {
            const activeInvoices = (linkedInvoices as any[]).filter(
              (inv: any) => inv.rechnungstyp !== 'storno' && inv.status !== 'storniert'
            )
            const fakturiertBrutto = activeInvoices.reduce(
              (s: number, inv: any) => s + (Number(inv.brutto_gesamt) || 0),
              0
            )
            const fakturiertNetto = activeInvoices.reduce(
              (s: number, inv: any) => s + (Number(inv.netto_gesamt) || 0),
              0
            )
            return (
              <CreateInvoiceDialog
                open={createInvoiceOpen}
                onClose={() => setCreateInvoiceOpen(false)}
                onConfirm={handleCreateInvoice}
                angebotsbrutto={totals.brutto_gesamt}
                angebotsnetto={totals.netto_gesamt}
                bereitsFakturiertBrutto={fakturiertBrutto}
                bereitsFakturiertNetto={fakturiertNetto}
                loading={creatingInvoice}
                positionen={positions
                  .filter((p: any) => p.id && (p.beschreibung || p.produktName))
                  .map((p: any) => ({
                    id: String(p.id),
                    beschreibung: p.beschreibung || p.produktName || '',
                    menge: p.menge,
                    einheit: p.einheit,
                    einzelpreis: p.einzelpreis,
                    gesamtpreis: p.gesamtpreis,
                  }))}
              />
            )
          })()}
        </>
      )}
    </div>
  )
}
