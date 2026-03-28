import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import PageHeader from '../components/shared/PageHeader';
import { base44 } from '@/api/base44Client';

export default function RustlerUpload() {
  const [file, setFile] = useState(null);
  const [ticketNumber, setTicketNumber] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Prüfen ob es eine PDF-Datei ist
      if (selectedFile.type === 'application/pdf' || selectedFile.name.match(/\.pdf$/i)) {
        setFile(selectedFile);
        setUploadSuccess(false);
      } else {
        toast.error('Bitte nur PDF-Dateien hochladen');
        e.target.value = '';
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      toast.error('Bitte wählen Sie eine Datei aus');
      return;
    }

    if (!ticketNumber.trim()) {
      toast.error('Bitte geben Sie eine Ticketnummer ein');
      return;
    }

    setUploading(true);
    try {
      // Datei zuerst zu Base44 hochladen
      console.log('Starte Datei-Upload...');
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      console.log('Datei hochgeladen:', file_url);
      
      // Datei-URL an n8n Webhook senden
      const webhookPayload = {
        fileName: file.name,
        fileUrl: file_url,
        fileSize: file.size,
        ticketNumber: ticketNumber.trim(),
        uploadedAt: new Date().toISOString(),
        source: 'rustler_upload'
      };

      console.log('Sende Webhook mit Payload:', webhookPayload);
      
      const response = await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/e41b0145-a4cd-4070-bed9-6a043a5cecf8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });

      console.log('Webhook Response Status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Webhook Error Response:', errorText);
        throw new Error(`Webhook-Fehler: ${response.status}`);
      }

      console.log('Webhook erfolgreich aufgerufen');
      toast.success('Rustler-Sheet erfolgreich hochgeladen und verarbeitet');
      setUploadSuccess(true);
      setFile(null);
      setTicketNumber('');
      
      // Input zurücksetzen
      const fileInput = document.getElementById('rustler-file-input');
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error('Vollständiger Upload-Fehler:', error);
      toast.error('Fehler beim Upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Rustler-Sheet Upload"
          subtitle="PDF-Dateien von Rustler Hausverwaltung hochladen und verarbeiten"
        />

        <div className="grid grid-cols-1 gap-6">
          <Card className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Neues Rustler-Sheet hochladen</h2>
                <p className="text-sm text-slate-500">PDF-Datei auswählen und hochladen</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
               <div>
                 <Label htmlFor="ticket-number" className="text-base mb-2 block">
                   Ticketnummer
                 </Label>
                 <Input
                   id="ticket-number"
                   type="text"
                   placeholder="z.B. TKT-2024-00123"
                   value={ticketNumber}
                   onChange={(e) => setTicketNumber(e.target.value)}
                   className="mb-6"
                 />
               </div>

               <div>
                 <Label htmlFor="rustler-file-input" className="text-base mb-3 block">
                   PDF-Datei auswählen
                 </Label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input
                      id="rustler-file-input"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
                {file && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-slate-700">{file.name}</span>
                      <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  </div>
                )}
              </div>

              {uploadSuccess && (
                <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    Upload erfolgreich! Die Datei wird jetzt automatisch verarbeitet.
                  </span>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                    type="submit"
                    disabled={!file || !ticketNumber.trim() || uploading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Hochladen & Verarbeiten
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ Hinweise</h3>
            <ul className="text-sm text-blue-800 space-y-1.5">
              <li>• Nur PDF-Dateien werden akzeptiert</li>
              <li>• Die Datei wird automatisch an n8n zur Verarbeitung gesendet</li>
              <li>• Rustler-Sheets werden automatisch in Angebote umgewandelt</li>
            </ul>
          </Card>

          <Card className="p-6 bg-orange-50 border-orange-200">
            <h3 className="text-sm font-semibold text-orange-900 mb-2">⚠️ Wichtig</h3>
            <p className="text-sm text-orange-800">
              Achtung im Zoho CRM System muss es diese Gasse bereits angelegt geben (Kunden)!
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}