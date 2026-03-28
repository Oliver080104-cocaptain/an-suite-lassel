import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function DeliveryNoteAssignment() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast.error('Bitte laden Sie nur PDF-Dateien hoch');
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Bitte laden Sie zunächst einen Lieferschein hoch');
      return;
    }

    if (!ticketNumber.trim()) {
      toast.error('Bitte geben Sie eine Ticketnummer ein');
      return;
    }

    setLoading(true);

    try {
      // Schritt 1: PDF über Base44 hochladen, um URL zu erhalten
      toast.success('PDF wird hochgeladen...');
      const uploadResponse = await base44.integrations.Core.UploadFile({ file });
      const pdfUrl = uploadResponse.file_url;

      // Schritt 2: FormData mit Datei, URL und Ticketnummer zur Webhook schicken
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pdfUrl', pdfUrl);
      formData.append('ticketNumber', ticketNumber.trim());

      const response = await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fb90b972-45fd-4762-bbea-cdec7543f6de', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
         toast.success('Lieferschein erfolgreich hochgeladen');
         setFile(null);
         setFileName('');
         setTicketNumber('');
         // Input-Element zurücksetzen
         const fileInput = document.getElementById('pdf-upload');
         if (fileInput) fileInput.value = '';
       } else {
         toast.error('Fehler beim Hochladen des Lieferscheins');
       }
    } catch (error) {
      toast.error('Fehler beim Hochladen: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Lieferschein Zuweisung</CardTitle>
            <CardDescription>Laden Sie einen Lieferschein (PDF) hoch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Ticket Number */}
            <div className="space-y-2">
              <Label htmlFor="ticket-number" className="text-base font-semibold">
                Ticketnummer
              </Label>
              <Input
                id="ticket-number"
                type="text"
                placeholder="z.B. TKT-2024-00123"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
              />
            </div>

            {/* File Upload */}
            <div className="space-y-4">
              <Label htmlFor="pdf-upload" className="text-base font-semibold">
                Lieferschein PDF hochladen
              </Label>
              <div className="flex items-center gap-4">
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="pdf-upload"
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">PDF auswählen</span>
                </label>
                {fileName && (
                  <span className="text-sm text-slate-600">
                    {fileName}
                  </span>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              className="w-full bg-orange-600 hover:bg-orange-700"
              disabled={!file || loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? 'Wird hochgeladen...' : 'Lieferschein hochladen'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}