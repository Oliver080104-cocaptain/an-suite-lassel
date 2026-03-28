import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default function PowerSuche() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [priorityFilter, setPriorityFilter] = useState('alle');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => base44.entities.Ticket.list('-created_date', 1000),
  });

  // Funktion zum Highlighting von Suchtreffern
  const highlightMatch = (text, searchTerm) => {
    if (!text || !searchTerm) return text;
    
    const textStr = String(text);
    const searchStr = String(searchTerm);
    const regex = new RegExp(`(${searchStr})`, 'gi');
    const parts = textStr.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-orange-200 font-semibold">{part}</mark> : part
    );
  };

  // Funktion zur intelligenten Normalisierung (ß→ss, Straße→Str, etc.)
  const normalizeText = (text) => {
    if (!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/straße/g, 'strasse')
      .replace(/strasse/g, 'str')
      .replace(/straße/g, 'str')
      .trim();
  };

  // Funktion zum Finden von Treffern in allen Feldern
  const findMatchingFields = (ticket, searchTerm) => {
    if (!searchTerm) return [];
    
    const searchLower = searchTerm.toLowerCase();
    const searchNormalized = normalizeText(searchTerm);
    
    // Alle Felder der Ticket-Entität durchsuchen
    const allFields = Object.keys(ticket).filter(key => 
      !['id', 'created_date', 'updated_date', 'created_by'].includes(key)
    );
    
    const matches = [];
    
    // Freundliche Feldnamen-Mapping
    const fieldLabels = {
      ticketnummer: 'Ticketnummer',
      ticketErstelltVon: 'Ticket erstellt von',
      projektstatus: 'Projektstatus',
      prioritaet: 'Priorität',
      aktiv: 'Aktiv',
      besTerminVon: 'BES Termin von',
      besTerminBis: 'BES Termin bis',
      besichtigungDurch: 'Besichtigung durch',
      kundeGasse: 'Kunde/Gasse',
      gasseZusatz: 'Gasse Zusatz',
      dienstleistungen: 'Dienstleistungen',
      dienstleistungZusatz: 'Dienstleistung Zusatz',
      skizzenLink: 'Skizzen Link',
      ansprechperson: 'Ansprechperson',
      zugangsbeschreibung: 'Zugangsbeschreibung',
      zustaendigeHausverwaltung: 'Zuständige Hausverwaltung',
      hausinhabung: 'Hausinhabung',
      bezirk: 'Bezirk',
      vermittlerVonTicket: 'Vermittler',
      schluesselVonHV: 'Schlüssel von HV',
      terminvereinbarungNotwendig: 'Terminvereinbarung notwendig',
      schluesselStatus: 'Schlüssel Status',
      dachbodenOffen: 'Dachboden offen',
      geschaeftsfallnummer: 'Geschäftsfallnummer',
      schluesselnummern: 'Schlüsselnummern',
      besichtigungNotiz: 'Besichtigung Notiz',
      angebotLink: 'Angebot Link',
      angebotErstelltDurch: 'Angebot erstellt durch',
      angebotsbemerkung: 'Angebotsbemerkung',
      ordnerlinkAngebote: 'Ordnerlink Angebote',
      ordnerlinkFotos: 'Ordnerlink Fotos',
      ordnerlinkWorkdrive: 'Ordnerlink Workdrive',
      ordnerlinkLieferscheine: 'Ordnerlink Lieferscheine',
      ordnerlinkFD: 'Ordnerlink FD',
      ordnerlinkRechnungen: 'Ordnerlink Rechnungen',
      baustelleBemerkung: 'Baustelle Bemerkung',
      notizSonderfaelle: 'Notiz Sonderfälle',
      verputzschadenS: 'Verputzschäden Seite',
      verputzschadenH: 'Verputzschäden Hof',
      gesimseS: 'Gesimse Seite',
      gesimseH: 'Gesimse Hof',
      deckung: 'Deckung',
      loetnaehte: 'Lötnähte',
      roststellen: 'Roststellen',
      verblechungen: 'Verblechungen',
      rauchfangkoepfe: 'Rauchfangköpfe',
      taubenabwehr: 'Taubenabwehr',
      aesteBewuchs: 'Äste/Bewuchs',
      sonstige: 'Sonstige',
      bemerkungKV1: 'Bemerkung/KV 1',
      bemerkungKV2: 'Bemerkung/KV 2',
      bemerkungKV3: 'Bemerkung/KV 3',
      bemerkungKV4: 'Bemerkung/KV 4',
      bemerkungKV5: 'Bemerkung/KV 5',
      bemerkungKV6: 'Bemerkung/KV 6',
      bemerkungKV7: 'Bemerkung/KV 7',
      bemerkungKV8: 'Bemerkung/KV 8',
      bemerkungKV9: 'Bemerkung/KV 9',
      bemerkungKV10: 'Bemerkung/KV 10',
      bemerkungKV11: 'Bemerkung/KV 11',
      infosDachrinnenCheckliste: 'Infos Dachrinnen Checkliste',
      ticketBesitzer: 'Ticket-Besitzer',
    };
    
    allFields.forEach(fieldKey => {
      const value = ticket[fieldKey];
      if (value) {
        const valueLower = String(value).toLowerCase();
        const valueNormalized = normalizeText(value);
        
        // Prüfe beide: exakte Suche und normalisierte Suche
        if (valueLower.includes(searchLower) || valueNormalized.includes(searchNormalized)) {
          matches.push({
            label: fieldLabels[fieldKey] || fieldKey,
            value: value
          });
        }
      }
    });
    
    return matches;
  };

  // Gefilterte Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      // Statusfilter
      if (statusFilter !== 'alle' && ticket.projektstatus !== statusFilter) {
        return false;
      }
      
      // Prioritätsfilter
      if (priorityFilter !== 'alle' && ticket.prioritaet !== priorityFilter) {
        return false;
      }
      
      // Suchfilter (Volltextsuche durch ALLE Felder mit intelligenter Normalisierung)
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const searchNormalized = normalizeText(searchTerm);
        
        // Durchsuche alle Felder außer System-Felder
        return Object.keys(ticket).some(key => {
          if (['id', 'created_date', 'updated_date', 'created_by'].includes(key)) {
            return false;
          }
          const value = ticket[key];
          if (!value) return false;
          
          const valueLower = String(value).toLowerCase();
          const valueNormalized = normalizeText(value);
          
          // Prüfe beide: exakte Suche und normalisierte Suche
          return valueLower.includes(searchLower) || valueNormalized.includes(searchNormalized);
        });
      }
      
      return true;
    });
  }, [tickets, searchTerm, statusFilter, priorityFilter]);

  const priorityColors = {
    niedrig: 'bg-blue-100 text-blue-800',
    mittel: 'bg-yellow-100 text-yellow-800',
    hoch: 'bg-orange-100 text-orange-800',
    kritisch: 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Power Suche</h1>
          <p className="text-slate-600">Durchsuchen Sie alle Tickets aus Zoho</p>
        </div>

        {/* Suchfeld & Filter */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Suchen Sie nach Ticketnummer, Kunde, Hausverwaltung, Bemerkungen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12 text-lg"
            />
          </div>

          {/* Schnellfilter */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Projektstatus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  <SelectItem value="Angebot in Besichtigung">Angebot in Besichtigung</SelectItem>
                  <SelectItem value="Besichtigung erfolgt">Besichtigung erfolgt</SelectItem>
                  <SelectItem value="Angebot erstellt">Angebot erstellt</SelectItem>
                  <SelectItem value="Auftrag erteilt">Auftrag erteilt</SelectItem>
                  <SelectItem value="In Bearbeitung">In Bearbeitung</SelectItem>
                  <SelectItem value="Abgeschlossen">Abgeschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priorität" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Prioritäten</SelectItem>
                  <SelectItem value="niedrig">Niedrig</SelectItem>
                  <SelectItem value="mittel">Mittel</SelectItem>
                  <SelectItem value="hoch">Hoch</SelectItem>
                  <SelectItem value="kritisch">Kritisch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Ergebnisanzahl */}
        <div className="mb-4 text-sm text-slate-600">
          {filteredTickets.length} {filteredTickets.length === 1 ? 'Ticket' : 'Tickets'} gefunden
        </div>

        {/* Ticket-Liste */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-500">Laden...</div>
        ) : filteredTickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              Keine Tickets gefunden
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const matchingFields = findMatchingFields(ticket, searchTerm);
              
              return (
                <Card key={ticket.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {ticket.ticketIdZoho ? (
                            <a
                              href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${ticket.ticketIdZoho}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xl font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                            >
                              {highlightMatch(ticket.ticketnummer, searchTerm)}
                            </a>
                          ) : (
                            <h3 className="text-xl font-semibold text-slate-900">
                              {highlightMatch(ticket.ticketnummer, searchTerm)}
                            </h3>
                          )}
                          {ticket.prioritaet && (
                            <Badge className={priorityColors[ticket.prioritaet]}>
                              {ticket.prioritaet}
                            </Badge>
                          )}
                          {!ticket.aktiv && (
                            <Badge variant="outline" className="text-slate-500">
                              Inaktiv
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-slate-600 space-y-1">
                          {ticket.kundeGasse && (
                            <div>
                              <span className="font-medium">Kunde/Gasse:</span>{' '}
                              {highlightMatch(ticket.kundeGasse, searchTerm)}
                            </div>
                          )}
                          {ticket.zustaendigeHausverwaltung && (
                            <div>
                              <span className="font-medium">Hausverwaltung:</span>{' '}
                              {highlightMatch(ticket.zustaendigeHausverwaltung, searchTerm)}
                            </div>
                          )}
                          {ticket.projektstatus && (
                            <div>
                              <span className="font-medium">Status:</span>{' '}
                              {highlightMatch(ticket.projektstatus, searchTerm)}
                            </div>
                          )}
                          {ticket.dienstleistungen && (
                            <div>
                              <span className="font-medium">Dienstleistungen:</span>{' '}
                              {highlightMatch(ticket.dienstleistungen, searchTerm)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {ticket.angebotLink && (
                          <a
                            href={ticket.angebotLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-600 hover:text-orange-700"
                          >
                            <ExternalLink className="w-5 h-5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Zusätzliche Infos */}
                    <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-sm text-slate-500">
                      {ticket.besichtigungDurch && (
                        <div>
                          <span className="font-medium">Besichtigung:</span> {ticket.besichtigungDurch}
                        </div>
                      )}
                      {ticket.bezirk && (
                        <div>
                          <span className="font-medium">Bezirk:</span> {ticket.bezirk}
                        </div>
                      )}
                      {ticket.geschaeftsfallnummer && (
                        <div>
                          <span className="font-medium">Geschäftsfall:</span> {ticket.geschaeftsfallnummer}
                        </div>
                      )}
                      {ticket.created_date && (
                        <div>
                          <span className="font-medium">Erstellt:</span>{' '}
                          {format(new Date(ticket.created_date), 'dd.MM.yyyy', { locale: de })}
                        </div>
                      )}
                    </div>

                    {/* Suchtreffer anzeigen - ganz unten */}
                    {matchingFields.length > 0 && searchTerm && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="text-xs font-medium text-slate-500 mb-2">
                          Suchtreffer in folgenden Feldern:
                        </div>
                        <div className="space-y-2">
                          {matchingFields.map((field, idx) => (
                            <div key={idx} className="p-2 bg-orange-50 border border-orange-200 rounded">
                              <div className="text-xs font-medium text-orange-900 mb-1">
                                {field.label}
                              </div>
                              <div className="text-sm text-slate-700 line-clamp-2">
                                {highlightMatch(field.value, searchTerm)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}