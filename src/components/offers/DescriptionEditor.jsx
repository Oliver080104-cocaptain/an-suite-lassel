import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Mic, Send, Check, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import TemplateManager from './TemplateManager';

export const QUICK_TEMPLATES = [
  { 
    id: 'verputzarbeiten', 
    label: 'Verputzarbeiten', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten
Notwendige Abdeckungen für die Dauer der Arbeiten
Schadhafte Stellen an der hofseitigen Fassade wie in der beiliegenden Skizze, rot markiert, ersichtlich, mittels seilunterstützter Arbeit abschlagen und neu verputzen
Verputzte Stellen so gut es geht farblich angleichen
Abdeckungen nach Fertigstellung der Arbeiten wieder entfernen
Seilabbau nach Durchführung der Arbeiten
Räumen der Baustelle
Entsorgung des Bauschuttes

Das Angebot bezieht sich auf das von Boden aus ersichtliche Schadensausmaß

Wir gehen davon aus, dass die Schadensursache bereits behoben wurde und das Mauerwerk bereits wieder aufgetrocknet ist.
Im Falle eines neuerlichen Auftretens der Schäden, aufgrund nicht behobener Ursachen, ist jede Form der Haftung und Gewährleistung ausgeschlossen.` 
  },
  { 
    id: 'gesimse', 
    label: 'Gesimse', 
    text: `Einrichten der Baustelle
Notwendige Abdeckungen vornehmen
Schadhafte Stellen an dem straßenseitigen Gesimse wie in den beiliegenden Skizzen blau markiert, mittels Steighilfen großflächig netzen und verspachten
Verputzte Stellen farblich angleichen
Abdeckungen wieder entfernen
Räumen der Baustelle
Entsorgen des Bauschutts` 
  },
  { 
    id: 'dachziegel', 
    label: 'Dachziegel tauschen', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten
Ersetzen von gebrochenen Dachziegeln wie in den beiliegenden Skizzen gelb markiert ersichtlich
Seilabbau nach Fertigstellung der Arbeiten
Räumen der Baustelle
Inkl. An- und Abfahrt
Inkl. Material` 
  },
  { 
    id: 'verblechung', 
    label: 'Rostige Verblechung', 
    text: `Einrichten der Baustelle
Rostige Stellen an den Verblechungen anschleifen und mit Rostschutzfarbe einmalig grundieren
Nach entsprechender Trocknungszeit zweimalig Streichen
Räumen der Baustelle` 
  },
  { 
    id: 'bewuchs', 
    label: 'Bewuchs entfernen', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten durchführen
Bewuchs an der Fassade wie in den beiliegenden Skizzen rot markiert ersichtlich, mittels seilunterstützter Arbeit entfernen
Seilabbau nach Durchführung der Arbeiten
Räumen der Baustelle
Entsorgung des Grünschnittes
Da es vorkommen kann, dass Stränge, die wieder rückläufig zur Fassade gehen, durchgetrennt werden, können wir keine Haftung für abgestorbene Äste, Stränge oder Bewuchsflächen übernehmen.` 
  },
  { 
    id: 'taubenabwehr_reparatur', 
    label: 'Instandsetzung Taubenabwehr', 
    text: `Einrichten der Baustelle
Vorhandenes beschädigtes Taubennetz wie in den beiliegenden Skizzen, blau markiert, ersichtlich mittels Steighilfen wieder in Stand setzen.
Räumen der Baustelle` 
  },
  { 
    id: 'taubenspitzen', 
    label: 'Taubenspitzen', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten
Die zu beklebenden Stellen reinigen
Taubenabwehrspitzen wie in den beiliegenden Skizzen rot markiert mittels seilunterstützter Arbeit kleben
Seilabbau nach Fertigstellung der Arbeiten
Räumen der Baustelle` 
  },
  { 
    id: 'taubenabwehr_balkon', 
    label: 'Taubenabwehr Balkon', 
    text: `Einrichten der Baustelle
Reinigung und Desinfektion des gesamten Balkons wie in den beiliegenden Skizzen grünmarkiert ersichtlich
Taubenabwehrspiralen wie in den beiliegenden Skizzen gelb markiert ersichtlich, mittels Steighilfen kleben
Räumen der Baustelle` 
  },
  { 
    id: 'taubennetz_neu', 
    label: 'Taubennetz demontieren/neu', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten durchführen
Vorhandenes, beschädigtes Taubennetz, wie in den beiliegenden Skizzen grün markiert ersichtlich, mittels seilunterstützter Arbeit demontieren und ein neues Taubennetz montieren
Seilabbau nach Durchführung der Arbeiten
Räumen der Baustelle` 
  },
  { 
    id: 'dachrinne_flachdach', 
    label: 'Dachrinne + Flachdach', 
    text: `Dachrinnenreinigung am gesamten Objekt durchführen
Fallrohre kontrollieren und die Sinkkörbe, falls vorhanden, entleeren
Flachdach kontrollieren und falls vorhanden, höheren Bewuchs entfernen
Entsorgung des Bewuchses
Wassereinlässe am Flachdach kontrollieren und reinigen` 
  },
  { 
    id: 'dachrinne', 
    label: 'Dachrinnenreinigung', 
    text: `Dachrinnenreinigung am gesamten Objekt durchführen
Fallrohre kontrollieren und die Sinkkörbe, falls vorhanden, entleeren` 
  },
  { 
    id: 'fixverglasung', 
    label: 'Reinigung Fixverglasung', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten durchführen
Fixverglasungen samt Rahmen mittels seilunterstützter Arbeit an der Außenseite reinigen
Seilabbau nach Durchführung der Arbeiten
Räumen der Baustelle` 
  },
  { 
    id: 'spechtloecher', 
    label: 'Spechtlöcher', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten durchführen
Spechtlöcher in der Wärmedämmfassade wie in den beiliegenden Skizzen rot markiert, mittels seilunterstützter Arbeit mit Dämmmaterial wieder auffüllen
Ausgefüllte Spechtlöcher werden mittels seilunterstützter Arbeit verputzt
Anfertigung, Lieferung und Montage von zwei Spechtwinkelblechen (ca. 2x10 lfm Ecke 25x25 cm) über die verputzten Spechtlöcher
Die Spechtwinkelbleche werden über die gesamte Länge von EG bis DG montiert
Seilabbau nach Fertigstellung der Arbeiten
Räumen der Baustelle` 
  },
  { 
    id: 'fluessigkunststoff', 
    label: 'Flüssigkunststoff', 
    text: `Einrichten der Baustelle
Seilaufbau für die Dauer der Arbeiten
Mangelhafte Abdichtungen wie in den beiliegenden Skizzen rot markiert mittels seilunterstützter Arbeit vorbehandeln und mittels Flüssigkunststoff abdichten
Seilabbau nach Fertigstellung der Arbeiten
Räumen der Baustelle` 
  }
];

export default function DescriptionEditor({ open, onOpenChange, value, onSave, title = "Beschreibung bearbeiten" }) {
  const [text, setText] = useState(value || '');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  const { data: customTemplates = [] } = useQuery({
    queryKey: ['descriptionTemplates'],
    queryFn: () => base44.entities.DescriptionTemplate.list('sortierung'),
    enabled: open
  });

  const handleSave = () => {
    onSave(text);
    onOpenChange(false);
  };

  const handleTemplateAdd = (templateText) => {
    setText(prev => {
      const newText = prev ? `${prev}\n\n${templateText}` : templateText;
      return newText;
    });
    toast.success('Text hinzugefügt');
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Bitte gib eine Anweisung ein');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Erstelle eine KURZE, stichpunktartige Baustellenbeschreibung für ein Angebot.

WICHTIG: Halte die Beschreibung SEHR KURZ und in Stichpunkten!

Struktur:
- Baustelle einrichten.
- [2-4 kurze, konkrete Arbeitspunkte - maximal 1 Zeile pro Punkt]
- Baustelle räumen.

Basierend auf: "${aiPrompt}"

Beispiel für gewünschte Kürze:
- Baustelle einrichten.
- Reinigung des Werbeschildes.
- Taubenabwehrspitzen wie in den beigelegten Skizzen rot markiert vollflächig auf der Oberseite des Werbeschildes mittels Steighilfen kleben.
- Baustelle räumen.

Keine langen Erklärungen, keine Details zu Sicherheit oder Ablauf. Nur die konkreten Arbeitsschritte.`,
        add_context_from_internet: false
      });

      setText(response);
      setAiPrompt('');
      toast.success('KI-Text generiert');
    } catch (error) {
      toast.error('KI-Fehler: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoiceInput = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Spracheingabe wird in diesem Browser nicht unterstützt');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      toast.info('Sprich jetzt...');
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      
      // Transkribiertes direkt als Prompt verwenden
      setAiPrompt(transcript);
      toast.success('Aufgenommen: ' + transcript);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      toast.error('Fehler bei Spracheingabe: ' + event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Haupt-Textfeld */}
          <div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Beschreibung eingeben..."
              className="min-h-[300px] text-base"
            />
            <div className="text-xs text-slate-500 mt-1">
              {text.length} Zeichen
            </div>
          </div>

          {/* Quick Templates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Schnellvorlagen
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplateManager(true)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                <Settings className="w-3 h-3 mr-1" />
                Vorlagen verwalten
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Eigene Vorlagen zuerst */}
              {customTemplates.map(template => (
                <Button
                  key={template.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleTemplateAdd(template.text)}
                  className="text-xs bg-blue-50 border-blue-200 hover:bg-blue-100"
                >
                  {template.name}
                </Button>
              ))}
              {/* Standard-Vorlagen */}
              {QUICK_TEMPLATES.map(template => (
                <Button
                  key={template.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleTemplateAdd(template.text)}
                  className="text-xs"
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>

          <TemplateManager open={showTemplateManager} onOpenChange={setShowTemplateManager} />

          {/* KI-Assistent */}
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              KI-Assistent
            </h3>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="z.B. 'Beschreibe die Sicherheitsmaßnahmen' oder 'Mache den Text formeller'"
                className="flex-1 bg-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAiGenerate();
                  }
                }}
              />
              <Button
                onClick={handleVoiceInput}
                variant="outline"
                size="icon"
                disabled={isListening}
                className={isListening ? 'bg-red-100 border-red-300' : ''}
              >
                {isListening ? (
                  <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
              <Button
                onClick={handleAiGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Generieren
              </Button>
            </div>
            <div className="mt-2 text-xs text-slate-600">
              💡 Tipp: Nutze die Spracheingabe für schnelle Eingaben oder gib Befehle ein wie "Schreibe einen professionellen Einleitungstext"
            </div>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}