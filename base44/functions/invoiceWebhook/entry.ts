import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const payload = await req.json();
        console.log('📥 Incoming invoice webhook:', JSON.stringify(payload, null, 2));
        
        const {
            source,
            entityType,
            ticketId,
            ticketNumber,
            rechnungstyp,
            referenzAngebotNummer,
            kunde,
            rechnung,
            positionen,
            meta
        } = payload;
        
        if (!ticketId) {
            return Response.json({ error: 'ticketId erforderlich' }, { status: 400 });
        }
        
        if (!kunde || !kunde.name) {
            return Response.json({ error: 'Kundendaten erforderlich' }, { status: 400 });
        }
        
        if (!positionen || positionen.length === 0) {
            return Response.json({ error: 'Mindestens eine Position erforderlich' }, { status: 400 });
        }
        
        const currentDate = new Date().toISOString().split('T')[0];
        const zahlungszielTage = rechnung?.zahlungszielTage || 14;
        const faelligAm = rechnung?.datum ? 
            new Date(new Date(rechnung.datum).getTime() + zahlungszielTage * 24 * 60 * 60 * 1000).toISOString().split('T')[0] :
            new Date(Date.now() + zahlungszielTage * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Positionen berechnen
        const calculatedPositions = positionen.map((pos, index) => {
            const menge = parseFloat(pos.menge) || 0;
            const einzelpreis = parseFloat(pos.einzelpreisNetto) || 0;
            const rabatt = parseFloat(pos.rabattProzent) || 0;
            const ust = parseFloat(pos.ustSatz) || 20;
            const teilfaktura = parseFloat(pos.teilfakturaProzent) || 100;
            
            const nettoVorRabatt = menge * einzelpreis;
            const rabattBetrag = nettoVorRabatt * (rabatt / 100);
            let gesamtNetto = nettoVorRabatt - rabattBetrag;
            
            if (teilfaktura < 100) {
                gesamtNetto = gesamtNetto * (teilfaktura / 100);
            }
            
            const ustBetrag = gesamtNetto * (ust / 100);
            const gesamtBrutto = gesamtNetto + ustBetrag;
            
            return {
                pos: index + 1,
                produktName: pos.produktName,
                beschreibung: pos.beschreibung || '',
                menge,
                einheit: pos.einheit || 'Stk',
                einzelpreisNetto: einzelpreis,
                rabattProzent: rabatt,
                ustSatz: ust,
                gesamtNetto,
                gesamtBrutto,
                teilfakturaProzent: teilfaktura,
                bereitsFakturiert: pos.bereitsFakturiert || 0
            };
        });
        
        const summeNetto = calculatedPositions.reduce((s, p) => s + p.gesamtNetto, 0);
        const summeRabatt = calculatedPositions.reduce((s, p) => {
            const nettoVorRabatt = p.menge * p.einzelpreisNetto;
            return s + (nettoVorRabatt * (p.rabattProzent / 100));
        }, 0);
        const summeUst = calculatedPositions.reduce((s, p) => {
            return s + (p.gesamtNetto * (p.ustSatz / 100));
        }, 0);
        const summeBrutto = summeNetto + summeUst;
        
        // "Automatisierung" zu "Reinhard Lassl" umwandeln
        const erstelltDurch = (rechnung?.erstelltDurch === 'Automatisierung' || rechnung?.erstelltDurch === 'automatisierung') 
            ? 'Reinhard Lassl' 
            : (rechnung?.erstelltDurch || '');
        
        // Prüfen ob bereits eine Rechnung für dieses Ticket existiert (ticketNumber hat Priorität)
        let existingInvoices = [];
        if (ticketNumber) {
            existingInvoices = await base44.asServiceRole.entities.Invoice.filter({ ticketNumber });
        } else if (ticketId) {
            existingInvoices = await base44.asServiceRole.entities.Invoice.filter({ ticketId });
        }
        
        let invoice;
        let rechnungsNummer;
        let isUpdate = false;
        
        if (existingInvoices.length > 0) {
            // Bestehende Rechnung aktualisieren
            const existingInvoice = existingInvoices[0];
            rechnungsNummer = existingInvoice.rechnungsNummer;
            isUpdate = true;
            
            // Behalte bestehende Arbeitstage wenn nicht im Payload angegeben
            const arbeitstageUpdate = rechnung?.arbeitstage || existingInvoice.arbeitstage || [];
            const leistungszeitraumVonUpdate = rechnung?.leistungszeitraumVon || existingInvoice.leistungszeitraumVon || null;
            const leistungszeitraumBisUpdate = rechnung?.leistungszeitraumBis || existingInvoice.leistungszeitraumBis || null;
            
            await base44.asServiceRole.entities.Invoice.update(existingInvoice.id, {
                ticketIdentifikation: ticketId || null,
                ticketNumber: ticketNumber || null,
                objektBezeichnung: rechnung?.objektBeschreibung || null,
                rechnungstyp: rechnungstyp || 'normal',
                source: source || 'webhook',
                entityType: entityType || 'ticket',
                ticketId,
                referenzAngebotNummer: referenzAngebotNummer || null,
                kundeName: kunde.name,
                kundeStrasse: kunde.strasse,
                kundePlz: kunde.plz,
                kundeOrt: kunde.ort,
                kundeAnsprechpartner: kunde.ansprechpartner,
                uidnummer: kunde.uidnummer || null,
                uidVonHI: kunde.uidVonHI || null,
                rechnungAnHI: kunde.rechnungAnHI === true,
                emailRechnung: kunde.emailRechnung || kunde.email || null,
                hausinhabung: (meta?.zoho?.hausinhabung && 
                              meta.zoho.hausinhabung.toLowerCase() !== 'nicht vorhanden') 
                              ? meta.zoho.hausinhabung 
                              : null,
                hausverwaltungName: meta?.zoho?.hausverwaltungName || null,
                hausverwaltungStrasse: meta?.zoho?.hausverwaltungStrasse || null,
                hausverwaltungPlz: meta?.zoho?.hausverwaltungPlz || null,
                hausverwaltungOrt: meta?.zoho?.hausverwaltungOrt || null,
                objektStrasse: kunde.objektAdresse?.strasse || null,
                objektPlz: kunde.objektAdresse?.plz || null,
                objektOrt: kunde.objektAdresse?.ort || null,
                datum: rechnung?.datum || currentDate,
                leistungszeitraumVon: leistungszeitraumVonUpdate,
                leistungszeitraumBis: leistungszeitraumBisUpdate,
                arbeitstage: arbeitstageUpdate,
                zahlungskondition: rechnung?.zahlungskondition || '30 Tage netto',
                zahlungszielTage,
                faelligAm,
                erstelltDurch,
                bemerkung: rechnung?.bemerkung || '',
                fotosLink: rechnung?.fotosLink || null,
                fotodokuOrdnerlink: rechnung?.fotodokuOrdnerlink || null,
                status: 'offen',
                summeNetto,
                summeRabatt,
                summeUst,
                summeBrutto,
                bezahltBetrag: 0,
                workdriveFolderId: meta?.workdriveFolderId || null,
                callbackUrl: meta?.callbackUrl || null,
                originalPayload: payload
            });
            
            invoice = await base44.asServiceRole.entities.Invoice.get(existingInvoice.id);
            
            // Alte Positionen löschen
            const oldPositions = await base44.asServiceRole.entities.InvoicePosition.filter({ invoiceId: existingInvoice.id });
            for (const oldPos of oldPositions) {
                await base44.asServiceRole.entities.InvoicePosition.delete(oldPos.id);
            }
            
            console.log('🔄 Rechnung aktualisiert:', rechnungsNummer);
        } else {
            // Neue Rechnung erstellen
            const year = new Date().getFullYear();
            const allInvoices = await base44.asServiceRole.entities.Invoice.list();
            const thisYearInvoices = allInvoices.filter(i => 
                i.rechnungsNummer && i.rechnungsNummer.includes(`RE-${year}`)
            );
            const nextNumber = thisYearInvoices.length + 1;
            rechnungsNummer = `RE-${year}-${String(nextNumber).padStart(5, '0')}`;
            
            invoice = await base44.asServiceRole.entities.Invoice.create({
                rechnungsNummer,
                ticketIdentifikation: ticketId || null,
                ticketNumber: ticketNumber || null,
                objektBezeichnung: rechnung?.objektBeschreibung || null,
                rechnungstyp: rechnungstyp || 'normal',
                source: source || 'webhook',
                entityType: entityType || 'ticket',
                ticketId,
                referenzAngebotNummer: referenzAngebotNummer || null,
                kundeName: kunde.name,
                kundeStrasse: kunde.strasse,
                kundePlz: kunde.plz,
                kundeOrt: kunde.ort,
                kundeAnsprechpartner: kunde.ansprechpartner,
                uidnummer: kunde.uidnummer || null,
                uidVonHI: kunde.uidVonHI || null,
                rechnungAnHI: kunde.rechnungAnHI === true,
                emailRechnung: kunde.emailRechnung || kunde.email || null,
                hausinhabung: (meta?.zoho?.hausinhabung && 
                              meta.zoho.hausinhabung.toLowerCase() !== 'nicht vorhanden') 
                              ? meta.zoho.hausinhabung 
                              : null,
                hausverwaltungName: meta?.zoho?.hausverwaltungName || null,
                hausverwaltungStrasse: meta?.zoho?.hausverwaltungStrasse || null,
                hausverwaltungPlz: meta?.zoho?.hausverwaltungPlz || null,
                hausverwaltungOrt: meta?.zoho?.hausverwaltungOrt || null,
                objektStrasse: kunde.objektAdresse?.strasse || null,
                objektPlz: kunde.objektAdresse?.plz || null,
                objektOrt: kunde.objektAdresse?.ort || null,
                datum: rechnung?.datum || currentDate,
                leistungszeitraumVon: rechnung?.leistungszeitraumVon || null,
                leistungszeitraumBis: rechnung?.leistungszeitraumBis || null,
                arbeitstage: rechnung?.arbeitstage || [],
                zahlungskondition: rechnung?.zahlungskondition || '30 Tage netto',
                zahlungszielTage,
                faelligAm,
                erstelltDurch,
                bemerkung: rechnung?.bemerkung || '',
                fotosLink: rechnung?.fotosLink || null,
                fotodokuOrdnerlink: rechnung?.fotodokuOrdnerlink || null,
                status: 'offen',
                summeNetto,
                summeRabatt,
                summeUst,
                summeBrutto,
                bezahltBetrag: 0,
                workdriveFolderId: meta?.workdriveFolderId || null,
                callbackUrl: meta?.callbackUrl || null,
                callbackSent: false,
                originalPayload: payload
            });
            
            console.log('✨ Neue Rechnung erstellt:', rechnungsNummer);
        }
        
        for (const pos of calculatedPositions) {
            await base44.asServiceRole.entities.InvoicePosition.create({
                invoiceId: invoice.id,
                ...pos
            });
        }
        
        const settingsList = await base44.asServiceRole.entities.CompanySettings.list();
        const companySettings = settingsList[0] || {};
        
        console.log('📄 Generiere PDF...');
        const pdfDoc = generateInvoicePdf(invoice, calculatedPositions, companySettings);
        const pdfBytes = pdfDoc.output('arraybuffer');
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const pdfFile = new File([pdfBlob], `${rechnungsNummer}.pdf`, { type: 'application/pdf' });
        
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfFile });
        
        await base44.asServiceRole.entities.Invoice.update(invoice.id, { pdfUrl: file_url });
        
        console.log('✅ PDF erstellt:', file_url);
        
        // API Log erstellen
        try {
            await base44.asServiceRole.entities.ApiLog.create({
                typ: 'incoming_invoice',
                method: 'POST',
                endpoint: '/invoiceWebhook',
                payload: payload,
                response: {
                    rechnungId: invoice.id,
                    rechnungsNummer,
                    pdfUrl: file_url
                },
                status: 'success',
                timestamp: new Date().toISOString()
            });
        } catch (logError) {
            console.error('Log-Fehler:', logError);
        }
        
        // Success Response - direkt zurückgeben
        return Response.json({
            success: true,
            message: isUpdate ? 'Rechnung erfolgreich aktualisiert' : 'Rechnung erfolgreich erstellt',
            data: {
                rechnungId: invoice.id,
                rechnungsNummer,
                pdfUrl: file_url,
                summeNetto,
                summeUst,
                summeBrutto,
                status: 'offen',
                isUpdate
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

function generateInvoicePdf(invoice, positions, settings) {
    const doc = new jsPDF();
    
    const formatCurrency = (val) => new Intl.NumberFormat('de-DE', { 
        style: 'currency', 
        currency: 'EUR' 
    }).format(val || 0);
    
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('de-DE');
    };
    
    const typLabel = {
        normal: 'Rechnung',
        teilrechnung: 'Teilrechnung',
        schlussrechnung: 'Schlussrechnung',
        storno: 'Stornorechnung'
    }[invoice.rechnungstyp] || 'Rechnung';
    
    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(typLabel, 20, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(settings.firmenname || 'Lassel GmbH', 150, 20);
    doc.text(`${settings.strasse || 'Hetzmannsdorf 25'}`, 150, 25);
    doc.text(`${settings.plz || '2041'} ${settings.ort || 'Hetzmannsdorf'}`, 150, 30);
    
    // Kunde
    let y = 50;
    doc.setFontSize(9);
    doc.setTextColor(128);
    doc.text('Rechnung an:', 20, y);
    y += 5;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(invoice.kundeName || '', 20, y);
    y += 5;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.kundeStrasse || '', 20, y);
    y += 5;
    doc.text(`${invoice.kundePlz || ''} ${invoice.kundeOrt || ''}`, 20, y);
    y += 5;
    if (invoice.kundeAnsprechpartner) {
        doc.text(`z.Hd. ${invoice.kundeAnsprechpartner}`, 20, y);
        y += 5;
    }
    
    // Rechnungsdaten
    y += 10;
    doc.setFontSize(10);
    doc.text(`Rechnungs-Nr.: ${invoice.rechnungsNummer}`, 20, y);
    doc.text(`Datum: ${formatDate(invoice.datum)}`, 100, y);
    y += 5;
    doc.text(`Fällig am: ${formatDate(invoice.faelligAm)}`, 100, y);
    
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
    doc.text('Menge', 120, y + 5);
    doc.text('Preis', 145, y + 5);
    doc.text('Gesamt', 170, y + 5);
    
    y += 8;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    
    positions.forEach(pos => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        
        doc.text(String(pos.pos), 22, y + 5);
        doc.text(pos.produktName || '', 35, y + 5);
        doc.text(`${pos.menge} ${pos.einheit}`, 120, y + 5);
        doc.text(formatCurrency(pos.einzelpreisNetto), 145, y + 5);
        doc.text(formatCurrency(pos.gesamtNetto), 170, y + 5);
        
        y += 6;
        
        if (pos.beschreibung) {
            doc.setFontSize(8);
            doc.setTextColor(128);
            const lines = doc.splitTextToSize(pos.beschreibung, 80);
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
    
    // Summen
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamtbetrag netto:', 130, y);
    doc.text(formatCurrency(invoice.summeNetto), 170, y);
    
    y += 6;
    doc.setFont('helvetica', 'normal');
    
    // USt berechnen
    const ustGruppen = {};
    positions.forEach(p => {
        const ustSatz = p.ustSatz || 20;
        if (!ustGruppen[ustSatz]) ustGruppen[ustSatz] = 0;
        ustGruppen[ustSatz] += p.gesamtNetto * (ustSatz / 100);
    });
    
    Object.entries(ustGruppen).forEach(([satz, betrag]) => {
        doc.text(`zzgl. Umsatzsteuer ${satz}%:`, 130, y);
        doc.text(formatCurrency(betrag), 170, y);
        y += 6;
    });
    
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Gesamtsumme:', 130, y);
    doc.text(formatCurrency(invoice.summeBrutto), 170, y);
    
    // Zahlungsinfo
    y += 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Zahlungsinformationen:', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Bitte überweisen Sie bis zum ${formatDate(invoice.faelligAm)} auf folgendes Konto:`, 20, y);
    y += 6;
    doc.text(`${settings.bankName || ''}`, 20, y);
    y += 5;
    doc.text(`IBAN: ${settings.iban || ''}`, 20, y);
    y += 5;
    doc.text(`BIC: ${settings.bic || ''}`, 20, y);
    y += 5;
    doc.text(`Verwendungszweck: ${invoice.rechnungsNummer}`, 20, y);
    
    // Footer
    y += 20;
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`${settings.firmenname || 'Lassel GmbH'} | ${settings.strasse || ''} | ${settings.plz || ''} ${settings.ort || ''}`, 105, y, { align: 'center' });
    
    return doc;
}