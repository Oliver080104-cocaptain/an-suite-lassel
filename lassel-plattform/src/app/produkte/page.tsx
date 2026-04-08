'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

const defaultForm = {
  name: '',
  kategorie: '',
  einheit: 'Stk',
  einzelpreis: '' as string | number,
  mwst_satz: '20' as string | number,
  aktiv: true,
  beschreibung: '',
}

export default function ProdukteListePage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [formData, setFormData] = useState({ ...defaultForm })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('produkte').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('produkte').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowDialog(false)
      resetForm()
      toast.success('Produkt erstellt')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('produkte').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowDialog(false)
      resetForm()
      toast.success('Produkt aktualisiert')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('produkte').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produkt gelöscht')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const resetForm = () => {
    setFormData({ ...defaultForm })
    setEditingProduct(null)
  }

  const handleEdit = (product: any) => {
    setEditingProduct(product)
    setFormData({
      ...defaultForm,
      ...product,
      einzelpreis: product.einzelpreis ?? '',
      mwst_satz: product.mwst_satz ?? '20',
    })
    setShowDialog(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...formData,
      einzelpreis: parseFloat(String(formData.einzelpreis)) || 0,
      mwst_satz: parseFloat(String(formData.mwst_satz)) || 20,
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Produkt wirklich löschen?')) {
      deleteMutation.mutate(id)
    }
  }

  const filteredProducts = (products as any[]).filter((p: any) =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.kategorie?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Produkte & Preise</h1>
            <p className="text-slate-500 mt-1">Zentrale Produkt- und Preisverwaltung</p>
          </div>
          <Button onClick={() => { resetForm(); setShowDialog(true) }} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Neues Produkt
          </Button>
        </div>

        {/* Search */}
        <Card className="p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Produkte durchsuchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        {/* Products list */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Laden...</div>
        ) : (
          <div className="grid gap-4">
            {filteredProducts.map((product: any) => (
              <Card key={product.id} className="p-5 sm:p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900">{product.name}</h3>
                      {!product.aktiv && <Badge variant="secondary">Inaktiv</Badge>}
                      {product.kategorie && (
                        <Badge variant="outline" className="text-slate-600">{product.kategorie}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-slate-600 mt-3">
                      <div>
                        <span className="font-medium">Preis:</span>{' '}
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(product.einzelpreis || 0)}
                      </div>
                      <div><span className="font-medium">Einheit:</span> {product.einheit}</div>
                      <div><span className="font-medium">MwSt:</span> {product.mwst_satz}%</div>
                    </div>
                    {product.beschreibung && (
                      <p className="text-sm text-slate-500 mt-3 line-clamp-2">{product.beschreibung}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(product)} className="h-8 w-8 p-0">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)} className="h-8 w-8 p-0 text-rose-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {filteredProducts.length === 0 && !isLoading && (
              <div className="text-center py-12 text-slate-400">
                {searchTerm ? 'Keine Produkte gefunden' : 'Noch keine Produkte vorhanden'}
              </div>
            )}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); setShowDialog(open) }}>
          <DialogContent className="p-8 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Produkt bearbeiten' : 'Neues Produkt'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <Label>Produktname *</Label>
                  <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required className="mt-1 h-12" />
                </div>
                <div>
                  <Label>Kategorie</Label>
                  <Input value={formData.kategorie} onChange={e => setFormData(p => ({ ...p, kategorie: e.target.value }))} className="mt-1 h-12" />
                </div>
                <div>
                  <Label>Einheit</Label>
                  <Input value={formData.einheit} onChange={e => setFormData(p => ({ ...p, einheit: e.target.value }))} className="mt-1 h-12" />
                </div>
                <div>
                  <Label>Preis (netto)</Label>
                  <Input
                    type="number" step="0.01"
                    value={formData.einzelpreis}
                    onChange={e => setFormData(p => ({ ...p, einzelpreis: e.target.value }))}
                    placeholder="0,00"
                    className="mt-1 h-12"
                  />
                </div>
                <div>
                  <Label>MwSt-Satz (%)</Label>
                  <Input
                    type="number" step="0.01"
                    value={formData.mwst_satz}
                    onChange={e => setFormData(p => ({ ...p, mwst_satz: e.target.value }))}
                    placeholder="20"
                    className="mt-1 h-12"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Beschreibung</Label>
                  <Textarea
                    rows={5}
                    value={formData.beschreibung}
                    onChange={e => setFormData(p => ({ ...p, beschreibung: e.target.value }))}
                    className="mt-1 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="aktiv" checked={formData.aktiv} onChange={e => setFormData(p => ({ ...p, aktiv: e.target.checked }))} className="rounded" />
                  <Label htmlFor="aktiv" className="cursor-pointer">Aktiv</Label>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {editingProduct ? 'Aktualisieren' : 'Erstellen'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
