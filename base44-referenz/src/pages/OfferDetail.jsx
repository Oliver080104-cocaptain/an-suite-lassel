import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, FileDown, Loader2, Send, Bug, Truck, Receipt, Car } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { createPageUrl } from '@/utils';
import PageHeader from '../components/shared/PageHeader';
import OfferPositionsTable from '../components/offers/OfferPositionsTable';
import OfferSummary from '../components/offers/OfferSummary';
import StatusBadge from '../components/shared/StatusBadge';
import PdfPreview from '../components/pdf/PdfPreview';
import EmailPreviewDialog from '../components/shared/EmailPreviewDialog';
import ParksperreDialog from '../components/shared/ParksperreDialog';
import TextTemplates from '../components/shared/TextTemplates';
import { generateOfferPdfHtml } from '../components/pdf/PdfGenerator';
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

export default function OfferDetail() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const offerId = urlParams.get('id');
  const isNew = !offerId;

  const [offer, setOffer] = useState({
    angebotNummer: '',
    datum: moment().format('YYYY-MM-DD'),
    gueltigBis: moment().add(30, 'days').format('YYYY-MM-DD'),
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
  });

  const [positions, setPositions] = useState([{
    pos: 1,
    produktName: '',
    beschreibung: '',
    menge: 1,
    einheit: 'Stk',
    einzelpreisNetto: 0,
    rabattProzent: 0,
    ustSatz: 20,
    gesamtNetto: 0,
    gesamtBrutto: 0
  }]);

  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [creatingDeliveryNote, setCreatingDeliveryNote] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [parksperreDialogOpen, setParksperreDialogOpen] = useState(false);
  const [sendingParksperre, setSendingParksperre] = useState(false);
  const [uploadingToZoho, setUploadingToZoho] = useState(false);
  const autoSaveLock = useRef(false);
  const positionsInitialized = useRef(false);
  const offerInitialized = useRef(false);

  // Offer laden
  const { data: existingOffer, isLoading: loadingOffer } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: () => {
      if (!offerId) return Promise.resolve([]);
      return base44.entities.Offer.filter({ id: offerId });
    }
  });

  // Verknüpfte Rechnungen laden
  const { data: linkedInvoices = [] } = useQuery({
    queryKey: ['linkedInvoices', offerId],
    queryFn: () => {
      if (!offerId) return Promise.resolve([]);
      return base44.entities.Invoice.filter({ referenzAngebotId: offerId });
    },
    enabled: !!offerId
  });

  // Verknüpfte Lieferscheine laden
  const { data: linkedDeliveryNotes = [] } = useQuery({
    queryKey: ['linkedDeliveryNotes', offerId],
    queryFn: () => {
      if (!offerId) return Promise.resolve([]);
      return base44.entities.DeliveryNote.filter({ referenzAngebotId: offerId });
    },
    enabled: !!offerId
  });

  // Positionen laden
  const { data: existingPositions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['offerPositions', offerId],
    queryFn: () => {
      if (!offerId) return Promise.resolve([]);
      return base44.entities.OfferPosition.filter({ offerId: offerId }, 'pos');
    }
  });

  // Company Settings laden
  const { data: companySettingsData } = useQuery({
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
    if (existingOffer && existingOffer.length > 0 && !offerInitialized.current) {
      setOffer(existingOffer[0]);
      offerInitialized.current = true;
    }
  }, [existingOffer]);

  useEffect(() => {
    if (existingPositions.length > 0 && !positionsInitialized.current) {
      setPositions(existingPositions);
      positionsInitialized.current = true;
    }
  }, [existingPositions]);

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Auto-Save: nur beim Verlassen der Seite / Tab-Wechsel
  useEffect(() => {
    if (isNew) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && offerId && offer.rechnungsempfaengerName) {
        handleAutoSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Auch beim Unmount speichern
      if (offerId && offer.rechnungsempfaengerName) {
        handleAutoSave();
      }
    };
  }, [offer, positions, isNew, offerId]);

  const handleAutoSave = async () => {
    if (isNew) return;
    if (!offerId) return;
    if (autoSaveLock.current) return; // Verhindert parallele Auto-Saves

    autoSaveLock.current = true;
    try {
      await base44.entities.Offer.update(offerId, { ...offer, ...totals });
      await savePositions(offerId, positions, existingPositions);
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      autoSaveLock.current = false;
    }
  };

  // Hilfsfunktion: Positionen effizient speichern (parallel statt sequentiell)
  const savePositions = async (targetOfferId, currentPositions, currentExistingPositions) => {
    const existingPosIds = currentExistingPositions.map(p => p.id);

    const toDelete = currentExistingPositions.filter(ep => !currentPositions.find(p => p.id === ep.id));
    const toUpdate = currentPositions.filter(p => p.id && existingPosIds.includes(p.id));
    const toCreate = currentPositions.filter(p => !p.id);

    const buildPosData = (pos) => ({
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
    });

    await Promise.all([
      ...toDelete.map(p => base44.entities.OfferPosition.delete(p.id).catch(() => {})),
      ...toUpdate.map(p => base44.entities.OfferPosition.update(p.id, buildPosData(p)).catch(() => {})),
      toCreate.length > 0 ? base44.entities.OfferPosition.bulkCreate(toCreate.map(buildPosData)) : Promise.resolve()
    ]);
  };

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
      const ustSatz = parseFloat(p.ustSatz) || 20;
      return sum + (gesamtNetto * (ustSatz / 100));
    }, 0);
    const summeBrutto = summeNetto + summeUst;
    
    return { summeNetto, summeRabatt, summeUst, summeBrutto };
  }, [positions]);

  const previewHtml = useMemo(() => {
    if (!offer.rechnungsempfaengerName || positions.length === 0 || !positions[0].produktName || !companySettingsData) return null;
    const previewOffer = {
      ...offer,
      ...totals,
      angebotNummer: offer.angebotNummer || 'AN-XXXX-XXXXX'
    };
    return generateOfferPdfHtml(previewOffer, positions, companySettingsData);
  }, [offer, positions, companySettingsData, totals]);

  const generateOfferNumber = async () => {
    const year = moment().year();
    const offers = await base44.entities.Offer.list();
    const thisYearOffers = offers.filter(o => o.angebotNummer && o.angebotNummer.includes(`AN-${year}`));
    const nextNumber = thisYearOffers.length + 1;
    return `AN-${year}-${String(nextNumber).padStart(5, '0')}`;
  };

  const handleSave = async (createPdf = false) => {
    setSaving(true);
    try {
      let savedOffer;
      const offerData = {
        ...offer,
        ...totals
      };

      if (isNew) {
        offerData.angebotNummer = await generateOfferNumber();
        savedOffer = await base44.entities.Offer.create(offerData);
      } else {
        await base44.entities.Offer.update(offerId, offerData);
        savedOffer = { ...offerData, id: offerId };
      }

      await savePositions(savedOffer.id, positions, isNew ? [] : existingPositions);

      queryClient.invalidateQueries(['offers']);
      queryClient.invalidateQueries(['offer', savedOffer.id]);
      queryClient.invalidateQueries(['offerPositions', savedOffer.id]);

      toast.success(isNew ? 'Angebot erstellt' : 'Angebot gespeichert');

      if (isNew) {
        window.history.pushState({}, '', `?id=${savedOffer.id}`);
      }

      if (createPdf) {
        await handleGeneratePdf(savedOffer);
      }
    } catch (error) {
      toast.error('Fehler beim Speichern: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDeliveryNote = async () => {
    if (!offerId) {
      toast.error('Angebot muss zuerst gespeichert werden');
      return;
    }

    setCreatingDeliveryNote(true);
    toast.loading('Lieferschein wird erstellt...');
    
    try {
      // Lieferschein-Nummer aus Angebotsnummer generieren (gleiche Nummer mit LI statt AN)
      const lieferscheinNummer = offer.angebotNummer.replace('AN-', 'LI-');

      const deliveryNote = await base44.entities.DeliveryNote.create({
        lieferscheinNummer,
        ticketIdentifikation: offer.ticketId || offer.ticketNumber,
        source: 'manual',
        entityType: 'ticket',
        ticketId: offer.ticketId,
        ticketNumber: offer.ticketNumber,
        geschaeftsfallNummer: offer.geschaeftsfallNummer,
        referenzAngebotNummer: offer.angebotNummer,
        referenzAngebotId: offer.id,
        kundeName: offer.rechnungsempfaengerName,
        uidnummer: offer.uidnummer,
        kundeStrasse: offer.rechnungsempfaengerStrasse,
        kundePlz: offer.rechnungsempfaengerPlz,
        kundeOrt: offer.rechnungsempfaengerOrt,
        kundeAnsprechpartner: offer.ansprechpartner,
        hausinhabung: offer.hausinhabung,
        hausverwaltungName: offer.rechnungsempfaengerName,
        hausverwaltungStrasse: offer.rechnungsempfaengerStrasse,
        hausverwaltungPlz: offer.rechnungsempfaengerPlz,
        hausverwaltungOrt: offer.rechnungsempfaengerOrt,
        objektStrasse: offer.objektStrasse,
        objektBezeichnung: offer.objektBezeichnung,
        datum: moment().format('YYYY-MM-DD'),
        erstelltDurch: offer.erstelltDurch,
        bemerkung: offer.bemerkung,
        status: 'entwurf'
      });

      for (const pos of positions) {
        await base44.entities.DeliveryNotePosition.create({
          deliveryNoteId: deliveryNote.id,
          pos: pos.pos,
          produktName: pos.produktName,
          beschreibung: pos.beschreibung || '',
          menge: pos.menge,
          einheit: pos.einheit
        });
      }

      // Webhook an n8n senden mit allen relevanten Infos
      try {
        const editUrl = `https://zoho-integration-suite-90207fd3.base44.app/DeliveryNoteDetail?id=${deliveryNote.id}`;
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/5e4e9681-a79e-42be-a1d0-309bfdc36909', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'lieferschein_erstellt',
            lieferscheinId: deliveryNote.id,
            lieferscheinNummer: deliveryNote.lieferscheinNummer,
            editUrl: editUrl,
            angebot: {
              angebotId: offer.id,
              angebotNummer: offer.angebotNummer,
              datum: offer.datum,
              gueltigBis: offer.gueltigBis,
              ticketNumber: offer.ticketNumber,
              ticketId: offer.ticketId,
              geschaeftsfallNummer: offer.geschaeftsfallNummer,
              skizzenLink: offer.Skizzen_Link
            },
            lieferschein: {
              datum: deliveryNote.datum,
              status: deliveryNote.status
            },
            kunde: {
              name: deliveryNote.kundeName,
              strasse: deliveryNote.kundeStrasse,
              plz: deliveryNote.kundePlz,
              ort: deliveryNote.kundeOrt,
              ansprechpartner: deliveryNote.kundeAnsprechpartner
            },
            objekt: {
              bezeichnung: deliveryNote.objektBezeichnung
            },
            erstelltDurch: deliveryNote.erstelltDurch,
            bemerkung: deliveryNote.bemerkung,
            positionen: positions.map(pos => ({
              pos: pos.pos,
              produktName: pos.produktName,
              beschreibung: pos.beschreibung,
              menge: pos.menge,
              einheit: pos.einheit
            })),
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook fehlgeschlagen:', webhookError);
      }

      toast.dismiss();
      toast.success('Lieferschein erstellt - Weiterleitung...');
      
      // Sofort zum Lieferschein-Detail springen
      window.location.href = createPageUrl('DeliveryNoteDetail') + `?id=${deliveryNote.id}`;
    } catch (error) {
      toast.dismiss();
      toast.error('Fehler: ' + error.message);
      console.error('Lieferschein-Fehler:', error);
      setCreatingDeliveryNote(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!offerId) {
      toast.error('Angebot muss zuerst gespeichert werden');
      return;
    }

    setCreatingInvoice(true);
    toast.loading('Rechnung wird erstellt...');
    
    try {
      // Rechnungs-Nummer aus Angebotsnummer generieren (gleiche Nummer mit RE statt AN)
      const rechnungsNummer = offer.angebotNummer.replace('AN-', 'RE-');

      const invoice = await base44.entities.Invoice.create({
        rechnungsNummer,
        rechnungstyp: 'normal',
        ticketIdentifikation: offer.ticketId || offer.ticketNumber,
        source: 'manual',
        entityType: 'ticket',
        ticketId: offer.ticketId,
        ticketNumber: offer.ticketNumber,
        objektBezeichnung: offer.objektBezeichnung,
        referenzAngebotNummer: offer.angebotNummer,
        referenzAngebotId: offer.id,
        kundeName: offer.rechnungsempfaengerName,
        uidnummer: offer.uidnummer,
        kundeStrasse: offer.rechnungsempfaengerStrasse,
        kundePlz: offer.rechnungsempfaengerPlz,
        kundeOrt: offer.rechnungsempfaengerOrt,
        kundeAnsprechpartner: offer.ansprechpartner,
        hausinhabung: offer.hausinhabung,
        hausverwaltungName: offer.rechnungsempfaengerName,
        hausverwaltungStrasse: offer.rechnungsempfaengerStrasse,
        hausverwaltungPlz: offer.rechnungsempfaengerPlz,
        hausverwaltungOrt: offer.rechnungsempfaengerOrt,
        objektStrasse: offer.objektStrasse,
        objektPlz: offer.objektPlz,
        objektOrt: offer.objektOrt,
        datum: moment().format('YYYY-MM-DD'),
        zahlungskondition: '14 Tage netto',
        zahlungszielTage: 14,
        faelligAm: moment().add(14, 'days').format('YYYY-MM-DD'),
        erstelltDurch: offer.erstelltDurch,
        bemerkung: offer.bemerkung,
        status: 'entwurf',
        summeNetto: totals.summeNetto,
        summeRabatt: totals.summeRabatt,
        summeUst: totals.summeUst,
        summeBrutto: totals.summeBrutto
      });

      // Verwende die aktuellen Positionen aus dem State direkt
      for (const pos of positions) {
        await base44.entities.InvoicePosition.create({
          invoiceId: invoice.id,
          pos: pos.pos,
          produktName: pos.produktName,
          beschreibung: pos.beschreibung || '',
          menge: parseFloat(pos.menge) || 0,
          einheit: pos.einheit,
          einzelpreisNetto: parseFloat(pos.einzelpreisNetto) || 0,
          rabattProzent: parseFloat(pos.rabattProzent) || 0,
          ustSatz: parseFloat(pos.ustSatz) || 20,
          gesamtNetto: parseFloat(pos.gesamtNetto) || 0,
          gesamtBrutto: parseFloat(pos.gesamtBrutto) || 0,
          teilfakturaProzent: 100,
          bereitsFakturiert: 0
        });
      }

      // Webhook an n8n senden mit allen Angebotsdaten
      try {
        const editUrl = `https://zoho-integration-suite-90207fd3.base44.app/InvoiceDetail?id=${invoice.id}`;
        await fetch('https://lasselgmbh.app.n8n.cloud/webhook/47c3bc5b-17e6-4c07-bd72-71a546d023d5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rechnungsId: invoice.id,
            rechnungsNummer: invoice.rechnungsNummer,
            rechnungstyp: invoice.rechnungstyp,
            editUrl: editUrl,
            angebot: {
              angebotId: offer.id,
              angebotNummer: offer.angebotNummer,
              datum: offer.datum,
              gueltigBis: offer.gueltigBis,
              ticketNumber: offer.ticketNumber,
              ticketId: offer.ticketId,
              geschaeftsfallNummer: offer.geschaeftsfallNummer,
              skizzenLink: offer.Skizzen_Link
            },
            rechnung: {
              datum: invoice.datum,
              faelligAm: invoice.faelligAm,
              zahlungskondition: invoice.zahlungskondition,
              zahlungszielTage: invoice.zahlungszielTage
            },
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
            erstelltDurch: invoice.erstelltDurch,
            bemerkung: invoice.bemerkung,
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
              gesamtBrutto: pos.gesamtBrutto
            })),
            summen: {
              netto: totals.summeNetto,
              rabatt: totals.summeRabatt,
              ust: totals.summeUst,
              brutto: totals.summeBrutto
            },
            status: invoice.status,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook fehlgeschlagen:', webhookError);
      }

      toast.dismiss();
      toast.success('Rechnung erstellt - Weiterleitung...');
      
      // Sofort zum Rechnungs-Detail springen
      window.location.href = createPageUrl('InvoiceDetail') + `?id=${invoice.id}`;
    } catch (error) {
      toast.dismiss();
      toast.error('Fehler: ' + error.message);
      console.error('Rechnungs-Fehler:', error);
      setCreatingInvoice(false);
    }
  };

  const handleSaveAndGeneratePdf = async () => {
    console.log('🚀 START handleSaveAndGeneratePdf');
    
    if (positions.length === 0 || !positions[0].produktName) {
      toast.error('Mindestens eine Position erforderlich');
      return;
    }

    if (!companySettingsData) {
      toast.error('Company Settings werden noch geladen...');
      console.error('⚠️ companySettingsData fehlt');
      return;
    }
    
    setSaving(true);
    setGeneratingPdf(true);
    
    try {
      console.log('📝 Speichere Angebot...');
      let savedOffer;
      const offerData = {
        ...offer,
        ...totals
      };

      if (isNew) {
        offerData.angebotNummer = await generateOfferNumber();
        savedOffer = await base44.entities.Offer.create(offerData);
        console.log('✅ Neues Angebot erstellt:', savedOffer.id);
      } else {
        await base44.entities.Offer.update(offerId, offerData);
        savedOffer = { ...offerData, id: offerId };
        console.log('✅ Angebot aktualisiert:', offerId);
      }

      console.log('📋 Speichere Positionen...');
      await savePositions(savedOffer.id, positions, isNew ? [] : existingPositions);
      console.log('✅ Positionen gespeichert');

      // HTML/CSS generieren
      console.log('🎨 Generiere HTML...');
      const htmlContent = generateOfferPdfHtml(savedOffer, positions, companySettingsData);
      console.log('✅ HTML generiert:', htmlContent.length, 'Zeichen');
      
      toast.success('PDF wird generiert...');
      const pdfUrl = await generatePdfFromHtml(htmlContent, `${savedOffer.angebotNummer}.pdf`);
      await base44.entities.Offer.update(savedOffer.id, { pdfUrl, status: 'final' });

      // State direkt setzen - KEIN invalidateQueries für offer/offerPositions (würde State überschreiben und leere Position hinzufügen)
      setOffer(prev => ({ ...prev, pdfUrl, status: 'final' }));
      queryClient.invalidateQueries(['offers']); // nur die Liste, nicht das Detail
      toast.success('PDF erfolgreich generiert!');
      
      console.log('🎉 Fertig!');
    } catch (error) {
      console.error('❌ FEHLER:', error);
      toast.error('Fehler: ' + error.message);
      setGeneratingPdf(false);
    } finally {
      setSaving(false);
    }
  };

  const handleShowEmailPreview = async () => {
    if (!offerId) {
      toast.error('Angebot muss zuerst gespeichert werden');
      return;
    }

    if (!companySettingsData) {
      toast.error('Company Settings werden noch geladen...');
      return;
    }

    // PDF neu generieren mit aktuellen Daten bevor Dialog geöffnet wird
    setSaving(true);
    setGeneratingPdf(true);
    toast.loading('PDF wird aktualisiert...');

    try {
      // Angebot & Positionen speichern
      const offerData = { ...offer, ...totals };
      await base44.entities.Offer.update(offerId, offerData);
      await savePositions(offerId, positions, existingPositions);

      // PDF neu erstellen
      const htmlContent = generateOfferPdfHtml({ ...offerData, id: offerId }, positions, companySettingsData);
      const pdfUrl = await generatePdfFromHtml(htmlContent, `${offer.angebotNummer}.pdf`);
      await base44.entities.Offer.update(offerId, { pdfUrl, status: 'final' });

      setOffer(prev => ({ ...prev, pdfUrl, status: 'final' }));
      toast.dismiss();
      toast.success('PDF aktualisiert');
      setEmailPreviewOpen(true);
    } catch (error) {
      toast.dismiss();
      toast.error('Fehler beim PDF erstellen: ' + error.message);
    } finally {
      setSaving(false);
      setGeneratingPdf(false);
    }
  };

  const handleUploadToZoho = async () => {
    if (!offerId || !offer.pdfUrl) {
      toast.error('Bitte zuerst speichern und PDF generieren');
      return;
    }

    setUploadingToZoho(true);
    try {
      const editUrl = `https://zoho-integration-suite-90207fd3.base44.app/OfferDetail?id=${offerId}`;
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fccf5130-51b2-4e66-8aa2-84d29da4862a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: offerId,
          angebotNummer: offer.angebotNummer,
          pdfUrl: offer.pdfUrl,
          editUrl: editUrl,
          ticketId: offer.ticketId,
          ticketNumber: offer.ticketNumber,
          dealId: offer.dealId,
          geschaeftsfallNummer: offer.geschaeftsfallNummer,
          datum: offer.datum,
          gueltigBis: offer.gueltigBis,
          status: offer.status,
          rechnungsempfaengerName: offer.rechnungsempfaengerName,
          objektBezeichnung: offer.objektBezeichnung,
          erstelltDurch: offer.erstelltDurch,
          source: offer.source,
          entityType: offer.entityType,
          summen: totals,
          skizzenLink: offer.Skizzen_Link,
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
    if (!companySettingsData) {
      toast.error('Company Settings werden noch geladen...');
      return;
    }

    setSaving(true);
    setGeneratingPdf(true);
    setUploadingToZoho(true);

    try {
      // Schritt 1: Angebot speichern
      let savedOffer;
      const offerData = { ...offer, ...totals };
      if (isNew) {
        offerData.angebotNummer = await generateOfferNumber();
        savedOffer = await base44.entities.Offer.create(offerData);
        window.history.pushState({}, '', `?id=${savedOffer.id}`);
      } else {
        await base44.entities.Offer.update(offerId, offerData);
        savedOffer = { ...offerData, id: offerId };
      }

      await savePositions(savedOffer.id, positions, isNew ? [] : existingPositions);

      // Schritt 2: PDF generieren
      const htmlContent = generateOfferPdfHtml(savedOffer, positions, companySettingsData);
      toast.success('PDF wird generiert...');
      const pdfUrl = await generatePdfFromHtml(htmlContent, `${savedOffer.angebotNummer}.pdf`);
      await base44.entities.Offer.update(savedOffer.id, { pdfUrl, status: 'final' });

      // State direkt setzen ohne Re-fetch (verhindert alten Link und leere Position)
      setOffer(prev => ({ ...prev, pdfUrl, status: 'final' }));

      // Schritt 3: Zoho Upload
      const editUrl = `https://zoho-integration-suite-90207fd3.base44.app/OfferDetail?id=${savedOffer.id}`;
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fccf5130-51b2-4e66-8aa2-84d29da4862a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: savedOffer.id,
          angebotNummer: savedOffer.angebotNummer,
          pdfUrl,
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
          source: savedOffer.source,
          entityType: savedOffer.entityType,
          summen: totals,
          skizzenLink: savedOffer.Skizzen_Link,
          timestamp: new Date().toISOString()
        })
      });

      queryClient.invalidateQueries(['offers']); // nur die Liste, nicht das Detail
      toast.success('PDF erfolgreich in Zoho abgespeichert');
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setSaving(false);
      setGeneratingPdf(false);
      setUploadingToZoho(false);
    }
  };

  const handleSendParksperre = async (emailData) => {
    setSendingParksperre(true);
    try {
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/7836c00e-ddef-4c0a-90b9-be803b9dc3a9', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'parksperre_antrag',
          angebot: {
            angebotNummer: offer.angebotNummer,
            objektBezeichnung: offer.objektBezeichnung,
            objektStrasse: offer.objektStrasse,
            objektPlz: offer.objektPlz,
            objektOrt: offer.objektOrt,
            ticketNumber: offer.ticketNumber,
            rechnungsempfaengerName: offer.rechnungsempfaengerName
          },
          email: {
            to: emailData.emailTo,
            subject: emailData.subject,
            body: emailData.bodyHtml,
            mitarbeiter: emailData.employee
          },
          attachments: emailData.attachments || [],
          timestamp: new Date().toISOString()
        })
      });
      
      toast.success('Parksperre-Antrag erfolgreich versendet');
      setParksperreDialogOpen(false);
    } catch (error) {
      toast.error('Fehler beim Versenden: ' + error.message);
    } finally {
      setSendingParksperre(false);
    }
  };

  const handleSendOffer = async (emailData) => {
    setSendingOffer(true);
    try {
      // Status auf versendet setzen
      await base44.entities.Offer.update(offerId, { status: 'versendet' });
      setOffer({ ...offer, status: 'versendet' });
      
      // Webhook für Angebot-Versand triggern mit allen Daten inkl. E-Mail-Vorschau
      try {
        const editUrl = `https://zoho-integration-suite-90207fd3.base44.app/OfferDetail?id=${offerId}`;
        await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/ab34322b-aed4-4a93-b232-9178bf75ecaf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offerId: offerId,
            angebotNummer: offer.angebotNummer,
            editUrl: editUrl,
            pdfUrl: offer.pdfUrl,
            status: 'versendet',
            datum: offer.datum,
            gueltigBis: offer.gueltigBis,
            ticketId: offer.ticketId || null,
            ticketNumber: offer.ticketNumber || null,
            ticketIdentifikation: offer.ticketIdentifikation || null,
            geschaeftsfallNummer: offer.geschaeftsfallNummer || null,
            skizzenLink: offer.Skizzen_Link || null,
            source: offer.source || 'manual',
            entityType: offer.entityType,
            dealId: offer.dealId,
            dealName: offer.dealName,
            customerId: offer.customerId,
            rechnungsempfaenger: {
              name: offer.rechnungsempfaengerName,
              strasse: offer.rechnungsempfaengerStrasse,
              plz: offer.rechnungsempfaengerPlz,
              ort: offer.rechnungsempfaengerOrt
            },
            objekt: {
              bezeichnung: offer.objektBezeichnung,
              strasse: offer.objektStrasse,
              plz: offer.objektPlz,
              ort: offer.objektOrt
            },
            ansprechpartner: offer.ansprechpartner || null,
            erstelltDurch: offer.erstelltDurch || null,
            bemerkung: offer.bemerkung || null,
            reverseCharge: offer.reverseCharge || false,
            workdriveFolderId: offer.workdriveFolderId,
            n8nWebhookUrl: offer.n8nWebhookUrl,
            callbackUrl: offer.callbackUrl,
            positionen: positions.map(pos => ({
              pos: pos.pos,
              produktId: pos.produktId,
              produktName: pos.produktName,
              beschreibung: pos.beschreibung,
              menge: pos.menge,
              einheit: pos.einheit,
              einzelpreisNetto: pos.einzelpreisNetto,
              rabattProzent: pos.rabattProzent,
              ustSatz: pos.ustSatz,
              gesamtNetto: pos.gesamtNetto,
              gesamtBrutto: pos.gesamtBrutto
            })),
            summen: {
              netto: totals.summeNetto,
              rabatt: totals.summeRabatt,
              ust: totals.summeUst,
              brutto: totals.summeBrutto
            },
            email: {
              sendenAn: emailData?.emailTo || null,
              betreff: emailData?.subject || null,
              nachrichtHtml: emailData?.bodyHtml || null,
              mitarbeiter: emailData?.employee || null,
              pdfHtml: emailData?.pdfHtml || null,
              attachments: emailData?.attachments || []
            },
            created_date: offer.created_date,
            updated_date: offer.updated_date,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook fehlgeschlagen:', webhookError);
      }
      
      queryClient.invalidateQueries(['offers']);
      toast.success('Angebot versendet');
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setSendingOffer(false);
    }
  };

  if (loadingOffer || loadingPositions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={isNew ? 'Neues Angebot' : offer.angebotNummer || 'Angebot'}
          subtitle={isNew ? 'Angebot erstellen' : `Erstellt am ${moment(offer.created_date).format('DD.MM.YYYY')}`}
          backLink="OfferList"
          backLabel="Alle Angebote"
          actions={
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {!isNew && (
                  <StatusBadge status={offer.status} />
                )}
                <Button 
                  onClick={handleSaveAndUploadToZoho} 
                  disabled={saving || generatingPdf || uploadingToZoho} 
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                >
                  {(saving || generatingPdf || uploadingToZoho) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Speichern & in Zoho ablegen
                </Button>
              </div>
              {!isNew && (
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button 
                    variant="outline" 
                    onClick={() => setParksperreDialogOpen(true)}
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
                    onClick={handleShowEmailPreview}
                    disabled={sendingOffer || saving || generatingPdf}
                    className="border-green-200 text-green-700 hover:bg-green-50 flex-1 sm:flex-none"
                    size="sm"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Angebot versenden
                  </Button>
                </div>
              )}
            </div>
          }
        />

        {/* Erste Zeile: Kundendaten und Angebotsdaten nebeneinander */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Kundendaten */}
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Rechnungsempfänger</h2>
                {offer.ticketId && (
                  <a
                    href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${offer.ticketId}`}
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
                <div>
                  <Label>Name (Hausverwaltung / Kunde)</Label>
                  <Input
                    value={offer.rechnungsempfaengerName || ''}
                    onChange={(e) => setOffer({ ...offer, rechnungsempfaengerName: e.target.value })}
                    placeholder="z.B. PAUL Vienna Office GmbH"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input
                    value={offer.rechnungsempfaengerStrasse || ''}
                    onChange={(e) => setOffer({ ...offer, rechnungsempfaengerStrasse: e.target.value })}
                    placeholder="Straße und Hausnummer"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input
                      value={offer.rechnungsempfaengerPlz || ''}
                      onChange={(e) => setOffer({ ...offer, rechnungsempfaengerPlz: e.target.value })}
                      placeholder="PLZ"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input
                      value={offer.rechnungsempfaengerOrt || ''}
                      onChange={(e) => setOffer({ ...offer, rechnungsempfaengerOrt: e.target.value })}
                      placeholder="Ort"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input
                    value={offer.uidnummer || ''}
                    onChange={(e) => setOffer({ ...offer, uidnummer: e.target.value })}
                    placeholder="z.B. ATU12345678"
                    className="mt-1"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Baustellenadresse)</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input
                    value={offer.objektBezeichnung || ''}
                    onChange={(e) => setOffer({ ...offer, objektBezeichnung: e.target.value })}
                    placeholder="z.B. Hauptstraße 50, 2020 Magersdorf"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Objektadresse (Straße und Nummer)</Label>
                  <Input
                    value={offer.objektStrasse || ''}
                    onChange={(e) => setOffer({ ...offer, objektStrasse: e.target.value })}
                    placeholder="z.B. Rauscherstraße 251"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Objekt PLZ</Label>
                    <Input
                      value={offer.objektPlz || ''}
                      onChange={(e) => setOffer({ ...offer, objektPlz: e.target.value })}
                      placeholder="PLZ"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Objekt Ort</Label>
                    <Input
                      value={offer.objektOrt || ''}
                      onChange={(e) => setOffer({ ...offer, objektOrt: e.target.value })}
                      placeholder="Ort"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Hausinhabung (HI)</Label>
                  <Input
                    value={offer.hausinhabung || ''}
                    onChange={(e) => setOffer({ ...offer, hausinhabung: e.target.value })}
                    placeholder="Name des Eigentümers (optional)"
                    className="mt-1"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Angebotsdaten */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Angebotsdaten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Angebotsdatum</Label>
                  <Input
                    type="date"
                    value={offer.datum || ''}
                    onChange={(e) => setOffer({ ...offer, datum: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Gültig bis</Label>
                  <Input
                    type="date"
                    value={offer.gueltigBis || ''}
                    onChange={(e) => setOffer({ ...offer, gueltigBis: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Angebot erstellt von</Label>
                  <Select 
                    value={offer.erstelltDurch || ''} 
                    onValueChange={(value) => setOffer({ ...offer, erstelltDurch: value })}
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
                <div className={offer.vermittlerId ? 'p-3 bg-orange-50 border-2 border-orange-300 rounded-lg' : ''}>
                  <Label>Vermittler</Label>
                  <Select 
                    value={offer.vermittlerId || ''} 
                    onValueChange={(value) => setOffer({ ...offer, vermittlerId: value || null })}
                  >
                    <SelectTrigger className={offer.vermittlerId ? 'mt-1 border-orange-300 bg-white' : 'mt-1'}>
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
                  {offer.vermittlerId && vermittlerList.find(v => v.id === offer.vermittlerId) && (
                    <p className="text-xs text-orange-700 font-medium mt-2">
                      ⚠️ Vermittler-Provision: {vermittlerList.find(v => v.id === offer.vermittlerId)?.provisionssatz || 10}% wird an Vermittler gezahlt
                    </p>
                  )}
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mt-1">
                    <Select 
                      value={offer.status || 'draft'} 
                      onValueChange={async (v) => {
                        setOffer({ ...offer, status: v });
                        
                        // Webhook triggern wenn Status auf "angenommen" gesetzt wird
                        if (v === 'angenommen' && offerId) {
                          try {
                            await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/2c51d71e-b55d-493d-aafb-1443d1d100cc', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                angebotId: offerId,
                                angebotNummer: offer.angebotNummer,
                                status: 'angenommen',
                                ticketId: offer.ticketId,
                                ticketNumber: offer.ticketNumber,
                                dealId: offer.dealId,
                                geschaeftsfallNummer: offer.geschaeftsfallNummer,
                                rechnungsempfaengerName: offer.rechnungsempfaengerName,
                                objektBezeichnung: offer.objektBezeichnung,
                                summeBrutto: totals.summeBrutto,
                                datum: offer.datum,
                                timestamp: new Date().toISOString()
                              })
                            });
                            toast.success('Status auf Angenommen gesetzt');
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
                   <Input
                     value={offer.ticketNumber || ''}
                     onChange={(e) => setOffer({ ...offer, ticketNumber: e.target.value })}
                     placeholder="Ticket-Nummer"
                     className="mt-1"
                   />
                 </div>
                 <div>
                   <Label>Geschäftsfallnummer</Label>
                   <Input
                     value={offer.geschaeftsfallNummer || ''}
                     onChange={(e) => setOffer({ ...offer, geschaeftsfallNummer: e.target.value })}
                     placeholder="Geschäftsfallnummer (optional)"
                     className="mt-1"
                   />
                 </div>
                 <div>
                   <Label>Skizzen Link</Label>
                  <Input
                    value={offer.Skizzen_Link || ''}
                    onChange={(e) => setOffer({ ...offer, Skizzen_Link: e.target.value })}
                    placeholder="Zoho Workdrive Link"
                    className="mt-1"
                  />
                  {offer.Skizzen_Link && (
                    <a 
                      href={offer.Skizzen_Link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700 underline mt-1 block"
                    >
                      Link öffnen
                    </a>
                  )}
                </div>
                <div>
                  <Label>PDF Link</Label>
                  <Input
                    value={offer.pdfUrl || ''}
                    onChange={(e) => setOffer({ ...offer, pdfUrl: e.target.value })}
                    placeholder="PDF Link (wird automatisch gesetzt)"
                    className="mt-1"
                    readOnly
                  />
                  {offer.pdfUrl && (
                    <a 
                      href={offer.pdfUrl} 
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

                {/* Verknüpfte Dokumente */}
                {!isNew && (linkedInvoices.length > 0 || linkedDeliveryNotes.length > 0) && (
                <Card className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Verknüpfte Dokumente</h2>
                <div className="space-y-4">
                 {linkedInvoices.length > 0 && (
                   <div>
                     <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rechnungen</p>
                     <div className="space-y-1">
                       {linkedInvoices.map(inv => (
                         <a
                           key={inv.id}
                           href={`/InvoiceDetail?id=${inv.id}`}
                           className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group"
                         >
                           <span className="text-sm font-medium text-blue-600 group-hover:underline">{inv.rechnungsNummer}</span>
                           <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                             inv.status === 'bezahlt' ? 'bg-emerald-100 text-emerald-700' :
                             inv.status === 'offen' ? 'bg-blue-100 text-blue-700' :
                             inv.status === 'storniert' ? 'bg-red-100 text-red-700' :
                             'bg-slate-100 text-slate-600'
                           }`}>{inv.status}</span>
                         </a>
                       ))}
                     </div>
                   </div>
                 )}
                 {linkedDeliveryNotes.length > 0 && (
                   <div>
                     <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Lieferscheine</p>
                     <div className="space-y-1">
                       {linkedDeliveryNotes.map(dn => (
                         <a
                           key={dn.id}
                           href={`/DeliveryNoteDetail?id=${dn.id}`}
                           className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 group"
                         >
                           <span className="text-sm font-medium text-blue-600 group-hover:underline">{dn.lieferscheinNummer}</span>
                           <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                             dn.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' :
                             dn.status === 'versendet' ? 'bg-blue-100 text-blue-700' :
                             dn.status === 'erstellt' ? 'bg-purple-100 text-purple-700' :
                             'bg-slate-100 text-slate-600'
                           }`}>{dn.status}</span>
                         </a>
                       ))}
                     </div>
                   </div>
                 )}
                </div>
                </Card>
                )}

                </div>
                </div>

        {/* Zweite Zeile: Positionen über volle Breite */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
          <OfferPositionsTable
            positions={positions}
            onChange={setPositions}
          />
        </Card>

        {/* Dritte Zeile: Anmerkungen, Steueroptionen, Zusammenfassung */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Anmerkungen zum Angebot */}
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

          {/* Steueroptionen */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Steueroptionen</h2>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reverseCharge"
                checked={offer.reverseCharge || false}
                onCheckedChange={(checked) => setOffer({ ...offer, reverseCharge: checked })}
              />
              <label
                htmlFor="reverseCharge"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Ohne 20% UST (Reverse Charge / Ausnahme)
              </label>
            </div>
          </Card>

          {/* Zusammenfassung */}
          <OfferSummary positions={positions} reverseCharge={offer.reverseCharge} />
        </div>

        {/* Textvorlagen */}
        <div className="mb-8">
          <TextTemplates 
            type="offer"
            value={offer.anmerkungen}
            onChange={(text) => setOffer({ ...offer, anmerkungen: text })}
          />
        </div>

        {/* PDF Preview */}
        <div className="mt-6">
          <PdfPreview htmlContent={previewHtml} title="Angebots-Vorschau" />
        </div>
      </div>

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        open={emailPreviewOpen}
        onOpenChange={setEmailPreviewOpen}
        onConfirm={handleSendOffer}
        onRegeneratePdf={() => handleSaveAndGeneratePdf()}
        documentType="offer"
        documentData={{ ...offer, ...totals, pdfHtml: previewHtml }}
        isLoading={sendingOffer}
      />

      {/* Parksperre Dialog */}
      <ParksperreDialog
        open={parksperreDialogOpen}
        onOpenChange={setParksperreDialogOpen}
        onConfirm={handleSendParksperre}
        isLoading={sendingParksperre}
        offerData={{ ...offer, positions }}
      />
    </div>
  );
}