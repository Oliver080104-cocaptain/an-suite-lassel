'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  TrendingUp, Euro, FileText, Receipt, Users, Lock, BarChart3,
  Table as TableIcon, Trash2, Plus, Loader2
} from 'lucide-react'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import { toast } from 'sonner'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

const PIN = '1234'

const MONTHS = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember',
]

function fmt(n: number) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [performanceView, setPerformanceView] = useState<'table'|'chart'>('table')
  const [revenueChartType, setRevenueChartType] = useState<'bar'|'line'>('bar')
  const [newMitarbeiterName, setNewMitarbeiterName] = useState('')
  const [addingMitarbeiter, setAddingMitarbeiter] = useState(false)

  const { data: offers = [] } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data } = await supabase.from('angebote').select('*').is('geloescht_am', null)
      return data || []
    },
    enabled: isAuthenticated,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await supabase.from('rechnungen').select('*')
      return data || []
    },
    enabled: isAuthenticated,
  })

  const { data: vermittler = [] } = useQuery({
    queryKey: ['vermittler'],
    queryFn: async () => {
      const { data } = await supabase.from('vermittler').select('*').eq('status', 'aktiv')
      return data || []
    },
    enabled: isAuthenticated,
  })

  const { data: mitarbeiterList = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data } = await supabase.from('mitarbeiter').select('*').order('name')
      return data || []
    },
    enabled: isAuthenticated,
  })

  const addMitarbeiterMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('mitarbeiter').insert({ name, aktiv: true })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mitarbeiter'] })
      toast.success('Mitarbeiter hinzugefügt')
      setNewMitarbeiterName('')
    },
  })

  const deleteMitarbeiterMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mitarbeiter').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mitarbeiter'] })
      toast.success('Mitarbeiter entfernt')
    },
  })

  const year = parseInt(selectedYear)

  // Filter helpers
  const inYear = (item: Record<string, unknown>) =>
    item.datum && new Date(item.datum as string).getFullYear() === year
  const inMonth = (item: Record<string, unknown>) =>
    item.datum &&
    new Date(item.datum as string).getFullYear() === year &&
    new Date(item.datum as string).getMonth() === selectedMonth

  const thisYearOffers = useMemo(() => offers.filter(inYear), [offers, year])
  const thisYearInvoices = useMemo(() => invoices.filter(inYear), [invoices, year])

  // KPIs
  const jahresumsatz = useMemo(
    () => thisYearInvoices.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0),
    [thisYearInvoices]
  )
  const prevYearInvoices = useMemo(
    () => invoices.filter((i: Record<string, unknown>) => i.datum && new Date(i.datum as string).getFullYear() === year - 1),
    [invoices, year]
  )
  const prevJahresumsatz = useMemo(
    () => prevYearInvoices.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0),
    [prevYearInvoices]
  )
  const yoyChange = prevJahresumsatz > 0 ? ((jahresumsatz - prevJahresumsatz) / prevJahresumsatz) * 100 : null

  const monatsumsatz = useMemo(
    () => invoices.filter(inMonth).reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0),
    [invoices, year, selectedMonth]
  )

  const offeneForderungen = useMemo(
    () => thisYearInvoices
      .filter((i: Record<string, unknown>) => i.status === 'offen' || i.status === 'teilweise_bezahlt')
      .reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0),
    [thisYearInvoices]
  )

  const today = new Date()
  const mahnungen = useMemo(
    () => thisYearInvoices.filter((i: Record<string, unknown>) => {
      if (i.status !== 'offen' && i.status !== 'mahnung') return false
      if (!i.faelligAm) return false
      return new Date(i.faelligAm as string) < today
    }),
    [thisYearInvoices]
  )
  const mahnungenBetrag = mahnungen.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0)

  const faelligBald = useMemo(
    () => thisYearInvoices.filter((i: Record<string, unknown>) => {
      if (i.status !== 'offen') return false
      if (!i.faelligAm) return false
      const fällig = new Date(i.faelligAm as string)
      const inDays = (fällig.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      return inDays >= 0 && inDays <= 14
    }),
    [thisYearInvoices]
  )
  const faelligBaldBetrag = faelligBald.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0)

  const nichtFaelligBetrag = offeneForderungen - mahnungenBetrag - faelligBaldBetrag

  // Umsatz per month chart data
  const chartData = useMemo(() => {
    return MONTHS.map((month, idx) => {
      const monthInvoices = invoices.filter((i: Record<string, unknown>) =>
        i.datum &&
        new Date(i.datum as string).getFullYear() === year &&
        new Date(i.datum as string).getMonth() === idx
      )
      const umsatz = monthInvoices.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0)
      return { monat: month.substring(0, 3), umsatz }
    })
  }, [invoices, year])

  // Vermittler stats
  const vermittlerStats = useMemo(() => {
    return vermittler.map((v: Record<string, unknown>) => {
      const vOffers = thisYearOffers.filter((o: Record<string, unknown>) => o.vermittlerId === v.id)
      const umsatz = vOffers.reduce((s: number, o: Record<string, unknown>) => s + (Number(o.summeBrutto) || 0), 0)
      return { ...v, anzahlAngebote: vOffers.length, umsatz }
    }).sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.umsatz) || 0) - (Number(a.umsatz) || 0))
  }, [vermittler, thisYearOffers])

  // Mitarbeiter performance
  const mitarbeiterStats = useMemo(() => {
    return mitarbeiterList.map((m: Record<string, unknown>) => {
      const mOffers = thisYearOffers.filter((o: Record<string, unknown>) => o.erstelltDurch === m.name)
      const mInvoices = thisYearInvoices.filter((i: Record<string, unknown>) => i.erstelltDurch === m.name)
      const umsatz = mInvoices.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.summeBrutto) || 0), 0)
      return { ...m, anzahlAngebote: mOffers.length, anzahlRechnungen: mInvoices.length, umsatz }
    }).sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.umsatz) || 0) - (Number(a.umsatz) || 0))
  }, [mitarbeiterList, thisYearOffers, thisYearInvoices])

  // PIN Gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="p-8 w-full max-w-sm">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-slate-100 p-4 rounded-full">
              <Lock className="w-8 h-8 text-slate-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-center text-slate-900 mb-2">Analytics</h2>
          <p className="text-sm text-slate-500 text-center mb-6">PIN eingeben</p>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pin === PIN) setIsAuthenticated(true)
                else if (e.key === 'Enter') toast.error('Falscher PIN')
              }}
              className="text-center text-2xl tracking-widest"
              maxLength={4}
            />
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                if (pin === PIN) setIsAuthenticated(true)
                else toast.error('Falscher PIN')
              }}
            >
              Entsperren
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const availableYears = Array.from(
    new Set([
      ...invoices.map((i: Record<string, unknown>) => i.datum ? new Date(i.datum as string).getFullYear() : null),
      ...offers.map((o: Record<string, unknown>) => o.datum ? new Date(o.datum as string).getFullYear() : null),
    ].filter(Boolean) as number[])
  ).sort((a, b) => b - a)
  if (!availableYears.includes(year)) availableYears.unshift(year)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-orange-50 p-3 rounded-lg">
              <BarChart3 className="w-8 h-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
              <p className="text-sm text-slate-600 mt-1">Umsatz & Leistungsübersicht</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Jahr</label>
              <Select value={selectedYear} onValueChange={(v) => { if (v) setSelectedYear(v) }}>
                <SelectTrigger className="h-9 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Monat</label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => { if (v) setSelectedMonth(parseInt(v)) }}>
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Row 1: KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <div className="bg-[#E85A1B] rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium opacity-80">Jahresumsatz {selectedYear}</div>
              <TrendingUp className="w-5 h-5 opacity-60" />
            </div>
            <div className="text-3xl font-bold">{fmt(jahresumsatz)}</div>
            {yoyChange !== null && (
              <div className={`text-sm mt-1 opacity-80 ${yoyChange >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}% vs. Vorjahr
              </div>
            )}
          </div>
          <div className="bg-[#E85A1B] rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium opacity-80">Monatsumsatz {MONTHS[selectedMonth]}</div>
              <Euro className="w-5 h-5 opacity-60" />
            </div>
            <div className="text-3xl font-bold">{fmt(monatsumsatz)}</div>
            <div className="text-sm mt-1 opacity-70">{invoices.filter(inMonth).length} Rechnungen</div>
          </div>
          <div className="bg-[#E85A1B] rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium opacity-80">Offene Forderungen</div>
              <Receipt className="w-5 h-5 opacity-60" />
            </div>
            <div className="text-3xl font-bold">{fmt(offeneForderungen)}</div>
            <div className="text-sm mt-1 opacity-70">
              {thisYearInvoices.filter((i: Record<string, unknown>) => i.status === 'offen' || i.status === 'teilweise_bezahlt').length} offen
            </div>
          </div>
        </div>

        {/* Row 2: Cashflow */}
        <Card className="p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Cashflow-Übersicht</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="text-xs font-semibold text-red-700 mb-1">Mahnungen / Überfällig</div>
              <div className="text-2xl font-bold text-red-700">{fmt(mahnungenBetrag)}</div>
              <div className="text-xs text-red-600 mt-1">{mahnungen.length} Rechnungen</div>
            </div>
            <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200">
              <div className="text-xs font-semibold text-yellow-700 mb-1">Fällig (&lt;14 Tage)</div>
              <div className="text-2xl font-bold text-yellow-700">{fmt(faelligBaldBetrag)}</div>
              <div className="text-xs text-yellow-600 mt-1">{faelligBald.length} Rechnungen</div>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-xs font-semibold text-blue-700 mb-1">Nicht fällig</div>
              <div className="text-2xl font-bold text-blue-700">{fmt(Math.max(0, nichtFaelligBetrag))}</div>
            </div>
          </div>
        </Card>

        {/* Row 3: Umsatzentwicklung */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Umsatzentwicklung {selectedYear}</h2>
            <div className="flex gap-2">
              <Button
                variant={revenueChartType === 'bar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRevenueChartType('bar')}
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Button
                variant={revenueChartType === 'line' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRevenueChartType('line')}
              >
                <TrendingUp className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            {revenueChartType === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monat" />
                <YAxis tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [fmt(Number(v)), 'Umsatz']} />
                <Bar dataKey="umsatz" fill="#E85A1B" radius={[4,4,0,0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monat" />
                <YAxis tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [fmt(Number(v)), 'Umsatz']} />
                <Line type="monotone" dataKey="umsatz" stroke="#E85A1B" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </Card>

        {/* Row 4: Vermittler */}
        {vermittlerStats.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Vermittler Umsatz {selectedYear}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Vermittler</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Angebote</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Umsatz</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Provision</th>
                  </tr>
                </thead>
                <tbody>
                  {vermittlerStats.map((v: Record<string, unknown>) => (
                    <tr key={v.id as string} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium">{v.name as string}</td>
                      <td className="py-2 px-3 text-right">{v.anzahlAngebote as number}</td>
                      <td className="py-2 px-3 text-right font-medium">{fmt(v.umsatz as number)}</td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {v.provisionssatz ? `${v.provisionssatz}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Row 5: Mitarbeiter Performance */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Mitarbeiter Performance {selectedYear}</h2>
            <div className="flex gap-2">
              <Button
                variant={performanceView === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPerformanceView('table')}
              >
                <TableIcon className="w-4 h-4" />
              </Button>
              <Button
                variant={performanceView === 'chart' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPerformanceView('chart')}
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {performanceView === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Mitarbeiter</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Angebote</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Rechnungen</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Umsatz</th>
                  </tr>
                </thead>
                <tbody>
                  {mitarbeiterStats.map((m: Record<string, unknown>) => (
                    <tr key={m.id as string} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium">{m.name as string}</td>
                      <td className="py-2 px-3 text-right">{m.anzahlAngebote as number}</td>
                      <td className="py-2 px-3 text-right">{m.anzahlRechnungen as number}</td>
                      <td className="py-2 px-3 text-right font-medium">{fmt(m.umsatz as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={mitarbeiterStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [fmt(Number(v)), 'Umsatz']} />
                <Bar dataKey="umsatz" fill="#E85A1B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Row 6: Mitarbeiter Verwaltung */}
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" />
            Mitarbeiter Verwaltung
          </h2>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Name des Mitarbeiters"
              value={newMitarbeiterName}
              onChange={(e) => setNewMitarbeiterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newMitarbeiterName.trim()) {
                  addMitarbeiterMutation.mutate(newMitarbeiterName.trim())
                }
              }}
              className="flex-1"
            />
            <Button
              onClick={() => { if (newMitarbeiterName.trim()) addMitarbeiterMutation.mutate(newMitarbeiterName.trim()) }}
              disabled={!newMitarbeiterName.trim() || addMitarbeiterMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {addMitarbeiterMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Hinzufügen
            </Button>
          </div>
          <div className="space-y-2">
            {mitarbeiterList.map((m: Record<string, unknown>) => (
              <div key={m.id as string} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="font-medium text-slate-700">{m.name as string}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMitarbeiterMutation.mutate(m.id as string)}
                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {mitarbeiterList.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">Noch keine Mitarbeiter angelegt</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
