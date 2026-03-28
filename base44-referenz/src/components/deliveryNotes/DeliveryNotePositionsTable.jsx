import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Check, ChevronsUpDown, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { base44 } from '@/api/base44Client';
import { cn } from "@/lib/utils";
import DescriptionEditor from "../offers/DescriptionEditor";

export default function DeliveryNotePositionsTable({ positions, onChange, readOnly = false }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [editingDescription, setEditingDescription] = useState(null);

  // Use React Query to cache products and prevent multiple API calls
  const { data: products = [] } = useQuery({
    queryKey: ['products', 'active'],
    queryFn: () => base44.entities.Product.filter({ aktiv: true }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const handleProductSelect = (index, product) => {
    const updated = [...positions];
    updated[index] = {
      ...updated[index],
      produktId: product.id,
      produktName: product.produktName,
      beschreibung: product.beschreibung || '',
      einheit: product.einheit || 'Stk',
      menge: updated[index].menge || 1
    };
    
    onChange(updated);
    setOpenIndex(null);
  };

  const handleChange = (index, field, value) => {
    const updated = [...positions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };
  
  const addPosition = () => {
    const newPos = {
      pos: positions.length + 1,
      produktName: '',
      beschreibung: '',
      menge: 1,
      einheit: 'Stk'
    };
    onChange([...positions, newPos]);
  };
  
  const removePosition = (index) => {
    const updated = positions.filter((_, i) => i !== index);
    updated.forEach((p, i) => p.pos = i + 1);
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {editingDescription !== null && (
        <DescriptionEditor
          open={true}
          onOpenChange={(open) => !open && setEditingDescription(null)}
          value={positions[editingDescription]?.beschreibung || ''}
          onSave={(newText) => handleChange(editingDescription, 'beschreibung', newText)}
          title={`Beschreibung: ${positions[editingDescription]?.produktName || 'Position'}`}
        />
      )}
      
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-16 text-center">Pos.</TableHead>
              <TableHead className="min-w-[300px]">Produkt / Beschreibung</TableHead>
              <TableHead className="w-32 text-right">Menge</TableHead>
              <TableHead className="w-24">Einheit</TableHead>
              {!readOnly && <TableHead className="w-16"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((pos, index) => (
              <TableRow key={index} className="group">
                <TableCell className="text-center font-medium text-slate-500">
                  {pos.pos}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <div>
                      <p className="font-medium">{pos.produktName}</p>
                      {pos.beschreibung && <p className="text-sm text-slate-500">{pos.beschreibung}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Popover open={openIndex === index} onOpenChange={(open) => setOpenIndex(open ? index : null)}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openIndex === index}
                            className="flex-1 justify-between border-slate-200 font-normal"
                          >
                            <span className={cn("truncate", !pos.produktName && "text-slate-400")}>
                              {pos.produktName || "Produkt auswählen..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Produkt suchen..." />
                            <CommandEmpty>Kein Produkt gefunden.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {products.map((product) => (
                                <CommandItem
                                  key={product.id}
                                  value={product.produktName}
                                  onSelect={() => handleProductSelect(index, product)}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      pos.produktId === product.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium">{product.produktName}</div>
                                    {product.produktKategorie && (
                                      <div className="text-xs text-slate-500">{product.produktKategorie}</div>
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
                        size="icon"
                        onClick={() => setEditingDescription(index)}
                        className={cn("flex-shrink-0", pos.beschreibung ? "text-slate-700" : "text-slate-400")}
                        title={pos.beschreibung ? "Beschreibung bearbeiten" : "Beschreibung hinzufügen"}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                   {readOnly ? (
                     <span className="text-right block">{pos.menge || 0}</span>
                   ) : (
                     <Input
                       type="number"
                       step="0.01"
                       min="0"
                       value={pos.menge || ''}
                       onChange={(e) => handleChange(index, 'menge', parseFloat(e.target.value) || 0)}
                       className="text-right border-slate-200"
                     />
                   )}
                 </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span>{pos.einheit}</span>
                  ) : (
                    <Input
                      value={pos.einheit || ''}
                      onChange={(e) => handleChange(index, 'einheit', e.target.value)}
                      className="border-slate-200"
                    />
                  )}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePosition(index)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {!readOnly && (
        <Button variant="outline" onClick={addPosition} className="w-full border-dashed">
          <Plus className="w-4 h-4 mr-2" />
          Position hinzufügen
        </Button>
      )}
    </div>
  );
}