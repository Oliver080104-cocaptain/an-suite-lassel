import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export default function ParksperreDialog({ open, onOpenChange, onConfirm, isLoading, offerData }) {
  const [emailData, setEmailData] = useState({
    emailTo: 'post@ma46.wien.gv.at',
    subject: '',
    body: '',
    employee: ''
  });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: () => base44.entities.Mitarbeiter.filter({ aktiv: true }, 'name')
  });

  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const settings = await base44.entities.CompanySettings.list();
      return settings[0] || {};
    }
  });

  useEffect(() => {
    if (open) {
      generateInitialEmail();
    }
  }, [open]);

  // Signatur aktualisieren wenn Mitarbeiter gewählt wird
  useEffect(() => {
    if (emailData.employee && emailData.body) {
      updateSignature();
    }
  }, [emailData.employee]);

  const generateInitialEmail = async () => {
    setGenerating(true);
    try {
      const objektInfo = offerData?.objektBezeichnung || 'Bauprojekt';
      const dienstleistung = offerData?.positions?.[0]?.produktName || 'Arbeiten';
      
      const emailBody = await base44.integrations.Core.InvokeLLM({
        prompt: `Erstelle eine höfliche, professionelle E-Mail auf Deutsch an die MA 48 Wien mit der Bitte um Genehmigung einer Parkraumsperre.

Informationen:
- Objekt/Baustelle: ${objektInfo}
- Art der Arbeiten: ${dienstleistung}
- Es werden Screenshots beigefügt, die zeigen wo das Gerüst aufgebaut wird

Struktur der E-Mail:
- "Sehr geehrte Damen und Herren,"
- Direkt zum Punkt: Antrag auf Parkraumsperre im Zuge von [Dienstleistung] am Objekt [Objektbezeichnung]
- Erwähne dass beigefügte Screenshots zeigen, wo genau das Gerüst aufgebaut wird
- Bitte um Rückmeldung bezüglich Details und Genehmigung
- Freundlicher Abschluss "Vielen Dank für Ihre Unterstützung."

WICHTIG: 
- Kurz und präzise (max. 6-7 Zeilen)
- Sehr höflich und professionell
- Komme direkt auf den Punkt, keine lange Vorstellung
- KEINE Grußformel am Ende (kein "Mit freundlichen Grüßen" etc.)

NUR DER E-MAIL TEXT, keine Betreffzeile!`,
        add_context_from_internet: false
      });

      const subject = `Antrag auf Parkraumsperre für ${objektInfo}`;

      setEmailData(prev => ({
        ...prev,
        subject,
        body: emailBody
      }));
    } catch (error) {
      toast.error('Fehler beim Generieren der E-Mail');
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const updateSignature = () => {
    const mitarbeiter = mitarbeiterList.find(m => m.name === emailData.employee);
    if (!mitarbeiter) return;

    const signature = mitarbeiter?.email 
      ? `\n\nMit freundlichen Grüßen\n${emailData.employee}\n${companySettings?.firmenname || 'Lassel GmbH'}\nTel: ${companySettings?.telefon || ''}\nE-Mail: ${mitarbeiter.email}`
      : `\n\nMit freundlichen Grüßen\n${emailData.employee}\n${companySettings?.firmenname || 'Lassel GmbH'}`;

    // Entferne alte Signatur falls vorhanden
    let bodyWithoutSignature = emailData.body;
    const signatureStart = bodyWithoutSignature.indexOf('\n\nMit freundlichen Grüßen');
    if (signatureStart !== -1) {
      bodyWithoutSignature = bodyWithoutSignature.substring(0, signatureStart);
    }

    setEmailData(prev => ({
      ...prev,
      body: bodyWithoutSignature + signature
    }));
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (uploadedFiles.length + files.length > 3) {
      toast.error('Maximal 3 Screenshots erlaubt');
      return;
    }

    setUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        return { name: file.name, url: file_url };
      });

      const newFiles = await Promise.all(uploadPromises);
      setUploadedFiles(prev => [...prev, ...newFiles]);
      toast.success(`${newFiles.length} Datei(en) hochgeladen`);
    } catch (error) {
      toast.error('Fehler beim Hochladen');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!emailData.body.trim() || !emailData.subject.trim()) {
      toast.error('Betreff und Nachricht sind erforderlich');
      return;
    }

    if (!emailData.employee) {
      toast.error('Bitte wähle einen Mitarbeiter aus');
      return;
    }

    onConfirm({
      ...emailData,
      bodyHtml: emailData.body,
      attachments: uploadedFiles
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Parksperre beantragen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Empfänger</Label>
            <Input
              value={emailData.emailTo}
              onChange={(e) => setEmailData({ ...emailData, emailTo: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Betreff</Label>
            <Input
              value={emailData.subject}
              onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Nachricht</Label>
            {generating ? (
              <div className="mt-1 flex items-center justify-center border rounded-md h-48 bg-slate-50">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <Textarea
                value={emailData.body}
                onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
                className="mt-1 min-h-[200px]"
              />
            )}
          </div>

          <div>
            <Label>Screenshots (max. 3)</Label>
            <div className="mt-2 space-y-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded border">
                  <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveFile(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {uploadedFiles.length < 3 && (
                <label className="flex items-center justify-center w-full p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  ) : (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Upload className="w-5 h-5" />
                      <span className="text-sm">Screenshots hochladen ({uploadedFiles.length}/3)</span>
                    </div>
                  )}
                </label>
              )}
            </div>
          </div>

          <div>
            <Label>Mitarbeiter (Absender)</Label>
            <Select
              value={emailData.employee}
              onValueChange={(value) => setEmailData({ ...emailData, employee: value })}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || generating}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              'Antrag absenden'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}