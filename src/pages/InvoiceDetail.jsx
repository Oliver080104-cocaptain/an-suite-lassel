import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileDown, Loader2, CheckCircle2, Ban, Send, Calendar as CalendarIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import PageHeader from '../components/shared/PageHeader';
import InvoicePositionsTable from '../components/invoices/InvoicePositionsTable';
import OfferSummary from '../components/offers/OfferSummary';
import StatusBadge from '../components/shared/StatusBadge';
import PdfPreview from '../components/pdf/PdfPreview';
import CancelInvoiceDialog from '../components/invoices/CancelInvoiceDialog';
import EmailPreviewDialog from '../components/shared/EmailPreviewDialog';
import InvoiceSendTypeDialog from '../components/invoices/InvoiceSendTypeDialog';
import PartialPaymentsSection from '../components/invoices/PartialPaymentsSection';
import TextTemplates from '../components/shared/TextTemplates';
import { generateInvoicePdfHtml } from '../components/pdf/PdfGenerator';
import moment from 'moment';

const API2PDF_KEY = '74db1926-9937-494d-9398-4006d286980b';
async function generatePdfFromHtml(html, fileName) {
  const minHtml = html.replace(/<!--[\s\S]*?-->/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '').trim();
  const response = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
    method: 'POST',
    headers: { 'Authorization': API2PDF_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: minHtml, inline: true, fileName })
  });
  if (!response.ok) throw new Error(`api2pdf Fehler (${response.status})`);
  const result = await response.json();
  const r = Array.isArray(result) ? result[0] : result;
  const pdfUrl = r.FileUrl || r.pdf;
  if (!pdfUrl) throw new Error('Keine PDF-URL von api2pdf erhalten');
  return pdfUrl;
}


