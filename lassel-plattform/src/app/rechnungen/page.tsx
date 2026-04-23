'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Receipt, Plus, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import EmptyState from '@/components/shared/EmptyState'
import InvoiceListItem from '@/components/invoices/InvoiceListItem'
import { getYear } from 'date-fns'

const invoiceStatusOptions = [
  { value: 'entwurf', label: 'Entwurf' },
  { value: 'offen', label: 'Offen' },
  { value: 'teilweise_bezahlt', label: 'Teilweise bezahlt' },
  { value: 'bezahlt', label: 'Bezahlt' },
  { value: 'storniert', label: 'Storniert' },
  { value: 'mahnung', label: 'Mahnung' },
]

const invoiceTypeOptions = [
  { value: 'normal', label: 'Normal (RE-)' },
  { value: 'anzahlung', label: 'Anzahlung (AN-)' },
  { value: 'teilrechnung', label: 'Teilrechnung (TR-)' },
  { value: 'schlussrechnung', label: 'Schlussrechnung (SR-)' },
  { value: 'gutschrift', label: 'Gutschrift (GS-)' },
  { value: 'storno', label: 'Storno' },
]

export default function RechnungenPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    search: '',
    year: 'all',
    status: 'all',
    type: 'all',
    employee: 'all'
  })

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['rechnungen'],
    queryFn: async () => {
      // Nur nicht-gelöschte (Papierkorb ausgeblendet). Analog zu Angebote.
      const { data, error } = await supabase
        .from('rechnungen')
        .select('*')
        .is('geloescht_am', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: allPositions = [] } = useQuery({
    queryKey: ['rechnungPositionen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rechnung_positionen').select('*')
      if (error) throw error
      return data || []
    }
  })

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mitarbeiter').select('*').eq('aktiv', true).order('name')
      if (error) throw error
      return data || []
    }
  })

  useEffect(() => {
    const channel = supabase
      .channel('rechnungen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rechnungen' }, () => {
        queryClient.invalidateQueries({ queryKey: ['rechnungen'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      // Soft-Delete (konsistent zu Angebote). Dokument landet im Papierkorb,
      // geloescht_am-Timestamp wird gesetzt. Nach 30 Tagen räumt der Cron
      // (src/app/api/cron/cleanup-papierkorb) den Papierkorb endgültig.
      const { error } = await supabase
        .from('rechnungen')
        .update({ geloescht_am: new Date().toISOString() })
        .eq('id', invoiceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rechnungen'] })
      queryClient.invalidateQueries({ queryKey: ['linkedInvoices'] })
      toast.success('Rechnung in Papierkorb verschoben')
    },
    onError: (error: Error) => {
      toast.error('Fehler beim Löschen: ' + error.message)
    }
  })

  const yearOptions = useMemo(() => {
    const years = new Set<number>()
    invoices.forEach((i: any) => {
      if (i.rechnungsdatum) years.add(getYear(new Date(i.rechnungsdatum)))
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [invoices])

  const employeeOptions = useMemo(() => {
    const employees = new Set<string>()
    mitarbeiterList.forEach((m: any) => { if (m.name) employees.add(m.name) })
    return Array.from(employees).sort()
  }, [mitarbeiterList])

  const searchInObject = (obj: any, searchTerm: string, fieldLabels: Record<string, string> = {}) => {
    const lowerSearch = searchTerm.toLowerCase()
    const matches: Array<{ field: string; value: string; key: string }> = []
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'string' && value.toLowerCase().includes(lowerSearch)) {
        matches.push({ field: fieldLabels[key] || key, value: value as string, key })
      }
    }
    return matches
  }

  const filteredInvoices = useMemo(() => {
    const fieldLabels: Record<string, string> = {
      rechnungsnummer: 'Rechnungs-Nr.',
      kunde_name: 'Kunde',
      kunde_strasse: 'Kundenstraße',
      kunde_plz: 'PLZ',
      kunde_ort: 'Ort',
      notizen: 'Notizen',
    }

    let result = invoices.map((invoice: any) => {
      let matchDetails: any[] = []
      if (filters.search) {
        const invoiceMatches = searchInObject(invoice, filters.search, fieldLabels)
        matchDetails = invoiceMatches
        const invoicePositions = allPositions.filter((p: any) => p.rechnung_id === invoice.id)
        invoicePositions.forEach((pos: any, idx: number) => {
          const posLabels: Record<string, string> = { produktName: 'Produkt', beschreibung: 'Beschreibung', menge: 'Menge', einheit: 'Einheit' }
          const posMatches = searchInObject(pos, filters.search, posLabels)
          posMatches.forEach(match => { matchDetails.push({ ...match, position: idx + 1 }) })
        })
        if (matchDetails.length === 0) return null
      }
      return { ...invoice, matchDetails }
    }).filter((i: any) => i !== null)

    result = result.filter((i: any) => {
      if (filters.year !== 'all' && i.rechnungsdatum) {
        if (getYear(new Date(i.rechnungsdatum)) !== parseInt(filters.year)) return false
      }
      if (filters.status !== 'all' && i.status !== filters.status) return false
      if (filters.type !== 'all' && (i.rechnungstyp || 'normal') !== filters.type) return false
      return true
    })

    return result.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [invoices, allPositions, filters])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters({ search: '', year: 'all', status: 'all', type: 'all', employee: 'all' })
  }

  const activeFilterCount =
    (filters.year !== 'all' ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0) +
    (filters.type !== 'all' ? 1 : 0) +
    (filters.employee !== 'all' ? 1 : 0) +
    (filters.search ? 1 : 0)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 p-3 rounded-lg">
              <Receipt className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-slate-900">Rechnungen</h1>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-700 font-medium">Live</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-1">Rechnungsverwaltung</p>
            </div>
          </div>
          <div className="ml-auto">
            <Link href="/rechnungen/neu">
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" />
                Neue Rechnung
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
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

          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-600">
              Filter aktiv: <span className="font-medium">{activeFilterCount}</span>
            </div>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={resetFilters} className="text-slate-600 hover:text-slate-900">
                <X className="w-4 h-4 mr-2" />
                Filter zurücksetzen
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Jahr</label>
              <Select value={filters.year} onValueChange={(v) => handleFilterChange('year', v ?? 'all')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v ?? 'all')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status ({invoices.length})</SelectItem>
                  {invoiceStatusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({invoices.filter((i: any) => i.status === option.value).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Typ</label>
              <Select value={filters.type} onValueChange={(v) => handleFilterChange('type', v ?? 'all')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Typen ({invoices.length})</SelectItem>
                  {invoiceTypeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({invoices.filter((i: any) => i.rechnungstyp === option.value).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Mitarbeiter</label>
              <Select value={filters.employee} onValueChange={(v) => handleFilterChange('employee', v ?? 'all')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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

        <div className="space-y-3">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Keine Rechnungen gefunden"
              description={filters.search || filters.status !== 'all' ? 'Versuche andere Filtereinstellungen' : 'Erstelle deine erste Rechnung'}
              action={
                !filters.search && filters.status === 'all' ? (
                  <Link href="/rechnungen/neu">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Neue Rechnung
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            filteredInvoices.map((invoice: any) => (
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
  )
}
