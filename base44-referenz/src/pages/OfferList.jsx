import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, TrendingUp, Clock, CheckCircle, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from '../components/shared/PageHeader';
import StatsCard from '../components/shared/StatsCard';
import OfferListItem from '../components/offers/OfferListItem';
import EmptyState from '../components/shared/EmptyState';
import moment from 'moment';

const offerStatusOptions = [
  { value: 'all', label: 'Alle Status' },
  { value: 'draft', label: 'Entwurf', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'versendet', label: 'Versendet', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'angenommen', label: 'Angenommen', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'abgelehnt', label: 'Abgelehnt', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'abgelaufen', label: 'Abgelaufen', color: 'bg-orange-100 text-orange-700 border-orange-300' },
];

export default function OfferList() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    year: 'all',
    status: 'all',
    employee: 'all'
  });

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const allOffers = await base44.entities.Offer.list('-created_date');
      return allOffers.filter(o => !o.deleted_at);
    },
  });

  const { data: allPositions = [] } = useQuery({
    queryKey: ['offerPositions'],
    queryFn: () => base44.entities.OfferPosition.list()
  });

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: () => base44.entities.Mitarbeiter.filter({ aktiv: true }, 'name')
  });

  // Alle Mitarbeiter kombinieren (DB + aus Angeboten)
  const employeeOptions = useMemo(() => {
    const employees = new Set();
    // Mitarbeiter aus DB
    mitarbeiterList.forEach(m => {
      if (m.name) employees.add(m.name);
    });
    // Mitarbeiter aus Angeboten (falls nicht in DB)
    offers.forEach(o => {
      if (o.erstelltDurch) employees.add(o.erstelltDurch);
    });
    return Array.from(employees).sort();
  }, [mitarbeiterList, offers]);

  const deleteOfferMutation = useMutation({
    mutationFn: async (offerId) => {
      await base44.entities.Offer.update(offerId, { deleted_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['offers']);
      queryClient.invalidateQueries(['deletedOffers']);
      toast.success('Angebot in Papierkorb verschoben');
    },
    onError: (error) => {
      toast.error('Fehler beim Löschen: ' + error.message);
    }
  });


  // Jahre für Filter extrahieren
  const yearOptions = useMemo(() => {
    const years = new Set();
    offers.forEach(o => {
      if (o.datum) years.add(moment(o.datum).year());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [offers]);



  // Hilfsfunktion: Suche in allen Feldern und gebe gefundene Felder zurück
  const searchInObject = (obj, searchTerm, fieldNames = {}) => {
    if (!obj) return [];
    const term = searchTerm.toLowerCase();
    const matches = [];
    
    Object.entries(obj).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const stringValue = typeof value === 'string' ? value : typeof value === 'number' ? value.toString() : '';
      
      if (stringValue.toLowerCase().includes(term)) {
        const fieldLabel = fieldNames[key] || key;
        matches.push({
          field: fieldLabel,
          value: stringValue,
          key: key
        });
      }
    });
    
    return matches;
  };

  // Gefilterte Angebote mit Volltext-Suche und Match-Info
  const filteredOffers = useMemo(() => {
    const fieldLabels = {
      angebotNummer: 'Angebotsnummer',
      rechnungsempfaengerName: 'Rechnungsempfänger',
      rechnungsempfaengerStrasse: 'RE Straße',
      rechnungsempfaengerPlz: 'RE PLZ',
      rechnungsempfaengerOrt: 'RE Ort',
      objektBezeichnung: 'Objektbezeichnung',
      objektStrasse: 'Objekt Straße',
      objektPlz: 'Objekt PLZ',
      objektOrt: 'Objekt Ort',
      hausinhabung: 'Hausinhabung',
      ansprechpartner: 'Ansprechpartner',
      erstelltDurch: 'Erstellt durch',
      bemerkung: 'Bemerkung',
      ticketNumber: 'Ticketnummer',
      geschaeftsfallNummer: 'Geschäftsfallnummer',
      Skizzen_Link: 'Skizzen Link',
      dealName: 'Deal Name',
      status: 'Status'
    };

    const filtered = offers.map(o => {
      let matchedFields = [];
      
      if (filters.search) {
        const search = filters.search.toLowerCase();
        
        // Suche in Angebots-Feldern
        const offerMatches = searchInObject(o, search, fieldLabels);
        matchedFields = [...offerMatches];
        
        // Suche in Positionen
        const offerPositions = allPositions.filter(p => p.offerId === o.id);
        offerPositions.forEach((pos, idx) => {
          const posMatches = searchInObject(pos, search, {
            produktName: `Position ${idx + 1} - Produkt`,
            beschreibung: `Position ${idx + 1} - Beschreibung`,
            menge: `Position ${idx + 1} - Menge`,
            einheit: `Position ${idx + 1} - Einheit`
          });
          matchedFields = [...matchedFields, ...posMatches];
        });
        
        if (matchedFields.length === 0) return null;
      }
      
      return { ...o, _matchedFields: matchedFields };
    }).filter(o => o !== null);

    // Weitere Filter anwenden
    const finalFiltered = filtered.filter(o => {
      if (filters.year !== 'all' && o.datum) {
        if (moment(o.datum).year() !== parseInt(filters.year)) return false;
      }
      if (filters.status !== 'all' && o.status !== filters.status) return false;
      if (filters.employee !== 'all' && o.erstelltDurch !== filters.employee) return false;
      return true;
    });

    // Sortierung: API/Zoho-Angebote (source=zoho) zuerst, dann nach Erstellungsdatum
    return finalFiltered.sort((a, b) => {
      const aFromApi = a.source === 'zoho' || a.entityType === 'ticket' || a.entityType === 'deal';
      const bFromApi = b.source === 'zoho' || b.entityType === 'ticket' || b.entityType === 'deal';
      
      // API-Angebote zuerst
      if (aFromApi && !bFromApi) return -1;
      if (!aFromApi && bFromApi) return 1;
      
      // Innerhalb gleicher Kategorie nach Erstellungsdatum (neueste zuerst)
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [offers, allPositions, filters]);

  // Statistiken
  const stats = useMemo(() => {
    const currentYear = moment().year();
    const thisYearOffers = offers.filter(o => o.datum && moment(o.datum).year() === currentYear);
    
    return {
      total: offers.length,
      thisYear: thisYearOffers.length,
      totalVolume: thisYearOffers.reduce((sum, o) => sum + (o.summeBrutto || 0), 0),
      accepted: thisYearOffers.filter(o => o.status === 'angenommen').length
    };
  }, [offers]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ search: '', year: 'all', status: 'all', employee: 'all' });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-orange-50 p-3 rounded-lg flex-shrink-0">
              <FileText className="w-6 sm:w-8 h-6 sm:h-8 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Angebote</h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">Angebotsverwaltung</p>
            </div>
          </div>
          <div className="sm:ml-auto w-full sm:w-auto">
            <Link to={createPageUrl('OfferDetail')} className="w-full sm:w-auto">
              <Button className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Neues Angebot
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 mb-6">
          {/* Suchleiste */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="Suche: Angebotsnr., Kunde..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10 pr-10 h-10 sm:h-11 text-sm"
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 text-sm">
            <div className="text-slate-600">
              Filter aktiv: <span className="font-medium">{
                (filters.year !== 'all' ? 1 : 0) + 
                (filters.status !== 'all' ? 1 : 0) + 
                (filters.employee !== 'all' ? 1 : 0) +
                (filters.search ? 1 : 0)
              }</span>
            </div>
            {(filters.search || filters.year !== 'all' || filters.status !== 'all' || filters.employee !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="text-slate-600 hover:text-slate-900 w-full sm:w-auto"
              >
                <X className="w-4 h-4 mr-2" />
                Filter zurücksetzen
              </Button>
            )}
          </div>

          {/* Schnellfilter */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Jahr</label>
              <Select value={filters.year} onValueChange={(v) => handleFilterChange('year', v)}>
                <SelectTrigger className="h-9 text-sm">
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
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {offerStatusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({offers.filter(o => option.value === 'all' ? true : o.status === option.value).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="hidden sm:block">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Mitarbeiter</label>
              <Select value={filters.employee} onValueChange={(v) => handleFilterChange('employee', v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {employeeOptions.map(emp => (
                    <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Ergebnisse</label>
              <div className="h-9 flex items-center px-3 bg-slate-50 rounded-md border border-slate-200 text-xs sm:text-sm font-medium text-slate-700">
                {filteredOffers.length}
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
          ) : filteredOffers.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Keine Angebote gefunden"
              description={filters.search || filters.status !== 'all' ? "Versuche andere Filtereinstellungen" : "Erstelle dein erstes Angebot"}
              action={
                !filters.search && filters.status === 'all' && (
                  <Link to={createPageUrl('OfferDetail')}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Neues Angebot
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            filteredOffers.map(offer => (
              <OfferListItem 
                key={offer.id} 
                offer={offer} 
                onDelete={deleteOfferMutation.mutate}
                searchTerm={filters.search}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}