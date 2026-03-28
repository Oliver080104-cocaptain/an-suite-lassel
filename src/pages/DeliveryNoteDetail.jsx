import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Loader2, FileDown } from "lucide-react";
import { createPageUrl } from '@/utils';
import PageHeader from '../components/shared/PageHeader';
import DeliveryNotePositionsTable from '../components/deliveryNotes/DeliveryNotePositionsTable';
import StatusBadge from '../components/shared/StatusBadge';
import PdfPreview from '../components/pdf/PdfPreview';
import { generateDeliveryNotePdfHtml } from '../components/pdf/PdfGenerator';
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

export default function DeliveryNoteDetail() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const deliveryNoteId = urlParams.get('id');
  const isNew = !deliveryNoteId;

  const [deliveryNote, setDeliveryNote] = useState({
    lieferscheinNummer: '',
    datum: moment().format('YYYY-MM-DD'),
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
    referenzAngebotId: ''
  });

  const [positions, setPositions] = useState([{
    pos: 1,
    produktName: '',
    beschreibung: '',
    menge: 1,
    einheit: 'Stk'
  }]);

  const positionsInitialized = useRef(false);
  const deliveryNoteInitialized = useRef(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [uploadingToZoho, setUploadingToZoho] = useState(false);
  // Lieferschein laden
  const { data: existingDeliveryNote, isLoading: loadingDeliveryNote } = useQuery({
    queryKey: ['deliveryNote', deliveryNoteId],
    queryFn: () => {
      if (!deliveryNoteId) return Promise.resolve([]);
      return base44.entities.DeliveryNote.filter({ id: deliveryNoteId });
    }
  });

  // Positionen laden
  const { data: existingPositions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['deliveryNotePositions', deliveryNoteId],
    queryFn: () => {
      if (!deliveryNoteId) return Promise.resolve([]);
      return base44.entities.DeliveryNotePosition.filter({ deliveryNoteId: deliveryNoteId }, 'pos');
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

  useEffect(() => {
    if (existingDeliveryNote && existingDeliveryNote.length > 0 && !deliveryNoteInitialized.current) {
      setDeliveryNote(existingDeliveryNote[0]);
      deliveryNoteInitialized.current = true;
    }
  }, [existingDeliveryNote]);

  useEffect(() => {
    if (existingPositions.length > 0 && !positionsInitialized.current) {
      setPositions(existingPositions);
      positionsInitialized.current = true;
    }
  }, [existingPositions]);

  // Auto-Save: nur beim Verlassen der Seite / Tab-Wechsel
  useEffect(() => {
    if (isNew) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && deliveryNoteId && deliveryNote.kundeName) {
        handleAutoSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (deliveryNoteId && deliveryNote.kundeName) {
        handleAutoSave();
      }
    };
  }, [deliveryNote, positions, isNew, deliveryNoteId]);

  const handleAutoSave = async () => {
    if (isNew) return;
    if (!deliveryNoteId) return;

    try {
      await base44.entities.DeliveryNote.update(deliveryNoteId, deliveryNote);
      await saveDnPositions(deliveryNoteId, positions, existingPositions);
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const saveDnPositions = async (targetId, currentPositions, currentExistingPositions) => {
    const existingPosIds = currentExistingPositions.map(p => p.id);
    const toDelete = currentExistingPositions.filter(ep => !currentPositions.find(p => p.id === ep.id));
    const toUpdate = currentPositions.filter(p => p.id && existingPosIds.includes(p.id));
    const toCreate = currentPositions.filter(p => !p.id);

    await Promise.all([
      ...toDelete.map(p => base44.entities.DeliveryNotePosition.delete(p.id).catch(() => {})),
      ...toUpdate.map(p => base44.entities.DeliveryNotePosition.update(p.id, { ...p, deliveryNoteId: targetId })),
      toCreate.length > 0 ? base44.entities.DeliveryNotePosition.bulkCreate(toCreate.map(p => ({ ...p, deliveryNoteId: targetId }))) : Promise.resolve()
    ]);
  };

  const previewHtml = useMemo(() => {
    if (!deliveryNote.kundeName || positions.length === 0 || !positions[0].produktName || !companySettingsData) return null;
    const previewNote = {
      ...deliveryNote,
      lieferscheinNummer: deliveryNote.lieferscheinNummer || 'LI-XXXX-XXXXX'
    };
    return generateDeliveryNotePdfHtml(previewNote, positions, companySettingsData);
  }, [deliveryNote, positions, companySettingsData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let savedDeliveryNote;
      
      if (isNew) {
        const year = moment().year();
        const allDeliveryNotes = await base44.entities.DeliveryNote.list();
        const thisYearDeliveryNotes = allDeliveryNotes.filter(dn =>
          dn.lieferscheinNummer && dn.lieferscheinNummer.includes(`LI-${year}`)
        );
        const nextNumber = thisYearDeliveryNotes.length + 1;
        const lieferscheinNummer = `LI-${year}-${String(nextNumber).padStart(5, '0')}`;
        
        savedDeliveryNote = await base44.entities.DeliveryNote.create({
          ...deliveryNote,
          lieferscheinNummer
        });
      } else {
        await base44.entities.DeliveryNote.update(deliveryNoteId, deliveryNote);
        savedDeliveryNote = { ...deliveryNote, id: deliveryNoteId };
      }

      await saveDnPositions(savedDeliveryNote.id, positions, isNew ? [] : existingPositions);

      queryClient.invalidateQueries(['deliveryNotes']);
      queryClient.invalidateQueries(['deliveryNote', savedDeliveryNote.id]);
      toast.success('Lieferschein gespeichert');

      if (isNew) {
        window.history.pushState({}, '', `?id=${savedDeliveryNote.id}`);
        setDeliveryNote(savedDeliveryNote);
      }
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadToZoho = async () => {
    if (!deliveryNoteId || !deliveryNote.pdfUrl) {
      toast.error('Bitte zuerst speichern und PDF generieren');
      return;
    }

    setUploadingToZoho(true);
    try {
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/b15d8baa-e8ec-4d8a-aa85-0865048b9c31', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lieferscheinId: deliveryNoteId,
          lieferscheinNummer: deliveryNote.lieferscheinNummer,
          pdfUrl: deliveryNote.pdfUrl,
          fileName: `${deliveryNote.lieferscheinNummer}.pdf`,
          ticketId: deliveryNote.ticketId,
          ticketNumber: deliveryNote.ticketNumber,
          dealId: deliveryNote.dealId,
          geschaeftsfallNummer: deliveryNote.geschaeftsfallNummer,
          datum: deliveryNote.datum,
          status: deliveryNote.status,
          kundeName: deliveryNote.kundeName,
          objektBezeichnung: deliveryNote.objektBezeichnung,
          erstelltDurch: deliveryNote.erstelltDurch,
          source: deliveryNote.source,
          entityType: deliveryNote.entityType,
          referenzAngebotNummer: deliveryNote.referenzAngebotNummer,
          referenzAngebotId: deliveryNote.referenzAngebotId,
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
      // Schritt 1: Speichern
      let savedDeliveryNote;
      if (isNew) {
        const year = moment().year();
        const allDeliveryNotes = await base44.entities.DeliveryNote.list();
        const thisYearDeliveryNotes = allDeliveryNotes.filter(dn =>
          dn.lieferscheinNummer && dn.lieferscheinNummer.includes(`LI-${year}`)
        );
        const nextNumber = thisYearDeliveryNotes.length + 1;
        const lieferscheinNummer = `LI-${year}-${String(nextNumber).padStart(5, '0')}`;
        savedDeliveryNote = await base44.entities.DeliveryNote.create({
          ...deliveryNote,
          lieferscheinNummer,
          status: 'erstellt'
        });
        window.history.pushState({}, '', `?id=${savedDeliveryNote.id}`);
      } else {
        await base44.entities.DeliveryNote.update(deliveryNoteId, deliveryNote);
        savedDeliveryNote = { ...deliveryNote, id: deliveryNoteId };
      }

      await saveDnPositions(savedDeliveryNote.id, positions, isNew ? [] : existingPositions);

      // Schritt 2: PDF generieren
      const htmlContent = generateDeliveryNotePdfHtml(savedDeliveryNote, positions, companySettingsData);
      toast.success('PDF wird generiert...');
      const pdfUrl = await generatePdfFromHtml(htmlContent, `${savedDeliveryNote.lieferscheinNummer}.pdf`);
      await base44.entities.DeliveryNote.update(savedDeliveryNote.id, { pdfUrl, status: 'erstellt' });

      // State sofort aktualisieren
      setDeliveryNote(prev => ({ ...prev, pdfUrl }));

      // Schritt 3: Zoho Upload
      await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/b15d8baa-e8ec-4d8a-aa85-0865048b9c31', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lieferscheinId: savedDeliveryNote.id,
          lieferscheinNummer: savedDeliveryNote.lieferscheinNummer,
          pdfUrl,
          fileName: `${savedDeliveryNote.lieferscheinNummer}.pdf`,
          ticketId: savedDeliveryNote.ticketId,
          ticketNumber: savedDeliveryNote.ticketNumber,
          dealId: savedDeliveryNote.dealId,
          geschaeftsfallNummer: savedDeliveryNote.geschaeftsfallNummer,
          datum: savedDeliveryNote.datum,
          status: savedDeliveryNote.status,
          kundeName: savedDeliveryNote.kundeName,
          objektBezeichnung: savedDeliveryNote.objektBezeichnung,
          erstelltDurch: savedDeliveryNote.erstelltDurch,
          source: savedDeliveryNote.source,
          entityType: savedDeliveryNote.entityType,
          referenzAngebotNummer: savedDeliveryNote.referenzAngebotNummer,
          referenzAngebotId: savedDeliveryNote.referenzAngebotId,
          timestamp: new Date().toISOString()
        })
      });

      queryClient.invalidateQueries(['deliveryNotes']);
      queryClient.invalidateQueries(['deliveryNote', savedDeliveryNote.id]);
      toast.success('PDF erfolgreich in Zoho abgespeichert');
    } catch (error) {
      toast.error('Fehler: ' + error.message);
    } finally {
      setSaving(false);
      setGeneratingPdf(false);
      setUploadingToZoho(false);
    }
  };

  const handleSaveAndGeneratePdf = async () => {
    if (positions.length === 0 || !positions[0].produktName) {
      toast.error('Mindestens eine Position erforderlich');
      return;
    }
    
    setSaving(true);
    setGeneratingPdf(true);
    try {
      let savedDeliveryNote;
      
      if (isNew) {
        const year = moment().year();
        const allDeliveryNotes = await base44.entities.DeliveryNote.list();
        const thisYearDeliveryNotes = allDeliveryNotes.filter(dn =>
          dn.lieferscheinNummer && dn.lieferscheinNummer.includes(`LI-${year}`)
        );
        const nextNumber = thisYearDeliveryNotes.length + 1;
        const lieferscheinNummer = `LI-${year}-${String(nextNumber).padStart(5, '0')}`;
        
        savedDeliveryNote = await base44.entities.DeliveryNote.create({
          ...deliveryNote,
          lieferscheinNummer,
          status: 'erstellt'
        });
      } else {
        await base44.entities.DeliveryNote.update(deliveryNoteId, deliveryNote);
        savedDeliveryNote = { ...deliveryNote, id: deliveryNoteId };
      }

      await saveDnPositions(savedDeliveryNote.id, positions, isNew ? [] : existingPositions);

      // HTML generieren und direkt via generatePdf -> api2pdf konvertieren
      const htmlContent = generateDeliveryNotePdfHtml(savedDeliveryNote, positions, companySettingsData || {});

      const pdfUrl = await generatePdfFromHtml(htmlContent, `${savedDeliveryNote.lieferscheinNummer}.pdf`);
      await base44.entities.DeliveryNote.update(savedDeliveryNote.id, { pdfUrl, status: 'erstellt' });

      setDeliveryNote(prev => ({ ...prev, pdfUrl }));
      queryClient.invalidateQueries(['deliveryNotes']);
      queryClient.invalidateQueries(['deliveryNote', savedDeliveryNote.id]);
      toast.success('PDF erfolgreich generiert!');

      if (isNew) {
        window.history.pushState({}, '', `?id=${savedDeliveryNote.id}`);
        setDeliveryNote(savedDeliveryNote);
      }
    } catch (error) {
      toast.error('Fehler: ' + error.message);
      setGeneratingPdf(false);
    } finally {
      setSaving(false);
    }
  };

  if (loadingDeliveryNote || loadingPositions) {
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
          title={isNew ? 'Neuer Lieferschein' : deliveryNote.lieferscheinNummer || 'Lieferschein'}
          subtitle={isNew ? 'Lieferschein erstellen' : `Erstellt am ${moment(deliveryNote.created_date).format('DD.MM.YYYY')}`}
          backLink="DeliveryNoteList"
          backLabel="Alle Lieferscheine"
          actions={
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveAndUploadToZoho} disabled={saving || generatingPdf || uploadingToZoho} className="bg-blue-600 hover:bg-blue-700">
                {(saving || generatingPdf || uploadingToZoho) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern & in Zoho ablegen
              </Button>
            </div>
          }
        />

        {/* Erste Zeile: Kundendaten und Lieferschein-Daten */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Kundendaten */}
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Empfänger</h2>
                {deliveryNote.ticketId && (
                  <a
                    href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${deliveryNote.ticketId}`}
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
                    value={deliveryNote.kundeName || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, kundeName: e.target.value })}
                    placeholder="z.B. PAUL Vienna Office GmbH"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Straße</Label>
                  <Input
                    value={deliveryNote.kundeStrasse || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, kundeStrasse: e.target.value })}
                    placeholder="Straße und Hausnummer"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input
                    value={deliveryNote.uidnummer || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, uidnummer: e.target.value })}
                    placeholder="z.B. ATU12345678"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PLZ</Label>
                    <Input
                      value={deliveryNote.kundePlz || ''}
                      onChange={(e) => setDeliveryNote({ ...deliveryNote, kundePlz: e.target.value })}
                      placeholder="PLZ"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input
                      value={deliveryNote.kundeOrt || ''}
                      onChange={(e) => setDeliveryNote({ ...deliveryNote, kundeOrt: e.target.value })}
                      placeholder="Ort"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Objekt (Lieferadresse)</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Objektbezeichnung</Label>
                  <Input
                    value={deliveryNote.objektBezeichnung || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, objektBezeichnung: e.target.value })}
                    placeholder="z.B. Hauptstraße 50, 2020 Magersdorf"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Ansprechpartner</Label>
                  <Input
                    value={deliveryNote.kundeAnsprechpartner || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, kundeAnsprechpartner: e.target.value })}
                    placeholder="Name des Ansprechpartners"
                    className="mt-1"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Seitenleiste */}
          <div className="space-y-6">
            {/* Lieferschein-Daten */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Lieferschein-Daten</h2>
              <div className="space-y-4">
                <div>
                  <Label>Lieferdatum</Label>
                  <Input
                    type="date"
                    value={deliveryNote.datum || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, datum: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Erstellt durch</Label>
                  <Input
                    value={deliveryNote.erstelltDurch || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, erstelltDurch: e.target.value })}
                    placeholder="Mitarbeiter"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Ticket-Nr.</Label>
                  <Input
                    value={deliveryNote.ticketNumber || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, ticketNumber: e.target.value })}
                    placeholder="Ticket-Nummer"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Geschäftsfallnummer</Label>
                  <Input
                    value={deliveryNote.geschaeftsfallNummer || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, geschaeftsfallNummer: e.target.value })}
                    placeholder="Geschäftsfallnummer"
                    className="mt-1"
                  />
                </div>
                {deliveryNote.referenzAngebotNummer && (
                   <div>
                     <Label>Referenz Angebot</Label>
                     <div className="mt-1">
                       <a
                         href={`/OfferDetail?id=${deliveryNote.referenzAngebotId}`}
                         className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                       >
                         {deliveryNote.referenzAngebotNummer}
                       </a>
                     </div>
                   </div>
                 )}
                <div>
                  <Label>PDF Link</Label>
                  <Input
                    value={deliveryNote.pdfUrl || ''}
                    onChange={(e) => setDeliveryNote({ ...deliveryNote, pdfUrl: e.target.value })}
                    placeholder="PDF Link (wird automatisch gesetzt)"
                    className="mt-1"
                    readOnly
                  />
                  {deliveryNote.pdfUrl && (
                    <a 
                      href={deliveryNote.pdfUrl} 
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

          </div>
        </div>

        {/* Zweite Zeile: Positionen über volle Breite */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Positionen</h2>
          <DeliveryNotePositionsTable
            positions={positions}
            onChange={setPositions}
          />
        </Card>

        {/* PDF Preview */}
        <div className="mt-6">
          <PdfPreview htmlContent={previewHtml} title="Lieferschein-Vorschau" />
        </div>
      </div>
    </div>
  );
}