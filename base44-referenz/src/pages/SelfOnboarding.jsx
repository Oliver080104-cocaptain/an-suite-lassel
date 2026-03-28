import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Loader2, CheckCircle2 } from 'lucide-react';
import moment from 'moment';

const SERVICES = [
  'Taubenabwehr',
  'Verputzarbeiten',
  'Dachrinnenreinigung',
  'Dachsicherungssystem',
  'Fensterreinigung',
  'Bewuchsentfernung',
  'Baumschnitt',
  'Dachübersteigung',
  'Streicharbeiten (Verblechungen)',
  'Streicharbeiten (Fassaden)',
  'Flüssigkeitkunststoff',
  'Montagearbeiten',
  'Diverse Dienstleistungen'
];

const CUSTOMER_TYPES = [
  'Privatperson',
  'Hausverwaltung',
  'Genossenschaft',
  'Baufirma'
];

const generateTicketNumber = () => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const datePart = d.getFullYear().toString() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  const randomPart = Math.floor(Math.random() * 90000) + 10000;
  return datePart + randomPart;
};

export default function SelfOnboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [formData, setFormData] = useState({
    // Stammdaten
    vorname: '',
    nachname: '',
    email: '',
    telefon: '',
    
    // Rechnungsanschrift
    rechnung_an_hausverwaltung: false,
    kundentyp: '',
    kundenname: '',
    rechnungsadresse_strasse: '',
    rechnungsadresse_plz: '',
    rechnungsadresse_ort: '',
    rechnungsadresse_land: 'Österreich',
    
    // Objektinfos
    gassennname: '',
    gasse_zusatz: '',
    prioritaet: '',
    schluessel_notwendig: false,
    dachboden_offen: null,
    schluessel_beschaffung: '',
    
    // Dienstleistungen
    dienstleistungen: []
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleServiceToggle = (service) => {
    setFormData(prev => ({
      ...prev,
      dienstleistungen: prev.dienstleistungen.includes(service)
        ? prev.dienstleistungen.filter(s => s !== service)
        : [...prev.dienstleistungen, service]
    }));
  };

  const validateStep = (step) => {
    switch(step) {
      case 1:
        if (!formData.vorname.trim()) { toast.error('Vorname erforderlich'); return false; }
        if (!formData.nachname.trim()) { toast.error('Nachname erforderlich'); return false; }
        if (!formData.email.trim()) { toast.error('E-Mail erforderlich'); return false; }
        if (!formData.telefon.trim()) { toast.error('Telefonnummer erforderlich'); return false; }
        return true;
      case 2:
        if (!formData.kundentyp) { toast.error('Kundentyp erforderlich'); return false; }
        if (!formData.kundenname.trim()) { toast.error('Kundenname erforderlich'); return false; }
        if (!formData.rechnungsadresse_strasse.trim()) { toast.error('Straße erforderlich'); return false; }
        if (!formData.rechnungsadresse_plz.trim()) { toast.error('PLZ erforderlich'); return false; }
        if (!formData.rechnungsadresse_ort.trim()) { toast.error('Stadt erforderlich'); return false; }
        return true;
      case 3:
        if (!formData.gassennname.trim()) { toast.error('Gassenname erforderlich'); return false; }
        if (!formData.prioritaet) { toast.error('Priorität erforderlich'); return false; }
        if (formData.schluessel_notwendig && formData.dachboden_offen === null) { 
          toast.error('Bitte angeben, ob Dachboden offen ist'); 
          return false; 
        }
        return true;
      case 4:
        if (formData.dienstleistungen.length === 0) { 
          toast.error('Mindestens eine Dienstleistung erforderlich'); 
          return false; 
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setIsSubmitting(true);
    try {
      const ticketNumber = generateTicketNumber();

      const payload = {
        ticketNumber,
        status: 'Angebot in Besichtigung',
        erstelltVon: 'Automatisierung',
        
        // Stammdaten
        ansprechpartner: {
          vorname: formData.vorname,
          nachname: formData.nachname,
          email: formData.email,
          telefon: formData.telefon
        },
        
        // Rechnungsanschrift
        rechnungsanschrift: {
          rechnungAnHausverwaltung: formData.rechnung_an_hausverwaltung,
          kundentyp: formData.kundentyp,
          kundenname: formData.kundenname,
          strasse: formData.rechnungsadresse_strasse,
          plz: formData.rechnungsadresse_plz,
          ort: formData.rechnungsadresse_ort,
          land: formData.rechnungsadresse_land
        },
        
        // Objektinfos
        objektinfos: {
          gassenname: formData.gassennname,
          gassenzusatz: formData.gasse_zusatz,
          prioritaet: formData.prioritaet,
          schluesselNotwendig: formData.schluessel_notwendig,
          dachbodenOffen: formData.schluessel_notwendig ? formData.dachboden_offen : null,
          schluesselBeschaffung: formData.schluessel_notwendig ? formData.schluessel_beschaffung : ''
        },
        
        // Dienstleistungen
        dienstleistungen: formData.dienstleistungen,
        
        timestamp: new Date().toISOString()
      };

      const response = await fetch('https://lasselgmbh.app.n8n.cloud/webhook-test/56e16274-2c03-4eb1-a6a2-39ad4c88ca3e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Webhook-Fehler');

      setIsSuccess(true);
      toast.success('Anfrage erfolgreich übermittelt!');
      
      setTimeout(() => {
        setCurrentStep(1);
        setFormData({
          vorname: '',
          nachname: '',
          email: '',
          telefon: '',
          rechnung_an_hausverwaltung: false,
          kundentyp: '',
          kundenname: '',
          rechnungsadresse_strasse: '',
          rechnungsadresse_plz: '',
          rechnungsadresse_ort: '',
          rechnungsadresse_land: 'Österreich',
          gassennname: '',
          gasse_zusatz: '',
          prioritaet: '',
          schluessel_notwendig: false,
          dachboden_offen: null,
          schluessel_beschaffung: '',
          dienstleistungen: []
        });
        setIsSuccess(false);
      }, 3000);
    } catch (error) {
      toast.error('Fehler beim Übermitteln: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="flex justify-center mb-6">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Anfrage erhalten!</h2>
          <p className="text-slate-600 mb-4">Danke für deine Anfrage. Wir werden dich in Kürze kontaktieren.</p>
          <p className="text-sm text-slate-500">Die Seite wird automatisch neu geladen...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">In 4 Schritten zu Ihrem Projekt</h1>
          <p className="text-slate-600">Legen Sie Ihre Anfrage schnell und einfach an</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-3">
            {[1, 2, 3, 4].map(step => (
              <div key={step} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step <= currentStep ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {step}
                </div>
                <span className="text-xs mt-2 text-slate-600">
                  {step === 1 && 'Stammdaten'}
                  {step === 2 && 'Rechnung'}
                  {step === 3 && 'Objekt'}
                  {step === 4 && 'Service'}
                </span>
              </div>
            ))}
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-orange-600 transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Form Card */}
        <Card className="p-8 shadow-lg">
          {/* Step 1: Stammdaten */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Stammdaten</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vorname *</Label>
                  <Input
                    value={formData.vorname}
                    onChange={(e) => handleInputChange('vorname', e.target.value)}
                    placeholder="Max"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Nachname *</Label>
                  <Input
                    value={formData.nachname}
                    onChange={(e) => handleInputChange('nachname', e.target.value)}
                    placeholder="Mustermann"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>E-Mail *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="max@beispiel.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Telefonnummer *</Label>
                <Input
                  type="tel"
                  value={formData.telefon}
                  onChange={(e) => handleInputChange('telefon', e.target.value)}
                  placeholder="+43 1 2345 6789"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Step 2: Rechnungsanschrift */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Rechnungsanschrift</h2>
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  id="hausverwaltung"
                  checked={formData.rechnung_an_hausverwaltung}
                  onCheckedChange={(checked) => handleInputChange('rechnung_an_hausverwaltung', checked)}
                />
                <Label htmlFor="hausverwaltung" className="cursor-pointer">Rechnung an Hausverwaltung</Label>
              </div>
              <div>
                <Label>Kundentyp *</Label>
                <Select value={formData.kundentyp} onValueChange={(v) => handleInputChange('kundentyp', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kundenname / Rechnungskopf *</Label>
                <Input
                  value={formData.kundenname}
                  onChange={(e) => handleInputChange('kundenname', e.target.value)}
                  placeholder="z.B. PAUL Vienna Office GmbH"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Straße *</Label>
                <Input
                  value={formData.rechnungsadresse_strasse}
                  onChange={(e) => handleInputChange('rechnungsadresse_strasse', e.target.value)}
                  placeholder="Hauptstraße 50"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>PLZ *</Label>
                  <Input
                    value={formData.rechnungsadresse_plz}
                    onChange={(e) => handleInputChange('rechnungsadresse_plz', e.target.value)}
                    placeholder="1020"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Stadt *</Label>
                  <Input
                    value={formData.rechnungsadresse_ort}
                    onChange={(e) => handleInputChange('rechnungsadresse_ort', e.target.value)}
                    placeholder="Wien"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Land</Label>
                  <Input
                    value={formData.rechnungsadresse_land}
                    disabled
                    className="mt-1 bg-slate-100"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Objektinfos */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Objektinformationen</h2>
              <div>
                <Label>Gassenname *</Label>
                <Input
                  value={formData.gassennname}
                  onChange={(e) => handleInputChange('gassennname', e.target.value)}
                  placeholder="z.B. Hauptstraße 50, 1020 Wien"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Gasse Zusatz (z.B. Top1, etc.)</Label>
                <Input
                  value={formData.gasse_zusatz}
                  onChange={(e) => handleInputChange('gasse_zusatz', e.target.value)}
                  placeholder="Top 1"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Priorität *</Label>
                <Select value={formData.prioritaet} onValueChange={(v) => handleInputChange('prioritaet', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dringend">Dringend</SelectItem>
                    <SelectItem value="So schnell wie möglich">So schnell wie möglich</SelectItem>
                    <SelectItem value="Mittel">Mittel</SelectItem>
                    <SelectItem value="Nicht dringend">Nicht dringend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="schluessel"
                  checked={formData.schluessel_notwendig}
                  onCheckedChange={(checked) => handleInputChange('schluessel_notwendig', checked)}
                />
                <Label htmlFor="schluessel" className="cursor-pointer">Schlüssel notwendig?</Label>
              </div>
              
              {formData.schluessel_notwendig && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-3">
                    <Label className="text-base font-medium">Dachboden offen?</Label>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <input 
                          type="radio" 
                          id="dachboden_ja" 
                          name="dachboden"
                          checked={formData.dachboden_offen === true}
                          onChange={() => handleInputChange('dachboden_offen', true)}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="dachboden_ja" className="cursor-pointer">Ja</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="radio" 
                          id="dachboden_nein" 
                          name="dachboden"
                          checked={formData.dachboden_offen === false}
                          onChange={() => handleInputChange('dachboden_offen', false)}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="dachboden_nein" className="cursor-pointer">Nein</Label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label>Wie kann man den Schlüssel beschaffen?</Label>
                    <Input
                      value={formData.schluessel_beschaffung}
                      onChange={(e) => handleInputChange('schluessel_beschaffung', e.target.value)}
                      placeholder="z.B. Schlüssel beim Hausmeister abholen"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Dienstleistungen */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Welche Dienstleistungen benötigen Sie?</h2>
              <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                {SERVICES.map(service => (
                  <div key={service} className="flex items-center gap-2">
                    <Checkbox
                      id={service}
                      checked={formData.dienstleistungen.includes(service)}
                      onCheckedChange={() => handleServiceToggle(service)}
                    />
                    <Label htmlFor={service} className="cursor-pointer">{service}</Label>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-orange-50 rounded-lg text-sm text-orange-700">
                {formData.dienstleistungen.length === 0 
                  ? 'Bitte wählen Sie mindestens eine Dienstleistung'
                  : `${formData.dienstleistungen.length} Dienstleistung(en) ausgewählt`
                }
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between gap-4 mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="flex-1"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Zurück
            </Button>
            {currentStep < 4 ? (
              <Button
                onClick={handleNext}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                Weiter
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isSubmitting ? 'Wird übermittelt...' : 'Anfrage absenden'}
              </Button>
            )}
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-600">
          <p>Bei Fragen kontaktieren Sie uns: <span className="font-semibold">office@hoehenarbeiten-lassel.at</span></p>
        </div>
      </div>
    </div>
  );
}