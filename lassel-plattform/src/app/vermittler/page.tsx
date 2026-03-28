'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Users, Plus, Pencil, Trash2, Mail, Phone } from 'lucide-react'

const defaultForm = {
  name: '',
  email: '',
  telefon: '',
  provisionssatz: 10,
  status: 'aktiv',
  notizen: '',
}

export default function VermittlerListePage() {
  const queryClient = useQueryClient()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedVermittler, setSelectedVermittler] = useState<any>(null)
  const [formData, setFormData] = useState({ ...defaultForm })

  const { data: vermittler = [], isLoading } = useQuery({
    queryKey: ['vermittler'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vermittler').select('*').order('name')
      if (error) throw error
      return data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('vermittler').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vermittler'] })
      setEditDialogOpen(false)
      resetForm()
      toast.success('Vermittler erstellt')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('vermittler').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vermittler'] })
      setEditDialogOpen(false)
      resetForm()
      toast.success('Vermittler aktualisiert')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vermittler').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vermittler'] })
      setDeleteDialogOpen(false)
      setSelectedVermittler(null)
      toast.success('Vermittler gelöscht')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const resetForm = () => {
    setFormData({ ...defaultForm })
    setSelectedVermittler(null)
  }

  const handleCreate = () => {
    resetForm()
    setEditDialogOpen(true)
  }

  const handleEdit = (verm: any) => {
    setSelectedVermittler(verm)
    setFormData({
      name: verm.name || '',
      email: verm.email || '',
      telefon: verm.telefon || '',
      provisionssatz: verm.provisionssatz || 10,
      status: verm.status || 'aktiv',
      notizen: verm.notizen || '',
    })
    setEditDialogOpen(true)
  }

  const handleDelete = (verm: any) => {
    setSelectedVermittler(verm)
    setDeleteDialogOpen(true)
  }

  const handleSubmit = () => {
    if (!formData.name.trim()) { toast.error('Name ist erforderlich'); return }
    if (selectedVermittler) {
      updateMutation.mutate({ id: selectedVermittler.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const activeVermittler = (vermittler as any[]).filter((v: any) => v.status === 'aktiv')
  const inactiveVermittler = (vermittler as any[]).filter((v: any) => v.status === 'inaktiv')

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Vermittler</h1>
            <p className="text-slate-500 mt-1">Verwalten Sie Ihre Vermittler und Provisionen</p>
          </div>
          <Button onClick={handleCreate} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Neuer Vermittler
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="p-6 bg-gradient-to-br from-orange-50 to-white border-orange-100">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-xl">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{(vermittler as any[]).length}</div>
                <div className="text-sm text-slate-500">Gesamt</div>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{activeVermittler.length}</div>
                <div className="text-sm text-slate-500">Aktiv</div>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-gradient-to-br from-slate-50 to-white border-slate-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-100 rounded-xl">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{inactiveVermittler.length}</div>
                <div className="text-sm text-slate-500">Inaktiv</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Table */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Alle Vermittler</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 hidden sm:table-cell">Kontakt</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Provision</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {(vermittler as any[]).map((verm: any) => (
                  <tr key={verm.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{verm.name}</td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <div className="space-y-1">
                        {verm.email && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{verm.email}</span>
                          </div>
                        )}
                        {verm.telefon && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone className="w-3 h-3 shrink-0" />
                            {verm.telefon}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-blue-600">{verm.provisionssatz}%</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant="outline" className={verm.status === 'aktiv' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}>
                        {verm.status === 'aktiv' ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(verm)} className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(verm)} className="h-8 w-8 p-0 text-slate-600 hover:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(vermittler as any[]).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      {isLoading ? 'Laden...' : 'Keine Vermittler vorhanden'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setEditDialogOpen(open) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedVermittler ? 'Vermittler bearbeiten' : 'Neuer Vermittler'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Name des Vermittlers" className="mt-1" />
              </div>
              <div>
                <Label>E-Mail</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="email@beispiel.com" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Telefon</Label>
                <Input value={formData.telefon} onChange={e => setFormData(p => ({ ...p, telefon: e.target.value }))} placeholder="+43 xxx xxx xxx" className="mt-1" />
              </div>
              <div>
                <Label>Provisionssatz (%)</Label>
                <Input type="number" step="0.1" value={formData.provisionssatz} onChange={e => setFormData(p => ({ ...p, provisionssatz: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v ?? 'aktiv' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea value={formData.notizen} onChange={e => setFormData(p => ({ ...p, notizen: e.target.value }))} placeholder="Interne Notizen..." rows={3} className="mt-1 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
              {selectedVermittler ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vermittler löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Vermittler <strong>{selectedVermittler?.name}</strong> wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(selectedVermittler?.id)} className="bg-rose-600 hover:bg-rose-700">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
