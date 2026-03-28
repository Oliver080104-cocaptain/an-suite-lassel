import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const payload = await req.json();
        console.log('📥 Incoming delivery note webhook:', JSON.stringify(payload, null, 2));
        
        const {
            source,
            entityType,
            ticketId,
            ticketNumber,
            dealId,
            kunde,
            lieferschein,
            positionen,
            meta
        } = payload;
        
        // Validierung
        if (payload.rechnungstyp) {
            return Response.json({ 
                error: 'Falsche URL - für Rechnungen bitte /invoiceWebhook verwenden' 
            }, { status: 400 });
        }
        
        if (payload.angebot && !payload.lieferschein) {
            return Response.json({ 
                error: 'Falsche URL - für Angebote bitte /offerWebhook verwenden' 
            }, { status: 400 });
        }
        
        if (!ticketId && !dealId) {
            return Response.json({ 
                error: 'ticketId oder dealId erforderlich' 
            }, { status: 400 });
        }
        
        if (!kunde || !kunde.name) {
            return Response.json({ 
                error: 'Kundendaten erforderlich' 
            }, { status: 400 });
        }
        
        if (!positionen || positionen.length === 0) {
            return Response.json({ 
                error: 'Mindestens eine Position erforderlich' 
            }, { status: 400 });
        }
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Lieferschein-Nummer generieren
        const year = new Date().getFullYear();
        const allDeliveryNotes = await base44.asServiceRole.entities.DeliveryNote.list();
        const thisYearDeliveryNotes = allDeliveryNotes.filter(dn => 
            dn.lieferscheinNummer && dn.lieferscheinNummer.includes(`LI-${year}`)
        );
        const nextNumber = thisYearDeliveryNotes.length + 1;
        const lieferscheinNummer = `LI-${year}-${String(nextNumber).padStart(5, '0')}`;
        
        // Lieferschein erstellen
        const deliveryNote = await base44.asServiceRole.entities.DeliveryNote.create({
            lieferscheinNummer,
            ticketIdentifikation: ticketId || dealId || null,
            source: source || 'webhook',
            entityType: entityType || 'ticket',
            ticketId: ticketId || null,
            ticketNumber: ticketNumber || null,
            dealId: dealId || null,
            referenzAngebotNummer: lieferschein?.referenzAngebotNummer || null,
            kundeName: kunde.name,
            kundeStrasse: kunde.strasse,
            kundePlz: kunde.plz,
            kundeOrt: kunde.ort,
            kundeAnsprechpartner: kunde.ansprechpartner,
            uidnummer: kunde.uidnummer || null,
            emailAngebot: kunde.emailAngebot || kunde.email || null,
            emailRechnung: kunde.emailRechnung || kunde.email || null,
            datum: lieferschein?.datum || currentDate,
            referenz: lieferschein?.referenz || null,
            erstelltDurch: lieferschein?.erstelltDurch || '',
            status: 'erstellt',
            workdriveFolderId: meta?.workdriveFolderId || null,
            callbackUrl: meta?.callbackUrl || null,
            originalPayload: payload
        });
        
        console.log('✨ Neuer Lieferschein erstellt:', lieferscheinNummer);
        
        // Positionen erstellen
        for (let i = 0; i < positionen.length; i++) {
            const pos = positionen[i];
            await base44.asServiceRole.entities.DeliveryNotePosition.create({
                deliveryNoteId: deliveryNote.id,
                pos: i + 1,
                produktName: pos.produktName,
                beschreibung: pos.beschreibung || '',
                menge: parseFloat(pos.menge) || 0,
                einheit: pos.einheit || 'Stk'
            });
        }
        
        // Company Settings laden
        const settingsList = await base44.asServiceRole.entities.CompanySettings.list();
        const companySettings = settingsList[0] || {};
        
        // PDF generieren
        console.log('📄 Generiere PDF...');
        const pdfDoc = generateDeliveryNotePdf(deliveryNote, positionen, companySettings);
        const pdfBytes = pdfDoc.output('arraybuffer');
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const pdfFile = new File([pdfBlob], `${lieferscheinNummer}.pdf`, { type: 'application/pdf' });
        
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfFile });
        
        // PDF URL speichern
        await base44.asServiceRole.entities.DeliveryNote.update(deliveryNote.id, { pdfUrl: file_url });
        
        console.log('✅ PDF erstellt:', file_url);
        
        // API Log erstellen
        try {
            await base44.asServiceRole.entities.ApiLog.create({
                typ: 'incoming_delivery_note',
                method: 'POST',
                endpoint: '/deliveryNoteWebhook',
                payload: payload,
                response: {
                    lieferscheinId: deliveryNote.id,
                    lieferscheinNummer,
                    pdfUrl: file_url
                },
                status: 'success',
                timestamp: new Date().toISOString()
            });
        } catch (logError) {
            console.error('Log-Fehler:', logError);
        }
        
        return Response.json({
            success: true,
            message: 'Lieferschein erfolgreich erstellt',
            data: {
                lieferscheinId: deliveryNote.id,
                lieferscheinNummer,
                pdfUrl: file_url,
                status: 'erstellt'
            }
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

function generateDeliveryNotePdf(deliveryNote, positions, settings) {
    const doc = new jsPDF();
    
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('de-DE');
    };
    
    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Lieferschein', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(settings.firmenname || 'Lassel GmbH', 150, 20);
    doc.text(`${settings.strasse || 'Hetzmannsdorf 25'}`, 150, 25);
    doc.text(`${settings.plz || '2041'} ${settings.ort || 'Hetzmannsdorf'}`, 150, 30);
    
    // Kunde
    let y = 50;
    doc.setFontSize(9);
    doc.setTextColor(128);
    doc.text('Lieferung an:', 20, y);
    y += 5;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(deliveryNote.kundeName || '', 20, y);
    y += 5;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(deliveryNote.kundeStrasse || '', 20, y);
    y += 5;
    doc.text(`${deliveryNote.kundePlz || ''} ${deliveryNote.kundeOrt || ''}`, 20, y);
    y += 5;
    if (deliveryNote.kundeAnsprechpartner) {
        doc.text(`z.Hd. ${deliveryNote.kundeAnsprechpartner}`, 20, y);
        y += 5;
    }
    
    // Lieferschein-Daten
    y += 10;
    doc.setFontSize(10);
    doc.text(`Lieferschein-Nr.: ${deliveryNote.lieferscheinNummer}`, 20, y);
    doc.text(`Datum: ${formatDate(deliveryNote.datum)}`, 100, y);
    y += 5;
    if (deliveryNote.referenzAngebotNummer) {
        doc.text(`Referenz: ${deliveryNote.referenzAngebotNummer}`, 20, y);
        y += 5;
    }
    if (deliveryNote.referenz) {
        doc.text(`Ihre Referenz: ${deliveryNote.referenz}`, 100, y);
        y += 5;
    }
    
    // Positionen Tabelle
    y += 15;
    
    // Header
    doc.setFillColor(45, 55, 72);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Pos', 22, y + 5);
    doc.text('Beschreibung', 35, y + 5);
    doc.text('Menge', 170, y + 5);
    
    y += 8;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    
    positions.forEach(pos => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        
        doc.text(String(pos.pos || pos.pos), 22, y + 5);
        doc.text(pos.produktName || '', 35, y + 5);
        doc.text(`${pos.menge} ${pos.einheit || 'Stk'}`, 170, y + 5);
        
        y += 6;
        
        if (pos.beschreibung) {
            doc.setFontSize(8);
            doc.setTextColor(128);
            const lines = doc.splitTextToSize(pos.beschreibung, 130);
            lines.forEach(line => {
                doc.text(line, 35, y + 4);
                y += 4;
            });
            doc.setFontSize(9);
            doc.setTextColor(0);
        }
        
        y += 2;
        doc.setDrawColor(226, 232, 240);
        doc.line(20, y, 190, y);
        y += 2;
    });
    
    // Abschlusstext
    y += 15;
    doc.setFontSize(9);
    doc.text('Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.', 20, y);
    y += 5;
    doc.text('Wir bedanken uns sehr für Ihr Vertrauen.', 20, y);
    y += 10;
    doc.text('Mit freundlichen Grüßen', 20, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(deliveryNote.erstelltDurch || '', 20, y);
    
    // Footer
    y = 280;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128);
    doc.text(`${settings.firmenname || 'Lassel GmbH'} | ${settings.strasse || ''} | ${settings.plz || ''} ${settings.ort || ''}`, 105, y, { align: 'center' });
    
    return doc;
}