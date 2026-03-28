'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Trash2, RotateCcw, FileText, Receipt, Truck, AlertCircle, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { format, differenceInDays } from 'date-fns'
import { de } from 'date-fns/locale'

type DocType = 'offer' | 'invoice' | 'deliveryNote'

export default function PapierkorbPage() {
  const queryClient = useQueryClient()
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: any; type: DocType | null }>({ open: false, item: null, type: null })
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; item: any; type: DocType | null }>({ open: false, item: null, type: null })
  const [deleteAllDialog, setDeleteAllDialog] = useState(false)
  const [selectedItems, setSelectedItems] = useState<{ id: string; type: DocType }[]>([])

  const { data: deletedOffers = [], isLoading: loadingOffers } = useQuery({
    queryKey: ['deletedOffers'],
    queryFn: async () => {
      const { data } = await supabase.from('offers').select('*').not('deleted_at', 'is', null)
      return data || []
    },
  })

  const { data: deletedInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['deletedInvoices'],
    queryFn: async () => {
      const { data } = await supabase.from('invoices').select('*').not('deleted_at', 'is', null)
      return data || []
    },
  })

  const { data: deletedDeliveryNotes = [], isLoading: loadingDeliveryNotes } = useQuery({
    queryKey: ['deletedDeliveryNotes'],
    queryFn: async () => {
      const { data } = await supabase.from('delivery_notes').select('*').not('deleted_at', 'is', null)
      return data || []
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: DocType }) => {
      const table = type === 'offer' ? 'offers' : type === 'invoice' ? 'invoices' : 'delivery_notes'
      await supabase.from(table).update({ deleted_at: null }).eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] })
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] })
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] })
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['deliveryNotes'] })
      toast.success('Dokument wiederhergestellt')
      setRestoreDialog({ open: false, item: null, type: null })
    },
    onError: () => toast.error('Fehler beim Wiederherstellen'),
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: DocType }) => {
      if (type === 'offer') {
        await supabase.from('offer_positions').delete().eq('offer_id', id)
        await supabase.from('offers').delete().eq('id', id)
      } else if (type === 'invoice') {
        await supabase.from('invoice_positions').delete().eq('invoice_id', id)
        await supabase.from('invoices').delete().eq('id', id)
      } else {
        await supabase.from('delivery_note_positions').delete().eq('delivery_note_id', id)
        await supabase.from('delivery_notes').delete().eq('id', id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] })
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] })
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] })
      toast.success('Dokument endgültig gelöscht')
      setDeleteDialog({ open: false, item: null, type: null })
      setSelectedItems([])
    },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  const deleteSelectedMutation = useMutation({
    mutationFn: async () => {
      for (const item of selectedItems) {
        await permanentDeleteMutation.mutateAsync(item)
      }
    },
    onSuccess: () => {
      toast.success(`${selectedItems.length} Dokument(e) endgültig gelöscht`)
      setSelectedItems([])
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      for (const o of deletedOffers as any[]) {
        await supabase.from('offer_positions').delete().eq('offer_id', o.id)
        await supabase.from('offers').delete().eq('id', o.id)
      }
      for (const i of deletedInvoices as any[]) {
        await supabase.from('invoice_positions').delete().eq('invoice_id', i.id)
        await supabase.from('invoices').delete().eq('id', i.id)
      }
      for (const d of deletedDeliveryNotes as any[]) {
        await supabase.from('delivery_note_positions').delete().eq('delivery_note_id', d.id)
        await supabase.from('delivery_notes').delete().eq('id', d.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] })
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] })
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] })
      toast.success('Papierkorb geleert')
      setDeleteAllDialog(false)
      setSelectedItems([])
    },
    onError: () => toast.error('Fehler beim Leeren des Papierkorbs'),
  })

  const getDaysRemaining = (deletedAt: string | null) => {
    if (!deletedAt) return 10
    const daysPassed = differenceInDays(new Date(), new Date(deletedAt))
    return Math.max(0, 10 - daysPassed)
  }

  const toggleSelection = (id: string, type: DocType) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.id === id && item.type === type)
      return exists ? prev.filter(item => !(item.id === id && item.type === type)) : [...prev, { id, type }]
    })
  }

  const isSelected = (id: string, type: DocType) => selectedItems.some(item => item.id === id && item.type === type)

  const renderDocumentCard = (doc: any, type: DocType, icon: React.ReactNode) => {
    const daysRemaining = getDaysRemaining(doc.deleted_at)
    const isExpiringSoon = daysRemaining <= 3
    const selected = isSelected(doc.id, type)

    return (
      <Card key={doc.id} className={`p-4 hover:shadow-md transition-all ${selected ? 'ring-2 ring-orange-500' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleSelection(doc.id, type)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 shrink-0"
            />
            <div className={`p-2 rounded-lg shrink-0 ${type === 'offer' ? 'bg-blue-100' : type === 'invoice' ? 'bg-emerald-100' : 'bg-purple-100'}`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="font-semibold text-slate-900 truncate">
                  {type === 'offer' ? doc.angebotNummer : type === 'invoice' ? doc.rechnungsNummer : doc.lieferscheinNummer}
                </h3>
                {isExpiringSoon && (
                  <Badge variant="destructive" className="flex items-center gap-1 shrink-0">
                    <AlertCircle className="w-3 h-3" />
                    {daysRemaining} Tag{daysRemaining !== 1 ? 'e' : ''}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600 mb-2 truncate">
                {doc.objektBezeichnung || doc.rechnungsempfaengerName || doc.kundeName || 'Kein Name'}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {doc.datum && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(doc.datum), 'dd.MM.yyyy', { locale: de })}
                  </span>
                )}
                {doc.summeBrutto != null && (
                  <span className="font-medium">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(doc.summeBrutto)}
                  </span>
                )}
                {doc.deleted_at && (
                  <span className="text-rose-600">
                    Gelöscht: {format(new Date(doc.deleted_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setRestoreDialog({ open: true, item: doc, type })} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
              <RotateCcw className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Wiederherstellen</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteDialog({ open: true, item: doc, type })} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const isLoading = loadingOffers || loadingInvoices || loadingDeliveryNotes
  const totalDeleted = (deletedOffers as any[]).length + (deletedInvoices as any[]).length + (deletedDeliveryNotes as any[]).length

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Papierkorb</h1>
          <p className="text-slate-500 mt-1">Gelöschte Dokumente werden nach 10 Tagen endgültig archiviert</p>
          {totalDeleted > 0 && (
            <div className="flex flex-wrap gap-3 mt-4">
              <Button variant="destructive" onClick={() => setDeleteAllDialog(true)} disabled={deleteAllMutation.isPending}>
                <Trash2 className="w-4 h-4 mr-2" />
                Papierkorb leeren ({totalDeleted})
              </Button>
              {selectedItems.length > 0 && (
                <Button variant="outline" onClick={() => deleteSelectedMutation.mutate()} disabled={deleteSelectedMutation.isPending} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Ausgewählte löschen ({selectedItems.length})
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Lade Papierkorb...</div>
        ) : totalDeleted === 0 ? (
          <Card className="p-12 text-center">
            <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">Papierkorb ist leer</h3>
            <p className="text-slate-500">Keine gelöschten Dokumente vorhanden</p>
          </Card>
        ) : (
          <div className="space-y-8">
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-900">
                  <strong>Automatische Archivierung:</strong> Dokumente im Papierkorb werden nach 10 Tagen automatisch endgültig gelöscht.
                  Dokumente mit weniger als 3 Tagen verbleibender Zeit werden rot markiert.
                </p>
              </div>
            </Card>

            {(deletedOffers as any[]).length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Angebote ({(deletedOffers as any[]).length})
                </h2>
                <div className="space-y-3">
                  {(deletedOffers as any[]).map(offer => renderDocumentCard(offer, 'offer', <FileText className="w-5 h-5 text-blue-600" />))}
                </div>
              </div>
            )}

            {(deletedInvoices as any[]).length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                  Rechnungen ({(deletedInvoices as any[]).length})
                </h2>
                <div className="space-y-3">
                  {(deletedInvoices as any[]).map(invoice => renderDocumentCard(invoice, 'invoice', <Receipt className="w-5 h-5 text-emerald-600" />))}
                </div>
              </div>
            )}

            {(deletedDeliveryNotes as any[]).length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-purple-600" />
                  Lieferscheine ({(deletedDeliveryNotes as any[]).length})
                </h2>
                <div className="space-y-3">
                  {(deletedDeliveryNotes as any[]).map(note => renderDocumentCard(note, 'deliveryNote', <Truck className="w-5 h-5 text-purple-600" />))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Restore dialog */}
        <AlertDialog open={restoreDialog.open} onOpenChange={(open) => !open && setRestoreDialog({ open: false, item: null, type: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dokument wiederherstellen?</AlertDialogTitle>
              <AlertDialogDescription>Das Dokument wird aus dem Papierkorb entfernt und wieder in der normalen Ansicht angezeigt.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => restoreMutation.mutate({ id: restoreDialog.item?.id, type: restoreDialog.type! })} className="bg-emerald-600 hover:bg-emerald-700">
                Wiederherstellen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Permanent delete dialog */}
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, item: null, type: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Endgültig löschen?</AlertDialogTitle>
              <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden. Das Dokument und alle zugehörigen Positionen werden permanent gelöscht.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => permanentDeleteMutation.mutate({ id: deleteDialog.item?.id, type: deleteDialog.type! })} className="bg-rose-600 hover:bg-rose-700">
                Endgültig löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete all dialog */}
        <AlertDialog open={deleteAllDialog} onOpenChange={setDeleteAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gesamten Papierkorb leeren?</AlertDialogTitle>
              <AlertDialogDescription>Alle {totalDeleted} Dokumente im Papierkorb werden endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteAllMutation.mutate()} className="bg-rose-600 hover:bg-rose-700">
                Alles löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
