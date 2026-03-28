import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Admin-Check
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    
    let deletedCount = 0;

    // Angebote älter als 10 Tage im Papierkorb löschen
    const offers = await base44.asServiceRole.entities.Offer.list();
    for (const offer of offers) {
      if (offer.deleted_at && new Date(offer.deleted_at) < tenDaysAgo) {
        const positions = await base44.asServiceRole.entities.OfferPosition.filter({ offerId: offer.id });
        for (const pos of positions) {
          await base44.asServiceRole.entities.OfferPosition.delete(pos.id);
        }
        await base44.asServiceRole.entities.Offer.delete(offer.id);
        deletedCount++;
      }
    }

    // Rechnungen älter als 10 Tage im Papierkorb löschen
    const invoices = await base44.asServiceRole.entities.Invoice.list();
    for (const invoice of invoices) {
      if (invoice.deleted_at && new Date(invoice.deleted_at) < tenDaysAgo) {
        const positions = await base44.asServiceRole.entities.InvoicePosition.filter({ invoiceId: invoice.id });
        for (const pos of positions) {
          await base44.asServiceRole.entities.InvoicePosition.delete(pos.id);
        }
        await base44.asServiceRole.entities.Invoice.delete(invoice.id);
        deletedCount++;
      }
    }

    // Lieferscheine älter als 10 Tage im Papierkorb löschen
    const deliveryNotes = await base44.asServiceRole.entities.DeliveryNote.list();
    for (const note of deliveryNotes) {
      if (note.deleted_at && new Date(note.deleted_at) < tenDaysAgo) {
        const positions = await base44.asServiceRole.entities.DeliveryNotePosition.filter({ deliveryNoteId: note.id });
        for (const pos of positions) {
          await base44.asServiceRole.entities.DeliveryNotePosition.delete(pos.id);
        }
        await base44.asServiceRole.entities.DeliveryNote.delete(note.id);
        deletedCount++;
      }
    }

    return Response.json({ 
      success: true, 
      deletedCount,
      message: `${deletedCount} Dokumente endgültig gelöscht`
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});