import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Receipt, FileText, Euro } from "lucide-react";
import PageHeader from '../components/shared/PageHeader';
import StatsCard from '../components/shared/StatsCard';
import RevenueChart from '../components/dashboard/RevenueChart';
import VatSummary from '../components/dashboard/VatSummary';
import OpenInvoicesWidget from '../components/dashboard/OpenInvoicesWidget';
import EmployeeOfferChart from '../components/dashboard/EmployeeOfferChart';
import moment from 'moment';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function Dashboard() {
  const currentYear = moment().year();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date'),
  });

  const { data: offers = [], isLoading: loadingOffers } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.list('-created_date'),
  });

  // Jahre für Filter
  const yearOptions = useMemo(() => {
    const years = new Set([currentYear, currentYear - 1]);
    invoices.forEach(i => {
      if (i.datum) years.add(moment(i.datum).year());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices, currentYear]);

  // Hauptstatistiken
  const stats = useMemo(() => {
    const year = parseInt(selectedYear);
    const yearInvoices = invoices.filter(i => 
      i.datum && moment(i.datum).year() === year && i.rechnungstyp !== 'storno' && i.status !== 'storniert'
    );
    const paidInvoices = yearInvoices.filter(i => i.status === 'bezahlt');
    
    const umsatzNetto = paidInvoices.reduce((sum, i) => sum + (i.summeNetto || 0), 0);
    const umsatzBrutto = paidInvoices.reduce((sum, i) => sum + (i.summeBrutto || 0), 0);
    
    const openInvoices = invoices.filter(i => i.status === 'offen' || i.status === 'teilweise_bezahlt');
    const openAmount = openInvoices.reduce((sum, i) => sum + ((i.summeBrutto || 0) - (i.bezahltBetrag || 0)), 0);

    // Vorjahresvergleich
    const lastYearInvoices = invoices.filter(i => 
      i.datum && moment(i.datum).year() === year - 1 && i.rechnungstyp !== 'storno' && i.status === 'bezahlt'
    );
    const lastYearRevenue = lastYearInvoices.reduce((sum, i) => sum + (i.summeBrutto || 0), 0);
    const revenueChange = lastYearRevenue > 0 ? ((umsatzBrutto - lastYearRevenue) / lastYearRevenue * 100).toFixed(1) : 0;

    return {
      umsatzNetto,
      umsatzBrutto,
      openAmount,
      openCount: openInvoices.length,
      revenueChange,
      revenueUp: parseFloat(revenueChange) >= 0
    };
  }, [invoices, selectedYear]);

  // Monatlicher Umsatz
  const monthlyRevenue = useMemo(() => {
    const year = parseInt(selectedYear);
    const lastYear = year - 1;
    
    return MONTHS.map((month, index) => {
      const thisYearInvoices = invoices.filter(i => 
        i.datum && 
        moment(i.datum).year() === year && 
        moment(i.datum).month() === index &&
        i.rechnungstyp !== 'storno' && 
        i.status === 'bezahlt'
      );
      
      const lastYearInvoices = invoices.filter(i => 
        i.datum && 
        moment(i.datum).year() === lastYear && 
        moment(i.datum).month() === index &&
        i.rechnungstyp !== 'storno' && 
        i.status === 'bezahlt'
      );
      
      return {
        month,
        umsatz: thisYearInvoices.reduce((sum, i) => sum + (i.summeBrutto || 0), 0),
        vorjahr: lastYearInvoices.reduce((sum, i) => sum + (i.summeBrutto || 0), 0)
      };
    });
  }, [invoices, selectedYear]);

  // USt pro Monat
  const monthlyVat = useMemo(() => {
    const year = parseInt(selectedYear);
    
    return MONTHS.map((month, index) => {
      const monthInvoices = invoices.filter(i => 
        i.datum && 
        moment(i.datum).year() === year && 
        moment(i.datum).month() === index &&
        i.rechnungstyp !== 'storno' && 
        i.status !== 'storniert'
      );
      
      return {
        month,
        ust: monthInvoices.reduce((sum, i) => sum + (i.summeUst || 0), 0)
      };
    });
  }, [invoices, selectedYear]);

  // Offene Rechnungen
  const openInvoices = useMemo(() => {
    return invoices
      .filter(i => i.status === 'offen' || i.status === 'teilweise_bezahlt')
      .sort((a, b) => {
        if (!a.faelligAm) return 1;
        if (!b.faelligAm) return -1;
        return moment(a.faelligAm).diff(moment(b.faelligAm));
      });
  }, [invoices]);

  // Angebotsvolumen pro Mitarbeiter
  const employeeOffers = useMemo(() => {
    const year = parseInt(selectedYear);
    const yearOffers = offers.filter(o => o.datum && moment(o.datum).year() === year);
    
    const byEmployee = {};
    yearOffers.forEach(o => {
      const emp = o.erstelltDurch || 'Unbekannt';
      byEmployee[emp] = (byEmployee[emp] || 0) + (o.summeBrutto || 0);
    });
    
    return Object.entries(byEmployee).map(([name, value]) => ({ name, value }));
  }, [offers, selectedYear]);

  if (loadingInvoices || loadingOffers) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {Array(4).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-[400px] rounded-xl" />
            <Skeleton className="h-[400px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (val) => new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency: 'EUR', 
    maximumFractionDigits: 0 
  }).format(val);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-slate-500 mt-1">Übersicht und Analysen</p>
          </div>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard 
            title="Umsatz Netto" 
            value={formatCurrency(stats.umsatzNetto)} 
            icon={Euro}
            subtitle={selectedYear}
          />
          <StatsCard 
            title="Umsatz Brutto" 
            value={formatCurrency(stats.umsatzBrutto)} 
            icon={TrendingUp}
            trend={stats.revenueChange !== 0 ? `${stats.revenueChange}% zum Vorjahr` : undefined}
            trendUp={stats.revenueUp}
          />
          <StatsCard 
            title="Offene Rechnungen" 
            value={stats.openCount} 
            icon={Receipt}
            subtitle={formatCurrency(stats.openAmount)}
          />
          <StatsCard 
            title="Angebote" 
            value={offers.filter(o => o.datum && moment(o.datum).year() === parseInt(selectedYear)).length} 
            icon={FileText}
            subtitle={selectedYear}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <RevenueChart 
            data={monthlyRevenue} 
            title={`Umsatz pro Monat ${selectedYear}`}
          />
          <RevenueChart 
            data={monthlyRevenue} 
            title="Vergleich zum Vorjahr"
            showComparison={true}
          />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <OpenInvoicesWidget 
            invoices={openInvoices} 
            totalOpen={stats.openAmount}
          />
          <EmployeeOfferChart data={employeeOffers} />
        </div>

        {/* USt Summary */}
        <VatSummary data={monthlyVat} />
      </div>
    </div>
  );
}