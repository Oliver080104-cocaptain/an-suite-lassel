import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const API2PDF_KEY = '74db1926-9937-494d-9398-4006d286980b';

Deno.serve(async (req) => {
    try {
        const { html, fileName, document_type, document_id } = await req.json();

        if (!html || !fileName || !document_type || !document_id) {
            return Response.json({ error: 'Fehlende Parameter' }, { status: 400 });
        }

        // HTML aggressiv minimieren um Payload zu reduzieren
        const minHtml = html
            .replace(/<!--[\s\S]*?-->/g, '')      // Kommentare entfernen
            .replace(/[ \t]+/g, ' ')               // Mehrfach-Spaces zu einem
            .replace(/\n\s*/g, '')                 // Zeilenumbrüche entfernen
            .trim();

        console.log(`generatePdf: ${document_type} ${document_id}, HTML size: ${minHtml.length} chars`);

        // API2PDF mit Timeout aufrufen
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

        let api2pdfResponse;
        try {
            api2pdfResponse = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
                method: 'POST',
                headers: {
                    'Authorization': API2PDF_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ html: minHtml, inline: true, fileName }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!api2pdfResponse.ok) {
            const errText = await api2pdfResponse.text();
            console.error('api2pdf HTTP Fehler:', api2pdfResponse.status, errText);
            return Response.json({ error: `api2pdf Fehler: ${errText}` }, { status: 500 });
        }

        const resultRaw = await api2pdfResponse.json();
        const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;
        const pdfUrl = result.FileUrl || result.pdf;

        if (!pdfUrl) {
            console.error('api2pdf kein FileUrl:', JSON.stringify(result));
            return Response.json({ error: 'Keine PDF-URL von api2pdf erhalten', result }, { status: 500 });
        }

        console.log(`PDF generiert: ${pdfUrl}`);

        // URL in Entity speichern (service role)
        const base44 = createClientFromRequest(req);
        switch (document_type) {
            case 'angebot':
                await base44.asServiceRole.entities.Offer.update(document_id, { pdfUrl, status: 'final' });
                break;
            case 'rechnung':
            case 'gutschrift':
                await base44.asServiceRole.entities.Invoice.update(document_id, { pdfUrl });
                break;
            case 'lieferschein':
                await base44.asServiceRole.entities.DeliveryNote.update(document_id, { pdfUrl, status: 'erstellt' });
                break;
        }

        return Response.json({ success: true, pdfUrl });

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('generatePdf Timeout nach 25s');
            return Response.json({ error: 'PDF-Generierung Timeout (HTML zu groß?)' }, { status: 504 });
        }
        console.error('generatePdf Fehler:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});