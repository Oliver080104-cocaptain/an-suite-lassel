import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function SignatureManagerDialog({ open, onOpenChange }) {
  const [selectedMitarbeiterId, setSelectedMitarbeiterId] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: mitarbeiterList = [], refetch: refetchMitarbeiter } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const allMitarbeiter = await base44.entities.Mitarbeiter.filter({ aktiv: true });
      return allMitarbeiter.filter(m => m.name !== 'Manuel Wullers');
    },
    initialData: []
  });

  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const settings = await base44.entities.CompanySettings.list();
      return settings[0] || null;
    }
  });

  // Signatur generieren wenn Mitarbeiter ausgewählt wird
  useEffect(() => {
    if (selectedMitarbeiterId && companySettings) {
      const mitarbeiter = mitarbeiterList.find(m => m.id === selectedMitarbeiterId);
      if (mitarbeiter) {
        // Wenn benutzerdefinierte Signatur existiert, diese verwenden
        if (mitarbeiter.signatur) {
          setSignatureText(mitarbeiter.signatur);
        } else {
          // Sonst Standard-Signatur generieren
          const sig = `Mit freundlichen Grüßen\n${mitarbeiter.name}\n${mitarbeiter.abteilung || 'Innendienst'}${mitarbeiter.telefon ? `\nTel.: ${mitarbeiter.telefon}` : ''}\n\nHöhenarbeiten Lassel GmbH\n${companySettings.strasse || '2041 Hetzmannsdorf 25'}\nTel.: ${companySettings.telefon || '0660/8060050'}\nE-Mail: ${companySettings.email || 'office@hoehenarbeiten-lassel.at'}\nInternet: ${companySettings.website || 'www.hoehenarbeiten-lassel.at'}`;
          setSignatureText(sig);
        }
      }
    }
  }, [selectedMitarbeiterId, companySettings, mitarbeiterList]);

  const handleSave = async () => {
    if (!selectedMitarbeiterId || !signatureText.trim()) {
      toast.error('Bitte Mitarbeiter und Signaturtext ausfüllen');
      return;
    }

    setIsSaving(true);
    try {
      const mitarbeiter = mitarbeiterList.find(m => m.id === selectedMitarbeiterId);
      await base44.entities.Mitarbeiter.update(selectedMitarbeiterId, {
        signatur: signatureText
      });
      
      queryClient.invalidateQueries({ queryKey: ['mitarbeiter'] });
      await refetchMitarbeiter();
      toast.success(`Signatur für ${mitarbeiter.name} gespeichert`);
    } catch (error) {
      toast.error('Fehler beim Speichern der Signatur');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (selectedMitarbeiterId && companySettings) {
      const mitarbeiter = mitarbeiterList.find(m => m.id === selectedMitarbeiterId);
      if (mitarbeiter) {
        const sig = `Mit freundlichen Grüßen\n${mitarbeiter.name}\n${mitarbeiter.abteilung || 'Innendienst'}${mitarbeiter.telefon ? `\nTel.: ${mitarbeiter.telefon}` : ''}\n\nHöhenarbeiten Lassel GmbH\n${companySettings.strasse || '2041 Hetzmannsdorf 25'}\nTel.: ${companySettings.telefon || '0660/8060050'}\nE-Mail: ${companySettings.email || 'office@hoehenarbeiten-lassel.at'}\nInternet: ${companySettings.website || 'www.hoehenarbeiten-lassel.at'}`;
        setSignatureText(sig);
        toast.success('Signatur zurückgesetzt');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Signaturen verwalten</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="mitarbeiter">Mitarbeiter auswählen</Label>
            <Select value={selectedMitarbeiterId} onValueChange={setSelectedMitarbeiterId}>
              <SelectTrigger id="mitarbeiter" className="mt-1">
                <SelectValue placeholder="Mitarbeiter wählen..." />
              </SelectTrigger>
              <SelectContent>
                {mitarbeiterList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} {m.abteilung ? `(${m.abteilung})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMitarbeiterId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="signature">Signaturtext</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-xs"
                >
                  Zurücksetzen
                </Button>
              </div>
              <Textarea
                id="signature"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                placeholder="Signaturtext bearbeiten..."
              />
              <p className="text-xs text-slate-500 mt-1">{signatureText.length} Zeichen</p>
            </div>
          )}

          {!selectedMitarbeiterId && (
            <div className="text-center py-8 text-slate-500">
              Wählen Sie einen Mitarbeiter aus, um die Signatur zu bearbeiten
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSaving || !selectedMitarbeiterId || !signatureText.trim()}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}