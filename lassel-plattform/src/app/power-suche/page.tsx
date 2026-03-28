'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const fieldLabels: Record<string, string> = {
  ticketnummer: 'Ticketnummer',
  ticketErstelltVon: 'Ticket erstellt von',
  projektstatus: 'Projektstatus',
  prioritaet: 'Priorität',
  besichtigungDurch: 'Besichtigung durch',
  kundeGasse: 'Kunde/Gasse',
  gasseZusatz: 'Gasse Zusatz',
  dienstleistungen: 'Dienstleistungen',
  dienstleistungZusatz: 'Dienstleistung Zusatz',
  ansprechperson: 'Ansprechperson',
  zugangsbeschreibung: 'Zugangsbeschreibung',
  zustaendigeHausverwaltung: 'Zuständige Hausverwaltung',
  hausinhabung: 'Hausinhabung',
  bezirk: 'Bezirk',
  vermittlerVonTicket: 'Vermittler',
  geschaeftsfallnummer: 'Geschäftsfallnummer',
  schluesselnummern: 'Schlüsselnummern',
  besichtigungNotiz: 'Besichtigung Notiz',
  angebotsbemerkung: 'Angebotsbemerkung',
  baustelleBemerkung: 'Baustelle Bemerkung',
  notizSonderfaelle: 'Notiz Sonderfälle',
  ticketBesitzer: 'Ticket-Besitzer',
}

const normalizeText = (text: any): string => {
  if (!text) return ''
  return String(text)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/straße/g, 'str')
    .replace(/strasse/g, 'str')
    .trim()
}

const highlightMatch = (text: any, searchTerm: string): React.ReactNode => {
  if (!text || !searchTerm) return String(text || '')
  const textStr = String(text)
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = textStr.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-orange-200 font-semibold">{part}</mark> : part
  )
}

const findMatchingFields = (ticket: any, searchTerm: string) => {
  if (!searchTerm) return []
  const searchLower = searchTerm.toLowerCase()
  const searchNormalized = normalizeText(searchTerm)
  const skipFields = ['id', 'created_date', 'updated_date', 'created_by', 'ticketIdZoho']
  const matches: { label: string; value: any }[] = []

  Object.keys(ticket).filter(k => !skipFields.includes(k)).forEach(key => {
    const value = ticket[key]
    if (value) {
      const valueLower = String(value).toLowerCase()
      const valueNormalized = normalizeText(value)
      if (valueLower.includes(searchLower) || valueNormalized.includes(searchNormalized)) {
        matches.push({ label: fieldLabels[key] || key, value })
      }
    }
  })
  return matches
}

const priorityColors: Record<string, string> = {
  niedrig: 'bg-blue-100 text-blue-800',
  mittel: 'bg-yellow-100 text-yellow-800',
  hoch: 'bg-orange-100 text-orange-800',
  kritisch: 'bg-red-100 text-red-800',
}

