import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { offerId } = await req.json();
        
        if (!offerId) {
            return Response.json({ error: 'offerId erforderlich' }, { status: 400 });
        }
        
        console.log('🔔 Sende Callback für Angebot:', offerId);
        
        // Angebot laden
        const offers = await base44.asServiceRole.entities.Offer.filter({ id: offerId });
        
        if (!offers || offers.length === 0) {
            return Response.json({ error: 'Angebot nicht gefunden' }, { status: 404 });
        }
        
        const offer = offers[0];
        
        if (!offer.callbackUrl) {
            return Response.json({ error: 'Keine Callback-URL vorhanden' }, { status: 400 });
        }
        
        // Callback kann mehrfach gesendet werden (z.B. bei Updates)
        
        const callbackPayload = {
            // Ursprüngliche Request-Daten 1:1 zurück
            ...(offer.originalPayload || {}),
            // Generierte Daten in separatem Objekt
            result: {
                ticketIdentifikation: offer.ticketIdentifikation,
                angebotId: offer.id,
                angebotNummer: offer.angebotNummer,
                pdfUrl: offer.pdfUrl,
                status: offer.status,
                summeNetto: offer.summeNetto,
                summeUst: offer.summeUst,
                summeBrutto: offer.summeBrutto
            }
        };
        
        console.log('📤 Callback Payload:', JSON.stringify(callbackPayload, null, 2));
        console.log('📍 Callback URL:', offer.callbackUrl);
        
        // API Log für ausgehenden Callback
        try {
            await base44.asServiceRole.entities.ApiLog.create({
                typ: 'outgoing_offer_callback',
                method: 'POST',
                endpoint: offer.callbackUrl,
                payload: callbackPayload,
                status: 'pending',
                timestamp: new Date().toISOString(),
                relatedOfferId: offer.id,
                relatedOfferNumber: offer.angebotNummer
            });
        } catch (logError) {
            console.error('Log-Fehler:', logError);
        }
        
        const callbackResponse = await fetch(offer.callbackUrl, {
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
                callbackUrl: offer.callbackUrl,
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