import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from '../components/shared/PageHeader';
import InvoiceListItem from '../components/invoices/InvoiceListItem';
import EmptyState from '../components/shared/EmptyState';
import moment from 'moment';

const invoiceStatusOptions = [
  { value: 'entwurf', label: 'Entwurf' },
  { value: 'offen', label: 'Offen' },
  { value: 'teilweise_bezahlt', label: 'Teilweise bezahlt' },
  { value: 'bezahlt', label: 'Bezahlt' },
  { value: 'storniert', label: 'Storniert' },
  { value: 'mahnung', label: 'Mahnung' },
];

const invoiceTypeOptions = [
  { value: 'normal', label: 'Normal' },
  { value: 'teilrechnung', label: 'Teilrechnung' },
  { value: 'schlussrechnung', label: 'Schlussrechnung' },
  { value: 'storno', label: 'Storno' },
];

export default function InvoiceList() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    year: 'all',
    status: 'all',
    type: 'all',
    employee: 'all'
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const allInvoices = await base44.entities.Invoice.list('-created_date');
      return allInvoices.filter(i => !i.deleted_at);
    },
  });

  const { data: allPositions = [] } = useQuery({
    queryKey: ['invoicePositions'],
    queryFn: () => base44.entities.InvoicePosition.list()
  });

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: () => base44.entities.Mitarbeiter.filter({ aktiv: true }, 'name')
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId) => {
      await base44.entities.Invoice.update(invoiceId, { deleted_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['deletedInvoices']);
      toast.success('Rechnung in Papierkorb verschoben');
    },
    onError: (error) => {
      toast.error('Fehler beim Löschen: ' + error.message);
    }
  });

  // Jahre für Filter extrahieren
  const yearOptions = useMemo(() => {
    const years = new Set();
    invoices.forEach(i => {
      if (i.datum) years.add(moment(i.datum).year());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices]);

  // Alle Mitarbeiter kombinieren (DB + aus Rechnungen)
  const employeeOptions = useMemo(() => {
    const employees = new Set();
    // Mitarbeiter aus DB
    mitarbeiterList.forEach(m => {
      if (m.name) employees.add(m.name);
    });
    // Mitarbeiter aus Rechnungen (falls nicht in DB)
    invoices.forEach(i => {
      if (i.erstelltDurch) employees.add(i.erstelltDurch);
    });
    return Array.from(employees).sort();
  }, [mitarbeiterList, invoices]);

  // Hilfsfunktion für Volltext-Suche mit Details
  const searchInObject = (obj, searchTerm, fieldLabels = {}) => {
    const lowerSearch = searchTerm.toLowerCase();
    const matches = [];
    
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'string' && value.toLowerCase().includes(lowerSearch)) {
        matches.push({
          field: fieldLabels[key] || key,
          value: value,
          key: key
        });
      }
    }
    
    return matches;
  };

  // Gefilterte Rechnungen mit Volltext-Suche
  const filteredInvoices = useMemo(() => {
    const fieldLabels = {
      rechnungsNummer: 'Rechnungs-Nr.',
      kundeName: 'Kunde',
      kundeStrasse: 'Kundenstraße',
      kundePlz: 'PLZ',
      kundeOrt: 'Ort',
      objektStrasse: 'Objektstraße',
      objektBezeichnung: 'Objekt',
      ticketNumber: 'Ticketnummer',
      bemerkung: 'Bemerkung',
      erstelltDurch: 'Ersteller',
      hausverwaltungName: 'Hausverwaltung'
    };

    let result = invoices.map(invoice => {
      let matchDetails = [];
      
      if (filters.search) {
        // Suche in Rechnungsfeldern
        const invoiceMatches = searchInObject(invoice, filters.search, fieldLabels);
        matchDetails = invoiceMatches;
        
        // Suche in Positionen
        const invoicePositions = allPositions.filter(p => p.invoiceId === invoice.id);
        invoicePositions.forEach((pos, idx) => {
          const posLabels = {
            produktName: 'Produkt',
            beschreibung: 'Beschreibung',
            menge: 'Menge',
            einheit: 'Einheit'
          };
          const posMatches = searchInObject(pos, filters.search, posLabels);
          posMatches.forEach(match => {
            matchDetails.push({
              ...match,
              position: idx + 1
            });
          });
        });
        
        if (matchDetails.length === 0) return null;
      }
      
      return { ...invoice, matchDetails };
    }).filter(i => i !== null);

    // Weitere Filter anwenden
    result = result.filter(i => {
      if (filters.year !== 'all' && i.datum) {
        if (moment(i.datum).year() !== parseInt(filters.year)) return false;
      }
      if (filters.status !== 'all' && i.status !== filters.status) return false;
      if (filters.type !== 'all' && i.rechnungstyp !== filters.type) return false;
      if (filters.employee !== 'all' && i.erstelltDurch !== filters.employee) return false;
      return true;
    });

    // Sortierung (neueste zuerst)
    return result.sort((a, b) => {
      const dateA = new Date(a.created_date);
      const dateB = new Date(b.created_date);
      return dateB - dateA;
    });
  }, [invoices, allPositions, filters]);



  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ search: '', year: 'all', status: 'all', type: 'all', employee: 'all' });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-orange-50 p-3 rounded-lg">
              <Receipt className="w-8 h-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Rechnungen</h1>
              <p className="text-sm text-slate-600 mt-1">Rechnungsverwaltung</p>
            </div>
          </div>
          <div className="ml-auto">
            <Link to={createPageUrl('InvoiceDetail')}>
              <Button className="bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-2" />
                Neue Rechnung
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          {/* Suchleiste */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="Volltext-Suche: Rechnungsnr., Kunde, Positionen, Notizen..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10 pr-10 h-11"
              />
              {filters.search && (
                <button
                  onClick={() => handleFilterChange('search', '')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filter-Aktionen */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-600">
              Filter aktiv: <span className="font-medium">{
                (filters.year !== 'all' ? 1 : 0) + 
                (filters.status !== 'all' ? 1 : 0) + 
                (filters.type !== 'all' ? 1 : 0) + 
                (filters.employee !== 'all' ? 1 : 0) +
                (filters.search ? 1 : 0)
              }</span>
            </div>
            {(filters.search || filters.year !== 'all' || filters.status !== 'all' || filters.type !== 'all' || filters.employee !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="text-slate-600 hover:text-slate-900"
              >
                <X className="w-4 h-4 mr-2" />
                Filter zurücksetzen
              </Button>
            )}
          </div>

          {/* Schnellfilter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Jahr</label>
              <Select value={filters.year} onValueChange={(v) => handleFilterChange('year', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Jahre</SelectItem>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Status</label>
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status ({invoices.length})</SelectItem>
                  {invoiceStatusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({invoices.filter(i => i.status === option.value).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Typ</label>
              <Select value={filters.type} onValueChange={(v) => handleFilterChange('type', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Typen ({invoices.length})</SelectItem>
                  {invoiceTypeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({invoices.filter(i => i.rechnungstyp === option.value).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Mitarbeiter</label>
              <Select value={filters.employee} onValueChange={(v) => handleFilterChange('employee', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Mitarbeiter</SelectItem>
                  {employeeOptions.map(emp => (
                    <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Ergebnisse</label>
              <div className="h-9 flex items-center px-3 bg-slate-50 rounded-md border border-slate-200 text-sm font-medium text-slate-700">
                {filteredInvoices.length} Rechnung{filteredInvoices.length !== 1 ? 'en' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className="space-y-3">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Keine Rechnungen gefunden"
              description={filters.search || filters.status !== 'all' ? "Versuche andere Filtereinstellungen" : "Erstelle deine erste Rechnung"}
              action={
                !filters.search && filters.status === 'all' && (
                  <Link to={createPageUrl('InvoiceDetail')}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Neue Rechnung
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            filteredInvoices.map(invoice => (
              <InvoiceListItem 
                key={invoice.id} 
                invoice={invoice} 
                onDelete={deleteInvoiceMutation.mutate}
                searchTerm={filters.search}
                matchDetails={invoice.matchDetails}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}