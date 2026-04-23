'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Plus, Check, X, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
}

interface DbSignatur {
  id: string
  name: string
  text: string
  aktiv: boolean
  created_at?: string
  updated_at?: string
}

/**
 * Zentrale Verwaltung aller eigenen Signaturen (Tabelle `signaturen`).
 * Wird aus EmailVorschauModal + ParksperreModal per "Verwalten"-Button
 * geöffnet. Liest und mutiert `signaturen` direkt — Builtin- und
 * Mitarbeiter-abgeleitete Signaturen werden hier NICHT angezeigt, weil
 * die nicht bearbeitbar sind.
 */
export default function SignaturenVerwaltenDialog({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editText, setEditText] = useState('')
  const [newName, setNewName] = useState('')
  const [newText, setNewText] = useState('')
  const [newFormOpen, setNewFormOpen] = useState(false)

  const { data: signaturen = [], isLoading } = useQuery<DbSignatur[]>({
    queryKey: ['signaturen-verwalten'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signaturen')
        .select('*')
        .order('name')
      if (error) throw error
      return (data || []) as DbSignatur[]
    },
    enabled: open,
  })

  const refetchEverywhere = () => {
    // Beide Query-Keys invalidieren, damit auch Dropdowns in den Modals frisch laden
    queryClient.invalidateQueries({ queryKey: ['signaturen-verwalten'] })
    queryClient.invalidateQueries({ queryKey: ['signaturen'] })
  }

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, text }: { id: string; name: string; text: string }) => {
      const { error } = await supabase
        .from('signaturen')
        .update({ name, text, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Signatur aktualisiert')
      setEditingId(null)
      refetchEverywhere()
    },
    onError: (err: any) => toast.error('Fehler: ' + (err?.message || 'unbekannt')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('signaturen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Signatur gelöscht')
      refetchEverywhere()
    },
    onError: (err: any) => toast.error('Fehler: ' + (err?.message || 'unbekannt')),
  })

  const toggleAktivMutation = useMutation({
    mutationFn: async ({ id, aktiv }: { id: string; aktiv: boolean }) => {
      const { error } = await supabase
        .from('signaturen')
        .update({ aktiv, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      refetchEverywhere()
    },
    onError: (err: any) => toast.error('Fehler: ' + (err?.message || 'unbekannt')),
  })

  const createMutation = useMutation({
    mutationFn: async ({ name, text }: { name: string; text: string }) => {
      const { error } = await supabase
        .from('signaturen')
        .insert({ name, text, aktiv: true })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Signatur angelegt')
      setNewName(''); setNewText(''); setNewFormOpen(false)
      refetchEverywhere()
    },
    onError: (err: any) => {
      const msg = err?.message || 'unbekannt'
      if (/signaturen/i.test(msg) && /does not exist|not found|schema cache/i.test(msg)) {
        toast.error('Tabelle fehlt — Migration 015_signaturen.sql ausführen')
      } else {
        toast.error('Fehler: ' + msg)
      }
    },
  })

  const startEdit = (sig: DbSignatur) => {
    setEditingId(sig.id)
    setEditName(sig.name)
    setEditText(sig.text || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName(''); setEditText('')
  }

  const saveEdit = () => {
    if (!editingId) return
    if (!editName.trim() || !editText.trim()) {
      toast.error('Name und Text sind Pflicht')
      return
    }
    updateMutation.mutate({ id: editingId, name: editName.trim(), text: editText.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#E85A1B]" />
            E-Mail-Signaturen verwalten
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <p className="text-xs text-slate-500">
            Hier verwaltest du deine eigenen E-Mail-Signaturen. Signaturen aus der
            Mitarbeiter-Liste und Standard-Vorlagen werden automatisch im Dropdown
            angeboten und können hier nicht bearbeitet werden.
          </p>

          {/* Neue Signatur anlegen */}
          {!newFormOpen ? (
            <Button
              variant="outline"
              onClick={() => setNewFormOpen(true)}
              className="w-full gap-2 border-dashed"
            >
              <Plus className="w-4 h-4" />
              Neue Signatur anlegen
            </Button>
          ) : (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z.B. Max Mustermann" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Signatur-Text</Label>
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  rows={5}
                  placeholder={'Mit freundlichen Grüßen\nMax Mustermann\n…'}
                  className="mt-1 resize-none font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { setNewFormOpen(false); setNewName(''); setNewText('') }} disabled={createMutation.isPending}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  disabled={createMutation.isPending || !newName.trim() || !newText.trim()}
                  onClick={() => createMutation.mutate({ name: newName.trim(), text: newText.trim() })}
                  className="bg-[#E85A1B] hover:bg-[#c94d17] text-white"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Speichern
                </Button>
              </div>
            </div>
          )}

          {/* Liste der bestehenden DB-Signaturen */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Signaturen werden geladen…</span>
            </div>
          ) : signaturen.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-6 border border-dashed border-slate-200 rounded-lg">
              Noch keine eigenen Signaturen angelegt.
            </div>
          ) : (
            <div className="space-y-2">
              {signaturen.map((sig) => {
                const isEditing = editingId === sig.id
                return (
                  <div
                    key={sig.id}
                    className={`border rounded-lg p-3 ${
                      isEditing
                        ? 'border-[#E85A1B] bg-orange-50/30'
                        : sig.aktiv
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-200 bg-slate-50 opacity-60'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Signatur-Text</Label>
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={6}
                            className="mt-1 resize-none font-mono text-sm"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={cancelEdit} disabled={updateMutation.isPending}>
                            <X className="w-3.5 h-3.5 mr-1" />
                            Abbrechen
                          </Button>
                          <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white">
                            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                            Speichern
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900">{sig.name}</span>
                            {!sig.aktiv && (
                              <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">inaktiv</span>
                            )}
                          </div>
                          <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                            {sig.text}
                          </pre>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit(sig)}
                            className="h-7 w-7 text-slate-500 hover:text-[#E85A1B]"
                            title="Bearbeiten"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleAktivMutation.mutate({ id: sig.id, aktiv: !sig.aktiv })}
                            disabled={toggleAktivMutation.isPending}
                            className="h-7 w-7 text-slate-500 hover:text-emerald-600"
                            title={sig.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                          >
                            <Check className={`w-3.5 h-3.5 ${sig.aktiv ? 'opacity-100' : 'opacity-30'}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Signatur "${sig.name}" endgültig löschen?`)) {
                                deleteMutation.mutate(sig.id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="h-7 w-7 text-slate-500 hover:text-red-600"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t mt-3">
          <Button variant="outline" onClick={onClose}>Fertig</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
