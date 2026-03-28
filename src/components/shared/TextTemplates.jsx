import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, ChevronDown, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TEMPLATES = {
  offer: [
    { 
      label: "Standard Abschluss", 
      text: "Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung. Wir bedanken uns sehr für Ihr Vertrauen. Mit freundlichen Grüßen"
    },
    { 
      label: "Zusammenarbeit", 
      text: "Gerne stehen wir Ihnen für weitere Informationen zur Verfügung. Wir freuen uns auf eine gute Zusammenarbeit. Mit freundlichen Grüßen"
    },
    { 
      label: "Kurz & Knapp", 
      text: "Bei Fragen können Sie uns jederzeit kontaktieren. Wir danken Ihnen für Ihr Interesse. Mit freundlichen Grüßen"
    }
  ],
  invoice: [
    { 
      label: "Standard Zahlungshinweis", 
      text: "Zahlbar innerhalb von 30 Tagen ohne Abzug. Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.\nMit freundlichen Grüßen"
    },
    { 
      label: "30 Tage netto + neue Bankverbindung", 
      text: "Zahlungsbedingungen: Zahlung innerhalb von 30 Tagen ab Rechnungseingang ohne Abzüge.\nAchtung neue Bankverbindung\nVolksbank    AT454300048406028000"
    },
    { 
      label: "Reverse Charge: ICM Immobilien + neue Bank", 
      text: "Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger, die Firma ICM Immobilien– ATU 65581337– über.\nAchtung neue Bankverbindung\nVolksbank    AT454300048406028000"
    },
    { 
      label: "Skonto: 3% bei 14 Tagen", 
      text: "Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.\nZahlungsbedingung:\ninnerhalb von 14 Tagen 3 % Skonto innerhalb von 30 Tagen ohne Abzug"
    },
    { 
      label: "Reverse Charge: Belfor Austria", 
      text: "Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger, die Firma Belfor Austria GmbH,- ATU14512400- über."
    },
    { 
      label: "Skonto 3% bei 14 Tagen (kurz)", 
      text: "Zahlungsbedingung: innerhalb von 14 Tagen 3 % Skonto\n                                  innerhalb von 30 Tagen ohne Abzug"
    },
    { 
      label: "Reverse Charge: Aquatech", 
      text: "Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger, die Firma Aquatech GmbH,- ATU63197711- über."
    },
    { 
      label: "Reverse Charge: LDS Lederer", 
      text: "Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger, die Fa. LDS Lederer Gebäudereinigung GmbH- ATU16024503- über"
    },
    { 
      label: "Reverse Charge: Purissima", 
      text: "Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger, der Firma Purissima GmbH ATU 46686206 über."
    },
    { 
      label: "Reverse Charge: SW Painting", 
      text: "Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger, die Firma SW Painting GmbH, über."
    }
  ]
};

export default function TextTemplates({ type = 'offer', value, onChange }) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const textareaRef = React.useRef(null);
  const queryClient = useQueryClient();

  const { data: customTemplates = [] } = useQuery({
    queryKey: ['closingTextTemplates', type],
    queryFn: () => base44.entities.ClosingTextTemplate.filter({ type }, 'sortierung', 100)
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ClosingTextTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['closingTextTemplates']);
      setDialogOpen(false);
      setNewLabel('');
      setNewText('');
    }
  });

  const standardTemplates = TEMPLATES[type] || TEMPLATES.offer;
  const allTemplates = [...standardTemplates, ...customTemplates.map(t => ({ label: t.label, text: t.text }))];

  const insertTemplate = (template) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange((value || '') + '\n\n' + template);
      setOpen(false);
      return;
    }

    const cursorPosition = textarea.selectionStart || 0;
    const currentValue = value || '';
    const textBefore = currentValue.substring(0, cursorPosition);
    const textAfter = currentValue.substring(cursorPosition);
    const newText = textBefore + template + textAfter;
    
    onChange(newText);
    setOpen(false);
    
    // Cursor nach eingefügtem Text setzen
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        cursorPosition + template.length,
        cursorPosition + template.length
      );
    }, 0);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Fußzeile
        </h3>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
              Weitere Vorlagen
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-2 max-h-96 overflow-y-auto">
            <div className="space-y-1">
              {allTemplates.map((template, idx) => (
                <Button
                  key={idx}
                  variant="ghost"
                  size="sm"
                  onClick={() => insertTemplate(template.text)}
                  className="w-full text-left justify-start text-xs h-auto py-2 px-3 hover:bg-slate-100"
                >
                  <div className="w-full">
                    <div className="font-semibold text-slate-900 mb-1">{template.label}</div>
                    <div className="line-clamp-2 text-slate-600 leading-relaxed">{template.text}</div>
                  </div>
                </Button>
              ))}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-auto py-2 px-3 mt-2 border-dashed"
                  >
                    <Plus className="w-3 h-3 mr-2" />
                    Neue Vorlage hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Neue Vorlage hinzufügen</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Bezeichnung</label>
                      <Input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="z.B. Skonto 3% bei 14 Tagen"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Vorlagentext</label>
                      <Textarea
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="Text der Vorlage..."
                        rows={8}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        Abbrechen
                      </Button>
                      <Button
                        onClick={() => createMutation.mutate({ label: newLabel, text: newText, type })}
                        disabled={!newLabel || !newText || createMutation.isPending}
                      >
                        {createMutation.isPending ? 'Speichern...' : 'Speichern'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <Textarea
        ref={textareaRef}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="text-xs"
        placeholder="Text für Angebot/Rechnung..."
      />
    </Card>
  );
}