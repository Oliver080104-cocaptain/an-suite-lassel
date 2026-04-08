'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { FileDown, Loader2, CheckCircle2, Ban, Send, Calendar as CalendarIcon, ArrowLeft, Download, FileText, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { format, addDays, parseISO, isValid } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Link from 'next/link'
import InvoicePositionsTable from '@/components/invoices/InvoicePositionsTable'
import OfferSummary from '@/components/offers/OfferSummary'
import { getTypInfo } from '@/lib/rechnung-typ'

interface InvoicePosition {
  id?: string
  pos: number
  produktId?: string
  produktName: string
  beschreibung: string
  menge: number | string
  einheit: string
  einzelpreisNetto: number | string
  rabattProzent: number | string
  ustSatz: number | string
  teilfakturaProzent: number | string
  bereitsFakturiert: number | string
  gesamtNetto: number | string
  gesamtBrutto: number | string
}

const defaultInvoice = {
  rechnungsNummer: '',
  rechnungstyp: 'normal',
  datum: format(new Date(), 'yyyy-MM-dd'),
  zahlungszielTage: 30,
  faelligAm: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
  skontoAktiv: false,
  skontoProzent: 3,
  skontoTage: 14,
  status: 'entwurf',
  kundeName: '',
  uidnummer: '',
  kundeStrasse: '',
  kundePlz: '',
  kundeOrt: '',
  kundeAnsprechpartner: '',
  erstelltDurch: '',
  ticketId: '',
  ticketNumber: '',
  objektBezeichnung: '',
  objektStrasse: '',
  objektPlz: '',
  objektOrt: '',
  hausinhabung: '',
  referenzAngebotNummer: '',
  referenzAngebotId: '',
  bemerkung: 'Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.',
  source: 'manual',
  rechnungAnHI: false,
  uidVonHI: '',
  hausverwaltungName: '',
  hausverwaltungStrasse: '',
  hausverwaltungPlz: '',
  hausverwaltungOrt: '',
  stornoVonRechnung: '',
  stornoGrund: '',
  pdfUrl: '',
  fusszeile: '',
  vermittlerId: '',
  leistungszeitraumVon: '',
  leistungszeitraumBis: '',
  arbeitstage: [] as string[],
  zahlungskondition: '30 Tage netto',
  geschaeftsfallnummer: '',
  summeBrutto: 0,
  bezahltBetrag: 0,
}

