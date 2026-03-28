import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ProductImport({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
      
      if (rows.length < 2) {
        toast.error('CSV-Datei ist leer oder ungültig');
        return;
      }

      const headers = rows[0];
      const data = rows.slice(1).filter(row => row.length > 1 && row[0]).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });

      setPreview(data);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview || preview.length === 0) return;

    setImporting(true);
    try {
      let created = 0;
      let updated = 0;

      for (const row of preview) {
        const productData = {
          produktName: row.Produktname || row.produktName || row.name,
          artikelnummer: row['Eintrag-ID'] || row.artikelnummer,
          produktKategorie: row['Produkt Kategorie'] || row.produktKategorie || row.kategorie,
          produkttyp: row.produkttyp || 'dienstleistung',
          einheit: row.Einheit || row.einheit || 'Stk',
          standardpreisNetto: parseFloat(row.standardpreisNetto || row.preis) || 0,
          steuersatz: parseFloat(row.steuersatz || row.mwst) || 20,
          steuerpflichtig: (row['Produkt Aktiv'] || row.aktiv) !== 'false',
          aktiv: (row['Produkt Aktiv'] || row.aktiv) !== 'false',
          beschreibung: row.Beschreibung || row.beschreibung || ''
        };

        if (!productData.produktName) continue;

        // Prüfen ob Produkt bereits existiert (anhand Artikelnummer oder Name)
        const existingProducts = await base44.entities.Product.list();
        const existing = existingProducts.find(p => 
          (productData.artikelnummer && p.artikelnummer === productData.artikelnummer) ||
          p.produktName === productData.produktName
        );

        if (existing) {
          await base44.entities.Product.update(existing.id, productData);
          updated++;
        } else {
          await base44.entities.Product.create(productData);
          created++;
        }
      }

      queryClient.invalidateQueries(['products']);
      toast.success(`Import erfolgreich: ${created} erstellt, ${updated} aktualisiert`);
      onOpenChange(false);
      setPreview(null);
    } catch (error) {
      toast.error('Import fehlgeschlagen: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = `Eintrag-ID,Produktname,Produkt Aktiv,Produkt Kategorie,Einheit,Beschreibung
ART-001,Beispielprodukt,true,Dienstleistungen,Std,Beispielbeschreibung`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'produkte_vorlage.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Produkte importieren (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-blue-900 mb-2">CSV-Format:</p>
            <p className="text-blue-700">
              Die CSV-Datei sollte folgende Spalten enthalten: Eintrag-ID, Produktname, 
              Produkt Aktiv, Produkt Kategorie, Einheit, Beschreibung
            </p>
          </div>

          <Button variant="outline" onClick={downloadTemplate} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Vorlage herunterladen
          </Button>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
            <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
            <label className="cursor-pointer">
              <span className="text-sm text-slate-600">
                CSV-Datei auswählen oder hier ablegen
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {preview && (
            <div>
              <h3 className="font-semibold mb-2">Vorschau ({preview.length} Produkte)</h3>
              <div className="border rounded-lg overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Artikel-Nr.</th>
                      <th className="px-3 py-2 text-left">Preis</th>
                      <th className="px-3 py-2 text-left">Einheit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2">{row.Produktname || row.produktName || row.name}</td>
                        <td className="px-3 py-2">{row['Eintrag-ID'] || row.artikelnummer}</td>
                        <td className="px-3 py-2">{row.standardpreisNetto || row.preis || '-'}</td>
                        <td className="px-3 py-2">{row.Einheit || row.einheit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <div className="text-xs text-slate-500 text-center py-2 bg-slate-50">
                    ... und {preview.length - 10} weitere
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={!preview || importing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importiere...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Importieren
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}