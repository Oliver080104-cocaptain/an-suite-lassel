import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Euro, FileText, Receipt, DollarSign, Percent, Users, TrendingDown, Lock, BarChart3, Table as TableIcon, Car } from 'lucide-react';
import StatsCard from '../components/shared/StatsCard';
import CurrencyDisplay from '../components/shared/CurrencyDisplay';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import moment from 'moment';
import { toast } from 'sonner';
import MitarbeiterManagement from '../components/analytics/MitarbeiterManagement';
import ParksperreDialog from '../components/shared/ParksperreDialog';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Analytics() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [selectedYear, setSelectedYear] = useState(() => moment().year().toString());
  const [selectedMonth, setSelectedMonth] = useState(() => moment().month());

  // Moment.js auf Deutsch umstellen
  useEffect(() => {
    moment.locale('de');
  }, []);
  const [performanceView, setPerformanceView] = useState('table');
  const [revenueChartType, setRevenueChartType] = useState('bar');
  const [parksperreDialogOpen, setParksperreDialogOpen] = useState(false);
  const [sendingParksperre, setSendingParksperre] = useState(false);

  const { data: offers = [] } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const allOffers = await base44.entities.Offer.list();
      return allOffers.filter(o => !o.deleted_at);
    },
    initialData: [],
    enabled: isAuthenticated,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const allInvoices = await base44.entities.Invoice.list();
      return allInvoices.filter(i => !i.deleted_at);
    },
    initialData: [],
    enabled: isAuthenticated,
  });

  const { data: vermittler = [] } = useQuery({
    queryKey: ['vermittler'],
    queryFn: () => base44.entities.Vermittler.filter({ status: 'aktiv' }),
    initialData: [],
    enabled: isAuthenticated,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    initialData: [],
    enabled: isAuthenticated,
  });

  const { data: partialPayments = [] } = useQuery({
    queryKey: ['partialPayments'],
    queryFn: () => base44.entities.PartialPayment.list(),
    initialData: [],
    enabled: isAuthenticated,
  });

  const { data: sevDeskData = [] } = useQuery({
    queryKey: ['sevDeskUmsatz'],
    queryFn: () => base44.entities.SevDeskUmsatz.list(),
    initialData: [],
    enabled: isAuthenticated,
  });

  const analytics = useMemo(() => {
    if (!isAuthenticated) return {
      jahresumsatzBrutto: 0,
      jahresumsatzYoY: 0,
      monatsumsatzBrutto: 0,
      offeneForderungen: 0,
      offeneForderungenMahnungen: 0,
      offeneForderungenFaellig: 0,
      offeneForderungenNichtFaellig: 0,
      umsatzsteuer: 0,
      marge: 0,
      offersByEmployee: {},
      invoicesByEmployee: {},
      monthlyRevenue: [],
      vermittlerUmsatz: {}
    };
    const year = parseInt(selectedYear);
    const currentYear = moment().year();
    const currentMonth = moment().month();

    // 1. JAHRESUMSATZ - Basiert auf selectedYear
    // Kombiniert Rechnungsdaten + sevDesk Daten
    // Ausschlüsse: entwurf und storniert
    const selectedYearInvoices = invoices.filter(inv => 
      moment(inv.datum).year() === year && 
      inv.status !== 'entwurf' && 
      inv.status !== 'storniert'
    );
    const jahresumsatzRechnungen = selectedYearInvoices.reduce((sum, inv) => sum + (parseFloat(inv.summeBrutto) || 0), 0);
    
    // sevDesk Jahresumsatz für selectedYear
    const sevDeskJahresdaten = sevDeskData.filter(sd => sd.jahr === year);
    const jahresumsatzSevDesk = sevDeskJahresdaten.reduce((sum, sd) => sum + (parseFloat(sd.umsatz) || 0), 0);
    
    const jahresumsatzBrutto = jahresumsatzRechnungen + jahresumsatzSevDesk;

    // Vorjahr-Vergleich für YoY
    const lastYearInvoices = invoices.filter(inv => 
      moment(inv.datum).year() === year - 1 && 
      inv.status !== 'entwurf' && 
      inv.status !== 'storniert'
    );
    const jahresumsatzVorjahr = lastYearInvoices.reduce((sum, inv) => sum + (parseFloat(inv.summeBrutto) || 0), 0);
    const jahresumsatzYoY = jahresumsatzVorjahr > 0 
      ? ((jahresumsatzBrutto - jahresumsatzVorjahr) / jahresumsatzVorjahr) * 100 
      : 0;

    // 2. MONATSUMSATZ - Basiert auf selectedYear und selectedMonth
    // Kombiniert Rechnungsdaten + sevDesk Daten
    const selectedMonthInvoices = invoices.filter(inv => 
      moment(inv.datum).year() === year &&
      moment(inv.datum).month() === selectedMonth &&
      inv.status !== 'entwurf' && 
      inv.status !== 'storniert'
    );
    const monatsumsatzRechnungen = selectedMonthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.summeBrutto) || 0), 0);
    const monatsumsatzNetto = selectedMonthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.summeNetto) || 0), 0);
    
    // sevDesk Monatsumsatz für selectedYear und selectedMonth
    const sevDeskMonatsdaten = sevDeskData.find(sd => sd.jahr === year && sd.monat === (selectedMonth + 1));
    const monatsumsatzSevDesk = sevDeskMonatsdaten ? parseFloat(sevDeskMonatsdaten.umsatz) : 0;
    
    const monatsumsatzBrutto = monatsumsatzRechnungen + monatsumsatzSevDesk;

    // 3. OFFENE FORDERUNGEN - Liquiditäts-Ansicht
    // offen & mahnung: voller Betrag
    // teilweise_bezahlt: Differenz (Gesamtbetrag - bezahltBetrag)
    const offeneInvoices = invoices.filter(inv => 
      inv.status === 'offen' || inv.status === 'mahnung' || inv.status === 'teilweise_bezahlt'
    );
    
    let offeneForderungen = 0;
    let offeneForderungenMahnungen = 0;
    let offeneForderungenFaellig = 0;
    let offeneForderungenNichtFaellig = 0;

    offeneInvoices.forEach(inv => {
      let betrag = 0;
      
      if (inv.status === 'teilweise_bezahlt') {
        // Differenz berechnen
        const gesamtBetrag = parseFloat(inv.summeBrutto) || 0;
        const bezahltBetrag = parseFloat(inv.bezahltBetrag) || 0;
        betrag = gesamtBetrag - bezahltBetrag;
      } else {
        // offen oder mahnung: voller Betrag
        betrag = parseFloat(inv.summeBrutto) || 0;
      }

      offeneForderungen += betrag;

      // 4. DETAIL-AUFLISTUNG nach Status gruppiert
      if (inv.status === 'mahnung') {
        offeneForderungenMahnungen += betrag;
      } else if (inv.faelligAm && moment(inv.faelligAm).isBefore(moment())) {
        offeneForderungenFaellig += betrag;
      } else {
        offeneForderungenNichtFaellig += betrag;
      }
    });

    // 5. UMSATZSTEUER (Ist-Versteuerung) - Nur von Zahlungen mit 20% UST
    // Basis: Status "bezahlt" + Teilbeträge von "teilweise_bezahlt"
    // Prüfung: reverseCharge = false/undefined → 20% UST berechnen
    let umsatzsteuer = 0;
    
    // Vollständig bezahlte Rechnungen des ausgewählten Monats
    const bezahlteMonat = invoices.filter(inv => 
      inv.status === 'bezahlt' &&
      moment(inv.datum).year() === year &&
      moment(inv.datum).month() === selectedMonth
    );
    bezahlteMonat.forEach(inv => {
      if (!inv.reverseCharge) {
        // Nur wenn 20% UST aktiv: Betrag * (20/120)
        const betrag = parseFloat(inv.summeBrutto) || 0;
        umsatzsteuer += betrag * (20 / 120);
      }
    });

    // Teilzahlungen des ausgewählten Monats (prüfe Rechnung für reverseCharge)
    const teilzahlungenMonat = partialPayments.filter(pp => 
      pp.status === 'bezahlt' &&
      moment(pp.datum).year() === year &&
      moment(pp.datum).month() === selectedMonth
    );
    teilzahlungenMonat.forEach(pp => {
      const rechnung = invoices.find(inv => inv.id === pp.invoiceId);
      if (rechnung && !rechnung.reverseCharge) {
        // Nur wenn 20% UST aktiv: Betrag * (20/120)
        const betrag = parseFloat(pp.betrag) || 0;
        umsatzsteuer += betrag * (20 / 120);
      }
    });

    // Filter für ausgewähltes Jahr (für Charts)
    const yearInvoices = invoices.filter(inv => 
      moment(inv.datum).year() === year && 
      inv.status !== 'entwurf' && 
      inv.status !== 'storniert'
    );

    const yearOffers = offers.filter(off => 
      moment(off.datum).year() === year
    );

    // Angebote pro Mitarbeiter
    const offersByEmployee = {};
    yearOffers.forEach(off => {
      const emp = off.erstelltDurch || 'Unbekannt';
      if (!offersByEmployee[emp]) {
        offersByEmployee[emp] = { count: 0, summeNetto: 0, summeBrutto: 0 };
      }
      offersByEmployee[emp].count++;
      offersByEmployee[emp].summeNetto += parseFloat(off.summeNetto) || 0;
      offersByEmployee[emp].summeBrutto += parseFloat(off.summeBrutto) || 0;
    });

    // Rechnungen pro Mitarbeiter
    const invoicesByEmployee = {};
    yearInvoices.forEach(inv => {
      const emp = inv.erstelltDurch || 'Unbekannt';
      if (!invoicesByEmployee[emp]) {
        invoicesByEmployee[emp] = { count: 0, summe: 0 };
      }
      invoicesByEmployee[emp].count++;
      if (inv.status === 'bezahlt') {
        invoicesByEmployee[emp].summe += parseFloat(inv.summeBrutto) || 0;
      }
    });

    // Vermittler Umsatz - Nur BEZAHLTE Rechnungen
    const vermittlerUmsatz = {};
    
    // Nur bezahlte Rechnungen zählen
    yearInvoices.forEach(inv => {
      if (inv.vermittlerId && inv.status === 'bezahlt') {
        const verm = vermittler.find(v => v.id === inv.vermittlerId);
        if (verm) {
          if (!vermittlerUmsatz[verm.name]) {
            vermittlerUmsatz[verm.name] = { 
              umsatzRechnungen: 0,
              provision: 0,
              provisionssatz: verm.provisionssatz || 10
            };
          }
          const invUmsatz = parseFloat(inv.summeBrutto) || 0;
          vermittlerUmsatz[verm.name].umsatzRechnungen += invUmsatz;
          // Provision berechnen
          const provisionBetrag = invUmsatz * (verm.provisionssatz / 100);
          vermittlerUmsatz[verm.name].provision += provisionBetrag;
        }
      }
    });

    // 6. MARGE - Nettoumsatz minus Provisionen
    const provisionenMonat = Object.values(vermittlerUmsatz).reduce((sum, v) => sum + (v.provision || 0), 0);
    const marge = monatsumsatzNetto - provisionenMonat;

    // Umsatzentwicklung pro Monat aus echten Rechnungsdaten (für ausgewähltes Jahr)
    const bezahlteJahrRechnungen = yearInvoices.filter(inv => inv.status === 'bezahlt');
    const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
      const monthInvoices = bezahlteJahrRechnungen.filter(inv => 
        moment(inv.datum).month() === i
      );
      const monatsumsatzRechnungen = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.summeBrutto) || 0), 0);
      
      // sevDesk Daten für diesen Monat und Jahr laden
      const sevDeskMonat = sevDeskData.find(sd => sd.jahr === year && sd.monat === (i + 1));
      const sevDeskUmsatz = sevDeskMonat ? parseFloat(sevDeskMonat.umsatz) : 0;
      
      const monatsnamen = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      
      return {
        monat: monatsnamen[i],
        umsatz: monatsumsatzRechnungen,
        sevDeskUmsatz: sevDeskUmsatz
      };
    });

    return {
      jahresumsatzBrutto,
      jahresumsatzYoY,
      monatsumsatzBrutto,
      offeneForderungen,
      offeneForderungenMahnungen,
      offeneForderungenFaellig,
      offeneForderungenNichtFaellig,
      umsatzsteuer,
      marge,
      offersByEmployee,
      invoicesByEmployee,
      monthlyRevenue,
      vermittlerUmsatz
    };
  }, [offers, invoices, vermittler, partialPayments, selectedYear, selectedMonth, isAuthenticated]);

  const employeeData = useMemo(() => {
    if (!isAuthenticated) return [];
    return Object.entries(analytics.invoicesByEmployee).map(([name, data]) => ({
      name,
      angebote: analytics.offersByEmployee[name]?.count || 0,
      angebotssummeNetto: analytics.offersByEmployee[name]?.summeNetto || 0,
      angebotssummeBrutto: analytics.offersByEmployee[name]?.summeBrutto || 0,
      rechnungen: data.count,
      umsatz: data.summe
    }));
  }, [analytics, isAuthenticated]);

  const vermittlerData = useMemo(() => {
    if (!isAuthenticated) return [];
    return Object.entries(analytics.vermittlerUmsatz).map(([name, data]) => ({
      name,
      ...data
    }));
  }, [analytics, isAuthenticated]);

  const availableYears = useMemo(() => {
    if (!isAuthenticated) return ['2026', '2025', '2024'];
    const years = new Set(['2024', '2025', '2026']);
    [...offers, ...invoices].forEach(item => {
      if (item.datum) {
        const year = moment(item.datum).year().toString();
        if (year === '2024' || year === '2025' || year === '2026') {
          years.add(year);
        }
      }
    });
    return Array.from(years).sort().reverse();
  }, [offers, invoices, isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pin === '1974') {
      setIsAuthenticated(true);
      setPin('');
      toast.success('Erfolgreich angemeldet');
    } else {
      toast.error('Ungültiger PIN-Code');
      setPin('');
    }
  };

  const handleSendParksperre = async (emailData) => {
    setSendingParksperre(true);
    try {
      await fetch('https://lasselgmbh.app.n8n.cloud/webhook-test/7836c00e-ddef-4c0a-90b9-be803b9dc3a9', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'parksperre_antrag',
          email: {
            to: emailData.emailTo,
            subject: emailData.subject,
            body: emailData.bodyHtml,
            signature: emailData.signatureHtml,
            mitarbeiter: emailData.employee
          },
          projektInfo: emailData.projektInfo,
          attachments: emailData.attachments || [],
          timestamp: new Date().toISOString()
        })
      });
      
      toast.success('Parksperre-Antrag erfolgreich versendet');
      setParksperreDialogOpen(false);
    } catch (error) {
      toast.error('Fehler beim Versenden: ' + error.message);
    } finally {
      setSendingParksperre(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="p-4 bg-orange-100 rounded-full">
              <Lock className="w-8 h-8 text-orange-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">Analytics Login</h1>
          <p className="text-center text-slate-500 mb-6">CEO Zugang erforderlich</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>PIN-Code</Label>
              <Input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.slice(0, 4))}
                placeholder="••••"
                className="mt-1 text-center text-lg tracking-widest"
                maxLength="4"
                inputMode="numeric"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700">
              Anmelden
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
         <div className="mb-8">
           <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
             <div>
               <h1 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h1>
               <p className="text-slate-500 mt-1">Performance Cockpit - Stand: {moment().format('DD. MMMM YYYY')}</p>
             </div>
             <div className="flex gap-3">
               <Select value={selectedYear} onValueChange={setSelectedYear}>
                 <SelectTrigger className="w-32">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {availableYears.map(year => (
                     <SelectItem key={year} value={year}>{year}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
                 <SelectTrigger className="w-40">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].map((month, idx) => (
                     <SelectItem key={idx} value={idx.toString()}>{month}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </div>
         </div>

        {/* KPI Cards - Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <StatsCard
            title="Jahresumsatz"
            value={<CurrencyDisplay value={analytics.jahresumsatzBrutto} />}
            subtitle={`${analytics.jahresumsatzYoY > 0 ? '+' : ''}${analytics.jahresumsatzYoY.toFixed(1)}% vs. Vorjahr`}
            icon={analytics.jahresumsatzYoY >= 0 ? TrendingUp : TrendingDown}
            variant="orange"
          />
          <StatsCard
           title="Monatsumsatz"
           value={<CurrencyDisplay value={analytics.monatsumsatzBrutto} />}
           subtitle={`${moment().month(selectedMonth).format('MMMM')} ${selectedYear}`}
           icon={Euro}
           variant="orange"
          />
          <StatsCard
            title="Offene Forderungen"
            value={<CurrencyDisplay value={analytics.offeneForderungen} />}
            subtitle="Gesamt ausstehend"
            icon={Receipt}
            variant="orange"
          />
        </div>

        {/* Detail-Auflistung Offene Forderungen */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Cashflow-Übersicht (Offene Forderungen)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm font-medium text-red-900 mb-1">Mahnungen</div>
              <div className="text-2xl font-bold text-red-700">
                <CurrencyDisplay value={analytics.offeneForderungenMahnungen} />
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-sm font-medium text-amber-900 mb-1">Fällige Rechnungen</div>
              <div className="text-2xl font-bold text-amber-700">
                <CurrencyDisplay value={analytics.offeneForderungenFaellig} />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-900 mb-1">Noch nicht fällig</div>
              <div className="text-2xl font-bold text-blue-700">
                <CurrencyDisplay value={analytics.offeneForderungenNichtFaellig} />
              </div>
            </div>
          </div>
        </Card>

        {/* Marge Karte - aktuell ausgeblendet */}

        {/* Umsatzentwicklung - Full Width */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Umsatzentwicklung {selectedYear}</h3>
            <div className="flex gap-2">
              <Button
                variant={revenueChartType === 'bar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRevenueChartType('bar')}
                className={revenueChartType === 'bar' ? 'bg-orange-600 hover:bg-orange-700' : ''}
              >
                Spalten
              </Button>
              <Button
                variant={revenueChartType === 'line' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRevenueChartType('line')}
                className={revenueChartType === 'line' ? 'bg-orange-600 hover:bg-orange-700' : ''}
              >
                Linie
              </Button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            {revenueChartType === 'bar' ? (
              <BarChart data={analytics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monat" />
                <YAxis 
                  ticks={[0, 50000, 100000, 150000, 200000, 250000, 300000, 350000]}
                  domain={[0, 'auto']}
                />
                <Tooltip formatter={(value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)} />
                <Legend />
                <Bar dataKey="umsatz" fill="#f97316" name="Umsatz (App)" />
                <Bar dataKey="sevDeskUmsatz" fill="#ea580c" name="Umsatz (sevDesk)" />
              </BarChart>
            ) : (
              <LineChart data={analytics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monat" />
                <YAxis 
                  ticks={[0, 50000, 100000, 150000, 200000, 250000, 300000, 350000]}
                  domain={[0, 'auto']}
                />
                <Tooltip formatter={(value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)} />
                <Legend />
                <Line type="monotone" dataKey="umsatz" stroke="#f97316" strokeWidth={2} name="Umsatz (App)" />
                <Line type="monotone" dataKey="sevDeskUmsatz" stroke="#ea580c" strokeWidth={2} name="Umsatz (sevDesk)" />
              </LineChart>
            )}
          </ResponsiveContainer>
        </Card>

        {/* Vermittler Übersicht */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Vermittler Umsatz {selectedYear} (nur bezahlte Rechnungen)</h3>
          {vermittlerData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vermittlerData.map((verm, idx) => (
                <div key={idx} className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-xl font-bold text-slate-900">{verm.name}</h4>
                      <p className="text-sm text-slate-600">Provisionssatz: {verm.provisionssatz}%</p>
                    </div>
                    <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Vermittelter Umsatz:</span>
                      <span className="text-lg font-bold text-slate-900">
                        {new Intl.NumberFormat('de-DE', { 
                          style: 'currency', 
                          currency: 'EUR',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }).format(verm.umsatzRechnungen)}
                      </span>
                    </div>
                    <div className="h-px bg-orange-200"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Provision schuldig:</span>
                      <span className="text-2xl font-bold text-orange-600">
                        {new Intl.NumberFormat('de-DE', { 
                          style: 'currency', 
                          currency: 'EUR',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }).format(verm.provision)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Keine Vermittler-Daten für {selectedYear} vorhanden</p>
              <p className="text-sm text-slate-400 mt-1">Es wurden keine bezahlten Rechnungen mit Vermittlern gefunden</p>
            </div>
          )}
        </Card>

        {/* Mitarbeiter Performance */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Mitarbeiter Performance {selectedYear}</h3>
            <div className="flex gap-2">
              <Button
                variant={performanceView === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPerformanceView('table')}
                className={performanceView === 'table' ? 'bg-orange-600 hover:bg-orange-700' : ''}
              >
                <TableIcon className="w-4 h-4 mr-2" />
                Tabelle
              </Button>
              <Button
                variant={performanceView === 'chart' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPerformanceView('chart')}
                className={performanceView === 'chart' ? 'bg-orange-600 hover:bg-orange-700' : ''}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Diagramm
              </Button>
            </div>
          </div>

          {performanceView === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Mitarbeiter</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Angebote</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Angebotssumme (Netto)</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Rechnungen</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Umsatz</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeData.map((emp, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium">{emp.name}</td>
                      <td className="py-3 px-4 text-right">{emp.angebote}</td>
                      <td className="py-3 px-4 text-right">
                        <CurrencyDisplay value={emp.angebotssummeNetto} />
                      </td>
                      <td className="py-3 px-4 text-right">{emp.rechnungen}</td>
                      <td className="py-3 px-4 text-right font-semibold">
                        <CurrencyDisplay value={emp.umsatz} />
                      </td>
                    </tr>
                  ))}
                  {employeeData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Keine Mitarbeiter-Daten vorhanden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Angebote Chart */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Anzahl Angebote</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={employeeData.sort((a, b) => b.angebote - a.angebote)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="angebote" fill="#f97316" name="Angebote" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Angebotssumme Chart */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Angebotssumme (Netto)</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={employeeData.sort((a, b) => b.angebotssummeNetto - a.angebotssummeNetto)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)} />
                    <Bar dataKey="angebotssummeNetto" fill="#3b82f6" name="Angebotssumme (Netto)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rechnungen Chart */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Anzahl Rechnungen</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={employeeData.sort((a, b) => b.rechnungen - a.rechnungen)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="rechnungen" fill="#10b981" name="Rechnungen" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Umsatz Chart */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Umsatz (bezahlte Rechnungen)</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={employeeData.sort((a, b) => b.umsatz - a.umsatz)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)} />
                    <Bar dataKey="umsatz" fill="#f59e0b" name="Umsatz" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Card>



        {/* Mitarbeiter Management */}
        <div className="mb-6">
          <MitarbeiterManagement />
        </div>

        <ParksperreDialog
          open={parksperreDialogOpen}
          onOpenChange={setParksperreDialogOpen}
          onConfirm={handleSendParksperre}
          isLoading={sendingParksperre}
        />
      </div>
    </div>
  );
}