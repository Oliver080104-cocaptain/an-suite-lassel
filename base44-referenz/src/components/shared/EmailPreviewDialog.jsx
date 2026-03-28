import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Mail, Sparkles, Settings, Paperclip, X } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import SignatureManagerDialog from './SignatureManagerDialog';

export default function EmailPreviewDialog({ open, onOpenChange, onConfirm, documentType, documentData, isLoading, sendType = 'normal', onRegeneratePdf }) {
  const [emailPreview, setEmailPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [selectedMitarbeiter, setSelectedMitarbeiter] = useState('');
  const [signature, setSignature] = useState('');
  const [customSignature, setCustomSignature] = useState('');
  const [useCustomSignature, setUseCustomSignature] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showSignatureManager, setShowSignatureManager] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const hasGeneratedRef = useRef(false);

  // Mitarbeiter laden (ohne Manuel Wullers)
  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const allMitarbeiter = await base44.entities.Mitarbeiter.filter({ aktiv: true });
      return allMitarbeiter.filter(m => m.name !== 'Manuel Wullers');
    },
    initialData: []
  });

  // Firmeneinstellungen laden
  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const settings = await base44.entities.CompanySettings.list();
      return settings[0] || null;
    }
  });

  // Signatur generieren und Platzhalter im Body ersetzen
  useEffect(() => {
    if (selectedMitarbeiter && companySettings && !useCustomSignature) {
      const mitarbeiter = mitarbeiterList.find(m => m.id === selectedMitarbeiter);
      if (mitarbeiter) {
        // Wenn benutzerdefinierte Signatur existiert, diese verwenden
        const sig = mitarbeiter.signatur || `Mit freundlichen Grüßen\n${mitarbeiter.name}\n${mitarbeiter.abteilung || 'Innendienst'}${mitarbeiter.telefon ? `\nTel.: ${mitarbeiter.telefon}` : ''}\n\nHöhenarbeiten Lassel GmbH\n${companySettings.strasse || '2041 Hetzmannsdorf 25'}\nTel.: ${companySettings.telefon || '0660/8060050'}\nE-Mail: ${companySettings.email || 'office@hoehenarbeiten-lassel.at'}\nInternet: ${companySettings.website || 'www.hoehenarbeiten-lassel.at'}`;
        setSignature(sig);
        
        // Platzhalter im Body durch echte Werte ersetzen
        if (body) {
          let updatedBody = body;
          updatedBody = updatedBody.replace(/\[Ihr Name\]/g, mitarbeiter.name);
          updatedBody = updatedBody.replace(/\[Ihre Position\]/g, mitarbeiter.abteilung || 'Innendienst');
          updatedBody = updatedBody.replace(/\[Ihre Firma\]/g, 'Höhenarbeiten Lassel GmbH');
          updatedBody = updatedBody.replace(/\[Ihre Kontaktdaten\]/g, `Tel.: ${companySettings.telefon || '0660/8060050'}\nE-Mail: ${companySettings.email || 'office@hoehenarbeiten-lassel.at'}`);
          
          if (body !== updatedBody) {
            setBody(updatedBody);
          }
        }
      }
    }
  }, [selectedMitarbeiter, mitarbeiterList, companySettings, useCustomSignature]);



  useEffect(() => {
    if (!open) {
      hasGeneratedRef.current = false;
      setEmailPreview(null);
      setSubject('');
      setBody('');
      setEmailTo('');
      setSignature('');
      setCustomSignature('');
      setUseCustomSignature(false);
      setSelectedMitarbeiter('');
      setShowAiDialog(false);
      setAiPrompt('');
      setAttachments([]);
      return;
    }
    
    // E-Mail-Adresse aus documentData setzen
    if (documentData) {
      const isOffer = documentType === 'offer';
      const email = isOffer ? documentData.emailAngebot : documentData.emailRechnung;
      if (email) {
        setEmailTo(email);
      }
    }

    if (!documentData || hasGeneratedRef.current) {
      return;
    }

    hasGeneratedRef.current = true;
    setGenerating(true);

    const generateEmailPreview = async () => {
      try {
        const isOffer = documentType === 'offer';
        const isPartialPayment = documentType === 'invoice' && sendType === 'partial';
        const docNumber = isOffer ? documentData.angebotNummer : documentData.rechnungsNummer;
        const recipient = isOffer ? documentData.rechnungsempfaengerName : documentData.kundeName;
        const objectName = documentData.objektBezeichnung || 'Ihr Projekt';
        
        if (isPartialPayment) {
          // Teilzahlungen mit Betreff und Body direkt aus der Vorlage generieren
          const firstPartialPayment = documentData.partialPayments?.[0];
          const partialAmount = firstPartialPayment?.betrag || 0;
          const totalAmount = documentData.summeBrutto || 0;
          const partialTitle = firstPartialPayment?.titel || 'Teilzahlung';
          
          const emailBody = `Sehr geehrte Damen und Herren,

anbei finden Sie die Teilzahlungsaufforderung für Rechnung ${docNumber}.

Dies ist eine Teilzahlung für unsere Rechnung:
• Gesamtbetrag der Rechnung: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalAmount)}
• Teilzahlung "${partialTitle}": ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(partialAmount)}

Die Teilzahlung ist dieser E-Mail als PDF angehängt.

Bei Fragen stehe ich Ihnen gerne zur Verfügung.

Vielen Dank für Ihre Aufmerksamkeit.`;

          const generatedSubject = `Teilzahlungsaufforderung zu Rechnung ${docNumber}`;
          setSubject(generatedSubject);
          setBody(emailBody);
          setEmailPreview({
            subject: generatedSubject,
            body: emailBody
          });
        } else {
          const prompt = `Erstelle eine professionelle, freundliche E-Mail auf Deutsch für das Versenden einer Rechnung.

Details:
- Rechnungsnummer: ${docNumber}
- Empfänger: ${recipient}
- Objekt: ${objectName}
- Betrag: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(documentData.summeBrutto || 0)}

Die E-Mail soll:
- Einen professionellen aber freundlichen Ton haben
- Kurz und prägnant sein
- Den Empfänger höflich ansprechen
- Die wichtigsten Informationen enthalten
- Einen Call-to-Action beinhalten (Zahlungshinweis)
- Das Zahlungsziel (${documentData.zahlungszielTage || 14} Tage) erwähnen

Nur den E-Mail-Text generieren, ohne Betreff.`;

          try {
            const response = await base44.integrations.Core.InvokeLLM({
              prompt: prompt,
              add_context_from_internet: false
            });

            const generatedSubject = `${isOffer ? 'Ihr Angebot' : 'Ihre Rechnung'} ${docNumber}`;
            setSubject(generatedSubject);
            setBody(response);
            setEmailPreview({
              subject: generatedSubject,
              body: response
            });
          } catch (aiError) {
            console.error('KI-Generierung fehlgeschlagen:', aiError);
            
            // Fallback: Standard-Template verwenden
            const fallbackSubject = `${isOffer ? 'Ihr Angebot' : 'Ihre Rechnung'} ${docNumber}`;
            const fallbackBody = `Sehr geehrte Damen und Herren,

anbei erhalten Sie ${isOffer ? 'unser Angebot' : 'unsere Rechnung'} ${docNumber} für ${objectName}.

${isOffer 
  ? `Das Angebot ist gültig bis ${documentData.gueltigBis ? new Intl.DateTimeFormat('de-DE').format(new Date(documentData.gueltigBis)) : '30 Tage nach diesem Datum'}.` 
  : `Zahlungsziel: ${documentData.zahlungszielTage || 14} Tage netto.`
}

Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.

Freundliche Grüße`;

            setSubject(fallbackSubject);
            setBody(fallbackBody);
            setEmailPreview({
              subject: fallbackSubject,
              body: fallbackBody
            });

            // Nutzer informieren
            toast.info('KI nicht verfügbar – Standard-Template wird verwendet', {
              description: 'Sie können die Nachricht jederzeit anpassen.',
              duration: 5000
            });
          }
        }
      } catch (error) {
        console.error('Fehler bei E-Mail-Generierung:', error);
        toast.error('Fehler beim Laden der E-Mail');
        setEmailPreview(null);
      } finally {
        setGenerating(false);
      }
    };

    generateEmailPreview();
  }, [open]);

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    const newAttachments = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" ist zu groß (max. 10MB)`);
        continue;
      }
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const base64 = dataUrl.split(',')[1];
          newAttachments.push({ name: file.name, data: base64, mimeType: file.type, previewUrl: dataUrl });
          resolve();
        };
        reader.onerror = () => { toast.error(`Fehler beim Lesen: ${file.name}`); resolve(); };
        reader.readAsDataURL(file);
      });
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    event.target.value = '';
  };

  const handleAiEdit = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Bitte gib eine Anweisung ein');
      return;
    }

    setIsTranscribing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bearbeitest einen E-Mail-Text. Hier ist der aktuelle Text:\n\n${body}\n\nAnweisung des Nutzers: ${aiPrompt}\n\nGib den überarbeiteten E-Mail-Text zurück. Nur den Text, keine Erklärungen.`
      });
      
      setBody(result);
      setShowAiDialog(false);
      setAiPrompt('');
      toast.success('Text mit KI bearbeitet');
    } catch (error) {
      toast.error('Fehler bei der KI-Bearbeitung');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-600" />
            E-Mail Vorschau
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
        {generating ? (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
            <p className="text-slate-500">E-Mail wird generiert...</p>
          </div>
        ) : emailPreview ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Senden an:</label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="empfaenger@beispiel.at"
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">E-Mail-Adresse kann angepasst werden</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Betreff:</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Nachricht:</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[200px] font-sans"
                placeholder="E-Mail-Text..."
              />
              <p className="text-xs text-slate-500 mt-1">{body.length} Zeichen</p>
            </div>

            {/* Signatur */}
             <div>
               <div className="flex items-center justify-between mb-2">
                 <label className="text-sm font-medium text-slate-700">
                   Signatur auswählen: <span className="text-red-500">*</span>
                 </label>
                 <div className="flex gap-2">
                   <Button
                     type="button"
                     size="sm"
                     variant={useCustomSignature ? "default" : "outline"}
                     onClick={() => {
                       setUseCustomSignature(!useCustomSignature);
                       if (!useCustomSignature) {
                         setSignature(customSignature);
                         setSelectedMitarbeiter('');
                       } else {
                         setCustomSignature('');
                       }
                     }}
                     className="h-8 text-xs"
                   >
                     {useCustomSignature ? 'Mitarbeiter verwenden' : 'Eigene Signatur'}
                   </Button>
                   <Button
                     type="button"
                     size="sm"
                     variant="outline"
                     onClick={() => setShowSignatureManager(true)}
                     className="h-8 text-xs"
                     title="Signaturen verwalten"
                   >
                     <Settings className="w-3.5 h-3.5" />
                   </Button>
                 </div>
               </div>
              
              {!useCustomSignature ? (
                <>
                  <Select value={selectedMitarbeiter} onValueChange={setSelectedMitarbeiter} required>
                    <SelectTrigger className={`mb-2 ${!selectedMitarbeiter ? 'border-red-300' : ''}`}>
                      <SelectValue placeholder="Mitarbeiter wählen (Pflichtfeld)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mitarbeiterList.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} {m.abteilung ? `(${m.abteilung})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    className="min-h-[120px] font-sans text-sm"
                    placeholder="Wähle einen Mitarbeiter aus, um die Signatur zu generieren..."
                    readOnly
                  />
                  {!selectedMitarbeiter && (
                    <p className="text-xs text-red-500 mt-1">
                      Signatur ist ein Pflichtfeld
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Textarea
                    value={customSignature}
                    onChange={(e) => {
                      setCustomSignature(e.target.value);
                      setSignature(e.target.value);
                    }}
                    className="min-h-[120px] font-sans text-sm"
                    placeholder="Eigene Signatur eingeben..."
                  />
                  {!customSignature.trim() && (
                    <p className="text-xs text-red-500 mt-1">
                      Signatur ist ein Pflichtfeld
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Anhänge - nur für Angebote */}
            {documentType !== 'invoice' && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                <Paperclip className="w-4 h-4 inline mr-1" />
                Bilder/Anhänge hochladen:
              </label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
              {attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                      {att.mimeType?.startsWith('image/') ? (
                        <img
                          src={att.previewUrl}
                          alt={att.name}
                          className="w-full h-28 object-cover"
                        />
                      ) : (
                        <div className="w-full h-28 flex flex-col items-center justify-center text-slate-400">
                          <Paperclip className="w-8 h-8 mb-1" />
                          <span className="text-xs">PDF</span>
                        </div>
                      )}
                      <div className="px-2 py-1 bg-white border-t border-slate-200">
                        <p className="text-xs text-slate-600 truncate">{att.name}</p>
                      </div>
                      <button
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-white/80 rounded-full p-0.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* KI-Assistent - unten wie im Screenshot */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-900">KI-Assistent</span>
              </div>
              
              <div className="flex gap-2">
                <Input
                  placeholder='z.B. "Beschreibe die Sicherheitsmaßnahmen" oder "Mache den Text formeller"'
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isTranscribing && aiPrompt.trim() && handleAiEdit()}
                  className="flex-1"
                />
                <Button
                  onClick={handleAiEdit}
                  disabled={isTranscribing || !aiPrompt.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generieren'}
                </Button>
              </div>
              
              <p className="text-xs text-slate-600 mt-2">
                💡 Tipp: Gib Befehle ein wie "Schreibe einen professionellen Einleitungstext"
              </p>
            </div>



            {/* Material-Links zum Prüfen - nur für Angebote */}
            {documentType === 'offer' && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    Hier Skizzenfotos nochmal prüfen vor dem Abschicken:
                  </p>
                  {documentData?.Skizzen_Link ? (
                    <a 
                      href={documentData.Skizzen_Link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 underline break-all"
                    >
                      {documentData.Skizzen_Link}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      Kein Skizzenlink vorhanden
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                <strong>Hinweis:</strong> Dies ist eine KI-generierte Vorschau. Die tatsächliche E-Mail wird beim Versenden erstellt.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400">
            Keine Vorschau verfügbar
          </div>
        )}
        </div>

        <DialogFooter className="flex-shrink-0 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button 
            onClick={() => {
              if (!signature || (!useCustomSignature && !selectedMitarbeiter) || (useCustomSignature && !customSignature.trim())) {
                toast.error('Bitte Signatur auswählen oder eingeben');
                return;
              }
              
              // Body und Signatur zusammen als vollständige Nachricht
              const fullBodyHtml = body.replace(/\n/g, '<br>') + '<br><br>' + signature.replace(/\n/g, '<br>');
              
              const emailData = {
                emailTo: emailTo,
                subject: subject,
                bodyHtml: fullBodyHtml,
                employee: useCustomSignature ? null : (mitarbeiterList.find(m => m.id === selectedMitarbeiter)?.name || null),
                pdfHtml: documentData?.pdfHtml || null,
                attachments: attachments
              };
              onConfirm(emailData);
              onOpenChange(false);
            }}
            disabled={isLoading || generating || (!useCustomSignature && !selectedMitarbeiter) || (useCustomSignature && !customSignature.trim())}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Jetzt versenden
          </Button>
        </DialogFooter>
      </DialogContent>

      <SignatureManagerDialog 
        open={showSignatureManager} 
        onOpenChange={setShowSignatureManager} 
      />
    </Dialog>
  );
}