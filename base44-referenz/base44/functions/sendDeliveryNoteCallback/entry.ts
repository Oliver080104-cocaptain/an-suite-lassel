import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { deliveryNoteId } = await req.json();
        
        if (!deliveryNoteId) {
            return Response.json({ 
                error: 'deliveryNoteId erforderlich' 
            }, { status: 400 });
        }
        
        // Lieferschein laden
        const deliveryNotes = await base44.asServiceRole.entities.DeliveryNote.filter({ 
            id: deliveryNoteId 
        });
        const deliveryNote = deliveryNotes[0];
        
        if (!deliveryNote) {
            return Response.json({ 
                error: 'Lieferschein nicht gefunden' 
            }, { status: 404 });
        }
        
        if (!deliveryNote.callbackUrl) {
            return Response.json({ 
                error: 'Keine Callback URL konfiguriert' 
            }, { status: 400 });
        }
        
        // Callback Payload erstellen (Original + Result)
        const callbackPayload = {
            ...deliveryNote.originalPayload,
            result: {
                ticketIdentifikation: deliveryNote.ticketIdentifikation,
                lieferscheinId: deliveryNote.id,
                lieferscheinNummer: deliveryNote.lieferscheinNummer,
                pdfUrl: deliveryNote.pdfUrl,
                status: deliveryNote.status
            }
        };
        
        console.log('📤 Callback Payload:', JSON.stringify(callbackPayload, null, 2));
        console.log('📍 Callback URL:', deliveryNote.callbackUrl);
        
        // API Log für ausgehenden Callback
        try {
            await base44.asServiceRole.entities.ApiLog.create({
                typ: 'outgoing_delivery_note_callback',
                method: 'POST',
                endpoint: deliveryNote.callbackUrl,
                payload: callbackPayload,
                status: 'pending',
                timestamp: new Date().toISOString()
            });
        } catch (logError) {
            console.error('Log-Fehler:', logError);
        }
        
        const callbackResponse = await fetch(deliveryNote.callbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(callbackPayload)
        });
        
        const responseBody = await callbackResponse.text();
        console.log('✅ Callback Response Status:', callbackResponse.status);
        console.log('📥 Callback Response Body:', responseBody);
        
        if (!callbackResponse.ok) {
            return Response.json({ 
                success: false,
                error: 'Callback fehlgeschlagen',
                status: callbackResponse.status,
                body: responseBody
            }, { status: 500 });
        }
        
        return Response.json({ 
            success: true,
            message: 'Callback erfolgreich gesendet',
            callbackStatus: callbackResponse.status
        });
        
    } catch (error) {
        console.error('❌ Fehler:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});