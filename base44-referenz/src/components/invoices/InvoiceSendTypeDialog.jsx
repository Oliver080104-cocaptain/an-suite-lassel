import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";

export default function InvoiceSendTypeDialog({ open, onOpenChange, invoice, partialPayments, onConfirm }) {
  const [sendType, setSendType] = useState('normal');

  const hasPartialPayments = partialPayments && partialPayments.length > 0;
  const hasOutstandingPayments = hasPartialPayments && partialPayments.some(p => p.status === 'ausstehend');

  const handleConfirm = () => {
    onConfirm(sendType);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            Versendart wählen
          </DialogTitle>
          <DialogDescription>
            Wie möchten Sie die Rechnung {invoice?.rechnungsNummer} versenden?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            {/* Normale Rechnung */}
            <div className="border rounded-lg p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSendType('normal')}>
              <div className="flex items-center gap-3">
                <RadioGroup value={sendType} onValueChange={setSendType}>
                  <RadioGroupItem value="normal" id="send-normal" />
                </RadioGroup>
                <Label htmlFor="send-normal" className="flex-1 cursor-pointer">
                  <span className="font-semibold text-slate-900">Normale Rechnung</span>
                  <p className="text-sm text-slate-500 mt-1">
                    Gesamtrechnungsbetrag: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(invoice?.summeBrutto || 0)}
                  </p>
                </Label>
              </div>
            </div>

            {/* Teilzahlungen */}
            {hasPartialPayments && (
              <div className="border rounded-lg p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSendType('partial')}>
                <div className="flex items-center gap-3">
                  <RadioGroup value={sendType} onValueChange={setSendType}>
                    <RadioGroupItem value="partial" id="send-partial" />
                  </RadioGroup>
                  <Label htmlFor="send-partial" className="flex-1 cursor-pointer">
                    <span className="font-semibold text-slate-900">Teilzahlungen</span>
                    <p className="text-sm text-slate-500 mt-1">
                      {partialPayments.filter(p => p.status === 'ausstehend').length} ausstehende Zahlungen
                    </p>
                  </Label>
                </div>
              </div>
            )}
          </div>

          {!hasPartialPayments && (
            <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">
              Für diese Rechnung wurden keine Teilzahlungen konfiguriert. Die Rechnung wird als Ganzes versendet.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700">
            Weiter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}