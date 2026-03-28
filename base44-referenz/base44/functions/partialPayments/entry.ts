import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { method } = req;
    const body = method !== 'GET' ? await req.json() : {};

    // LIST - Alle Teilzahlungen für eine Rechnung abrufen
    if (method === 'GET' || body.action === 'list') {
      const { invoiceId } = body;
      if (!invoiceId) {
        return Response.json({ error: 'invoiceId erforderlich' }, { status: 400 });
      }

      const payments = await base44.entities.PartialPayment.filter({ invoiceId }, 'datum');
      return Response.json({ success: true, payments });
    }

    // CREATE - Neue Teilzahlung erstellen
    if (body.action === 'create') {
      const { invoiceId, titel, betrag, prozentAnteil, datum, status, zahlungsart, bemerkung } = body;
      
      if (!invoiceId || betrag === undefined || !datum || !status) {
        return Response.json({ error: 'Pflichtfelder fehlen' }, { status: 400 });
      }

      const payment = await base44.entities.PartialPayment.create({
        invoiceId,
        titel: titel || '',
        betrag: parseFloat(betrag) || 0,
        prozentAnteil: parseFloat(prozentAnteil) || 0,
        datum,
        status,
        zahlungsart: zahlungsart || 'überweisung',
        bemerkung: bemerkung || ''
      });

      // Invoice Status aktualisieren
      await updateInvoiceStatus(base44, invoiceId);

      return Response.json({ success: true, payment });
    }

    // UPDATE - Teilzahlung aktualisieren
    if (body.action === 'update') {
      const { paymentId, invoiceId, ...updateData } = body;
      
      if (!paymentId) {
        return Response.json({ error: 'paymentId erforderlich' }, { status: 400 });
      }

      await base44.entities.PartialPayment.update(paymentId, updateData);
      
      // Invoice Status aktualisieren
      if (invoiceId) {
        await updateInvoiceStatus(base44, invoiceId);
      }

      return Response.json({ success: true });
    }

    // DELETE - Teilzahlung löschen
    if (body.action === 'delete') {
      const { paymentId, invoiceId } = body;
      
      if (!paymentId) {
        return Response.json({ error: 'paymentId erforderlich' }, { status: 400 });
      }

      await base44.entities.PartialPayment.delete(paymentId);
      
      // Invoice Status aktualisieren
      if (invoiceId) {
        await updateInvoiceStatus(base44, invoiceId);
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ungültige Aktion' }, { status: 400 });

  } catch (error) {
    console.error('Error in partialPayments function:', error);
    return Response.json({ 
      error: error.message || 'Interner Serverfehler',
      details: error.toString()
    }, { status: 500 });
  }
});

// Hilfsfunktion: Invoice Status basierend auf Teilzahlungen aktualisieren
async function updateInvoiceStatus(base44, invoiceId) {
  try {
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    if (invoices.length === 0) return;
    
    const invoice = invoices[0];
    const payments = await base44.entities.PartialPayment.filter({ invoiceId });
    
    const totalPaid = payments
      .filter(p => p.status === 'bezahlt')
      .reduce((sum, p) => sum + (parseFloat(p.betrag) || 0), 0);
    
    const invoiceTotal = parseFloat(invoice.summeBrutto) || 0;
    
    let newStatus = invoice.status;
    if (totalPaid >= invoiceTotal - 0.01 && invoiceTotal > 0) {
      newStatus = 'bezahlt';
    } else if (totalPaid > 0) {
      newStatus = 'teilweise_bezahlt';
    } else if (payments.length > 0 && totalPaid === 0) {
      newStatus = 'offen';
    }
    
    if (newStatus !== invoice.status) {
      await base44.entities.Invoice.update(invoiceId, { 
        status: newStatus,
        bezahltBetrag: totalPaid
      });
    }
  } catch (error) {
    console.error('Error updating invoice status:', error);
  }
}