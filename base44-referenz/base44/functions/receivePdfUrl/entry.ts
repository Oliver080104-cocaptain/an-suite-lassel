import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();

        const { document_type, document_id, pdf_url, metadata } = payload;

        if (!document_type || !document_id || !pdf_url) {
            return Response.json({ 
                error: 'Fehlende Parameter: document_type, document_id und pdf_url erforderlich' 
            }, { status: 400 });
        }

        // Je nach Dokumenttyp in die richtige Entity schreiben
        switch (document_type) {
            case 'angebot':
                await base44.asServiceRole.entities.Offer.update(document_id, { 
                    pdfUrl: pdf_url,
                    status: 'final'
                });
                break;

            case 'rechnung':
            case 'gutschrift':
                await base44.asServiceRole.entities.Invoice.update(document_id, { 
                    pdfUrl: pdf_url
                });
                break;

            case 'lieferschein':
                await base44.asServiceRole.entities.DeliveryNote.update(document_id, { 
                    pdfUrl: pdf_url,
                    status: 'erstellt'
                });
                break;

            default:
                return Response.json({ 
                    error: `Unbekannter document_type: ${document_type}` 
                }, { status: 400 });
        }

        return Response.json({ 
            success: true,
            message: `PDF-URL erfolgreich für ${document_type} ${document_id} gespeichert`,
            document_type,
            document_id,
            pdf_url
        });

    } catch (error) {
        console.error('Fehler beim Speichern der PDF-URL:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});