export default function InvoiceDetail() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const invoiceId = urlParams.get('id');
  const isNew = !invoiceId;

  const [invoice, setInvoice] = useState({
    rechnungsNummer: '',
    rechnungstyp: 'normal',
    datum: moment().format('YYYY-MM-DD'),
    zahlungskondition: '30 Tage netto',
    zahlungszielTage: '30',
    faelligAm: moment().add(30, 'days').format('YYYY-MM-DD'),
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
    referenzAngebotNummer: '',
    bemerkung: 'Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.',
    source: 'manual'
  });

  const [positions, setPositions] = useState([{
    pos: 1,
    produktName: '',
    beschreibung: '',
    menge: 1,
    einheit: 'Stk',
    einzelpreisNetto: 0,
    rabattProzent: 0,
    ustSatz: 19,
    gesamtNetto: 0,
    gesamtBrutto: 0,
    teilfakturaProzent: 100,
    bereitsFakturiert: 0
  }]);

  const positionsInitialized = useRef(false);
  const invoiceInitialized = useRef(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [sendTypeDialogOpen, setSendTypeDialogOpen] = useState(false);
  const [selectedSendType, setSelectedSendType] = useState('normal');
  const [uploadingToZoho, setUploadingToZoho] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  // Invoice laden
  const { data: existingInvoice, isLoading: loadingInvoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => {
      if (!invoiceId) return Promise.resolve([]);
      return base44.entities.Invoice.filter({ id: invoiceId });
    }
  });

  // Positionen laden
  const { data: existingPositions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['invoicePositions', invoiceId],
    queryFn: () => {
      if (!invoiceId) return Promise.resolve([]);
      return base44.entities.InvoicePosition.filter({ invoiceId: invoiceId }, 'pos');
    }
  });

  // Teilzahlungen laden
  const { data: partialPayments = [] } = useQuery({
    queryKey: ['partialPayments', invoiceId],
    queryFn: () => {
      if (!invoiceId) return Promise.resolve([]);
      return base44.entities.PartialPayment.filter({ invoiceId: invoiceId });
    }
  });

  // Company Settings laden
  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const settings = await base44.entities.CompanySettings.list();
      return settings[0] || {};
    },
  });

  // Mitarbeiter laden
  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: () => base44.entities.Mitarbeiter.filter({ aktiv: true }, 'name')
  });

  // Vermittler laden
  const { data: vermittlerList = [] } = useQuery({
    queryKey: ['vermittler'],
    queryFn: () => base44.entities.Vermittler.filter({ status: 'aktiv' }, 'name')
  });

  useEffect(() => {
    if (existingInvoice && existingInvoice.length > 0 && !invoiceInitialized.current) {
      setInvoice(existingInvoice[0]);
      invoiceInitialized.current = true;
    } else if (isNew) {
      // Stelle sicher, dass neue Rechnungen mit 30 Tagen Standard-Zahlungsziel beginnen
      setInvoice(prev => ({
        ...prev,
        zahlungszielTage: 30,
        faelligAm: moment(prev.datum).add(30, 'days').format('YYYY-MM-DD')
      }));
    }
  }, [existingInvoice, isNew]);

  useEffect(() => {
    if (existingPositions.length > 0 && !positionsInitialized.current) {
      setPositions(existingPositions);
      positionsInitialized.current = true;
    }
  }, [existingPositions]);

  // Leistungstage aus Invoice laden - EINMALIG beim Laden
  useEffect(() => {
    if (!existingInvoice || existingInvoice.length === 0) return;
    
    const inv = existingInvoice[0];
    if (inv.arbeitstage && inv.arbeitstage.length > 0) {
      // Verwende gespeicherte Arbeitstage
      const dates = inv.arbeitstage.map(d => moment(d).toDate());
      setSelectedDates(dates);
    } else if (inv.leistungszeitraumVon && inv.leistungszeitraumBis) {
      // Fallback: alle Tage zwischen von und bis
      const dates = [];
      const start = moment(inv.leistungszeitraumVon);
      const end = moment(inv.leistungszeitraumBis);
      
      if (start.isSame(end, 'day')) {
        dates.push(start.toDate());
      } else {
        let current = start.clone();
        while (current.isSameOrBefore(end, 'day')) {
          dates.push(current.toDate());
          current.add(1, 'day');
        }
      }
      
      setSelectedDates(dates);
    }
  }, [existingInvoice]);

  // Fälligkeitsdatum aktualisieren
  useEffect(() => {
    if (invoice.datum && invoice.zahlungszielTage) {
      setInvoice(prev => ({
        ...prev,
        faelligAm: moment(prev.datum).add(prev.zahlungszielTage, 'days').format('YYYY-MM-DD')
      }));
    }
  }, [invoice.datum, invoice.zahlungszielTage]);

  // Auto-Save: nur beim Verlassen der Seite / Tab-Wechsel
  useEffect(() => {
    if (isNew) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && invoiceId && invoice.kundeName) {
        handleAutoSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (invoiceId && invoice.kundeName) {
        handleAutoSave();
      }
    };
  }, [invoice, positions, isNew, invoiceId]);

  const saveInvoicePositions = async (targetInvoiceId, currentPositions, currentExistingPositions) => {
    const existingPosIds = currentExistingPositions.map(p => p.id);
    const toDelete = currentExistingPositions.filter(ep => !currentPositions.find(p => p.id === ep.id));
    const toUpdate = currentPositions.filter(p => p.id && existingPosIds.includes(p.id));
    const toCreate = currentPositions.filter(p => !p.id);

    await Promise.all([
      ...toDelete.map(p => base44.entities.InvoicePosition.delete(p.id).catch(() => {})),
      ...toUpdate.map(p => base44.entities.InvoicePosition.update(p.id, { ...p, invoiceId: targetInvoiceId })),
      toCreate.length > 0 ? base44.entities.InvoicePosition.bulkCreate(toCreate.map(p => ({ ...p, invoiceId: targetInvoiceId }))) : Promise.resolve()
    ]);
  };

  const handleAutoSave = async () => {
    if (isNew) return;
    if (!invoiceId) return;
    if (!invoice.kundeName) return;

    try {
      const invoiceData = {
        ...invoice,
        ...totals,
        arbeitstage: selectedDates.length > 0 ? selectedDates.map(d => moment(d).format('YYYY-MM-DD')) : undefined
      };
      await base44.entities.Invoice.update(invoiceId, invoiceData);
      await saveInvoicePositions(invoiceId, positions, existingPositions);
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const previewHtml = useMemo(() => {
    if (!invoice.kundeName || positions.length === 0 || !positions[0].produktName) return null;
    const previewInvoice = {
      ...invoice,
      rechnungsNummer: invoice.rechnungsNummer || 'RE-XXXX-XXXXX'
    };
    return generateInvoicePdfHtml(previewInvoice, positions, companySettings || {});
  }, [invoice, positions, companySettings]);

  // Summen berechnen
  const totals = useMemo(() => {
    const summeNetto = positions.reduce((sum, p) => sum + (parseFloat(p.gesamtNetto) || 0), 0);
    const summeRabatt = positions.reduce((sum, p) => {
      const menge = parseFloat(p.menge) || 0;
      const einzelpreis = parseFloat(p.einzelpreisNetto) || 0;
      const rabatt = parseFloat(p.rabattProzent) || 0;
      return sum + ((menge * einzelpreis) * (rabatt / 100));
    }, 0);
    const summeUst = positions.reduce((sum, p) => {
      const gesamtNetto = parseFloat(p.gesamtNetto) || 0;
      const ustSatz = parseFloat(p.ustSatz) || 19;
      return sum + (gesamtNetto * (ustSatz / 100));
    }, 0);
    const summeBrutto = summeNetto + summeUst;
    
    return { summeNetto, summeRabatt, summeUst, summeBrutto };
  }, [positions]);

  const generateInvoiceNumber = async () => {
    const year = moment().year();
    const invoices = await base44.entities.Invoice.list();
    const thisYearInvoices = invoices.filter(i => i.rechnungsNummer && i.rechnungsNummer.includes(`RE-${year}`));
    const nextNumber = thisYearInvoices.length + 1;
    return `RE-${year}-${String(nextNumber).padStart(5, '0')}`;
  };

  const handleSave = async (createPdf = false) => {
    setSaving(true);
    try {
      let savedInvoice;
      const invoiceData = {
        ...invoice,
        ...totals,
        arbeitstage: selectedDates.length > 0 ? selectedDates.map(d => moment(d).format('YYYY-MM-DD')) : undefined
      };

      if (isNew) {
        invoiceData.rechnungsNummer = await generateInvoiceNumber();
        savedInvoice = await base44.entities.Invoice.create(invoiceData);
      } else {
        await base44.entities.Invoice.update(invoiceId, invoiceData);
        savedInvoice = { ...invoiceData, id: invoiceId };
      }

      await saveInvoicePositions(savedInvoice.id, positions, isNew ? [] : existingPositions);

      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['invoice', savedInvoice.id]);
      queryClient.invalidateQueries(['invoicePositions', savedInvoice.id]);

      toast.success(isNew ? 'Rechnung erstellt' : 'Rechnung gespeichert');

      if (isNew) {
        window.history.pushState({}, '', `?id=${savedInvoice.id}`);
      }

      if (createPdf) {
        await handleGeneratePdf(savedInvoice);
      }
    } catch (error) {
      toast.error('Fehler beim Speichern: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePdf = async (invoiceData = invoice) => {
    setGeneratingPdf(true);
    try {
      const htmlContent = generateInvoicePdfHtml(invoiceData, positions, companySettings);

      const pdfUrl = await generatePdfFromHtml(htmlContent, `${invoiceData.rechnungsNummer || 'Rechnung'}.pdf`);

      const newStatus = invoiceData.status === 'entwurf' ? 'offen' : invoiceData.status;
      await base44.entities.Invoice.update(invoiceData.id, { pdfUrl, status: newStatus });
      setInvoice(prev => ({ ...prev, pdfUrl, status: newStatus }));
      queryClient.invalidateQueries(['invoices']);
      toast.success('PDF erfolgreich generiert!');
    } catch (error) {
      toast.error('Fehler bei PDF-Erstellung: ' + error.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleMarkAsPaid = async () => {
    try {
      await base44.entities.Invoice.update(invoiceId, { 
        status: 'bezahlt',
        bezahltBetrag: invoice.summeBrutto
      });
      setInvoice({ ...invoice, status: 'bezahlt', bezahltBetrag: invoice.summeBrutto });
      queryClient.invalidateQueries(['invoices']);
      toast.success('Rechnung als bezahlt markiert');
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    }
  };

  const handleShowEmailPreview = async () => {
    if (!invoiceId) {
      toast.error('Rechnung muss zuerst gespeichert werden');
      return;
    }
    if (!companySettings) {
      toast.error('Company Settings werden noch geladen...');
      return;
    }

    // PDF neu generieren mit aktuellen Daten bevor Dialog geöffnet wird
    setSaving(true);
    setGeneratingPdf(true);
    toast.loading('PDF wird aktualisiert...');

    try {
      // Rechnung & Positionen speichern
      const invoiceData = {
        ...invoice,
        ...totals,
        arbeitstage: selectedDates.length > 0 ? selectedDates.map(d => moment(d).format('YYYY-MM-DD')) : undefined
      };
      await base44.entities.Invoice.update(invoiceId, invoiceData);
      await saveInvoicePositions(invoiceId, positions, existingPositions);

      // PDF neu erstellen
      const htmlContent = generateInvoicePdfHtml({ ...invoiceData, id: invoiceId }, positions, companySettings);
      const pdfUrl = await generatePdfFromHtml(htmlContent, `${invoice.rechnungsNummer}.pdf`);
      const newStatus = invoiceData.status === 'entwurf' ? 'offen' : invoiceData.status;
      await base44.entities.Invoice.update(invoiceId, { pdfUrl, status: newStatus });

      setInvoice(prev => ({ ...prev, pdfUrl, status: newStatus }));
      toast.dismiss();
      toast.success('PDF aktualisiert');
      setSendTypeDialogOpen(true);
    } catch (error) {
      toast.dismiss();
      toast.error('Fehler beim PDF erstellen: ' + error.message);
    } finally {
      setSaving(false);
      setGeneratingPdf(false);
    }
  };

  const handleSendTypeSelected = (sendType) => {
    setSelectedSendType(sendType);
    setEmailPreviewOpen(true);
  };

  const handleSendInvoice = async (emailData) => {
    setSendingInvoice(true);
    try {
      // Status auf offen setzen
      await base44.entities.Invoice.update(invoiceId, { status: 'offen' });
      setInvoice({ ...invoice, status: 'offen' });
      
      // Webhook für Rechnungs-Versand triggern mit allen Daten inkl. E-Mail-Vorschau
      try {
        const editUrl = `https://zoho-integration-suite-90207fd3.base44.app/InvoiceDetail?id=${invoiceId}`;
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/rechnung-versenden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rechnungsId: invoiceId,
            rechnungsNummer: invoice.rechnungsNummer,
            rechnungstyp: invoice.rechnungstyp,
            sendType: selectedSendType,
            editUrl: editUrl,
            pdfUrl: invoice.pdfUrl,
            status: 'offen',
            datum: invoice.datum,
            faelligAm: invoice.faelligAm,
            zahlungskondition: invoice.zahlungskondition,
            zahlungszielTage: invoice.zahlungszielTage,
            ticketId: invoice.ticketId || null,
            ticketNumber: invoice.ticketNumber || null,
            ticketIdentifikation: invoice.ticketIdentifikation || null,
            source: invoice.source || 'manual',
            entityType: invoice.entityType,
            customerId: invoice.customerId,
            referenzAngebotNummer: invoice.referenzAngebotNummer || null,
            referenzAngebotId: invoice.referenzAngebotId || null,
            stornoVonRechnung: invoice.stornoVonRechnung || null,
            stornoGrund: invoice.stornoGrund || null,
            kunde: {
              name: invoice.kundeName,
              strasse: invoice.kundeStrasse,
              plz: invoice.kundePlz,
              ort: invoice.kundeOrt,
              ansprechpartner: invoice.kundeAnsprechpartner
            },
            objekt: {
              bezeichnung: invoice.objektBezeichnung
            },
            erstelltDurch: invoice.erstelltDurch || null,
            bemerkung: invoice.bemerkung || null,
            fotosLink: invoice.fotosLink || null,
            fotodokuOrdnerlink: invoice.fotodokuOrdnerlink || null,
            workdriveFolderId: invoice.workdriveFolderId,
            callbackUrl: invoice.callbackUrl,
            positionen: positions.map(pos => ({
              pos: pos.pos,
              produktName: pos.produktName,
              beschreibung: pos.beschreibung,
              menge: pos.menge,
              einheit: pos.einheit,
              einzelpreisNetto: pos.einzelpreisNetto,
              rabattProzent: pos.rabattProzent,
              ustSatz: pos.ustSatz,
              gesamtNetto: pos.gesamtNetto,
              gesamtBrutto: pos.gesamtBrutto,
              teilfakturaProzent: pos.teilfakturaProzent,
              bereitsFakturiert: pos.bereitsFakturiert
            })),
            summen: {
              netto: totals.summeNetto,
              rabatt: totals.summeRabatt,
              ust: totals.summeUst,
              brutto: totals.summeBrutto
            },
            bezahltBetrag: invoice.bezahltBetrag || 0,
            email: {
              sendenAn: emailData?.emailTo || null,
              betreff: emailData?.subject || null,
              nachrichtHtml: emailData?.bodyHtml || null,
              mitarbeiter: emailData?.employee || null,
              pdfHtml: emailData?.pdfHtml || null
            },
            created_date: invoice.created_date,
            updated_date: invoice.updated_date,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook fehlgeschlagen:', webhookError);
      }
      
      queryClient.invalidateQueries(['invoices']);
      toast.success('Rechnung versendet');
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setSendingInvoice(false);
    }
  };

  const handleCancel = async (stornierungsgrund) => {
    setCancelDialogOpen(false);
    setGeneratingPdf(true);
    try {
      // Neue Storno-Rechnung erstellen
      const year = moment().year();
      const invoices = await base44.entities.Invoice.list();
      const thisYearInvoices = invoices.filter(i => i.rechnungsNummer && i.rechnungsNummer.includes(`RE-${year}`));
      const nextNumber = thisYearInvoices.length + 1;
      const stornoNummer = `RE-${year}-${String(nextNumber).padStart(5, '0')}`;

      // Positionen mit negativen Werten - einzelpreisNetto bleibt positiv, nur Menge wird negativ
      const stornoPositions = positions.map(pos => ({
        pos: pos.pos,
        produktName: pos.produktName,
        beschreibung: pos.beschreibung,
        menge: -Math.abs(parseFloat(pos.menge) || 0),
        einheit: pos.einheit,
        einzelpreisNetto: Math.abs(parseFloat(pos.einzelpreisNetto) || 0),
        rabattProzent: parseFloat(pos.rabattProzent) || 0,
        ustSatz: parseFloat(pos.ustSatz) || 20,
        gesamtNetto: -Math.abs(parseFloat(pos.gesamtNetto) || 0),
        gesamtBrutto: -Math.abs(parseFloat(pos.gesamtBrutto) || 0),
        teilfakturaProzent: parseFloat(pos.teilfakturaProzent) || 100,
        bereitsFakturiert: parseFloat(pos.bereitsFakturiert) || 0
      }));

      const stornoInvoice = await base44.entities.Invoice.create({
        ...invoice,
        id: undefined,
        rechnungsNummer: stornoNummer,
        rechnungstyp: 'storno',
        stornoVonRechnung: invoice.rechnungsNummer,
        stornoGrund: stornierungsgrund,
        datum: moment().format('YYYY-MM-DD'),
        status: 'entwurf',
        summeNetto: -Math.abs(totals.summeNetto),
        summeRabatt: -Math.abs(totals.summeRabatt),
        summeUst: -Math.abs(totals.summeUst),
        summeBrutto: -Math.abs(totals.summeBrutto),
        pdfUrl: null,
        callbackUrl: null
      });

      for (const pos of stornoPositions) {
        await base44.entities.InvoicePosition.create({
          ...pos,
          id: undefined,
          invoiceId: stornoInvoice.id
        });
      }

      queryClient.invalidateQueries(['invoices']);
      toast.success('Storno-Rechnung erstellt');
      
      // Zur neuen Storno-Rechnung navigieren
      window.location.href = `?id=${stornoInvoice.id}`;
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleUploadToZoho = async () => {
    if (!invoiceId || !invoice.pdfUrl) {
      toast.error('Bitte zuerst speichern und PDF generieren');
      return;
    }

    setUploadingToZoho(true);
    try {
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/48a021d8-c88d-4663-80f6-dc09a70d598b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rechnungsId: invoiceId,
          rechnungsNummer: invoice.rechnungsNummer,
          rechnungstyp: invoice.rechnungstyp,
          pdfUrl: invoice.pdfUrl,
          ticketId: invoice.ticketId,
          ticketNumber: invoice.ticketNumber,
          dealId: invoice.dealId,
          geschaeftsfallNummer: invoice.geschaeftsfallNummer,
          datum: invoice.datum,
          faelligAm: invoice.faelligAm,
          status: invoice.status,
          kundeName: invoice.kundeName,
          objektBezeichnung: invoice.objektBezeichnung,
          erstelltDurch: invoice.erstelltDurch,
          source: invoice.source,
          entityType: invoice.entityType,
          referenzAngebotNummer: invoice.referenzAngebotNummer,
          referenzAngebotId: invoice.referenzAngebotId,
          stornoVonRechnung: invoice.stornoVonRechnung,
          stornoGrund: invoice.stornoGrund,
          summen: totals,
          fotosLink: invoice.fotosLink,
          fotodokuOrdnerlink: invoice.fotodokuOrdnerlink,
          timestamp: new Date().toISOString()
        })
      });
      
      toast.success('PDF erfolgreich in Zoho abgespeichert');
    } catch (error) {
      toast.error('Fehler beim Abspeichern in Zoho: ' + error.message);
    } finally {
      setUploadingToZoho(false);
    }
  };

  const handleSaveAndUploadToZoho = async () => {
    if (positions.length === 0 || !positions[0].produktName) {
      toast.error('Mindestens eine Position erforderlich');
      return;
    }
    if (!companySettings) {
      toast.error('Company Settings werden noch geladen...');
      return;
    }

    setSaving(true);
    setGeneratingPdf(true);
    setUploadingToZoho(true);

    try {
      // Schritt 1: Speichern
      let savedInvoice;
      const invoiceData = {
        ...invoice,
        ...totals,
        arbeitstage: selectedDates.length > 0 ? selectedDates.map(d => moment(d).format('YYYY-MM-DD')) : undefined
      };
      if (isNew) {
        invoiceData.rechnungsNummer = await generateInvoiceNumber();
        savedInvoice = await base44.entities.Invoice.create(invoiceData);
        window.history.pushState({}, '', `?id=${savedInvoice.id}`);
      } else {
        await base44.entities.Invoice.update(invoiceId, invoiceData);
        savedInvoice = { ...invoiceData, id: invoiceId };
      }

      await saveInvoicePositions(savedInvoice.id, positions, isNew ? [] : existingPositions);

      // Schritt 2: PDF generieren
      const htmlContent = generateInvoicePdfHtml(savedInvoice, positions, companySettings);
      toast.success('PDF wird generiert...');
      const pdfUrl = await generatePdfFromHtml(htmlContent, `${savedInvoice.rechnungsNummer}.pdf`);

      const newStatus = savedInvoice.status === 'entwurf' ? 'offen' : savedInvoice.status;
      await base44.entities.Invoice.update(savedInvoice.id, { pdfUrl, status: newStatus });

      // State sofort aktualisieren
      setInvoice(prev => ({ ...prev, pdfUrl, status: newStatus }));

      // Schritt 3: Zoho Upload
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/48a021d8-c88d-4663-80f6-dc09a70d598b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rechnungsId: savedInvoice.id,
          rechnungsNummer: savedInvoice.rechnungsNummer,
          rechnungstyp: savedInvoice.rechnungstyp,
          pdfUrl,
          ticketId: savedInvoice.ticketId,
          ticketNumber: savedInvoice.ticketNumber,
          dealId: savedInvoice.dealId,
          geschaeftsfallNummer: savedInvoice.geschaeftsfallNummer,
          datum: savedInvoice.datum,
          faelligAm: savedInvoice.faelligAm,
          status: newStatus,
          kundeName: savedInvoice.kundeName,
          objektBezeichnung: savedInvoice.objektBezeichnung,
          erstelltDurch: savedInvoice.erstelltDurch,
          source: savedInvoice.source,
          entityType: savedInvoice.entityType,
          referenzAngebotNummer: savedInvoice.referenzAngebotNummer,
          referenzAngebotId: savedInvoice.referenzAngebotId,
          stornoVonRechnung: savedInvoice.stornoVonRechnung,
          stornoGrund: savedInvoice.stornoGrund,
          summen: totals,
          fotosLink: savedInvoice.fotosLink,
          fotodokuOrdnerlink: savedInvoice.fotodokuOrdnerlink,
          timestamp: new Date().toISOString()
        })
      });

      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['invoice', savedInvoice.id]);
      toast.success('PDF erfolgreich in Zoho abgespeichert');
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setSaving(false);
      setGeneratingPdf(false);
      setUploadingToZoho(false);
    }
  };

  if (loadingInvoice || loadingPositions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const showTeilfaktura = invoice.rechnungstyp === 'teilrechnung' || invoice.rechnungstyp === 'schlussrechnung';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={isNew ? 'Neue Rechnung' : invoice.rechnungsNummer || 'Rechnung'}
          subtitle={isNew ? 'Rechnung erstellen' : `Erstellt am ${moment(invoice.created_date).format('DD.MM.YYYY')}`}
          backLink="InvoiceList"
          backLabel="Alle Rechnungen"
          actions={
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-2">
                {!isNew && <StatusBadge status={invoice.status} />}
                {!isNew && <StatusBadge status={invoice.rechnungstyp} />}
              </div>
              {!isNew && invoice.rechnungstyp !== 'storno' && (
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  {invoice.status === 'offen' && (
                    <Button variant="outline" onClick={handleMarkAsPaid} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 w-full sm:w-auto">
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Als bezahlt markieren</span>
                      <span className="sm:hidden">Bezahlt</span>
                    </Button>
                  )}
                  {invoice.status !== 'storniert' && invoice.status !== 'entwurf' && (
                    <Button variant="outline" onClick={() => setCancelDialogOpen(true)} className="text-rose-600 border-rose-200 hover:bg-rose-50 w-full sm:w-auto">
                      <Ban className="w-4 h-4 mr-2" />
                      Stornieren
                    </Button>
                  )}
                </div>
              )}
              {!isNew && invoice.pdfUrl && (
                <Button 
                  variant="outline" 
                  onClick={handleShowEmailPreview} 
                  disabled={sendingInvoice || saving || generatingPdf}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 w-full sm:w-auto"
                >
                  <Send className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Rechnung versenden</span>
                  <span className="sm:hidden">Versenden</span>
                </Button>
              )}
              <Button onClick={handleSaveAndUploadToZoho} disabled={saving || generatingPdf || uploadingToZoho} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                {(saving || generatingPdf || uploadingToZoho) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
                <span className="hidden sm:inline">Speichern & in Zoho ablegen</span>
                <span className="sm:hidden">Speichern</span>
              </Button>
            </div>
          }
        />

        {/* Erste Zeile: Kundendaten und Rechnungsdaten nebeneinander */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Kundendaten */}
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Kundendaten</h2>
                {invoice.ticketId && (
                  <a
                    href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${invoice.ticketId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                    title="In Zoho öffnen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="w-full">
                  <Label>Kundenname</Label>
                  <Input
                    value={invoice.kundeName || ''}
                    onChange={(e) => setInvoice({ ...invoice, kundeName: e.target.value })}
                    placeholder="Firma / Name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input
                    value={invoice.kundeStrasse || ''}
                    onChange={(e) => setInvoice({ ...invoice, kundeStrasse: e.target.value })}
                    placeholder="Straße und Hausnummer"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input
                      value={invoice.kundePlz || ''}
                      onChange={(e) => setInvoice({ ...invoice, kundePlz: e.target.value })}
                      placeholder="PLZ"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input
                      value={invoice.kundeOrt || ''}
                      onChange={(e) => setInvoice({ ...invoice, kundeOrt: e.target.value })}
                      placeholder="Ort"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input
                    value={invoice.kundeAnsprechpartner || ''}
                    onChange={(e) => setInvoice({ ...invoice, kundeAnsprechpartner: e.target.value })}
                    placeholder="Ansprechpartner"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input
                    value={invoice.uidnummer || ''}
                    onChange={(e) => setInvoice({ ...invoice, uidnummer: e.target.value })}
                    placeholder="z.B. ATU12345678"
                    className="mt-1"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="rechnungAnHI-kunde"
                    checked={invoice.rechnungAnHI || false}
                    onChange={(e) => setInvoice({ ...invoice, rechnungAnHI: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="rechnungAnHI-kunde" className="text-sm text-slate-600 cursor-pointer">
                    RE an HI?
                  </label>
                </div>
                {invoice.rechnungAnHI && (
                  <div className="mt-3">
                    <Label>UID-Nummer der Hausinhabung</Label>
                    <Input
                      value={invoice.uidVonHI || ''}
                      onChange={(e) => setInvoice({ ...invoice, uidVonHI: e.target.value })}
                      placeholder="z.B. ATU12345678"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input
                    value={invoice.objektBezeichnung || ''}
                    onChange={(e) => setInvoice({ ...invoice, objektBezeichnung: e.target.value })}
                    placeholder="z.B. Hauptstraße 50, 2020 Magersdorf"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Objektadresse (Straße und Nummer)</Label>
                  <Input
                    value={invoice.objektStrasse || ''}
                    onChange={(e) => setInvoice({ ...invoice, objektStrasse: e.target.value })}
                    placeholder="Hauptstraße 50"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Objekt PLZ</Label>
                    <Input
                      value={invoice.objektPlz || ''}
                      onChange={(e) => setInvoice({ ...invoice, objektPlz: e.target.value })}
                      placeholder="2020"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Objekt Ort</Label>
                    <Input
                      value={invoice.objektOrt || ''}
                      onChange={(e) => setInvoice({ ...invoice, objektOrt: e.target.value })}
                      placeholder="Magersdorf"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Hausinhabung (HI)</Label>
                  <Input
                    value={invoice.hausinhabung || ''}
                    onChange={(e) => setInvoice({ ...invoice, hausinhabung: e.target.value })}
                    placeholder="Name des Eigentümers (optional)"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input
                    value={invoice.kundeAnsprechpartner || ''}
                    onChange={(e) => setInvoice({ ...invoice, kundeAnsprechpartner: e.target.value })}
                    placeholder="Name des Ansprechpartners"
                    className="mt-1"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Rechnungsdaten */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Rechnungsdaten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Rechnungstyp</Label>
                  <Select value={invoice.rechnungstyp} onValueChange={(v) => setInvoice({ ...invoice, rechnungstyp: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="teilrechnung">Teilrechnung</SelectItem>
                      <SelectItem value="schlussrechnung">Schlussrechnung</SelectItem>
                      <SelectItem value="storno">Storno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {invoice.rechnungstyp === 'storno' && (
                  <>
                    <div>
                      <Label>Storno von Rechnung</Label>
                      <Input
                        value={invoice.stornoVonRechnung || ''}
                        onChange={(e) => setInvoice({ ...invoice, stornoVonRechnung: e.target.value })}
                        placeholder="RE-XXXX-XXXXX"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Stornierungsgrund</Label>
                      <Textarea
                        value={invoice.stornoGrund || ''}
                        onChange={(e) => setInvoice({ ...invoice, stornoGrund: e.target.value })}
                        placeholder="z.B. Retoure, Preisänderung, Vertragsverletzung"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
                <div>
                  <Label>Rechnungsdatum</Label>
                  <Input
                    type="date"
                    value={invoice.datum || ''}
                    onChange={(e) => setInvoice({ ...invoice, datum: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Leistungszeitraum (Arbeitstage auswählen)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal mt-1"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDates.length > 0 ? (
                          <span>
                            {(() => {
                              if (selectedDates.length === 1) {
                                return moment(selectedDates[0]).format('DD.MM.YYYY');
                              }
                              
                              // Sortiere Daten
                              const sorted = [...selectedDates].sort((a, b) => a - b);
                              
                              // Finde zusammenhängende Bereiche
                              const ranges = [];
                              let rangeStart = moment(sorted[0]);
                              let rangeEnd = moment(sorted[0]);
                              
                              for (let i = 1; i < sorted.length; i++) {
                                const current = moment(sorted[i]);
                                if (current.diff(rangeEnd, 'days') === 1) {
                                  rangeEnd = current;
                                } else {
                                  ranges.push({ start: rangeStart.clone(), end: rangeEnd.clone() });
                                  rangeStart = current.clone();
                                  rangeEnd = current.clone();
                                }
                              }
                              ranges.push({ start: rangeStart, end: rangeEnd });
                              
                              // Formatiere Bereiche
                              const formatted = ranges.map(range => {
                                if (range.start.isSame(range.end, 'day')) {
                                  return range.start.format('DD.MM.YYYY');
                                } else {
                                  return `${range.start.format('DD.MM.YYYY')} - ${range.end.format('DD.MM.YYYY')}`;
                                }
                              }).join(', ');
                              
                              return `${formatted} (${selectedDates.length} Tage)`;
                            })()}
                          </span>
                        ) : (
                          <span className="text-slate-500">Tage auswählen...</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="multiple"
                        selected={selectedDates}
                        onSelect={(dates) => {
                          setSelectedDates(dates || []);
                          
                          // Von und Bis automatisch setzen
                          if (dates && dates.length > 0) {
                            const sortedDates = [...dates].sort((a, b) => a - b);
                            const vonDate = moment(sortedDates[0]).format('YYYY-MM-DD');
                            const bisDate = moment(sortedDates[sortedDates.length - 1]).format('YYYY-MM-DD');
                            
                            setInvoice({
                              ...invoice,
                              leistungszeitraumVon: vonDate,
                              leistungszeitraumBis: bisDate
                            });
                          } else {
                            setInvoice({
                              ...invoice,
                              leistungszeitraumVon: '',
                              leistungszeitraumBis: ''
                            });
                          }
                        }}
                        initialFocus
                      />
                      {selectedDates.length > 0 && (
                        <div className="p-3 border-t">
                          <p className="text-sm font-medium text-slate-700 mb-2">
                            Ausgewählte Tage ({selectedDates.length}):
                          </p>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {[...selectedDates]
                              .sort((a, b) => a - b)
                              .map((date, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded"
                                >
                                  {moment(date).format('DD.MM.')}
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
                      onChange={(e) => setInvoice({ ...invoice, zahlungszielTage: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="30"
                      className="mt-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label>Skonto aktivieren</Label>
                    <Switch
                      checked={invoice.skontoAktiv || false}
                      onCheckedChange={(checked) => setInvoice({ ...invoice, skontoAktiv: checked })}
                    />
                  </div>
                  {invoice.skontoAktiv && (
                    <>
                      <Label className="text-sm text-slate-600">Skonto % (bei Zahlung innerhalb)</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <Input
                          type="number"
                          step="0.1"
                          value={invoice.skontoProzent || 3}
                          onChange={(e) => setInvoice({ ...invoice, skontoProzent: parseFloat(e.target.value) || 3 })}
                          placeholder="3"
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={invoice.skontoTage || 14}
                            onChange={(e) => setInvoice({ ...invoice, skontoTage: parseInt(e.target.value) || 14 })}
                            placeholder="14"
                          />
                          <span className="text-sm text-slate-600">Tage</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <Label>Fällig am</Label>
                  <Input
                    type="date"
                    value={invoice.faelligAm || ''}
                    onChange={(e) => setInvoice({ ...invoice, faelligAm: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Erstellt durch</Label>
                  <Select 
                    value={invoice.erstelltDurch || ''} 
                    onValueChange={(value) => setInvoice({ ...invoice, erstelltDurch: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Mitarbeiter auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mitarbeiterList.map((m) => (
                        <SelectItem key={m.id} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={invoice.vermittlerId ? 'p-3 bg-orange-50 border-2 border-orange-300 rounded-lg' : ''}>
                  <Label>Vermittler</Label>
                  <Select 
                    value={invoice.vermittlerId || ''} 
                    onValueChange={(value) => setInvoice({ ...invoice, vermittlerId: value || null })}
                  >
                    <SelectTrigger className={invoice.vermittlerId ? 'mt-1 border-orange-300 bg-white' : 'mt-1'}>
                      <SelectValue placeholder="Vermittler auswählen (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Kein Vermittler</SelectItem>
                      {vermittlerList.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} ({v.provisionssatz || 10}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {invoice.vermittlerId && vermittlerList.find(v => v.id === invoice.vermittlerId) && (
                    <p className="text-xs text-orange-700 font-medium mt-2">
                      ⚠️ Vermittler-Provision: {vermittlerList.find(v => v.id === invoice.vermittlerId)?.provisionssatz || 10}% wird an Vermittler gezahlt
                    </p>
                  )}
                </div>

                <div>
                   <Label>Status</Label>
                   <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mt-1">
                     <Select 
                       value={invoice.status || 'entwurf'} 
                       onValueChange={async (v) => {
                         setInvoice({ ...invoice, status: v });
                         
                         // Webhook triggern wenn Status auf "bezahlt" gesetzt wird
                         if (v === 'bezahlt' && invoiceId) {
                           try {
                             await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fd01a47a-4d74-4763-b551-e5c3a29155da', {
                               method: 'POST',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({
                                 rechnungsId: invoiceId,
                                 rechnungsNummer: invoice.rechnungsNummer,
                                 status: 'bezahlt',
                                 ticketId: invoice.ticketId,
                                 ticketNumber: invoice.ticketNumber,
                                 objektBezeichnung: invoice.objektBezeichnung,
                                 kundeName: invoice.kundeName,
                                 summeBrutto: totals.summeBrutto,
                                 datum: invoice.datum,
                                 faelligAm: invoice.faelligAm,
                                 timestamp: new Date().toISOString()
                               })
                             });
                             toast.success('Status auf Bezahlt gesetzt');
                           } catch (error) {
                             console.error('Webhook Fehler:', error);
                             toast.error('Status gesetzt, aber Webhook fehlgeschlagen');
                           }
                         }
                       }}
                     >
                       <SelectTrigger className="bg-white">
                         <SelectValue />
                       </SelectTrigger>
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
                       <a
                         href={`/OfferDetail?id=${invoice.referenzAngebotId}`}
                         className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                       >
                         {invoice.referenzAngebotNummer}
                       </a>
                     </div>
                   </div>
                 )}
                 <div>
                   <Label>Ticket-Nr.</Label>
                   <Input
                     value={invoice.ticketNumber || ''}
                     onChange={(e) => setInvoice({ ...invoice, ticketNumber: e.target.value })}
                     placeholder="Zoho Ticketnummer"
                     className="mt-1"
                   />
                 </div>
                 <div>
                   <Label>PDF Link</Label>
                   <Input
                     value={invoice.pdfUrl || ''}
                     onChange={(e) => setInvoice({ ...invoice, pdfUrl: e.target.value })}
                     placeholder="PDF Link (wird automatisch gesetzt)"
                     className="mt-1"
                     readOnly
                   />
                   {invoice.pdfUrl && (
                     <a 
                       href={invoice.pdfUrl} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block"
                     >
                       PDF öffnen
                     </a>
                   )}
                 </div>
                </div>
                </Card>

                {/* Teilzahlungen */}
                {!isNew && (
                  <PartialPaymentsSection 
                    invoiceId={invoiceId}
                    invoice={invoice}
                  />
                )}

                </div>
                </div>

                {/* Zweite Zeile: Positionen über volle Breite */}
                <Card className="p-6 mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
                <InvoicePositionsTable
                positions={positions}
                onChange={setPositions}
                showTeilfaktura={showTeilfaktura}
                />
                </Card>

                {/* Dritte Zeile: Zusammenfassung */}
                <div className="mb-8">
                <OfferSummary positions={positions} />
                </div>

        {/* Textvorlagen */}
        <div className="mb-8">
          <TextTemplates 
            type="invoice"
            value={invoice.bemerkung}
            onChange={(text) => setInvoice({ ...invoice, bemerkung: text })}
          />
        </div>

        {/* PDF Preview */}
        <div className="mt-6">
          <PdfPreview htmlContent={previewHtml} title="Rechnungs-Vorschau" />
        </div>
      </div>

      {/* Dialoge */}
      <CancelInvoiceDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleCancel}
        invoiceNumber={invoice.rechnungsNummer}
      />

      {/* Send Type Dialog */}
      <InvoiceSendTypeDialog
        open={sendTypeDialogOpen}
        onOpenChange={setSendTypeDialogOpen}
        invoice={invoice}
        partialPayments={partialPayments}
        onConfirm={handleSendTypeSelected}
      />

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        open={emailPreviewOpen}
        onOpenChange={setEmailPreviewOpen}
        onConfirm={handleSendInvoice}
        onRegeneratePdf={() => handleGeneratePdf()}
        documentType="invoice"
        documentData={{ ...invoice, ...totals, partialPayments, pdfHtml: previewHtml }}
        isLoading={sendingInvoice}
        sendType={selectedSendType}
      />
    </div>
  );
}