const defaultPosition: InvoicePosition = {
  pos: 1, produktName: '', beschreibung: '', menge: 1, einheit: 'Stk',
  einzelpreisNetto: 0, rabattProzent: 0, ustSatz: 20,
  teilfakturaProzent: 100, bereitsFakturiert: 0,
  gesamtNetto: 0, gesamtBrutto: 0
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const rawId = params?.id as string
  const isNew = rawId === 'neu'
  const invoiceId = isNew ? null : rawId

  const [invoice, setInvoice] = useState({ ...defaultInvoice })
  const [positions, setPositions] = useState<InvoicePosition[]>([{ ...defaultPosition }])
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [saving, setSaving] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [uploadingToZoho, setUploadingToZoho] = useState(false)
  const [vorlagenOpen, setVorlagenOpen] = useState(false)
  const [teilzahlungModalOpen, setTeilzahlungModalOpen] = useState(false)
  const [newTeilzahlung, setNewTeilzahlung] = useState({ betrag: '', datum: format(new Date(), 'yyyy-MM-dd'), zahlungsart: 'überweisung', notizen: '' })

  const invoiceInitialized = useRef(false)
  const positionsInitialized = useRef(false)
  const autoSaveLock = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load invoice
  const { data: existingInvoice, isLoading: loadingInvoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null
      const { data, error } = await supabase.from('rechnungen').select('*').eq('id', invoiceId).single()
      if (error) throw error
      return data
    },
    enabled: !!invoiceId,
  })

  // Load positions
  const { data: existingPositions = [] } = useQuery({
    queryKey: ['invoicePositions', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return []
      const { data, error } = await supabase.from('rechnung_positionen').select('*').eq('rechnung_id', invoiceId).order('position')
      if (error) throw error
      return data || []
    },
    enabled: !!invoiceId,
  })

  // Load mitarbeiter
  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data } = await supabase.from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  // Load vermittler
  const { data: vermittlerList = [] } = useQuery({
    queryKey: ['vermittler'],
    queryFn: async () => {
      const { data } = await supabase.from('vermittler').select('*').eq('status', 'aktiv').order('name')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  // Load company settings
  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).single()
      return data || {}
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: vorlagenList = [] } = useQuery({
    queryKey: ['textvorlagen'],
    queryFn: async () => {
      const { data } = await supabase.from('textvorlagen').select('*').order('name')
      return data || []
    }
  })

  const { data: teilzahlungen = [], refetch: refetchTeilzahlungen } = useQuery({
    queryKey: ['teilzahlungen', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return []
      const { data } = await supabase.from('teilzahlungen').select('*').eq('rechnung_id', invoiceId).order('datum')
      return data || []
    },
    enabled: !!invoiceId,
  })

  // Init invoice from loaded data
  useEffect(() => {
    if (existingInvoice && !invoiceInitialized.current) {
      setInvoice({
        ...defaultInvoice,
        rechnungsNummer: existingInvoice.rechnungsnummer || '',
        datum: existingInvoice.rechnungsdatum || defaultInvoice.datum,
        faelligAm: existingInvoice.faellig_bis || defaultInvoice.faelligAm,
        status: existingInvoice.status || 'entwurf',
        kundeName: existingInvoice.kunde_name || '',
        uidnummer: existingInvoice.kunde_uid || '',
        kundeStrasse: existingInvoice.kunde_strasse || '',
        kundePlz: existingInvoice.kunde_plz || '',
        kundeOrt: existingInvoice.kunde_ort || '',
        objektBezeichnung: existingInvoice.objekt_adresse || '',
        ticketNumber: existingInvoice.ticket_nummer || '',
        ticketId: existingInvoice.zoho_ticket_id || '',
        erstelltDurch: existingInvoice.erstellt_von || '',
        bemerkung: existingInvoice.notizen || defaultInvoice.bemerkung,
        fusszeile: existingInvoice.fusszeile || '',
        pdfUrl: existingInvoice.pdf_url || '',
        summeBrutto: existingInvoice.brutto_gesamt || 0,
        referenzAngebotId: existingInvoice.angebot_id || existingInvoice.referenz_angebot_id || '',
        referenzAngebotNummer: existingInvoice.referenz_angebot_nummer || '',
        vermittlerId: existingInvoice.vermittler_id || '',
        rechnungAnHI: existingInvoice.rechnung_an_hi || false,
        hausinhabung: existingInvoice.hausinhabung || '',
        hausverwaltungName: existingInvoice.hausverwaltung_name || '',
        hausverwaltungStrasse: existingInvoice.hausverwaltung_strasse || '',
        hausverwaltungPlz: existingInvoice.hausverwaltung_plz || '',
        hausverwaltungOrt: existingInvoice.hausverwaltung_ort || '',
        uidVonHI: existingInvoice.uid_von_hi || '',
        leistungszeitraumVon: existingInvoice.leistungszeitraum_von || '',
        leistungszeitraumBis: existingInvoice.leistungszeitraum_bis || '',
        zahlungskondition: existingInvoice.zahlungskondition || '30 Tage netto',
        zahlungszielTage: existingInvoice.zahlungsziel_tage || 30,
        geschaeftsfallnummer: existingInvoice.geschaeftsfallnummer || '',
        rechnungstyp: existingInvoice.rechnungstyp || 'normal',
        stornoGrund: existingInvoice.storno_grund || '',
        bezahltBetrag: existingInvoice.bezahlt_betrag || 0,
      })
      invoiceInitialized.current = true
    }
  }, [existingInvoice])

  // Init positions
  useEffect(() => {
    if (existingPositions.length > 0 && !positionsInitialized.current) {
      setPositions((existingPositions as any[]).map((p: any, i: number) => {
        const lines = (p.beschreibung || '').split('\n')
        return {
        id: p.id,
        pos: i + 1,
        produktName: lines[0] || '',
        beschreibung: lines.slice(1).join('\n').trim(),
        menge: p.menge || 1,
        einheit: p.einheit || 'Stk',
        einzelpreisNetto: p.einzelpreis || 0,
        rabattProzent: p.rabatt_prozent || 0,
        ustSatz: p.mwst_satz || 20,
        teilfakturaProzent: 100,
        bereitsFakturiert: 0,
        gesamtNetto: p.gesamtpreis || 0,
        gesamtBrutto: p.gesamtpreis || 0,
        }
      }))
      positionsInitialized.current = true
    }
  }, [existingPositions])

  // Auto-update fälligAm when datum or zahlungszielTage changes
  useEffect(() => {
    if (invoice.datum && invoice.zahlungszielTage) {
      try {
        const d = parseISO(invoice.datum)
        if (isValid(d)) {
          setInvoice(prev => ({ ...prev, faelligAm: format(addDays(d, Number(prev.zahlungszielTage)), 'yyyy-MM-dd') }))
        }
      } catch {}
    }
  }, [invoice.datum, invoice.zahlungszielTage])

  // Auto-save on visibility change
  useEffect(() => {
    if (isNew) return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && invoiceId && invoice.kundeName && !autoSaveLock.current) {
        autoSaveLock.current = true
        performAutoSave().finally(() => { autoSaveLock.current = false })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (invoiceId && invoice.kundeName && !autoSaveLock.current) {
        autoSaveLock.current = true
        performAutoSave().finally(() => { autoSaveLock.current = false })
      }
    }
  }, [invoice, positions, isNew, invoiceId])

  // Debounced autosave: 2 seconds after last change
  useEffect(() => {
    if (isNew || !invoiceId || !invoiceInitialized.current) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      if (!autoSaveLock.current) {
        autoSaveLock.current = true
        performAutoSave().finally(() => { autoSaveLock.current = false })
      }
    }, 2000)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [invoice, positions])

  const totals = useMemo(() => {
    const summeNetto = positions.reduce((sum, p) => sum + (parseFloat(p.gesamtNetto as string) || 0), 0)
    const summeRabatt = positions.reduce((sum, p) => {
      const menge = parseFloat(p.menge as string) || 0
      const einzelpreis = parseFloat(p.einzelpreisNetto as string) || 0
      const rabatt = parseFloat(p.rabattProzent as string) || 0
      return sum + (menge * einzelpreis * (rabatt / 100))
    }, 0)
    const summeUst = positions.reduce((sum, p) => {
      const gesamtNetto = parseFloat(p.gesamtNetto as string) || 0
      const ustSatz = parseFloat(p.ustSatz as string) || 20
      return sum + (gesamtNetto * (ustSatz / 100))
    }, 0)
    const summeBrutto = summeNetto + summeUst
    return { summeNetto, summeRabatt, summeUst, summeBrutto }
  }, [positions])

  const generateInvoiceNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('rechnungen').select('rechnungsnummer').ilike('rechnungsnummer', `RE-${year}%`)
    const nextNum = (data?.length || 0) + 1
    return `RE-${year}-${String(nextNum).padStart(5, '0')}`
  }

  const buildPosData = (p: InvoicePosition, rechnungId: string) => ({
    rechnung_id: rechnungId,
    position: p.pos,
    beschreibung: p.produktName || p.beschreibung || '-',
    menge: parseFloat(p.menge as string) || 1,
    einheit: p.einheit,
    einzelpreis: parseFloat(p.einzelpreisNetto as string) || 0,
    rabatt_prozent: parseFloat(p.rabattProzent as string) || 0,
    mwst_satz: parseFloat(p.ustSatz as string) || 20,
    gesamtpreis: parseFloat(p.gesamtNetto as string) || 0,
  })

  const savePositions = async (targetId: string, currentPositions: InvoicePosition[], existingPosData: any[]) => {
    const toDelete = existingPosData.filter(ep => !currentPositions.find(p => p.id === ep.id))
    const toUpdate = currentPositions.filter(p => p.id && existingPosData.find(ep => ep.id === p.id))
    const toCreate = currentPositions.filter(p => !p.id)

    await Promise.all([
      ...toDelete.map(p => supabase.from('rechnung_positionen').delete().eq('id', p.id)),
      ...toUpdate.map(p => supabase.from('rechnung_positionen').update(buildPosData(p, targetId)).eq('id', p.id!)),
    ])
    if (toCreate.length > 0) {
      await supabase.from('rechnung_positionen').insert(toCreate.map(p => ({ ...buildPosData(p, targetId), id: undefined })))
    }
  }

  const buildRechnungData = (inv: typeof defaultInvoice, t: typeof totals) => ({
    rechnungsnummer: inv.rechnungsNummer,
    rechnungstyp: inv.rechnungstyp || 'normal',
    status: inv.status,
    kunde_name: inv.kundeName,
    kunde_strasse: inv.kundeStrasse || null,
    kunde_plz: inv.kundePlz || null,
    kunde_ort: inv.kundeOrt || null,
    kunde_uid: inv.uidnummer || null,
    rechnung_an_hi: inv.rechnungAnHI || false,
    hausinhabung: inv.hausinhabung || null,
    hausverwaltung_name: inv.hausverwaltungName || null,
    hausverwaltung_strasse: inv.hausverwaltungStrasse || null,
    hausverwaltung_plz: inv.hausverwaltungPlz || null,
    hausverwaltung_ort: inv.hausverwaltungOrt || null,
    uid_von_hi: inv.uidVonHI || null,
    rechnungsdatum: inv.datum,
    faellig_bis: inv.faelligAm || null,
    zahlungskondition: inv.zahlungskondition || '30 Tage netto',
    zahlungsziel_tage: inv.zahlungszielTage || 30,
    leistungszeitraum_von: inv.leistungszeitraumVon || null,
    leistungszeitraum_bis: inv.leistungszeitraumBis || null,
    objekt_adresse: inv.objektBezeichnung || null,
    ticket_nummer: inv.ticketNumber || null,
    zoho_ticket_id: inv.ticketId || null,
    geschaeftsfallnummer: inv.geschaeftsfallnummer || null,
    erstellt_von: inv.erstelltDurch || null,
    fusszeile: inv.fusszeile || null,
    notizen: inv.bemerkung || null,
    pdf_url: inv.pdfUrl || null,
    angebot_id: inv.referenzAngebotId || null,
    referenz_angebot_id: inv.referenzAngebotId || null,
    referenz_angebot_nummer: inv.referenzAngebotNummer || null,
    vermittler_id: inv.vermittlerId || null,
    storno_grund: inv.stornoGrund || null,
    netto_gesamt: t.summeNetto || 0,
    mwst_gesamt: t.summeUst || 0,
    brutto_gesamt: t.summeBrutto || 0,
  })

  const performAutoSave = async () => {
    if (!invoiceId || !invoice.kundeName) return
    try {
      await supabase.from('rechnungen').update(buildRechnungData(invoice, totals)).eq('id', invoiceId)
      await savePositions(invoiceId, positions, existingPositions)
    } catch (err) {
      console.error('Auto-save error:', err)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let savedId = invoiceId
      const invCopy = { ...invoice }

      if (isNew) {
        invCopy.rechnungsNummer = await generateInvoiceNumber()
        setInvoice(invCopy)
        const dbData = buildRechnungData(invCopy, totals)
        const { data, error } = await supabase.from('rechnungen').insert([dbData]).select().single()
        if (error) throw error
        savedId = data.id
        router.replace(`/rechnungen/${savedId}`)
      } else {
        const { error } = await supabase.from('rechnungen').update(buildRechnungData(invCopy, totals)).eq('id', invoiceId!)
        if (error) throw error
      }

      await savePositions(savedId!, positions, isNew ? [] : existingPositions)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', savedId] })
      queryClient.invalidateQueries({ queryKey: ['invoicePositions', savedId] })
      toast.success(isNew ? 'Rechnung erstellt' : 'Rechnung gespeichert')
    } catch (err: any) {
      toast.error('Fehler beim Speichern: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndUploadToZoho = async () => {
    setSaving(true)
    setUploadingToZoho(true)
    try {
      let savedId = invoiceId
      const invCopy = { ...invoice }

      if (isNew) {
        invCopy.rechnungsNummer = await generateInvoiceNumber()
        setInvoice(invCopy)
        const dbData = buildRechnungData(invCopy, totals)
        const { data, error } = await supabase.from('rechnungen').insert([dbData]).select().single()
        if (error) throw error
        savedId = data.id
        router.replace(`/rechnungen/${savedId}`)
      } else {
        const { error } = await supabase.from('rechnungen').update(buildRechnungData(invCopy, totals)).eq('id', invoiceId!)
        if (error) throw error
      }

      await savePositions(savedId!, positions, isNew ? [] : existingPositions)

      // Trigger Zoho webhook
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/48a021d8-c88d-4663-80f6-dc09a70d598b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rechnungsId: savedId,
          rechnungsNummer: invCopy.rechnungsNummer,
          rechnungstyp: invCopy.rechnungstyp || 'normal',
          pdfUrl: `${window.location.origin}/api/pdf/rechnung/${savedId}`,
          ticketId: invCopy.ticketId,
          ticketNumber: invCopy.ticketNumber,
          datum: invCopy.datum,
          faelligAm: invCopy.faelligAm,
          status: invCopy.status,
          kundeName: invCopy.kundeName,
          objektBezeichnung: invCopy.objektBezeichnung,
          erstelltDurch: invCopy.erstelltDurch,
          referenzAngebotId: invCopy.referenzAngebotId,
          referenzAngebotNummer: invCopy.referenzAngebotNummer,
          summen: { netto: totals.summeNetto, ust: totals.summeUst, brutto: totals.summeBrutto },
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Zoho webhook failed:', err))

      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Gespeichert & in Zoho abgelegt')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    } finally {
      setSaving(false)
      setUploadingToZoho(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (!invoiceId) return
    try {
      await supabase.from('rechnungen').update({ status: 'bezahlt', brutto_gesamt: totals.summeBrutto }).eq('id', invoiceId)
      setInvoice(prev => ({ ...prev, status: 'bezahlt', summeBrutto: totals.summeBrutto }))
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Rechnung als bezahlt markiert')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    }
  }

  const handleSendInvoice = async () => {
    if (!invoiceId) { toast.error('Rechnung muss zuerst gespeichert werden'); return }
    try {
      await supabase.from('rechnungen').update({ status: 'offen' }).eq('id', invoiceId)
      setInvoice(prev => ({ ...prev, status: 'offen' }))

      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/rechnung-versenden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rechnungsId: invoiceId,
          rechnungsNummer: invoice.rechnungsNummer,
          rechnungstyp: invoice.rechnungstyp,
          pdfUrl: invoice.pdfUrl,
          status: 'offen',
          datum: invoice.datum,
          faelligAm: invoice.faelligAm,
          ticketId: invoice.ticketId,
          ticketNumber: invoice.ticketNumber,
          source: invoice.source,
          referenzAngebotNummer: invoice.referenzAngebotNummer,
          stornoVonRechnung: invoice.stornoVonRechnung,
          kunde: {
            name: invoice.kundeName,
            strasse: invoice.kundeStrasse,
            plz: invoice.kundePlz,
            ort: invoice.kundeOrt,
            ansprechpartner: invoice.kundeAnsprechpartner
          },
          objekt: { bezeichnung: invoice.objektBezeichnung },
          erstelltDurch: invoice.erstelltDurch,
          bemerkung: invoice.bemerkung,
          positionen: positions,
          summen: totals,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Send webhook failed:', err))

      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Rechnung versendet')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    }
  }

  const handleStorno = async () => {
    if (!invoiceId || !cancelReason.trim()) { toast.error('Bitte Stornierungsgrund angeben'); return }
    try {
      const year = new Date().getFullYear()
      const { data: allInvoices } = await supabase.from('rechnungen').select('rechnungsnummer').ilike('rechnungsnummer', `RE-${year}%`)
      const nextNum = (allInvoices?.length || 0) + 1
      const stornoNummer = `RE-${year}-${String(nextNum).padStart(5, '0')}`

      const stornoPositions = positions.map(pos => ({
        position: pos.pos,
        beschreibung: pos.produktName || pos.beschreibung || '-',
        menge: -Math.abs(parseFloat(pos.menge as string) || 0),
        einheit: pos.einheit,
        einzelpreis: Math.abs(parseFloat(pos.einzelpreisNetto as string) || 0),
        rabatt_prozent: parseFloat(pos.rabattProzent as string) || 0,
        mwst_satz: parseFloat(pos.ustSatz as string) || 20,
        gesamtpreis: -Math.abs(parseFloat(pos.gesamtNetto as string) || 0),
      }))

      const stornoDbData = {
        rechnungsnummer: stornoNummer,
        rechnungstyp: 'storno',
        status: 'entwurf',
        storno_von_rechnung_id: invoiceId,
        storno_grund: cancelReason,
        kunde_name: invoice.kundeName,
        kunde_strasse: invoice.kundeStrasse || null,
        kunde_plz: invoice.kundePlz || null,
        kunde_ort: invoice.kundeOrt || null,
        kunde_uid: invoice.uidnummer || null,
        rechnungsdatum: format(new Date(), 'yyyy-MM-dd'),
        faellig_bis: null,
        objekt_adresse: invoice.objektBezeichnung || null,
        ticket_nummer: invoice.ticketNumber || null,
        notizen: cancelReason,
        netto_gesamt: -Math.abs(totals.summeNetto),
        mwst_gesamt: -Math.abs(totals.summeUst),
        brutto_gesamt: -Math.abs(totals.summeBrutto),
      }

      const { data: stornoData, error } = await supabase.from('rechnungen').insert([stornoDbData]).select().single()
      if (error) throw error

      await Promise.all([
        supabase.from('rechnung_positionen').insert(stornoPositions.map(p => ({ ...p, rechnung_id: stornoData.id }))),
        supabase.from('rechnungen').update({ status: 'storniert' }).eq('id', invoiceId),
      ])
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      toast.success('Storno-Rechnung erstellt')
      setCancelDialogOpen(false)
      router.push(`/rechnungen/${stornoData.id}`)
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    }
  }

  const handleAddTeilzahlung = async () => {
    if (!invoiceId || !newTeilzahlung.betrag) { toast.error('Betrag eingeben'); return }
    const betrag = parseFloat(newTeilzahlung.betrag)
    if (isNaN(betrag) || betrag <= 0) { toast.error('Ungültiger Betrag'); return }
    try {
      await supabase.from('teilzahlungen').insert({
        rechnung_id: invoiceId,
        betrag,
        datum: newTeilzahlung.datum,
        zahlungsart: newTeilzahlung.zahlungsart,
        notizen: newTeilzahlung.notizen || null,
      })
      const allTz = [...(teilzahlungen as any[]), { betrag }]
      const bezahltGesamt = allTz.reduce((s: number, t: any) => s + (Number(t.betrag) || 0), 0)
      const newStatus = bezahltGesamt >= totals.summeBrutto ? 'bezahlt' : 'teilweise_bezahlt'
      await supabase.from('rechnungen').update({ bezahlt_betrag: bezahltGesamt, status: newStatus }).eq('id', invoiceId)
      setInvoice(p => ({ ...p, status: newStatus, bezahltBetrag: bezahltGesamt }))
      setTeilzahlungModalOpen(false)
      setNewTeilzahlung({ betrag: '', datum: format(new Date(), 'yyyy-MM-dd'), zahlungsart: 'überweisung', notizen: '' })
      refetchTeilzahlungen()
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Zahlung erfasst')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    }
  }

  const deleteTeilzahlung = async (tzId: string) => {
    if (!invoiceId) return
    try {
      await supabase.from('teilzahlungen').delete().eq('id', tzId)
      const remaining = (teilzahlungen as any[]).filter((t: any) => t.id !== tzId)
      const bezahltGesamt = remaining.reduce((s: number, t: any) => s + (Number(t.betrag) || 0), 0)
      const newStatus = bezahltGesamt <= 0 ? 'offen' : bezahltGesamt >= totals.summeBrutto ? 'bezahlt' : 'teilweise_bezahlt'
      await supabase.from('rechnungen').update({ bezahlt_betrag: bezahltGesamt, status: newStatus }).eq('id', invoiceId)
      setInvoice(p => ({ ...p, status: newStatus, bezahltBetrag: bezahltGesamt }))
      refetchTeilzahlungen()
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Zahlung gelöscht')
    } catch (err: any) {
      toast.error('Fehler: ' + err.message)
    }
  }

  const handleStatusChange = async (v: string) => {
    setInvoice(prev => ({ ...prev, status: v }))
    if (v === 'bezahlt' && invoiceId) {
      try {
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fd01a47a-4d74-4763-b551-e5c3a29155da', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rechnungsId: invoiceId,
            rechnungsNummer: invoice.rechnungsNummer,
            status: 'bezahlt',
            ticketNumber: invoice.ticketNumber,
            objektBezeichnung: invoice.objektBezeichnung,
            kundeName: invoice.kundeName,
            summeBrutto: totals.summeBrutto,
            datum: invoice.datum,
            faelligAm: invoice.faelligAm,
            timestamp: new Date().toISOString()
          })
        })
        toast.success('Status auf Bezahlt gesetzt')
      } catch (err) {
        console.error('Bezahlt webhook failed:', err)
      }
    }
  }

  const showTeilfaktura = invoice.rechnungstyp === 'teilrechnung' || invoice.rechnungstyp === 'schlussrechnung'

  const formatSelectedDates = (dates: Date[]) => {
    if (dates.length === 0) return null
    if (dates.length === 1) return format(dates[0], 'dd.MM.yyyy')
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
    const ranges: { start: Date; end: Date }[] = []
    let rangeStart = sorted[0]
    let rangeEnd = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const diff = (sorted[i].getTime() - rangeEnd.getTime()) / (1000 * 60 * 60 * 24)
      if (diff === 1) {
        rangeEnd = sorted[i]
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd })
        rangeStart = sorted[i]
        rangeEnd = sorted[i]
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd })
    const formatted = ranges.map(r =>
      r.start.getTime() === r.end.getTime()
        ? format(r.start, 'dd.MM.yyyy')
        : `${format(r.start, 'dd.MM.yyyy')} - ${format(r.end, 'dd.MM.yyyy')}`
    ).join(', ')
    return `${formatted} (${dates.length} Tage)`
  }

  if (loadingInvoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const selectedVermittler = vermittlerList.find((v: any) => v.id === invoice.vermittlerId)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-4">
            <Link href="/rechnungen">
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Alle Rechnungen
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {isNew ? 'Neue Rechnung' : (invoice.rechnungsNummer || 'Rechnung')}
              </h1>
              {!isNew && invoiceId && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs text-slate-500 shrink-0">PDF Link:</Label>
                  <a
                    href={invoice.pdfUrl || `/api/pdf/rechnung/${invoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md"
                  >
                    {invoice.pdfUrl || `/api/pdf/rechnung/${invoiceId}`}
                  </a>
                </div>
              )}
              {!isNew && (() => {
                const typInfo = getTypInfo(invoice.rechnungstyp)
                const teilNetto = Number((invoice as any).teilbetragNetto ?? (invoice as any).teilbetrag_netto ?? 0)
                return (
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${invoice.status === 'bezahlt' ? 'bg-emerald-100 text-emerald-800' :
                        invoice.status === 'offen' ? 'bg-blue-100 text-blue-800' :
                        invoice.status === 'mahnung' ? 'bg-red-100 text-red-800' :
                        invoice.status === 'storniert' ? 'bg-rose-100 text-rose-800' :
                        'bg-slate-100 text-slate-600'}`}>
                      {invoice.status}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typInfo.badgeBg} ${typInfo.badgeText}`}>
                      {typInfo.label}
                    </span>
                    {(invoice as any).istSchlussrechnung || (invoice as any).ist_schlussrechnung ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        Schlussrechnung
                      </span>
                    ) : null}
                    {teilNetto > 0 && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        Teilbetrag: {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(teilNetto)}
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew && invoice.rechnungstyp !== 'storno' && invoice.status === 'offen' && (
              <Button variant="outline" onClick={handleMarkAsPaid} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Als bezahlt markieren</span>
                <span className="sm:hidden">Bezahlt</span>
              </Button>
            )}
            {!isNew && invoice.rechnungstyp !== 'storno' && invoice.status !== 'storniert' && invoice.status !== 'entwurf' && (
              <Button variant="outline" onClick={() => setCancelDialogOpen(true)} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                <Ban className="w-4 h-4 mr-2" />
                Stornieren
              </Button>
            )}
            {!isNew && (
              <Button variant="outline" onClick={handleSendInvoice} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                <Send className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Rechnung versenden</span>
                <span className="sm:hidden">Versenden</span>
              </Button>
            )}
            <Button onClick={handleSaveAndUploadToZoho} disabled={saving || uploadingToZoho} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {(saving || uploadingToZoho) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
              <span className="hidden sm:inline">Speichern & in Zoho ablegen</span>
              <span className="sm:hidden">Speichern</span>
            </Button>
            {!isNew && (
              <a href={`/api/pdf/rechnung/${invoiceId}?download=1`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF herunterladen
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Storno Dialog */}
        {cancelDialogOpen && (
          <Card className="p-6 mb-6 border-rose-200 bg-rose-50">
            <h3 className="text-lg font-semibold text-rose-800 mb-3">Rechnung stornieren</h3>
            <p className="text-sm text-rose-700 mb-3">
              Es wird eine neue Storno-Rechnung für <strong>{invoice.rechnungsNummer}</strong> erstellt.
            </p>
            <div className="mb-4">
              <Label className="text-rose-800">Stornierungsgrund *</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="z.B. Retoure, Preisänderung, Vertragsverletzung"
                rows={3}
                className="mt-1 border-rose-200"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleStorno} className="bg-rose-600 hover:bg-rose-700 text-white" disabled={!cancelReason.trim()}>
                Storno-Rechnung erstellen
              </Button>
            </div>
          </Card>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Kundendaten + Objekt */}
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Kundendaten</h2>
                {invoice.ticketId && (
                  <a
                    href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${invoice.ticketId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                    title="In Zoho öffnen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Kundenname</Label>
                  <Input value={invoice.kundeName || ''} onChange={e => setInvoice(p => ({ ...p, kundeName: e.target.value }))} placeholder="Firma / Name" className="mt-1" />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input value={invoice.kundeStrasse || ''} onChange={e => setInvoice(p => ({ ...p, kundeStrasse: e.target.value }))} placeholder="Straße und Hausnummer" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={invoice.kundePlz || ''} onChange={e => setInvoice(p => ({ ...p, kundePlz: e.target.value }))} placeholder="PLZ" className="mt-1" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={invoice.kundeOrt || ''} onChange={e => setInvoice(p => ({ ...p, kundeOrt: e.target.value }))} placeholder="Ort" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input value={invoice.kundeAnsprechpartner || ''} onChange={e => setInvoice(p => ({ ...p, kundeAnsprechpartner: e.target.value }))} placeholder="Ansprechpartner" className="mt-1" />
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={invoice.uidnummer || ''} onChange={e => setInvoice(p => ({ ...p, uidnummer: e.target.value }))} placeholder="z.B. ATU12345678" className="mt-1" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="rechnungAnHI"
                    checked={invoice.rechnungAnHI || false}
                    onChange={e => setInvoice(p => ({ ...p, rechnungAnHI: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="rechnungAnHI" className="text-sm font-medium text-slate-700 cursor-pointer">Rechnung an Hausinhabung (HI)</label>
                </div>
                {invoice.rechnungAnHI && (
                  <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Hausinhabungs-Adresse</p>
                    <div>
                      <Label>Hausinhabung (Name)</Label>
                      <Input value={invoice.hausinhabung || ''} onChange={e => setInvoice(p => ({ ...p, hausinhabung: e.target.value }))} placeholder="Name des Eigentümers" className="mt-1" />
                    </div>
                    <div>
                      <Label>Hausverwaltung (p.A.)</Label>
                      <Input value={invoice.hausverwaltungName || ''} onChange={e => setInvoice(p => ({ ...p, hausverwaltungName: e.target.value }))} placeholder="Hausverwaltungs-Name" className="mt-1" />
                    </div>
                    <div>
                      <Label>Straße</Label>
                      <Input value={invoice.hausverwaltungStrasse || ''} onChange={e => setInvoice(p => ({ ...p, hausverwaltungStrasse: e.target.value }))} placeholder="Straße und Hausnummer" className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>PLZ</Label>
                        <Input value={invoice.hausverwaltungPlz || ''} onChange={e => setInvoice(p => ({ ...p, hausverwaltungPlz: e.target.value }))} placeholder="PLZ" className="mt-1" />
                      </div>
                      <div>
                        <Label>Ort</Label>
                        <Input value={invoice.hausverwaltungOrt || ''} onChange={e => setInvoice(p => ({ ...p, hausverwaltungOrt: e.target.value }))} placeholder="Ort" className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label>UID der Hausinhabung</Label>
                      <Input value={invoice.uidVonHI || ''} onChange={e => setInvoice(p => ({ ...p, uidVonHI: e.target.value }))} placeholder="z.B. ATU12345678" className="mt-1" />
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="space-y-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input value={invoice.objektBezeichnung || ''} onChange={e => setInvoice(p => ({ ...p, objektBezeichnung: e.target.value }))} placeholder="z.B. Hauptstraße 50, 2020 Magersdorf" className="mt-1" />
                </div>
                <div>
                  <Label>Objektadresse (Straße und Nummer)</Label>
                  <Input value={invoice.objektStrasse || ''} onChange={e => setInvoice(p => ({ ...p, objektStrasse: e.target.value }))} placeholder="Hauptstraße 50" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Objekt PLZ</Label>
                    <Input value={invoice.objektPlz || ''} onChange={e => setInvoice(p => ({ ...p, objektPlz: e.target.value }))} placeholder="2020" className="mt-1" />
                  </div>
                  <div>
                    <Label>Objekt Ort</Label>
                    <Input value={invoice.objektOrt || ''} onChange={e => setInvoice(p => ({ ...p, objektOrt: e.target.value }))} placeholder="Magersdorf" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Hausinhabung (HI)</Label>
                  <Input value={invoice.hausinhabung || ''} onChange={e => setInvoice(p => ({ ...p, hausinhabung: e.target.value }))} placeholder="Name des Eigentümers (optional)" className="mt-1" />
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Rechnungsdaten */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Rechnungsdaten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Rechnungstyp</Label>
                  <Select value={invoice.rechnungstyp} onValueChange={v => setInvoice(p => ({ ...p, rechnungstyp: v ?? 'normal' }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal (RE-)</SelectItem>
                      <SelectItem value="anzahlung">Anzahlung (AN-)</SelectItem>
                      <SelectItem value="teilrechnung">Teilrechnung (TR-)</SelectItem>
                      <SelectItem value="schlussrechnung">Schlussrechnung (SR-)</SelectItem>
                      <SelectItem value="gutschrift">Gutschrift (GS-)</SelectItem>
                      <SelectItem value="storno">Storno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {invoice.rechnungstyp === 'storno' && (
                  <>
                    <div>
                      <Label>Storno von Rechnung</Label>
                      <Input value={invoice.stornoVonRechnung || ''} onChange={e => setInvoice(p => ({ ...p, stornoVonRechnung: e.target.value }))} placeholder="RE-XXXX-XXXXX" className="mt-1" />
                    </div>
                    <div>
                      <Label>Stornierungsgrund</Label>
                      <Textarea value={invoice.stornoGrund || ''} onChange={e => setInvoice(p => ({ ...p, stornoGrund: e.target.value }))} placeholder="z.B. Retoure, Preisänderung" rows={3} className="mt-1" />
                    </div>
                  </>
                )}

                <div>
                  <Label>Rechnungsdatum</Label>
                  <Input type="date" value={invoice.datum || ''} onChange={e => setInvoice(p => ({ ...p, datum: e.target.value }))} className="mt-1" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Leistungszeitraum Von</Label>
                    <Input type="date" value={invoice.leistungszeitraumVon || ''} onChange={e => setInvoice(p => ({ ...p, leistungszeitraumVon: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Leistungszeitraum Bis</Label>
                    <Input type="date" value={invoice.leistungszeitraumBis || ''} onChange={e => setInvoice(p => ({ ...p, leistungszeitraumBis: e.target.value }))} className="mt-1" />
                  </div>
                </div>

                <div>
                  <Label>Zahlungskondition</Label>
                  <Select value={invoice.zahlungskondition || '30 Tage netto'} onValueChange={v => {
                    const val = v || '30 Tage netto'
                    const days = val === 'sofort' ? 0 : val === '14 Tage netto' ? 14 : 30
                    setInvoice(p => ({ ...p, zahlungskondition: val, zahlungszielTage: days }))
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14 Tage netto">14 Tage netto</SelectItem>
                      <SelectItem value="30 Tage netto">30 Tage netto</SelectItem>
                      <SelectItem value="sofort">Sofort fällig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input value={invoice.geschaeftsfallnummer || ''} onChange={e => setInvoice(p => ({ ...p, geschaeftsfallnummer: e.target.value }))} placeholder="Geschäftsfallnummer (optional)" className="mt-1" />
                </div>

                {/* Leistungszeitraum calendar picker */}
                <div>
                  <Label>Leistungszeitraum (Arbeitstage auswählen)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {selectedDates.length > 0
                            ? formatSelectedDates(selectedDates)
                            : <span className="text-slate-500">Tage auswählen...</span>
                          }
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="multiple"
                        selected={selectedDates}
                        onSelect={(dates) => {
                          const newDates = dates || []
                          setSelectedDates(newDates)
                          if (newDates.length > 0) {
                            const sorted = [...newDates].sort((a, b) => a.getTime() - b.getTime())
                            setInvoice(prev => ({
                              ...prev,
                              leistungszeitraumVon: format(sorted[0], 'yyyy-MM-dd'),
                              leistungszeitraumBis: format(sorted[sorted.length - 1], 'yyyy-MM-dd'),
                            }))
                          } else {
                            setInvoice(prev => ({ ...prev, leistungszeitraumVon: '', leistungszeitraumBis: '' }))
                          }
                        }}
                        initialFocus
                      />
                      {selectedDates.length > 0 && (
                        <div className="p-3 border-t">
                          <p className="text-sm font-medium text-slate-700 mb-2">Ausgewählte Tage ({selectedDates.length}):</p>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {[...selectedDates].sort((a, b) => a.getTime() - b.getTime()).map((date, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                {format(date, 'dd.MM.')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Zahlungsziel (Tage)</Label>
                  <Input
                    type="number"
                    value={invoice.zahlungszielTage || ''}
                    onChange={e => setInvoice(p => ({ ...p, zahlungszielTage: parseInt(e.target.value) || 30 }))}
                    placeholder="30"
                    className="mt-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Skonto aktivieren</Label>
                    <Switch checked={invoice.skontoAktiv || false} onCheckedChange={checked => setInvoice(p => ({ ...p, skontoAktiv: checked }))} />
                  </div>
                  {invoice.skontoAktiv && (
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={invoice.skontoProzent || 3}
                        onChange={e => setInvoice(p => ({ ...p, skontoProzent: parseFloat(e.target.value) || 3 }))}
                        placeholder="3 %"
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={invoice.skontoTage || 14}
                          onChange={e => setInvoice(p => ({ ...p, skontoTage: parseInt(e.target.value) || 14 }))}
                          placeholder="14"
                        />
                        <span className="text-sm text-slate-600 whitespace-nowrap">Tage</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Fällig am</Label>
                  <Input type="date" value={invoice.faelligAm || ''} onChange={e => setInvoice(p => ({ ...p, faelligAm: e.target.value }))} className="mt-1" />
                </div>

                <div>
                  <Label>Erstellt durch</Label>
                  <Input value={invoice.erstelltDurch || ''} onChange={e => setInvoice(p => ({ ...p, erstelltDurch: e.target.value }))} placeholder="z.B. Reinhard Lassel" className="mt-1" />
                </div>

                <div className={invoice.vermittlerId ? 'p-3 bg-orange-50 border-2 border-orange-300 rounded-lg' : ''}>
                  <Label>Vermittler</Label>
                  <Select value={invoice.vermittlerId || 'none'} onValueChange={v => setInvoice(p => ({ ...p, vermittlerId: v == null || v === 'none' ? '' : v }))}>
                    <SelectTrigger className={`mt-1 ${invoice.vermittlerId ? 'border-orange-300 bg-white' : ''}`}>
                      <SelectValue placeholder="Vermittler auswählen (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Vermittler</SelectItem>
                      {(vermittlerList as any[]).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} ({v.provisionssatz || 10}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVermittler && (
                    <p className="text-xs text-orange-700 font-medium mt-2">
                      Vermittler-Provision: {(selectedVermittler as any).provisionssatz || 10}% wird an Vermittler gezahlt
                    </p>
                  )}
                </div>

                <div>
                  <Label>Status</Label>
                  <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mt-1">
                    <Select value={invoice.status || 'entwurf'} onValueChange={(v) => { if (v) handleStatusChange(v) }}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entwurf">Entwurf</SelectItem>
                        <SelectItem value="offen">Offen</SelectItem>
                        <SelectItem value="teilweise_bezahlt">Teilweise bezahlt</SelectItem>
                        <SelectItem value="bezahlt">Bezahlt</SelectItem>
                        <SelectItem value="storniert">Storniert</SelectItem>
                        <SelectItem value="mahnung">Mahnung</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {invoice.referenzAngebotNummer && (
                  <div>
                    <Label>Referenz Angebot</Label>
                    <div className="mt-1">
                      <Link href={`/angebote/${invoice.referenzAngebotId}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium">
                        {invoice.referenzAngebotNummer}
                      </Link>
                    </div>
                  </div>
                )}

                <div>
                  <Label>Ticket-Nr.</Label>
                  <Input value={invoice.ticketNumber || ''} onChange={e => setInvoice(p => ({ ...p, ticketNumber: e.target.value }))} placeholder="Zoho Ticketnummer" className="mt-1" />
                </div>

                {invoice.pdfUrl && (
                  <div>
                    <Label>PDF Link</Label>
                    <div className="mt-1">
                      <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 underline truncate block">
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
          <InvoicePositionsTable positions={positions} onChange={setPositions} showTeilfaktura={showTeilfaktura} />
        </Card>

        {/* Teilzahlungen */}
        {!isNew && (
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Teilzahlungen</h2>
              <Button size="sm" onClick={() => setTeilzahlungModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                <Plus className="h-4 w-4" /> Zahlung erfassen
              </Button>
            </div>

            {teilzahlungModalOpen && (
              <div className="mb-4 p-4 border border-emerald-200 bg-emerald-50 rounded-lg space-y-3">
                <p className="text-sm font-semibold text-emerald-800">Neue Zahlung</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Betrag (€)</Label>
                    <Input type="number" step="0.01" value={newTeilzahlung.betrag} onChange={e => setNewTeilzahlung(p => ({ ...p, betrag: e.target.value }))} placeholder="0.00" className="mt-1" autoFocus />
                  </div>
                  <div>
                    <Label>Datum</Label>
                    <Input type="date" value={newTeilzahlung.datum} onChange={e => setNewTeilzahlung(p => ({ ...p, datum: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Zahlungsart</Label>
                  <Select value={newTeilzahlung.zahlungsart} onValueChange={v => setNewTeilzahlung(p => ({ ...p, zahlungsart: v || 'überweisung' }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="überweisung">Überweisung</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="sonstiges">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notiz (optional)</Label>
                  <Input value={newTeilzahlung.notizen} onChange={e => setNewTeilzahlung(p => ({ ...p, notizen: e.target.value }))} placeholder="z.B. Anzahlung" className="mt-1" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setTeilzahlungModalOpen(false)}>Abbrechen</Button>
                  <Button size="sm" onClick={handleAddTeilzahlung} className="bg-emerald-600 hover:bg-emerald-700">Speichern</Button>
                </div>
              </div>
            )}

            {(teilzahlungen as any[]).length === 0 && !teilzahlungModalOpen && (
              <p className="text-sm text-slate-400">Noch keine Zahlungen erfasst.</p>
            )}

            <div className="space-y-1">
              {(teilzahlungen as any[]).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-emerald-700">
                      {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(t.betrag)}
                    </span>
                    <span className="text-sm text-slate-500">{t.datum ? new Date(t.datum).toLocaleDateString('de-AT') : ''}</span>
                    {t.zahlungsart && <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-500">{t.zahlungsart}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.notizen && <span className="text-xs text-slate-400">{t.notizen}</span>}
                    <Button variant="ghost" size="sm" onClick={() => deleteTeilzahlung(t.id)} className="text-red-400 hover:text-red-600 h-7 w-7 p-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {(teilzahlungen as any[]).length > 0 && (() => {
              const bezahltGesamt = (teilzahlungen as any[]).reduce((s: number, t: any) => s + (Number(t.betrag) || 0), 0)
              const offen = totals.summeBrutto - bezahltGesamt
              return (
                <div className="border-t pt-3 mt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Bereits bezahlt:</span>
                    <span className="font-semibold text-emerald-600">{new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(bezahltGesamt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-800">Offener Betrag:</span>
                    <span className={`font-bold text-xl ${offen <= 0 ? 'text-emerald-600' : 'text-[#E85A1B]'}`}>
                      {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(offen)}
                    </span>
                  </div>
                </div>
              )
            })()}
          </Card>
        )}

        {/* Anmerkungen + Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Anmerkungen</h2>
            <Textarea
              value={invoice.bemerkung || ''}
              onChange={e => setInvoice(p => ({ ...p, bemerkung: e.target.value }))}
              rows={6}
              placeholder="Zahlungshinweise, Bankdaten, etc."
              className="resize-none"
            />
          </Card>
          <OfferSummary positions={positions} />
        </div>

        {/* Fußzeile – volle Breite */}
        <Card className="p-6 mb-6">
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
                      onClick={() => { setInvoice(p => ({ ...p, fusszeile: v.inhalt || v.text || '' })); setVorlagenOpen(false) }}
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
            value={invoice.fusszeile || ''}
            onChange={e => setInvoice(p => ({ ...p, fusszeile: e.target.value }))}
            placeholder="Leer lassen für Standard-Fußtext aus Einstellungen..."
            rows={4}
          />
          <p className="text-xs text-slate-400 mt-1">Leer = Standard-Fußtext aus Einstellungen wird verwendet</p>
        </Card>

        {/* PDF Preview */}
        {!isNew && (
          <div className="rounded-xl border border-slate-200 bg-white shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Rechnungs-Vorschau</h2>
              <a href={`/api/pdf/rechnung/${invoiceId}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF speichern
                </Button>
              </a>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-inner" style={{ aspectRatio: '1 / 1.414' }}>
              <iframe src={`/api/pdf/rechnung/${invoiceId}`} className="w-full h-full" title="Rechnungs-Vorschau" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
