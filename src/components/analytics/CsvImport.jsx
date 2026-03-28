import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function CsvImport({ onImport }) {
  const [importing, setImporting] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        // Skip header
        const dataLines = lines.slice(1);
        
        const data = dataLines.map(line => {
          const [monatsumsatz, monat, offeneForderungen] = line.split(',').map(v => v.trim().replace(/"/g, ''));
          return {
            monatsumsatz: parseFloat(monatsumsatz) || 0,
            monat: monat,
            offeneForderungen: parseFloat(offeneForderungen) || 0
          };
        });

        onImport(data);
        toast.success(`${data.length} Datensätze importiert`);
      } catch (error) {
        toast.error('Fehler beim Importieren: ' + error.message);
      } finally {
        setImporting(false);
        e.target.value = null;
      }
    };

    reader.readAsText(file);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">CSV Import</h3>
          <p className="text-sm text-slate-500 mt-1">
            Format: Monatsumsatz, Monat, Offene Forderungen
          </p>
        </div>
        <FileSpreadsheet className="w-8 h-8 text-slate-400" />
      </div>
      
      <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
        <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-600 mb-4">CSV-Datei hier ablegen oder auswählen</p>
        <label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            disabled={importing}
          />
          <Button variant="outline" disabled={importing} className="cursor-pointer" asChild>
            <span>{importing ? 'Importiere...' : 'Datei auswählen'}</span>
          </Button>
        </label>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        <p className="font-semibold mb-2">Beispiel CSV-Format:</p>
        <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto">
{`Monatsumsatz,Monat,Offene Forderungen
150000,Januar,25000
180000,Februar,30000`}
        </pre>
      </div>
    </Card>
  );
}