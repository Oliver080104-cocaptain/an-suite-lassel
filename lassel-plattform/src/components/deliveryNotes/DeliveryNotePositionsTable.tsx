'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, Check, ChevronsUpDown, FileText, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
}

interface Props {
  positions: Position[]
  onChange: (positions: Position[]) => void
  readOnly?: boolean
}

export default function DeliveryNotePositionsTable({ positions, onChange, readOnly = false }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [editingDescription, setEditingDescription] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const itemIds = useMemo(() => positions.map((_, i) => `row-${i}`), [positions.length])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = itemIds.indexOf(String(active.id))
    const newIndex = itemIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(positions, oldIndex, newIndex).map((p, i) => ({ ...p, pos: i + 1 }))
    onChange(reordered)
  }

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('produkte').select('*').eq('aktiv', true)
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const handleProductSelect = (index: number, product: any) => {
    const updated = [...positions]
    updated[index] = {
      ...updated[index],
      produktId: product.id,
      produktName: product.name,
      beschreibung: product.beschreibung || '',
      einheit: product.einheit || 'Stk',
      menge: updated[index].menge || 1,
    }
    onChange(updated)
    setOpenIndex(null)
  }

  const handleChange = (index: number, field: keyof Position, value: any) => {
    const updated = [...positions]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const addPosition = () => {
    onChange([...positions, {
      pos: positions.length + 1,
      produktName: '', beschreibung: '', menge: 1, einheit: 'Stk'
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
        />
      )}

      <div className="rounded-xl border border-slate-200 overflow-x-auto">
        <Table className="min-w-full text-sm sm:text-base">
          <TableHeader>
            <TableRow className="bg-slate-50">
              {!readOnly && <TableHead className="w-8 p-0"></TableHead>}
              <TableHead className="w-12 sm:w-16 text-center text-xs sm:text-sm">Pos.</TableHead>
              <TableHead className="min-w-[200px] sm:min-w-[300px] text-xs sm:text-sm">Produkt / Beschreibung</TableHead>
              <TableHead className="w-20 sm:w-32 text-right text-xs sm:text-sm">Menge</TableHead>
              <TableHead className="w-16 sm:w-24 text-xs sm:text-sm">Einheit</TableHead>
              {!readOnly && <TableHead className="w-10 sm:w-16"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {positions.map((pos, index) => (
              <SortablePositionRow key={itemIds[index]} id={itemIds[index]} readOnly={readOnly}>
                <TableCell className="text-center font-medium text-slate-500">{pos.pos}</TableCell>
                <TableCell>
                  {readOnly ? (
                    <div>
                      <p className="font-medium text-xs sm:text-base">{pos.produktName}</p>
                      {pos.beschreibung && <p className="text-xs text-slate-500">{pos.beschreibung}</p>}
                    </div>
                  ) : (
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
                                    {product.kategorie && (
                                      <div className="text-xs text-slate-500">{product.kategorie}</div>
                                    )}
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
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span className="text-right block text-xs sm:text-base">{pos.menge || 0}</span>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pos.menge || ''}
                      onChange={(e) => handleChange(index, 'menge', parseFloat(e.target.value) || 0)}
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
                {!readOnly && (
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePosition(index)}
                      className="text-slate-400 hover:text-rose-600 h-8 w-8 sm:h-9 sm:w-9"
                      title="Position entfernen"
                    >
                      <Trash2 className="w-3 sm:w-4 h-3 sm:h-4" />
                    </Button>
                  </TableCell>
                )}
              </SortablePositionRow>
            ))}
              </SortableContext>
            </DndContext>
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

function SortablePositionRow({ id, readOnly, children }: { id: string; readOnly: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? '#fef3e8' : undefined,
  }
  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      {!readOnly && (
        <TableCell className="p-0 w-8">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none text-slate-300 hover:text-slate-600 h-full w-full flex items-center justify-center py-2"
            title="Zum Verschieben ziehen"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </TableCell>
      )}
      {children}
    </TableRow>
  )
}
