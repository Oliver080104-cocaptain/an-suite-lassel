import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { invoiceId } = await req.json();
        
        if (!invoiceId) {
            return Response.json({ error: 'invoiceId erforderlich' }, { status: 400 });
        }
        
        console.log('🔔 Sende Callback für Rechnung:', invoiceId);
        
        // Rechnung laden
        const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
        
        if (!invoices || invoices.length === 0) {
            return Response.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
        }
        
        const invoice = invoices[0];
        
        if (!invoice.callbackUrl) {
            return Response.json({ error: 'Keine Callback-URL vorhanden' }, { status: 400 });
        }
        
        // Callback kann mehrfach gesendet werden (z.B. bei Updates)
        
        const callbackPayload = {
            // Ursprüngliche Request-Daten 1:1 zurück
            ...(invoice.originalPayload || {}),
            // Generierte Daten in separatem Objekt
            result: {
                ticketIdentifikation: invoice.ticketIdentifikation,
                rechnungId: invoice.id,
                rechnungsNummer: invoice.rechnungsNummer,
                rechnungstyp: invoice.rechnungstyp,
                pdfUrl: invoice.pdfUrl,
                status: invoice.status,
                summeNetto: invoice.summeNetto,
                summeUst: invoice.summeUst,
                summeBrutto: invoice.summeBrutto,
                faelligAm: invoice.faelligAm
            }
        };
        
        console.log('📤 Callback Payload:', JSON.stringify(callbackPayload, null, 2));
        console.log('📍 Callback URL:', invoice.callbackUrl);
        
        // API Log für ausgehenden Callback
        try {
            await base44.asServiceRole.entities.ApiLog.create({
                typ: 'outgoing_invoice_callback',
                method: 'POST',
                endpoint: invoice.callbackUrl,
                payload: callbackPayload,
                status: 'pending',
                timestamp: new Date().toISOString(),
                relatedInvoiceId: invoice.id,
                relatedInvoiceNumber: invoice.rechnungsNummer
            });
        } catch (logError) {
            console.error('Log-Fehler:', logError);
        }
        
        const callbackResponse = await fetch(invoice.callbackUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Base44-Webhook/1.0'
            },
            body: JSON.stringify(callbackPayload)
        });
        
        console.log('📊 Callback Response Status:', callbackResponse.status);
        const responseText = await callbackResponse.text();
        console.log('📊 Callback Response Body:', responseText);
        
        if (callbackResponse.ok) {
            console.log('✅ Callback erfolgreich gesendet');
            
            return Response.json({
                success: true,
                message: 'Callback erfolgreich gesendet',
                callbackUrl: invoice.callbackUrl,
                payload: callbackPayload
            }, { status: 200 });
        } else {
            console.error('❌ Callback fehlgeschlagen:', callbackResponse.status);
            return Response.json({
                success: false,
                error: 'Callback fehlgeschlagen',
                status: callbackResponse.status,
                response: responseText
            }, { status: 500 });
        }
        
    } catch (error) {
        console.error('❌ Fehler beim Callback-Versand:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});