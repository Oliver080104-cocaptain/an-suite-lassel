'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Truck, Plus, Trash2, Search, X, Building2, Calendar, Hash, ChevronRight, Download } from 'lucide-react'
import Link from 'next/link'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import EmptyState from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { format } from 'date-fns'
import StatusBadge from '@/components/shared/StatusBadge'

const statusOptions = [
  { value: 'entwurf', label: 'Entwurf' },
  { value: 'erstellt', label: 'Erstellt' },
  { value: 'versendet', label: 'Versendet' },
  { value: 'erledigt', label: 'Erledigt' },
]

export default function LieferscheinePage() {
  const [filters, setFilters] = useState({ search: '', year: 'all', status: 'all', employee: 'all' })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedDN, setSelectedDN] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data: deliveryNotes = [], isLoading } = useQuery({
    queryKey: ['lieferscheine'],
    queryFn: async () => {
      // Papierkorb-Docs ausblenden (konsistent zu Angebote + Rechnungen).
      const { data, error } = await supabase
        .from('lieferscheine')
        .select('*')
        .is('geloescht_am', null)
        .order('created_at', { ascending: false })
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
      .channel('lieferscheine-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lieferscheine' }, () => {
        queryClient.invalidateQueries({ queryKey: ['lieferscheine'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Soft-Delete (konsistent zu Angebote + Rechnungen). Wandert in den
      // Papierkorb, nach 10 Tagen endgültige Löschung durch Job.
      const { error } = await supabase
        .from('lieferscheine')
        .update({ geloescht_am: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lieferscheine'] })
      queryClient.invalidateQueries({ queryKey: ['linkedDeliveryNotes'] })
      toast.success('Lieferschein in Papierkorb verschoben')
    },
    onError: (error: Error) => {
      toast.error('Fehler beim Löschen: ' + error.message)
    }
  })

  const handleDeleteClick = (e: React.MouseEvent, dn: any) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedDN(dn)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (selectedDN) deleteMutation.mutate(selectedDN.id)
    setDeleteDialogOpen(false)
    setSelectedDN(null)
  }

  const yearOptions = useMemo(() => {
    const years = [...new Set(deliveryNotes.map((dn: any) => dn.lieferdatum ? new Date(dn.lieferdatum).getFullYear() : null))]
      .filter(Boolean).sort((a, b) => (b as number) - (a as number))
    return years as number[]
  }, [deliveryNotes])

  const employeeOptions = useMemo(() => {
    const employees = new Set<string>()
    mitarbeiterList.forEach((m: any) => { if (m.name) employees.add(m.name) })
    return Array.from(employees).sort()
  }, [mitarbeiterList])

  const searchInObject = (obj: any, searchTerm: string, fieldLabels: Record<string, string> = {}) => {
    const lowerSearch = searchTerm.toLowerCase()
    const matches: any[] = []
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'string' && value.toLowerCase().includes(lowerSearch)) {
        matches.push({ field: fieldLabels[key] || key, value: value as string, key })
      }
    }
    return matches
  }

  const filteredDeliveryNotes = useMemo(() => {
    const fieldLabels: Record<string, string> = {
      lieferscheinnummer: 'Lieferschein-Nr.',
      kunde_name: 'Kunde',
      kunde_strasse: 'Kundenstraße',
      kunde_plz: 'PLZ',
      kunde_ort: 'Ort',
      objekt_adresse: 'Objekt',
      ticket_nummer: 'Ticketnummer',
      notizen: 'Notizen',
    }

    let result = deliveryNotes.map((dn: any) => {
      let matchDetails: any[] = []
      if (filters.search) {
        const dnMatches = searchInObject(dn, filters.search, fieldLabels)
        matchDetails = dnMatches
        if (matchDetails.length === 0) return null
      }
      return { ...dn, matchDetails }
    }).filter((dn: any) => dn !== null)

    result = result.filter((dn: any) => {
      const matchYear = filters.year === 'all' || (dn.lieferdatum && new Date(dn.lieferdatum).getFullYear().toString() === filters.year)
      const matchStatus = filters.status === 'all' || dn.status === filters.status
      return matchYear && matchStatus
    })

    return result.sort((a: any, b: any) => new Date(b.lieferdatum).getTime() - new Date(a.lieferdatum).getTime())
  }, [deliveryNotes, filters])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Truck className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-slate-900">Lieferscheine</h1>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-700 font-medium">Live</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-1">Übersicht aller Lieferscheine</p>
            </div>
          </div>
          <div className="ml-auto">
            <Link href="/lieferscheine/neu">
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                Neuer Lieferschein
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Jahr</label>
              <Select value={filters.year} onValueChange={(v) => handleFilterChange('year', v ?? 'all')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Jahre</SelectItem>
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Status</label>
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v ?? 'all')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status ({deliveryNotes.length})</SelectItem>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({deliveryNotes.filter((d: any) => d.status === option.value).length})
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
              icon={Truck}
              title="Keine Lieferscheine gefunden"
              description="Erstellen Sie Ihren ersten Lieferschein"
              action={
                <Link href="/lieferscheine/neu">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Lieferschein erstellen
                  </Button>
                </Link>
              }
            />
          ) : (
            filteredDeliveryNotes.map((dn: any) => (
              <Link key={dn.id} href={`/lieferscheine/${dn.id}`}>
                <Card className="p-4 hover:shadow-md transition-all hover:border-slate-300 cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors flex-shrink-0">
                      <Truck className="w-5 h-5 text-purple-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-slate-900 text-base whitespace-nowrap">
                          {dn.lieferscheinnummer}
                        </span>
                        <StatusBadge status={dn.status} />
                      </div>

                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="w-4 h-4 flex-shrink-0 text-purple-500" />
                          <span className="truncate font-medium text-slate-700">{dn.kunde_name || 'Kein Kunde'}</span>
                        </span>
                        {dn.objekt_adresse && (
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-slate-600">{dn.objekt_adresse}</span>
                          </span>
                        )}
                      </div>

                      {filters.search && dn.matchDetails && dn.matchDetails.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <div className="text-xs text-slate-500 mb-2">Gefunden in:</div>
                          <div className="flex flex-wrap gap-2">
                            {dn.matchDetails.map((match: any, idx: number) => {
                              const displayText = match.value.length > 60 ? match.value.substring(0, 60) + '...' : match.value
                              const parts = displayText.split(new RegExp(`(${filters.search})`, 'gi'))
                              return (
                                <div key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                                  {match.position && <span className="font-medium text-amber-900">Position {match.position} - </span>}
                                  <span className="font-medium text-amber-900">{match.field}:</span>
                                  <span className="text-slate-700">
                                    {parts.map((part: string, i: number) =>
                                      part.toLowerCase() === filters.search.toLowerCase()
                                        ? <span key={i} className="bg-yellow-200 font-semibold">{part}</span>
                                        : part
                                    )}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="w-36 text-sm text-slate-600">
                        {dn.ticket_nummer && (
                          <span className="flex items-center gap-1.5">
                            <Hash className="w-4 h-4 flex-shrink-0 text-purple-500" />
                            <span className="font-medium">{dn.ticket_nummer}</span>
                          </span>
                        )}
                      </div>

                      <div className="w-28 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Calendar className="w-4 h-4 text-purple-500" />
                          {dn.lieferdatum ? format(new Date(dn.lieferdatum), 'dd.MM.yyyy') : '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 w-28 justify-end">
                        {dn.pdf_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              window.open(dn.pdf_url, '_blank')
                            }}
                            className="text-slate-400 hover:text-purple-600 hover:bg-purple-50 h-8 w-8"
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
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-colors" />
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
                Der Lieferschein <strong>{selectedDN?.lieferscheinnummer}</strong> wird endgültig gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
