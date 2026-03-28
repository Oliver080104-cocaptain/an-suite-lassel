import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Download, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import html2pdf from 'html2pdf.js';
import { generatePartialPaymentPdfHtml } from '@/components/pdf/PartialPaymentPdf';

export default function PartialPaymentsSection({ invoiceId, invoice }) {
  const [enabled, setEnabled] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [localPayments, setLocalPayments] = useState({});
  const queryClient = useQueryClient();
  const updateTimersRef = React.useRef({});

  const { data: payments = [], isLoading, error, refetch } = useQuery({
    queryKey: ['partialPayments', invoiceId],
    queryFn: async () => {
      if (!invoiceId || invoiceId === 'new') return [];
      
      try {
        const result = await base44.entities.PartialPayment.filter({ invoiceId }, 'datum');
        setLocalPayments({});
        return result || [];
      } catch (err) {
        console.error('Error fetching payments:', err);
        throw err;
      }
    },
    enabled: !!invoiceId && invoiceId !== 'new',
    retry: 1
  });

  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const settings = await base44.entities.CompanySettings.list();
      return settings[0] || null;
    }
  });

  React.useEffect(() => {
    if (payments.length > 0) {
      setEnabled(true);
    }
  }, [payments]);

  const updateInvoiceStatus = async () => {
    try {
      const totalPaid = payments
        .filter(p => p.status === 'bezahlt')
        .reduce((sum, p) => sum + (parseFloat(p.betrag) || 0), 0);
      
      const invoiceTotal = parseFloat(invoice?.summeBrutto) || 0;
      
      let newStatus = invoice?.status || 'entwurf';
      if (totalPaid >= invoiceTotal - 0.01 && invoiceTotal > 0) {
        newStatus = 'bezahlt';
      } else if (totalPaid > 0) {
        newStatus = 'teilweise_bezahlt';
      } else if (payments.length > 0 && totalPaid === 0) {
        newStatus = 'offen';
      }
      
      if (newStatus !== invoice?.status) {
        await base44.entities.Invoice.update(invoiceId, { 
          status: newStatus,
          bezahltBetrag: totalPaid
        });
        queryClient.invalidateQueries(['invoice', invoiceId]);
        queryClient.invalidateQueries(['invoices']);
      }
    } catch (error) {
      console.error('Error updating invoice status:', error);
    }
  };

  const handleAddPayment = async () => {
    setIsProcessing(true);
    try {
      await base44.entities.PartialPayment.create({
        invoiceId,
        titel: '',
        betrag: 0,
        prozentAnteil: 0,
        datum: new Date().toISOString().split('T')[0],
        status: 'ausstehend',
        zahlungsart: 'überweisung',
        bemerkung: ''
      });
      
      await refetch();
      await updateInvoiceStatus();
      toast.success('Teilzahlung hinzugefügt');
    } catch (error) {
      console.error('Error adding payment:', error);
      toast.error('Fehler beim Hinzufügen: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdatePayment = (paymentId, updates) => {
    setLocalPayments(prev => ({
      ...prev,
      [paymentId]: { ...prev[paymentId], ...updates }
    }));
    
    if (updateTimersRef.current[paymentId]) {
      clearTimeout(updateTimersRef.current[paymentId]);
    }
    
    updateTimersRef.current[paymentId] = setTimeout(async () => {
      try {
        await base44.entities.PartialPayment.update(paymentId, updates);
        await refetch();
        await updateInvoiceStatus();
      } catch (error) {
        console.error('Error updating payment:', error);
        if (error.message && error.message.includes('rate limit')) {
          toast.error('Zu viele Anfragen. Bitte warten Sie einen Moment.');
        } else {
          toast.error('Fehler beim Aktualisieren: ' + (error.message || 'Unbekannter Fehler'));
        }
      }
    }, 2000);
  };

  const handleDeletePayment = async (paymentId) => {
    setIsProcessing(true);
    try {
      await base44.entities.PartialPayment.delete(paymentId);
      await refetch();
      await updateInvoiceStatus();
      toast.success('Teilzahlung gelöscht');
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPaymentPdf = async (payment) => {
    try {
      const htmlContent = generatePartialPaymentPdfHtml(invoice, payment, companySettings);
      
      const response = await fetch('https://lasselgmbh.app.n8n.cloud/webhook-test/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html_content: htmlContent,
          css_content: '',
          file_name: `Teilzahlung_${invoice.rechnungsNummer}_${payment.datum}.pdf`,
          document_type: 'teilzahlung',
          metadata: {
            invoiceId: invoice.id,
            rechnungsNummer: invoice.rechnungsNummer,
            paymentId: payment.id,
            paymentDatum: payment.datum,
            paymentBetrag: payment.betrag
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook fehlgeschlagen: ${response.status}`);
      }

      toast.success('PDF-Anfrage wurde gesendet');
    } catch (error) {
      console.error('Error creating PDF:', error);
      toast.error('Fehler beim Erstellen des PDFs: ' + error.message);
    }
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-red-600">Fehler bei Teilzahlungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600 space-y-2">
            <p>Die Teilzahlungen konnten nicht geladen werden.</p>
            <p className="text-xs text-red-600">Fehler: {error.message || 'Unbekannter Fehler'}</p>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-2">
              Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Teilzahlungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!enabled && payments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Teilzahlungen</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setEnabled(true)} 
            variant="outline"
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Teilzahlungen aktivieren
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalPaid = payments
    .filter(p => p.status === 'bezahlt')
    .reduce((sum, p) => sum + (parseFloat(p.betrag) || 0), 0);
  const totalOutstanding = payments
    .filter(p => p.status === 'ausstehend')
    .reduce((sum, p) => sum + (parseFloat(p.betrag) || 0), 0);
  const remaining = (invoice?.summeBrutto || 0) - totalPaid - totalOutstanding;

  const getPaymentValue = (payment, field) => {
    const localValue = localPayments[payment.id]?.[field];
    return localValue !== undefined ? localValue : (payment[field] || (field === 'betrag' || field === 'prozentAnteil' ? 0 : ''));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Teilzahlungen</CardTitle>
          <Button 
            onClick={handleAddPayment} 
            size="sm" 
            className="bg-orange-600 hover:bg-orange-700"
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Hinzufügen
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {payments.map((payment) => {
          const status = getPaymentValue(payment, 'status') || 'ausstehend';
          return (
          <div key={payment.id} className={`border rounded-lg p-4 space-y-3 ${status === 'bezahlt' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex justify-between items-start mb-2">
              <Input
                value={getPaymentValue(payment, 'titel')}
                onChange={(e) => handleUpdatePayment(payment.id, { titel: e.target.value })}
                placeholder="z.B. Anzahlung, 1. Teilzahlung"
                className="font-semibold text-base"
              />
              <Select
                value={status}
                onValueChange={(value) => handleUpdatePayment(payment.id, { status: value })}
              >
                <SelectTrigger className="w-36 ml-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ausstehend">Ausstehend</SelectItem>
                  <SelectItem value="bezahlt">Bezahlt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Prozent (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={getPaymentValue(payment, 'prozentAnteil')}
                  onChange={(e) => {
                    const prozent = parseFloat(e.target.value) || 0;
                    const betrag = (invoice?.summeBrutto || 0) * (prozent / 100);
                    handleUpdatePayment(payment.id, { prozentAnteil: prozent, betrag: betrag });
                  }}
                  placeholder="z.B. 10"
                />
              </div>
              <div>
                <Label className="text-sm">Betrag (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={getPaymentValue(payment, 'betrag')}
                  onChange={(e) => {
                    const betrag = parseFloat(e.target.value) || 0;
                    const prozent = invoice?.summeBrutto ? (betrag / invoice.summeBrutto) * 100 : 0;
                    handleUpdatePayment(payment.id, { betrag: betrag, prozentAnteil: prozent });
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Datum</Label>
                <Input
                  type="date"
                  value={getPaymentValue(payment, 'datum')}
                  onChange={(e) => handleUpdatePayment(payment.id, { datum: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Zahlungsart</Label>
                <Select
                  value={getPaymentValue(payment, 'zahlungsart') || 'überweisung'}
                  onValueChange={(value) => handleUpdatePayment(payment.id, { zahlungsart: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="überweisung">Überweisung</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="karte">Karte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm">Bemerkung</Label>
              <Input
                value={getPaymentValue(payment, 'bemerkung')}
                onChange={(e) => handleUpdatePayment(payment.id, { bemerkung: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadPaymentPdf(payment)}
                className="text-blue-600 hover:text-blue-700"
                disabled={status !== 'bezahlt'}
              >
                <Download className="w-4 h-4 mr-1" />
                PDF herunterladen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeletePayment(payment.id)}
                className="text-red-600 hover:text-red-700"
                disabled={isProcessing}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
        })}

        {payments.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Rechnungsbetrag:</span>
              <span className="font-semibold">
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(invoice?.summeBrutto || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Bereits bezahlt:</span>
              <span className="font-semibold text-green-600">
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Ausstehend:</span>
              <span className="font-semibold text-orange-600">
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalOutstanding)}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t">
              <span className="font-medium">Verbleibend:</span>
              <span className={`font-semibold ${remaining <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(remaining)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}