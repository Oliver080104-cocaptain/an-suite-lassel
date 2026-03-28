import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, RotateCcw, FileText, Receipt, Truck, AlertCircle, Calendar } from "lucide-react";
import PageHeader from '../components/shared/PageHeader';
import { format, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import CurrencyDisplay from '../components/shared/CurrencyDisplay';

export default function Papierkorb() {
  const queryClient = useQueryClient();
  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null, type: null });
  const [restoreDialog, setRestoreDialog] = useState({ open: false, item: null, type: null });
  const [deleteAllDialog, setDeleteAllDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  // Gelöschte Dokumente laden
  const { data: deletedOffers = [], isLoading: loadingOffers } = useQuery({
    queryKey: ['deletedOffers'],
    queryFn: async () => {
      const allOffers = await base44.entities.Offer.list();
      return allOffers.filter(o => o.deleted_at);
    }
  });

  const { data: deletedInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['deletedInvoices'],
    queryFn: async () => {
      const allInvoices = await base44.entities.Invoice.list();
      return allInvoices.filter(i => i.deleted_at);
    }
  });

  const { data: deletedDeliveryNotes = [], isLoading: loadingDeliveryNotes } = useQuery({
    queryKey: ['deletedDeliveryNotes'],
    queryFn: async () => {
      const allNotes = await base44.entities.DeliveryNote.list();
      return allNotes.filter(d => d.deleted_at);
    }
  });

  // Wiederherstellen
  const restoreMutation = useMutation({
    mutationFn: async ({ id, type }) => {
      const entity = type === 'offer' ? base44.entities.Offer : 
                     type === 'invoice' ? base44.entities.Invoice : 
                     base44.entities.DeliveryNote;
      await entity.update(id, { deleted_at: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] });
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] });
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['deliveryNotes'] });
      toast.success('Dokument wiederhergestellt');
      setRestoreDialog({ open: false, item: null, type: null });
    },
    onError: () => {
      toast.error('Fehler beim Wiederherstellen');
    }
  });

  // Endgültig löschen
  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ id, type }) => {
      if (type === 'offer') {
        const positions = await base44.entities.OfferPosition.filter({ offerId: id });
        for (const pos of positions) {
          await base44.entities.OfferPosition.delete(pos.id);
        }
        await base44.entities.Offer.delete(id);
      } else if (type === 'invoice') {
        const positions = await base44.entities.InvoicePosition.filter({ invoiceId: id });
        for (const pos of positions) {
          await base44.entities.InvoicePosition.delete(pos.id);
        }
        await base44.entities.Invoice.delete(id);
      } else if (type === 'deliveryNote') {
        const positions = await base44.entities.DeliveryNotePosition.filter({ deliveryNoteId: id });
        for (const pos of positions) {
          await base44.entities.DeliveryNotePosition.delete(pos.id);
        }
        await base44.entities.DeliveryNote.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] });
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] });
      toast.success('Dokument endgültig gelöscht');
      setDeleteDialog({ open: false, item: null, type: null });
      setSelectedItems([]);
    },
    onError: () => {
      toast.error('Fehler beim Löschen');
    }
  });

  // Alle ausgewählten löschen
  const deleteSelectedMutation = useMutation({
    mutationFn: async () => {
      for (const item of selectedItems) {
        if (item.type === 'offer') {
          const positions = await base44.entities.OfferPosition.filter({ offerId: item.id });
          for (const pos of positions) {
            await base44.entities.OfferPosition.delete(pos.id);
          }
          await base44.entities.Offer.delete(item.id);
        } else if (item.type === 'invoice') {
          const positions = await base44.entities.InvoicePosition.filter({ invoiceId: item.id });
          for (const pos of positions) {
            await base44.entities.InvoicePosition.delete(pos.id);
          }
          await base44.entities.Invoice.delete(item.id);
        } else if (item.type === 'deliveryNote') {
          const positions = await base44.entities.DeliveryNotePosition.filter({ deliveryNoteId: item.id });
          for (const pos of positions) {
            await base44.entities.DeliveryNotePosition.delete(pos.id);
          }
          await base44.entities.DeliveryNote.delete(item.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] });
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] });
      toast.success(`${selectedItems.length} Dokument(e) endgültig gelöscht`);
      setSelectedItems([]);
      setDeleteAllDialog(false);
    },
    onError: () => {
      toast.error('Fehler beim Löschen');
    }
  });

  // Alle löschen
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      for (const offer of deletedOffers) {
        const positions = await base44.entities.OfferPosition.filter({ offerId: offer.id });
        for (const pos of positions) {
          await base44.entities.OfferPosition.delete(pos.id);
        }
        await base44.entities.Offer.delete(offer.id);
      }
      for (const invoice of deletedInvoices) {
        const positions = await base44.entities.InvoicePosition.filter({ invoiceId: invoice.id });
        for (const pos of positions) {
          await base44.entities.InvoicePosition.delete(pos.id);
        }
        await base44.entities.Invoice.delete(invoice.id);
      }
      for (const note of deletedDeliveryNotes) {
        const positions = await base44.entities.DeliveryNotePosition.filter({ deliveryNoteId: note.id });
        for (const pos of positions) {
          await base44.entities.DeliveryNotePosition.delete(pos.id);
        }
        await base44.entities.DeliveryNote.delete(note.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedOffers'] });
      queryClient.invalidateQueries({ queryKey: ['deletedInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['deletedDeliveryNotes'] });
      toast.success('Papierkorb geleert');
      setDeleteAllDialog(false);
      setSelectedItems([]);
    },
    onError: () => {
      toast.error('Fehler beim Leeren des Papierkorbs');
    }
  });

  const getDaysRemaining = (deleted_at) => {
    if (!deleted_at) return 10;
    const deletedDate = new Date(deleted_at);
    const daysPassed = differenceInDays(new Date(), deletedDate);
    return Math.max(0, 10 - daysPassed);
  };

  const toggleSelection = (id, type) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.id === id && item.type === type);
      if (exists) {
        return prev.filter(item => !(item.id === id && item.type === type));
      }
      return [...prev, { id, type }];
    });
  };

  const isSelected = (id, type) => {
    return selectedItems.some(item => item.id === id && item.type === type);
  };

  const renderDocumentCard = (doc, type, icon) => {
    const daysRemaining = getDaysRemaining(doc.deleted_at);
    const isExpiringSoon = daysRemaining <= 3;
    const selected = isSelected(doc.id, type);

    return (
      <Card key={doc.id} className={`p-4 hover:shadow-md transition-all ${selected ? 'ring-2 ring-orange-500' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleSelection(doc.id, type)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <div className={`p-2 rounded-lg ${
              type === 'offer' ? 'bg-blue-100' : 
              type === 'invoice' ? 'bg-emerald-100' : 
              'bg-purple-100'
            }`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-slate-900 truncate">
                  {type === 'offer' ? doc.angebotNummer : 
                   type === 'invoice' ? doc.rechnungsNummer : 
                   doc.lieferscheinNummer}
                </h3>
                {isExpiringSoon && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {daysRemaining} Tag{daysRemaining !== 1 ? 'e' : ''}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600 mb-2">
                {doc.objektBezeichnung || doc.rechnungsempfaengerName || doc.kundeName || 'Kein Name'}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {doc.datum && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(doc.datum), 'dd.MM.yyyy', { locale: de })}
                  </span>
                )}
                {(doc.summeBrutto || doc.summeBrutto === 0) && (
                  <CurrencyDisplay amount={doc.summeBrutto} className="font-medium" />
                )}
                {doc.deleted_at && (
                  <span className="text-red-600">
                    Gelöscht: {format(new Date(doc.deleted_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRestoreDialog({ open: true, item: doc, type })}
              disabled={restoreMutation.isPending}
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Wiederherstellen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeleteDialog({ open: true, item: doc, type })}
              disabled={permanentDeleteMutation.isPending}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const isLoading = loadingOffers || loadingInvoices || loadingDeliveryNotes;
  const totalDeleted = deletedOffers.length + deletedInvoices.length + deletedDeliveryNotes.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <PageHeader
            title="Papierkorb"
            subtitle="Gelöschte Dokumente werden nach 10 Tagen endgültig archiviert"
            backLink="Settings"
            backLabel="Zurück zu Einstellungen"
          />
          {totalDeleted > 0 && (
            <div className="flex gap-3 mt-4">
              <Button
                variant="destructive"
                onClick={() => setDeleteAllDialog(true)}
                disabled={deleteAllMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Papierkorb leeren ({totalDeleted})
              </Button>
              {selectedItems.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => deleteSelectedMutation.mutate()}
                  disabled={deleteSelectedMutation.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Ausgewählte löschen ({selectedItems.length})
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-slate-500">Lade Papierkorb...</div>
          </div>
        ) : totalDeleted === 0 ? (
          <Card className="p-12 text-center">
            <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">Papierkorb ist leer</h3>
            <p className="text-slate-500">Keine gelöschten Dokumente vorhanden</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Info Banner */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <strong>Automatische Archivierung:</strong> Dokumente im Papierkorb werden nach 10 Tagen automatisch endgültig gelöscht. 
                  Dokumente mit weniger als 3 Tagen verbleibender Zeit werden rot markiert.
                </div>
              </div>
            </Card>

            {/* Angebote */}
            {deletedOffers.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Angebote ({deletedOffers.length})
                </h2>
                <div className="space-y-3">
                  {deletedOffers.map(offer => renderDocumentCard(
                    offer, 
                    'offer', 
                    <FileText className="w-5 h-5 text-blue-600" />
                  ))}
                </div>
              </div>
            )}

            {/* Rechnungen */}
            {deletedInvoices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                  Rechnungen ({deletedInvoices.length})
                </h2>
                <div className="space-y-3">
                  {deletedInvoices.map(invoice => renderDocumentCard(
                    invoice, 
                    'invoice', 
                    <Receipt className="w-5 h-5 text-emerald-600" />
                  ))}
                </div>
              </div>
            )}

            {/* Lieferscheine */}
            {deletedDeliveryNotes.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-purple-600" />
                  Lieferscheine ({deletedDeliveryNotes.length})
                </h2>
                <div className="space-y-3">
                  {deletedDeliveryNotes.map(note => renderDocumentCard(
                    note, 
                    'deliveryNote', 
                    <Truck className="w-5 h-5 text-purple-600" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wiederherstellen Dialog */}
        <AlertDialog open={restoreDialog.open} onOpenChange={(open) => !open && setRestoreDialog({ open: false, item: null, type: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dokument wiederherstellen?</AlertDialogTitle>
              <AlertDialogDescription>
                Das Dokument wird aus dem Papierkorb entfernt und wieder in der normalen Ansicht angezeigt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => restoreMutation.mutate({ 
                  id: restoreDialog.item?.id, 
                  type: restoreDialog.type 
                })}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Wiederherstellen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Endgültig löschen Dialog */}
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, item: null, type: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Endgültig löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden. Das Dokument und alle zugehörigen Positionen werden permanent gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => permanentDeleteMutation.mutate({ 
                  id: deleteDialog.item?.id, 
                  type: deleteDialog.type 
                })}
                className="bg-red-600 hover:bg-red-700"
              >
                Endgültig löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Papierkorb leeren Dialog */}
        <AlertDialog open={deleteAllDialog} onOpenChange={setDeleteAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gesamten Papierkorb leeren?</AlertDialogTitle>
              <AlertDialogDescription>
                Alle {totalDeleted} Dokumente im Papierkorb werden endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAllMutation.mutate()}
                className="bg-red-600 hover:bg-red-700"
              >
                Alles löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}