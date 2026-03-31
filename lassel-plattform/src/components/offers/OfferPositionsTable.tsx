'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, Check, ChevronsUpDown, FileText } from 'lucide-react'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import BeschreibungsModal from '@/components/BeschreibungsModal'

interface Position {
  id?: string
  pos: number
  produktId?: string
  produktName: string
  beschreibung: string
  menge: number | string
  einheit: string
  einzelpreisNetto: number | string
  rabattProzent: number | string
  ustSatz: number | string
  gesamtNetto: number | string
  gesamtBrutto: number | string
}

interface Props {
  positions: Position[]
  onChange: (positions: Position[]) => void
  readOnly?: boolean
  objektAdresse?: string
}

export default function OfferPositionsTable({ positions, onChange, readOnly = false, objektAdresse }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [editingDescription, setEditingDescription] = useState<number | null>(null)

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('produkte').select('*').eq('aktiv', true).order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const recalc = (pos: Position): Position => {
    const menge = parseFloat(pos.menge as string) || 0
    const einzelpreis = parseFloat(pos.einzelpreisNetto as string) || 0
    const rabatt = parseFloat(pos.rabattProzent as string) || 0
    const ust = parseFloat(pos.ustSatz as string) || 20
    const nettoVorRabatt = menge * einzelpreis
    const rabattBetrag = nettoVorRabatt * (rabatt / 100)
    const gesamtNetto = nettoVorRabatt - rabattBetrag
    const ustBetrag = gesamtNetto * (ust / 100)
    return { ...pos, gesamtNetto, gesamtBrutto: gesamtNetto + ustBetrag }
  }

  const handleProductSelect = (index: number, product: any) => {
    const updated = [...positions]
    updated[index] = recalc({
      ...updated[index],
      produktId: product.id,
      produktName: product.name,
      beschreibung: product.beschreibung || '',
      einheit: product.einheit || 'Stk',
      einzelpreisNetto: product.einzelpreis || 0,
      ustSatz: product.mwst_satz || 20
    })
    onChange(updated)
    setOpenIndex(null)
  }

  const handleChange = (index: number, field: keyof Position, value: any) => {
    const updated = [...positions]
    const numericFields = ['menge', 'einzelpreisNetto', 'rabattProzent', 'ustSatz']
    const parsed = numericFields.includes(field) ? (parseFloat(value) || 0) : value
    updated[index] = recalc({ ...updated[index], [field]: parsed })
    onChange(updated)
  }

  const addPosition = () => {
    onChange([...positions, {
      pos: positions.length + 1,
      produktName: '', beschreibung: '', menge: 1, einheit: 'Stk',
      einzelpreisNetto: 0, rabattProzent: 0, ustSatz: 20, gesamtNetto: 0, gesamtBrutto: 0
    }])
  }

  const removePosition = (index: number) => {
    const updated = positions.filter((_, i) => i !== index)
    updated.forEach((p, i) => { p.pos = i + 1 })
    onChange(updated)
  }

  return (
    <div className="space-y-4">
      {editingDescription !== null && (
        <BeschreibungsModal
          open={true}
          onOpenChange={(open) => { if (!open) setEditingDescription(null) }}
          value={positions[editingDescription]?.beschreibung || ''}
          onSave={(newText) => { handleChange(editingDescription, 'beschreibung', newText) }}
          title={`Beschreibung: ${positions[editingDescription]?.produktName || 'Position'}`}
          objektAdresse={objektAdresse}
          onPriceUpdate={(preis) => {
            const idx = editingDescription
            if (idx === null) return
            const updated = [...positions]
            updated[idx] = { ...updated[idx], einzelpreisNetto: preis }
            onChange(updated)
          }}
        />
      )}

      <div className="rounded-xl border border-slate-200 overflow-x-auto">
        <Table className="min-w-full text-sm sm:text-base">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-12 sm:w-16 text-center text-xs sm:text-sm">Pos.</TableHead>
              <TableHead className="min-w-[150px] sm:min-w-[200px] max-w-[240px] sm:max-w-[300px] text-xs sm:text-sm">Produkt</TableHead>
              <TableHead className="w-16 sm:w-24 text-right text-xs sm:text-sm">Menge</TableHead>
              <TableHead className="w-14 sm:w-20 text-xs sm:text-sm">Einheit</TableHead>
              <TableHead className="w-20 sm:w-32 text-right text-xs sm:text-sm">Preis</TableHead>
              <TableHead className="hidden sm:table-cell w-24 text-right text-xs sm:text-sm">Rabatt %</TableHead>
              <TableHead className="hidden sm:table-cell w-20 text-right text-xs sm:text-sm">USt %</TableHead>
              <TableHead className="w-20 sm:w-32 text-right text-xs sm:text-sm">Netto</TableHead>
              {!readOnly && <TableHead className="w-10 sm:w-16"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((pos, index) => (
              <TableRow key={index} className="group">
                <TableCell className="text-center font-medium text-slate-500">{pos.pos}</TableCell>
                <TableCell>
                  {readOnly ? (
                    <div className="max-w-[240px] sm:max-w-[300px] overflow-hidden">
                      <p className="font-medium text-xs sm:text-base truncate" title={pos.produktName}>{pos.produktName}</p>
                      {pos.beschreibung && <p className="text-xs text-slate-500 truncate" title={pos.beschreibung}>{pos.beschreibung}</p>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Popover open={openIndex === index} onOpenChange={(open) => setOpenIndex(open ? index : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openIndex === index}
                              className="flex-1 justify-between border-slate-200 font-normal text-xs sm:text-base h-8 sm:h-9"
                            >
                              <span className={cn('truncate', !pos.produktName && 'text-slate-400')}>
                                {pos.produktName || 'Produkt...'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-3 sm:h-4 w-3 sm:w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] sm:w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Produkt suchen..." />
                              <CommandEmpty>Kein Produkt gefunden.</CommandEmpty>
                              <CommandGroup className="max-h-64 overflow-auto">
                                {(products as any[]).map((product: any) => (
                                  <CommandItem
                                    key={product.id}
                                    value={product.name}
                                    onSelect={() => handleProductSelect(index, product)}
                                    className="cursor-pointer"
                                  >
                                    <Check className={cn('mr-2 h-4 w-4', pos.produktId === product.id ? 'opacity-100' : 'opacity-0')} />
                                    <div className="flex-1">
                                      <div className="font-medium">{product.name}</div>
                                      <div className="text-xs text-slate-500">
                                        {product.kategorie && <span>{product.kategorie} • </span>}
                                        {product.einzelpreis ? `€${Number(product.einzelpreis).toFixed(2)}` : ''}
                                      </div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDescription(index)}
                          className={cn('flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9', pos.beschreibung ? 'text-slate-700' : 'text-slate-400')}
                          title={pos.beschreibung ? 'Beschreibung bearbeiten' : 'Beschreibung hinzufügen'}
                        >
                          <FileText className="w-3 sm:w-4 h-3 sm:h-4" />
                        </Button>
                      </div>
                      {pos.produktName && (
                        <input
                          type="text"
                          value={pos.produktName}
                          onChange={(e) => handleChange(index, 'produktName', e.target.value)}
                          className="w-full text-xs text-slate-500 border-0 border-b border-dashed border-slate-300 bg-transparent focus:outline-none focus:border-orange-400 placeholder:text-slate-300 px-1 py-0.5"
                          placeholder="Titel anpassen..."
                        />
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span className="text-right block text-xs sm:text-base">{pos.menge}</span>
                  ) : (
                    <Input
                      type="number"
                      value={pos.menge || ''}
                      onChange={(e) => handleChange(index, 'menge', e.target.value)}
                      className="text-right border-slate-200 text-xs sm:text-base h-8 sm:h-9 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span className="text-xs sm:text-base">{pos.einheit}</span>
                  ) : (
                    <Input
                      value={pos.einheit || ''}
                      onChange={(e) => handleChange(index, 'einheit', e.target.value)}
                      className="border-slate-200 text-xs sm:text-base h-8 sm:h-9"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <CurrencyDisplay value={pos.einzelpreisNetto as number} className="text-right block text-xs sm:text-base" />
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={pos.einzelpreisNetto || ''}
                      onChange={(e) => handleChange(index, 'einzelpreisNetto', e.target.value)}
                      className="text-right border-slate-200 text-xs sm:text-base h-8 sm:h-9 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {readOnly ? (
                    <span className="text-right block">{pos.rabattProzent || 0}%</span>
                  ) : (
                    <Input
                      type="number"
                      step="0.1"
                      value={pos.rabattProzent || ''}
                      onChange={(e) => handleChange(index, 'rabattProzent', e.target.value)}
                      className="text-right border-slate-200 h-8 sm:h-9 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {readOnly ? (
                    <span className="text-right block">{pos.ustSatz}%</span>
                  ) : (
                    <Input
                      type="number"
                      value={pos.ustSatz || 20}
                      onChange={(e) => handleChange(index, 'ustSatz', e.target.value)}
                      className="text-right border-slate-200 h-8 sm:h-9 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={pos.gesamtNetto as number} className="font-medium text-xs sm:text-base" />
                </TableCell>
                {!readOnly && (
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePosition(index)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 h-8 w-8 sm:h-9 sm:w-9"
                    >
                      <Trash2 className="w-3 sm:w-4 h-3 sm:h-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!readOnly && (
        <Button variant="outline" onClick={addPosition} className="w-full border-dashed text-sm sm:text-base h-10 sm:h-11">
          <Plus className="w-4 h-4 mr-2" />
          Position hinzufügen
        </Button>
      )}
    </div>
  )
}
