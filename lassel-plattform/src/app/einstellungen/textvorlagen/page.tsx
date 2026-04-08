'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const defaultForm = {
  name: '',
  kategorie: '',
  inhalt: '',
}

export default function TextvorlagenPage() {
  const queryClient = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: any }>({ open: false, item: null })
  const [editingVorlage, setEditingVorlage] = useState<any>(null)
  const [formData, setFormData] = useState({ ...defaultForm })

  const { data: vorlagen = [], isLoading } = useQuery({
    queryKey: ['textvorlagen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('textvorlagen').select('*').order('kategorie').order('name')
      if (error) throw error
      return data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('textvorlagen').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textvorlagen'] })
      setShowDialog(false)
      resetForm()
      toast.success('Vorlage erstellt')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('textvorlagen').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textvorlagen'] })
      setShowDialog(false)
      resetForm()
      toast.success('Vorlage aktualisiert')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('textvorlagen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textvorlagen'] })
      setDeleteDialog({ open: false, item: null })
      toast.success('Vorlage gelöscht')
    },
    onError: (err: any) => toast.error('Fehler: ' + err.message),
  })

  const resetForm = () => {
    setFormData({ ...defaultForm })
    setEditingVorlage(null)
  }

  const handleEdit = (vorlage: any) => {
    setEditingVorlage(vorlage)
    setFormData({ name: vorlage.name || vorlage.titel || '', kategorie: vorlage.kategorie || '', inhalt: vorlage.inhalt || '' })
    setShowDialog(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { toast.error('Name ist erforderlich'); return }
    if (!formData.inhalt.trim()) { toast.error('Text ist erforderlich'); return }
    if (editingVorlage) {
      updateMutation.mutate({ id: editingVorlage.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  // Group vorlagen by category
  const grouped = (vorlagen as any[]).reduce((acc: Record<string, any[]>, v: any) => {
    const kat = v.kategorie || 'Allgemein'
    if (!acc[kat]) acc[kat] = []
    acc[kat].push(v)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-4">
            <Link href="/einstellungen">
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Einstellungen
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Textvorlagen</h1>
              <p className="text-slate-500 text-sm mt-0.5">Schnellvorlagen für Positionsbeschreibungen</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowDialog(true) }} className="bg-slate-900 hover:bg-slate-800 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Neue Vorlage
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Laden...</div>
        ) : (vorlagen as any[]).length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-slate-500 mb-4">Noch keine Textvorlagen vorhanden</p>
            <Button onClick={() => { resetForm(); setShowDialog(true) }} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Erste Vorlage erstellen
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([kat, items]) => (
              <div key={kat}>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">{kat}</h2>
                <div className="space-y-3">
                  {(items as any[]).map((vorlage: any) => (
                    <Card key={vorlage.id} className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 mb-1">{vorlage.name || vorlage.titel}</h3>
                          <p className="text-sm text-slate-600 line-clamp-3 whitespace-pre-wrap">{vorlage.inhalt}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(vorlage)} className="h-8 w-8 p-0">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteDialog({ open: true, item: vorlage })} className="h-8 w-8 p-0 text-rose-400 hover:text-rose-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); setShowDialog(open) }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingVorlage ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <Label>Name *</Label>
                <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="z.B. Standardbeschreibung Dachreparatur" required className="mt-1" />
              </div>
              <div>
                <Label>Kategorie</Label>
                <Input value={formData.kategorie} onChange={e => setFormData(p => ({ ...p, kategorie: e.target.value }))} placeholder="z.B. Dach, Fassade, Instandhaltung" className="mt-1" />
                <p className="text-xs text-slate-500 mt-1">Vorlagen werden nach Kategorie gruppiert</p>
              </div>
              <div>
                <Label>Text *</Label>
                <Textarea
                  value={formData.inhalt}
                  onChange={e => setFormData(p => ({ ...p, inhalt: e.target.value }))}
                  placeholder="Der Vorlagentext der beim Klicken in die Beschreibung eingefügt wird..."
                  rows={8}
                  className="mt-1 resize-none font-mono text-sm"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-slate-900 hover:bg-slate-800 text-white">
                  {editingVorlage ? 'Speichern' : 'Erstellen'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, item: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie die Vorlage <strong>{deleteDialog.item?.name || deleteDialog.item?.titel}</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMutation.mutate(deleteDialog.item?.id)} className="bg-rose-600 hover:bg-rose-700">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
