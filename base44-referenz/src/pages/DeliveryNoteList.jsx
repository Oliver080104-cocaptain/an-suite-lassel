import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Plus, Trash2, Search, X, Building2, Calendar, User, Hash, ChevronRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import EmptyState from '../components/shared/EmptyState';
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { toast } from 'sonner';
import moment from 'moment';

const statusOptions = [
  { value: 'all', label: 'Alle Status' },
  { value: 'entwurf', label: 'Entwurf' },
  { value: 'erstellt', label: 'Erstellt' },
  { value: 'versendet', label: 'Versendet' },
  { value: 'erledigt', label: 'Erledigt' }
];

export default function DeliveryNoteList() {
  const [filters, setFilters] = useState({
    search: '',
    year: 'all',
    status: 'all',
    employee: 'all'
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDN, setSelectedDN] = useState(null);

  const queryClient = useQueryClient();

  const { data: deliveryNotes = [], isLoading } = useQuery({
    queryKey: ['deliveryNotes'],
    queryFn: async () => {
      const allNotes = await base44.entities.DeliveryNote.list();
      return allNotes.filter(d => !d.deleted_at);
    }
  });

  const { data: allPositions = [] } = useQuery({
    queryKey: ['deliveryNotePositions'],
    queryFn: () => base44.entities.DeliveryNotePosition.list()
  });

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: () => base44.entities.Mitarbeiter.filter({ aktiv: true }, 'name')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.DeliveryNote.update(id, { deleted_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryNotes'] });
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] });
      toast.success('Lieferschein in Papierkorb verschoben');
    },
    onError: (error) => {
      toast.error('Fehler beim Löschen: ' + error.message);
    }
  });

  const handleDeleteClick = (e, dn) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedDN(dn);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedDN) {
      deleteMutation.mutate(selectedDN.id);
    }
    setDeleteDialogOpen(false);
    setSelectedDN(null);
  };

  const yearOptions = useMemo(() => {
    if (!deliveryNotes || deliveryNotes.length === 0) {
      return [{ value: 'all', label: 'Alle Jahre' }];
    }
    const years = [...new Set(deliveryNotes.map(dn => 
      dn.datum ? new Date(dn.datum).getFullYear() : null
    ))].filter(Boolean).sort((a, b) => b - a);
    return [{ value: 'all', label: 'Alle Jahre' }, ...years.map(y => ({ value: y.toString(), label: y.toString() }))];
  }, [deliveryNotes]);

  // Alle Mitarbeiter kombinieren (DB + aus Lieferscheinen)
  const employeeOptions = useMemo(() => {
    const employees = new Set();
    mitarbeiterList.forEach(m => {
      if (m.name) employees.add(m.name);
    });
    deliveryNotes.forEach(dn => {
      if (dn.erstelltDurch) employees.add(dn.erstelltDurch);
    });
    return Array.from(employees).sort();
  }, [mitarbeiterList, deliveryNotes]);

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

  // Gefilterte Lieferscheine mit Volltext-Suche
  const filteredDeliveryNotes = useMemo(() => {
    const fieldLabels = {
      lieferscheinNummer: 'Lieferschein-Nr.',
      kundeName: 'Kunde',
      kundeStrasse: 'Kundenstraße',
      kundePlz: 'PLZ',
      kundeOrt: 'Ort',
      objektStrasse: 'Objektstraße',
      objektBezeichnung: 'Objekt',
      ticketNumber: 'Ticketnummer',
      referenz: 'Referenz',
      erstelltDurch: 'Ersteller'
    };

    let result = deliveryNotes.map(dn => {
      let matchDetails = [];
      
      if (filters.search) {
        // Suche in Lieferschein-Feldern
        const dnMatches = searchInObject(dn, filters.search, fieldLabels);
        matchDetails = dnMatches;
        
        // Suche in Positionen
        const dnPositions = allPositions.filter(p => p.deliveryNoteId === dn.id);
        dnPositions.forEach((pos, idx) => {
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
      
      return { ...dn, matchDetails };
    }).filter(dn => dn !== null);

    result = result.filter(dn => {
      const matchYear = filters.year === 'all' || 
        (dn.datum && new Date(dn.datum).getFullYear().toString() === filters.year);
      const matchStatus = filters.status === 'all' || dn.status === filters.status;
      const matchEmployee = filters.employee === 'all' || dn.erstelltDurch === filters.employee;
      
      return matchYear && matchStatus && matchEmployee;
    });

    return result.sort((a, b) => new Date(b.datum) - new Date(a.datum));
  }, [deliveryNotes, allPositions, filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-orange-50 p-3 rounded-lg">
              <Truck className="w-8 h-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Lieferscheine</h1>
              <p className="text-sm text-slate-600 mt-1">Übersicht aller Lieferscheine</p>
            </div>
          </div>
          <div className="ml-auto">
            <Link to={createPageUrl('DeliveryNoteDetail')}>
              <Button className="bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-2" />
                Neuer Lieferschein
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
                placeholder="Volltext-Suche: Lieferschein-Nr., Kunde, Positionen, Notizen..."
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

          {/* Schnellfilter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Jahr</label>
              <Select value={filters.year} onValueChange={(v) => handleFilterChange('year', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Jahre</SelectItem>
                  {yearOptions.slice(1).map(y => (
                    <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
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
                  <SelectItem value="all">Alle Status ({deliveryNotes.length})</SelectItem>
                  {statusOptions.slice(1).map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({deliveryNotes.filter(d => d.status === option.value).length})
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
                {filteredDeliveryNotes.length} Lieferschein{filteredDeliveryNotes.length !== 1 ? 'e' : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-1">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </Card>
            ))
          ) : filteredDeliveryNotes.length === 0 ? (
            <EmptyState
              title="Keine Lieferscheine gefunden"
              description="Erstellen Sie Ihren ersten Lieferschein"
              action={
                <Link to={createPageUrl('DeliveryNoteDetail')}>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Lieferschein erstellen
                  </Button>
                </Link>
              }
            />
          ) : (
            filteredDeliveryNotes.map(dn => (
              <Link key={dn.id} to={createPageUrl('DeliveryNoteDetail') + `?id=${dn.id}`}>
                <Card className="p-4 hover:shadow-md transition-all hover:border-slate-300 cursor-pointer group">
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="p-2.5 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors flex-shrink-0">
                      <Truck className="w-5 h-5 text-blue-600" />
                    </div>
                    
                    {/* Linke Seite: Lieferscheinnummer + Details */}
                    <div className="flex-1 min-w-0">
                      {/* Lieferscheinnummer + Status */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-slate-900 text-base whitespace-nowrap">
                          {dn.lieferscheinNummer}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          dn.status === 'erledigt' ? 'bg-green-100 text-green-700' :
                          dn.status === 'versendet' ? 'bg-orange-100 text-orange-700' :
                          dn.status === 'erstellt' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {dn.status}
                        </span>
                      </div>
                      
                      {/* Kunde + Objekt + Mitarbeiter */}
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
                          <span className="truncate font-medium text-slate-700">{dn.kundeName || 'Kein Kunde'}</span>
                        </span>
                        {dn.objektBezeichnung && (
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-slate-600">{dn.objektBezeichnung}</span>
                          </span>
                        )}
                        {dn.erstelltDurch && (
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <User className="w-4 h-4 text-blue-500" />
                            {dn.erstelltDurch}
                          </span>
                        )}
                      </div>
                      
                      {/* Suchtreffer */}
                      {filters.search && dn.matchDetails && dn.matchDetails.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <div className="text-xs text-slate-500 mb-2">Gefunden in:</div>
                          <div className="flex flex-wrap gap-2">
                            {dn.matchDetails.map((match, idx) => {
                              const highlightText = (text, search) => {
                                const parts = text.split(new RegExp(`(${search})`, 'gi'));
                                return parts.map((part, i) => 
                                  part.toLowerCase() === search.toLowerCase() ? 
                                    <span key={i} className="bg-yellow-200 font-semibold">{part}</span> : part
                                );
                              };
                              
                              const displayText = match.value.length > 60 
                                ? match.value.substring(0, 60) + '...' 
                                : match.value;
                              
                              return (
                                <div key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                                  {match.position && <span className="font-medium text-amber-900">Position {match.position} - </span>}
                                  <span className="font-medium text-amber-900">{match.field}:</span>
                                  <span className="text-slate-700">{highlightText(displayText, filters.search)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Rechte Seite: Ticketnummer, Datum, Actions */}
                    <div className="flex items-center gap-6 flex-shrink-0">
                      {/* Ticket Nummer - feste Breite */}
                      <div className="w-36 text-sm text-slate-600">
                        {dn.ticketNumber && (
                          <span className="flex items-center gap-1.5">
                            <Hash className="w-4 h-4 flex-shrink-0 text-blue-500" />
                            <span className="font-medium">{dn.ticketNumber}</span>
                          </span>
                        )}
                      </div>
                      
                      {/* Datum - feste Breite */}
                      <div className="w-28 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Calendar className="w-4 h-4 text-blue-500" />
                          {dn.datum ? moment(dn.datum).format('DD.MM.YYYY') : '-'}
                        </span>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 w-28 justify-end">
                        {dn.pdfUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(dn.pdfUrl, '_blank');
                            }}
                            className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 w-8"
                            title="PDF öffnen"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeleteClick(e, dn)}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lieferschein löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Der Lieferschein <strong>{selectedDN?.lieferscheinNummer}</strong> wird in den Papierkorb verschoben.
                Nach 10 Tagen wird er automatisch endgültig gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                In Papierkorb verschieben
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}