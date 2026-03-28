import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function CancelInvoiceDialog({ open, onOpenChange, onConfirm, invoiceNumber }) {
  const [stornoGrund, setStornoGrund] = useState('');

  const handleConfirm = () => {
    onConfirm(stornoGrund);
    setStornoGrund('');
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stornorechnung erstellen</AlertDialogTitle>
          <AlertDialogDescription>
            Es wird eine neue Stornorechnung für <strong>{invoiceNumber}</strong> erstellt.
            <br /><br />
            Die Positionen werden mit negativen Beträgen übernommen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor="stornogrund" className="text-sm font-medium">
            Grund für die Stornierung (optional)
          </Label>
          <Textarea
            id="stornogrund"
            value={stornoGrund}
            onChange={(e) => setStornoGrund(e.target.value)}
            placeholder="z.B. Retoure, Preisänderung, Vertragsverletzung..."
            rows={3}
            className="mt-2"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setStornoGrund('')}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-rose-600 hover:bg-rose-700"
          >
            Stornorechnung erstellen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}