export default function PowerSuchePage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [priorityFilter, setPriorityFilter] = useState('alle')

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').order('created_date', { ascending: false }).limit(1000)
      if (error) throw error
      return data || []
    },
  })

  const filteredTickets = useMemo(() => {
    return (tickets as any[]).filter((ticket: any) => {
      if (statusFilter !== 'alle' && ticket.projektstatus !== statusFilter) return false
      if (priorityFilter !== 'alle' && ticket.prioritaet !== priorityFilter) return false
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const searchNormalized = normalizeText(searchTerm)
        return Object.keys(ticket).some(key => {
          if (['id', 'created_date', 'updated_date', 'created_by'].includes(key)) return false
          const value = ticket[key]
          if (!value) return false
          const valueLower = String(value).toLowerCase()
          const valueNormalized = normalizeText(value)
          return valueLower.includes(searchLower) || valueNormalized.includes(searchNormalized)
        })
      }
      return true
    })
  }, [tickets, searchTerm, statusFilter, priorityFilter])

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Power Suche</h1>
          <p className="text-slate-600">Durchsuchen Sie alle Tickets aus Zoho</p>
        </div>

        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Suchen Sie nach Ticketnummer, Kunde, Hausverwaltung, Bemerkungen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 h-12 text-base sm:text-lg"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'alle')}>
                <SelectTrigger><SelectValue placeholder="Projektstatus" /></SelectTrigger>
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
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v ?? 'alle')}>
                <SelectTrigger><SelectValue placeholder="Priorität" /></SelectTrigger>
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

        <div className="mb-4 text-sm text-slate-600">
          {filteredTickets.length} {filteredTickets.length === 1 ? 'Ticket' : 'Tickets'} gefunden
        </div>

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
            {filteredTickets.map((ticket: any) => {
              const matchingFields = findMatchingFields(ticket, searchTerm)
              return (
                <Card key={ticket.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-4 gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          {ticket.ticketIdZoho ? (
                            <a
                              href={`https://crm.zoho.eu/crm/org20107446748/tab/CustomModule17/${ticket.ticketIdZoho}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-lg sm:text-xl font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                            >
                              {highlightMatch(ticket.ticketnummer, searchTerm)}
                            </a>
                          ) : (
                            <h3 className="text-lg sm:text-xl font-semibold text-slate-900">
                              {highlightMatch(ticket.ticketnummer, searchTerm)}
                            </h3>
                          )}
                          {ticket.prioritaet && (
                            <Badge className={priorityColors[ticket.prioritaet] || 'bg-slate-100 text-slate-700'}>
                              {ticket.prioritaet}
                            </Badge>
                          )}
                          {ticket.aktiv === false && (
                            <Badge variant="outline" className="text-slate-500">Inaktiv</Badge>
                          )}
                        </div>
                        <div className="text-slate-600 space-y-1 text-sm">
                          {ticket.kundeGasse && (
                            <div><span className="font-medium">Kunde/Gasse:</span> {highlightMatch(ticket.kundeGasse, searchTerm)}</div>
                          )}
                          {ticket.zustaendigeHausverwaltung && (
                            <div><span className="font-medium">Hausverwaltung:</span> {highlightMatch(ticket.zustaendigeHausverwaltung, searchTerm)}</div>
                          )}
                          {ticket.projektstatus && (
                            <div><span className="font-medium">Status:</span> {highlightMatch(ticket.projektstatus, searchTerm)}</div>
                          )}
                          {ticket.dienstleistungen && (
                            <div><span className="font-medium">Dienstleistungen:</span> {highlightMatch(ticket.dienstleistungen, searchTerm)}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {ticket.angebotLink && (
                          <a href={ticket.angebotLink} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700">
                            <ExternalLink className="w-5 h-5" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-slate-500">
                      {ticket.besichtigungDurch && (
                        <div><span className="font-medium">Besichtigung:</span> {ticket.besichtigungDurch}</div>
                      )}
                      {ticket.bezirk && (
                        <div><span className="font-medium">Bezirk:</span> {ticket.bezirk}</div>
                      )}
                      {ticket.geschaeftsfallnummer && (
                        <div><span className="font-medium">Geschäftsfall:</span> {ticket.geschaeftsfallnummer}</div>
                      )}
                      {ticket.created_date && (
                        <div><span className="font-medium">Erstellt:</span> {format(new Date(ticket.created_date), 'dd.MM.yyyy', { locale: de })}</div>
                      )}
                    </div>

                    {matchingFields.length > 0 && searchTerm && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="text-xs font-medium text-slate-500 mb-2">Suchtreffer in folgenden Feldern:</div>
                        <div className="space-y-2">
                          {matchingFields.map((field, idx) => (
                            <div key={idx} className="p-2 bg-orange-50 border border-orange-200 rounded">
                              <div className="text-xs font-medium text-orange-900 mb-1">{field.label}</div>
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
