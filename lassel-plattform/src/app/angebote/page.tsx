'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Plus, X, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import EmptyState from '@/components/shared/EmptyState'
import OfferListItem from '@/components/offers/OfferListItem'
import { format } from 'date-fns'

const offerStatusOptions = [
  { value: 'all', label: 'Alle Status' },
  { value: 'draft', label: 'Entwurf' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung' },
  { value: 'versendet', label: 'Versendet' },
  { value: 'angenommen', label: 'Angenommen' },
  { value: 'abgelehnt', label: 'Abgelehnt' },
  { value: 'abgelaufen', label: 'Abgelaufen' },
]

export default function AngebotePage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    search: '',
    year: 'all',
    status: 'all',
    employee: 'all',
  })

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('angebote')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: allPositions = [] } = useQuery({
    queryKey: ['offerPositions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('angebot_positionen').select('*')
      if (error) throw error
      return data || []
    },
  })

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitarbeiter')
        .select('*')
        .eq('aktiv', true)
        .order('name')
      if (error) throw error
      return data || []
    },
  })

  const deleteOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('angebote')
        .update({ geloescht_am: new Date().toISOString() })
        .eq('id', offerId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      toast.success('Angebot in Papierkorb verschoben')
    },
    onError: (error: Error) => {
      toast.error('Fehler beim Löschen: ' + error.message)
    },
  })

  // Jahre für Filter
  const yearOptions = useMemo(() => {
    const years = new Set<number>()
    offers.forEach((o: { angebotsdatum?: string }) => {
      if (o.angebotsdatum) years.add(new Date(o.angebotsdatum).getFullYear())
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [offers])

  // Mitarbeiter kombinieren
  const employeeOptions = useMemo(() => {
    const employees = new Set<string>()
    mitarbeiterList.forEach((m: { name?: string }) => {
      if (m.name) employees.add(m.name)
    })
    return Array.from(employees).sort()
  }, [mitarbeiterList])

  const searchInObject = (obj: Record<string, unknown>, searchTerm: string, fieldNames: Record<string, string> = {}) => {
    if (!obj) return []
    const term = searchTerm.toLowerCase()
    const matches: { field: string; value: string; key: string }[] = []
    Object.entries(obj).forEach(([key, value]) => {
      if (value === null || value === undefined) return
      const stringValue =
        typeof value === 'string' ? value : typeof value === 'number' ? value.toString() : ''
      if (stringValue.toLowerCase().includes(term)) {
        const fieldLabel = (fieldNames as Record<string, string>)[key] || key
        matches.push({ field: fieldLabel, value: stringValue, key })
      }
    })
    return matches
  }

  const filteredOffers = useMemo(() => {
    const fieldLabels: Record<string, string> = {
      angebotsnummer: 'Angebotsnummer',
      kunde_name: 'Rechnungsempfänger',
      kunde_strasse: 'RE Straße',
      kunde_plz: 'RE PLZ',
      kunde_ort: 'RE Ort',
      objekt_bezeichnung: 'Objektbezeichnung',
      objekt_adresse: 'Objekt Adresse',
      notizen: 'Notizen',
      ticket_nummer: 'Ticketnummer',
      status: 'Status',
    }

    const filtered = offers.map((o: Record<string, unknown>) => {
      let matchedFields: { field: string; value: string; key: string }[] = []
      if (filters.search) {
        const search = filters.search.toLowerCase()
        const offerMatches = searchInObject(o, search, fieldLabels)
        matchedFields = [...offerMatches]
        const offerPositions = allPositions.filter((p: { angebot_id?: string }) => p.angebot_id === o.id)
        offerPositions.forEach((pos: Record<string, unknown>, idx: number) => {
          const posMatches = searchInObject(pos, search, {
            produktName: `Position ${idx + 1} - Produkt`,
            beschreibung: `Position ${idx + 1} - Beschreibung`,
            menge: `Position ${idx + 1} - Menge`,
            einheit: `Position ${idx + 1} - Einheit`,
          })
          matchedFields = [...matchedFields, ...posMatches]
        })
        if (matchedFields.length === 0) return null
      }
      return { ...o, _matchedFields: matchedFields }
    }).filter((o) => o !== null) as Record<string, unknown>[]

    const finalFiltered = filtered.filter((o: Record<string, unknown>) => {
      if (filters.year !== 'all' && o.angebotsdatum) {
        if (new Date(o.angebotsdatum as string).getFullYear() !== parseInt(filters.year)) return false
      }
      if (filters.status !== 'all' && o.status !== filters.status) return false
      return true
    })

    return finalFiltered.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aFromApi = a.source === 'zoho' || a.entityType === 'ticket' || a.entityType === 'deal'
      const bFromApi = b.source === 'zoho' || b.entityType === 'ticket' || b.entityType === 'deal'
      if (aFromApi && !bFromApi) return -1
      if (!aFromApi && bFromApi) return 1
      return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    })
  }, [offers, allPositions, filters])

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters({ search: '', year: 'all', status: 'all', employee: 'all' })
  }

  const activeFilterCount =
    (filters.year !== 'all' ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0) +
    (filters.employee !== 'all' ? 1 : 0) +
    (filters.search ? 1 : 0)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
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
            <Link href="/angebote/neu" className="w-full sm:w-auto">
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
              Filter aktiv: <span className="font-medium">{activeFilterCount}</span>
            </div>
            {activeFilterCount > 0 && (
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
              <Select value={filters.year} onValueChange={(v) => handleFilterChange('year', v ?? 'all')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Jahre</SelectItem>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v ?? 'all')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {offerStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.value === 'all' ? offers.length : offers.filter((o: { status?: string }) => o.status === option.value).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="hidden sm:block">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Mitarbeiter</label>
              <Select value={filters.employee} onValueChange={(v) => handleFilterChange('employee', v ?? 'all')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {employeeOptions.map((emp) => (
                    <SelectItem key={emp} value={emp}>
                      {emp}
                    </SelectItem>
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
            Array(5)
              .fill(0)
              .map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : filteredOffers.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Keine Angebote gefunden"
              description={
                filters.search || filters.status !== 'all'
                  ? 'Versuche andere Filtereinstellungen'
                  : 'Erstelle dein erstes Angebot'
              }
              action={
                !filters.search && filters.status === 'all' ? (
                  <Link href="/angebote/neu">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Neues Angebot
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            filteredOffers.map((offer: Record<string, unknown>) => (
              <OfferListItem
                key={offer.id as string}
                offer={offer}
                onDelete={deleteOfferMutation.mutate}
                searchTerm={filters.search}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
