import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Check, ChevronsUpDown, FileText } from "lucide-react";
import CurrencyDisplay from "../shared/CurrencyDisplay";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { base44 } from '@/api/base44Client';
import { cn } from "@/lib/utils";
import DescriptionEditor from "../offers/DescriptionEditor";

export default function InvoicePositionsTable({ positions, onChange, readOnly = false, showTeilfaktura = false }) {
  const [products, setProducts] = useState([]);
  const [openIndex, setOpenIndex] = useState(null);
  const [editingDescription, setEditingDescription] = useState(null);
  const [productsLoaded, setProductsLoaded] = useState(false);

  useEffect(() => {
    if (productsLoaded) return;
    
    const loadProducts = async () => {
      try {
        const allProducts = await base44.entities.Product.filter({ aktiv: true });
        setProducts(allProducts);
        setProductsLoaded(true);
      } catch (error) {
        console.error('Error loading products:', error);
      }
    };
    
    loadProducts();
  }, [productsLoaded]);
  const handleProductSelect = (index, product) => {
    const updated = [...positions];
    updated[index] = {
      ...updated[index],
      produktId: product.id,
      produktName: product.produktName,
      beschreibung: product.beschreibung || '',
      einheit: product.einheit || 'Stk',
      einzelpreisNetto: product.standardpreisNetto || 0,
      ustSatz: product.steuersatz || 20
    };
    
    // Neuberechnung mit den neuen Werten
    const menge = parseFloat(updated[index].menge) || 0;
    const einzelpreis = parseFloat(updated[index].einzelpreisNetto) || 0;
    const rabatt = parseFloat(updated[index].rabattProzent) || 0;
    const ust = parseFloat(updated[index].ustSatz) || 20;
    const teilfaktura = parseFloat(updated[index].teilfakturaProzent) || 100;
    
    const nettoVorRabatt = menge * einzelpreis;
    const rabattBetrag = nettoVorRabatt * (rabatt / 100);
    let gesamtNetto = nettoVorRabatt - rabattBetrag;
    
    // Bei Teilfaktura nur den Prozentsatz berechnen
    if (showTeilfaktura && teilfaktura < 100) {
      gesamtNetto = gesamtNetto * (teilfaktura / 100);
    }
    
    const ustBetrag = gesamtNetto * (ust / 100);
    const gesamtBrutto = gesamtNetto + ustBetrag;
    
    updated[index].gesamtNetto = gesamtNetto;
    updated[index].gesamtBrutto = gesamtBrutto;
    
    onChange(updated);
    setOpenIndex(null);
  };

  const handleChange = (index, field, value) => {
    const updated = [...positions];
    
    // Konvertiere numerische Felder sofort zu Zahlen
    if (['menge', 'einzelpreisNetto', 'rabattProzent', 'ustSatz', 'teilfakturaProzent', 'bereitsFakturiert'].includes(field)) {
      updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    
    // Neuberechnung
    const menge = parseFloat(updated[index].menge) || 0;
    const einzelpreis = parseFloat(updated[index].einzelpreisNetto) || 0;
    const rabatt = parseFloat(updated[index].rabattProzent) || 0;
    const ust = parseFloat(updated[index].ustSatz) || 20;
    const teilfaktura = parseFloat(updated[index].teilfakturaProzent) || 100;
    
    const nettoVorRabatt = menge * einzelpreis;
    const rabattBetrag = nettoVorRabatt * (rabatt / 100);
    let gesamtNetto = nettoVorRabatt - rabattBetrag;
    
    // Bei Teilfaktura nur den Prozentsatz berechnen
    if (showTeilfaktura && teilfaktura < 100) {
      gesamtNetto = gesamtNetto * (teilfaktura / 100);
    }
    
    const ustBetrag = gesamtNetto * (ust / 100);
    const gesamtBrutto = gesamtNetto + ustBetrag;
    
    updated[index].gesamtNetto = gesamtNetto;
    updated[index].gesamtBrutto = gesamtBrutto;
    
    onChange(updated);
  };
  
  const addPosition = () => {
    const newPos = {
      pos: positions.length + 1,
      produktName: '',
      beschreibung: '',
      menge: 1,
      einheit: 'Stk',
      einzelpreisNetto: 0,
      rabattProzent: 0,
      ustSatz: 20,
      gesamtNetto: 0,
      gesamtBrutto: 0,
      teilfakturaProzent: 100,
      bereitsFakturiert: 0
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
              <TableHead className="min-w-[200px]">Produkt / Beschreibung</TableHead>
              <TableHead className="w-24 text-right">Menge</TableHead>
              <TableHead className="w-20">Einheit</TableHead>
              <TableHead className="w-32 text-right">Einzelpreis</TableHead>
              <TableHead className="w-24 text-right">Rabatt %</TableHead>
              <TableHead className="w-20 text-right">USt %</TableHead>
              {showTeilfaktura && (
                <>
                  <TableHead className="w-24 text-right">Teilfakt. %</TableHead>
                  <TableHead className="w-32 text-right">Bereits fakt.</TableHead>
                </>
              )}
              <TableHead className="w-32 text-right">Gesamt Netto</TableHead>
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
                                    <div className="text-xs text-slate-500">
                                      {product.produktKategorie && <span>{product.produktKategorie} • </span>}
                                      {product.standardpreisNetto ? `€${product.standardpreisNetto.toFixed(2)}` : ''}
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
                    <span className="text-right block">{pos.menge}</span>
                  ) : (
                    <Input
                      type="number"
                      value={pos.menge || ''}
                      onChange={(e) => handleChange(index, 'menge', e.target.value)}
                      className="text-right border-slate-200 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? pos.einheit : (
                    <Input
                      value={pos.einheit || ''}
                      onChange={(e) => handleChange(index, 'einheit', e.target.value)}
                      className="border-slate-200"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <CurrencyDisplay value={pos.einzelpreisNetto} className="text-right block" />
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={pos.einzelpreisNetto || ''}
                      onChange={(e) => handleChange(index, 'einzelpreisNetto', e.target.value)}
                      className="text-right border-slate-200 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span className="text-right block">{pos.rabattProzent || 0}%</span>
                  ) : (
                    <Input
                      type="number"
                      step="0.1"
                      value={pos.rabattProzent || ''}
                      onChange={(e) => handleChange(index, 'rabattProzent', e.target.value)}
                      className="text-right border-slate-200 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <span className="text-right block">{pos.ustSatz}%</span>
                  ) : (
                    <Input
                      type="number"
                      value={pos.ustSatz || 19}
                      onChange={(e) => handleChange(index, 'ustSatz', e.target.value)}
                      className="text-right border-slate-200 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </TableCell>
                {showTeilfaktura && (
                  <>
                    <TableCell>
                      {readOnly ? (
                        <span className="text-right block">{pos.teilfakturaProzent || 100}%</span>
                      ) : (
                        <Input
                          type="number"
                          value={pos.teilfakturaProzent || 100}
                          onChange={(e) => handleChange(index, 'teilfakturaProzent', e.target.value)}
                          className="text-right border-slate-200 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-slate-500">
                      <CurrencyDisplay value={pos.bereitsFakturiert || 0} />
                    </TableCell>
                  </>
                )}
                <TableCell className="text-right">
                  <CurrencyDisplay value={pos.gesamtNetto} className="font-medium" />
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