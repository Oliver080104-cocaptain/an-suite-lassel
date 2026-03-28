import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react";
import PageHeader from '../components/shared/PageHeader';
import ProductImport from '../components/products/ProductImport';

export default function ProductList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    produktName: '',
    artikelnummer: '',
    produktKategorie: '',
    produkttyp: 'dienstleistung',
    einheit: 'Stk',
    standardpreisNetto: 0,
    steuersatz: 20,
    steuerpflichtig: true,
    aktiv: true,
    beschreibung: ''
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-updated_date')
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setShowDialog(false);
      resetForm();
      toast.success('Produkt erstellt');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setShowDialog(false);
      resetForm();
      toast.success('Produkt aktualisiert');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      toast.success('Produkt gelöscht');
    }
  });

  const resetForm = () => {
    setFormData({
      produktName: '',
      artikelnummer: '',
      produktKategorie: '',
      produkttyp: 'dienstleistung',
      einheit: 'Stk',
      standardpreisNetto: 0,
      steuersatz: 20,
      steuerpflichtig: true,
      aktiv: true,
      beschreibung: ''
    });
    setEditingProduct(null);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData(product);
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Produkt wirklich löschen?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredProducts = products.filter(p =>
    p.produktName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.artikelnummer?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Produkte & Preise"
          subtitle="Zentrale Produkt- und Preisverwaltung"
          actions={
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Produkte importieren
              </Button>
              <Button onClick={() => { resetForm(); setShowDialog(true); }} className="bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-2" />
                Neues Produkt
              </Button>
            </div>
          }
        />

        <Card className="p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Produkte durchsuchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        <div className="grid gap-4">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">{product.produktName}</h3>
                    {!product.aktiv && <Badge variant="secondary">Inaktiv</Badge>}
                    {product.produkttyp && (
                      <Badge className="bg-orange-100 text-orange-700">
                        {product.produkttyp}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-600 mt-4">
                    {product.artikelnummer && (
                      <div>
                        <span className="font-medium">Artikel-Nr:</span> {product.artikelnummer}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Preis:</span> {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(product.standardpreisNetto || 0)}
                    </div>
                    <div>
                      <span className="font-medium">Einheit:</span> {product.einheit}
                    </div>
                    <div>
                      <span className="font-medium">MwSt:</span> {product.steuersatz}%
                    </div>
                  </div>

                  {product.beschreibung && (
                    <p className="text-sm text-slate-500 mt-3">{product.beschreibung}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)} className="text-rose-600 hover:text-rose-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Produkt bearbeiten' : 'Neues Produkt'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Produktname *</Label>
                  <Input
                    value={formData.produktName}
                    onChange={(e) => setFormData({ ...formData, produktName: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Artikelnummer</Label>
                  <Input
                    value={formData.artikelnummer}
                    onChange={(e) => setFormData({ ...formData, artikelnummer: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Kategorie</Label>
                  <Input
                    value={formData.produktKategorie}
                    onChange={(e) => setFormData({ ...formData, produktKategorie: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Produkttyp</Label>
                  <Select value={formData.produkttyp} onValueChange={(v) => setFormData({ ...formData, produkttyp: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dienstleistung">Dienstleistung</SelectItem>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="paket">Paket</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Einheit</Label>
                  <Input
                    value={formData.einheit}
                    onChange={(e) => setFormData({ ...formData, einheit: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Standardpreis (netto)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.standardpreisNetto}
                    onChange={(e) => setFormData({ ...formData, standardpreisNetto: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Steuersatz (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.steuersatz}
                    onChange={(e) => setFormData({ ...formData, steuersatz: parseFloat(e.target.value) || 20 })}
                    className="mt-1"
                  />
                </div>

                <div className="col-span-2">
                  <Label>Beschreibung</Label>
                  <textarea
                    className="w-full border rounded-md p-2 text-sm mt-1"
                    rows={3}
                    value={formData.beschreibung}
                    onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.steuerpflichtig}
                    onChange={(e) => setFormData({ ...formData, steuerpflichtig: e.target.checked })}
                    className="rounded"
                  />
                  <Label>Steuerpflichtig</Label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.aktiv}
                    onChange={(e) => setFormData({ ...formData, aktiv: e.target.checked })}
                    className="rounded"
                  />
                  <Label>Aktiv</Label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingProduct ? 'Aktualisieren' : 'Erstellen'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ProductImport open={showImportDialog} onOpenChange={setShowImportDialog} />
      </div>
    </div>
  );
}