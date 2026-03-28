import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const payload = await req.json();
        console.log('📥 PDF URL Update erhalten:', JSON.stringify(payload, null, 2));
        
        // Parse data wenn es ein String ist
        let data = payload;
        if (typeof payload.data === 'string') {
            data = JSON.parse(payload.data);
        } else if (payload.data) {
            data = payload.data;
        }
        
        const { document_type, document_id, pdf_url, success } = data;
        
        if (!success) {
            console.log('⚠️ Update nicht erfolgreich, überspringe');
            return Response.json({ message: 'Nicht erfolgreich, ignoriert' }, { status: 200 });
        }
        
        if (!document_type || !document_id || !pdf_url) {
            return Response.json({ 
                error: 'Fehlende Felder: document_type, document_id, pdf_url erforderlich' 
            }, { status: 400 });
        }
        
        // Je nach document_type das richtige Entity aktualisieren
        let updated = false;
        
        if (document_type === 'angebot') {
            try {
                await base44.asServiceRole.entities.Offer.update(document_id, { 
                    pdfUrl: pdf_url 
                });
                console.log(`✅ PDF-URL für Angebot ${document_id} aktualisiert`);
                updated = true;
            } catch (e) {
                console.error('Fehler beim Aktualisieren des Angebots:', e.message);
                return Response.json({ error: `Angebot nicht gefunden: ${e.message}` }, { status: 404 });
            }
        } else if (document_type === 'rechnung') {
            try {
                await base44.asServiceRole.entities.Invoice.update(document_id, { 
                    pdfUrl: pdf_url 
                });
                console.log(`✅ PDF-URL für Rechnung ${document_id} aktualisiert`);
                updated = true;
            } catch (e) {
                console.error('Fehler beim Aktualisieren der Rechnung:', e.message);
                return Response.json({ error: `Rechnung nicht gefunden: ${e.message}` }, { status: 404 });
            }
        } else if (document_type === 'lieferschein') {
            try {
                await base44.asServiceRole.entities.DeliveryNote.update(document_id, { 
                    pdfUrl: pdf_url 
                });
                console.log(`✅ PDF-URL für Lieferschein ${document_id} aktualisiert`);
                updated = true;
            } catch (e) {
                console.error('Fehler beim Aktualisieren des Lieferscheins:', e.message);
                return Response.json({ error: `Lieferschein nicht gefunden: ${e.message}` }, { status: 404 });
            }
        } else {
            return Response.json({ 
                error: `Unbekannter document_type: ${document_type}. Unterstützt: angebot, rechnung, lieferschein` 
            }, { status: 400 });
        }
        
        return Response.json({
            success: true,
            message: `PDF-URL für ${document_type} ${document_id} erfolgreich aktualisiert`,
            document_type,
            document_id,
            pdf_url,
            updated
        }, { status: 200 });
        
    } catch (error) {
        console.error('❌ Fehler:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});