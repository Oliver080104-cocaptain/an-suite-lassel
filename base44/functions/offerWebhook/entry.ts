import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Request Body lesen
        const payload = await req.json();
        console.log('📥 Incoming offer webhook:', JSON.stringify(payload, null, 2));
        
        const {
            source,
            entityType,
            ticketId,
            ticketNumber,
            dealId,
            dealName,
            kunde,
            angebot,
            positionen,
            meta
        } = payload;
        
        // Geschäftsfallnummer aus angebot extrahieren
        const geschaeftsfallNummer = angebot?.geschaeftsfallnummer || null;
        
        // Validierung
        if (entityType === 'invoice' || payload.rechnungstyp) {
            return Response.json({ 
                error: 'Falsche URL - für Rechnungen bitte /invoiceWebhook verwenden' 
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
        
        // Positionen sind optional - Angebot kann als Draft angelegt werden
        const hasPositions = Array.isArray(positionen) && positionen.length > 0;
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        // "Automatisierung" zu "Reinhard Lassl" umwandeln
        const erstelltDurch = (angebot?.erstelltDurch === 'Automatisierung' || angebot?.erstelltDurch === 'automatisierung') 
            ? 'Reinhard Lassl' 
            : (angebot?.erstelltDurch || '');
        
        // Positionen nur berechnen wenn vorhanden
        const calculatedPositions = hasPositions ? positionen.map((pos, index) => {
            const menge = parseFloat(pos.menge) || 0;
            const einzelpreis = parseFloat(pos.einzelpreisNetto) || 0;
            const rabatt = parseFloat(pos.rabattProzent) || 0;
            const ust = parseFloat(pos.ustSatz) || 20;
            
            const nettoVorRabatt = menge * einzelpreis;
            const rabattBetrag = nettoVorRabatt * (rabatt / 100);
            const gesamtNetto = nettoVorRabatt - rabattBetrag;
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
                gesamtBrutto
            };
        }) : [];
        
        const summeNetto = hasPositions ? calculatedPositions.reduce((s, p) => s + p.gesamtNetto, 0) : 0;
        const summeRabatt = hasPositions ? calculatedPositions.reduce((s, p) => {
            const nettoVorRabatt = p.menge * p.einzelpreisNetto;
            return s + (nettoVorRabatt * (p.rabattProzent / 100));
        }, 0) : 0;
        const summeUst = hasPositions ? calculatedPositions.reduce((s, p) => {
            return s + (p.gesamtNetto * (p.ustSatz / 100));
        }, 0) : 0;
        const summeBrutto = summeNetto + summeUst;
        
        // Prüfen ob bereits ein Angebot für dieses Ticket/Deal existiert (ticketNumber hat Priorität)
        let existingOffers = [];
        try {
            if (ticketNumber) {
                existingOffers = await base44.asServiceRole.entities.Offer.filter({ ticketNumber }, '-created_date', 1);
            } else if (ticketId) {
                existingOffers = await base44.asServiceRole.entities.Offer.filter({ ticketId }, '-created_date', 1);
            }
        } catch (e) {
            console.log('Filter-Fehler (nicht kritisch):', e.message);
        }
        
        let offer;
        let angebotNummer;
        let isUpdate = false;
        
        if (existingOffers.length > 0) {
            // Bestehendes Angebot aktualisieren
            const existingOffer = existingOffers[0];
            angebotNummer = existingOffer.angebotNummer;
            isUpdate = true;
            
            await base44.asServiceRole.entities.Offer.update(existingOffer.id, {
                ticketIdentifikation: ticketId || dealId || null,
                source: source || 'webhook',
                entityType: entityType || 'ticket',
                ticketId: ticketId || null,
                ticketNumber: ticketNumber || null,
                dealId: dealId || null,
                dealName: dealName || null,
                rechnungsempfaengerName: kunde.name,
                rechnungsempfaengerStrasse: kunde.strasse,
                rechnungsempfaengerPlz: kunde.plz,
                rechnungsempfaengerOrt: kunde.ort,
                uidnummer: kunde.uidnummer || null,
                uidVonHI: kunde.uidVonHI || null,
                rechnungAnHI: kunde.rechnungAnHI === true,
                emailAngebot: kunde.emailAngebot || kunde.email || null,
                emailRechnung: kunde.emailRechnung || kunde.email || null,
                objektBezeichnung: angebot?.objektBeschreibung || kunde.objektAdresse?.gasse || kunde.name,
                objektStrasse: kunde.objektAdresse?.strasse || kunde.strasse,
                objektPlz: kunde.objektAdresse?.plz || kunde.plz,
                objektOrt: kunde.objektAdresse?.ort || kunde.ort,
                hausinhabung: (meta?.zoho?.hausinhabung && 
                              meta.zoho.hausinhabung.toLowerCase() !== 'nicht vorhanden') 
                              ? meta.zoho.hausinhabung 
                              : null,
                ansprechpartner: kunde.ansprechpartner,
                geschaeftsfallNummer: geschaeftsfallNummer,
                datum: angebot?.datum || currentDate,
                gueltigBis: angebot?.gueltigBis || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
                erstelltDurch: erstelltDurch,
                bemerkung: angebot?.bemerkung || '',
                Skizzen_Link: angebot?.skizzenLink || null,
                status: hasPositions ? 'in_bearbeitung' : 'draft',
                summeNetto,
                summeRabatt,
                summeUst,
                summeBrutto,
                workdriveFolderId: meta?.workdriveFolderId || null,
                callbackUrl: meta?.callbackUrl || null
            });
            
            offer = await base44.asServiceRole.entities.Offer.get(existingOffer.id);
            
            // Alte Positionen löschen (async im Hintergrund)
            base44.asServiceRole.entities.OfferPosition.filter({ offerId: existingOffer.id })
                .then(oldPositions => {
                    oldPositions.forEach(pos => {
                        base44.asServiceRole.entities.OfferPosition.delete(pos.id).catch(e => console.error('Position delete error:', e));
                    });
                })
                .catch(e => console.error('Position fetch error:', e));
            
            console.log('🔄 Angebot aktualisiert:', angebotNummer);
        } else {
            // Neues Angebot erstellen
            const year = new Date().getFullYear();
            // Nur letzten Angebote aus diesem Jahr abrufen - begrenzt
            const thisYearOffers = await base44.asServiceRole.entities.Offer.filter({}, '-created_date', 1000);
            const currentYearOffers = thisYearOffers.filter(o => 
                o.angebotNummer && o.angebotNummer.includes(`AN-${year}`)
            );
            const nextNumber = currentYearOffers.length + 1;
            angebotNummer = `AN-${year}-${String(nextNumber).padStart(5, '0')}`;
            
            offer = await base44.asServiceRole.entities.Offer.create({
                angebotNummer,
                ticketIdentifikation: ticketId || dealId || null,
                source: source || 'webhook',
                entityType: entityType || 'ticket',
                ticketId: ticketId || null,
                ticketNumber: ticketNumber || null,
                dealId: dealId || null,
                dealName: dealName || null,
                rechnungsempfaengerName: kunde.name,
                rechnungsempfaengerStrasse: kunde.strasse,
                rechnungsempfaengerPlz: kunde.plz,
                rechnungsempfaengerOrt: kunde.ort,
                uidnummer: kunde.uidnummer || null,
                uidVonHI: kunde.uidVonHI || null,
                rechnungAnHI: kunde.rechnungAnHI === true,
                emailAngebot: kunde.emailAngebot || kunde.email || null,
                emailRechnung: kunde.emailRechnung || kunde.email || null,
                objektBezeichnung: angebot?.objektBeschreibung || kunde.objektAdresse?.gasse || kunde.name,
                objektStrasse: kunde.objektAdresse?.strasse || kunde.strasse,
                objektPlz: kunde.objektAdresse?.plz || kunde.plz,
                objektOrt: kunde.objektAdresse?.ort || kunde.ort,
                hausinhabung: (meta?.zoho?.hausinhabung && 
                              meta.zoho.hausinhabung.toLowerCase() !== 'nicht vorhanden') 
                              ? meta.zoho.hausinhabung 
                              : null,
                ansprechpartner: kunde.ansprechpartner,
                geschaeftsfallNummer: geschaeftsfallNummer,
                datum: angebot?.datum || currentDate,
                gueltigBis: angebot?.gueltigBis || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
                erstelltDurch: erstelltDurch,
                bemerkung: angebot?.bemerkung || '',
                Skizzen_Link: angebot?.skizzenLink || null,
                status: hasPositions ? 'in_bearbeitung' : 'draft',
                summeNetto,
                summeRabatt,
                summeUst,
                summeBrutto,
                workdriveFolderId: meta?.workdriveFolderId || null,
                callbackUrl: meta?.callbackUrl || null,
                callbackSent: false
            });
            
            console.log('✨ Neues Angebot erstellt:', angebotNummer);
        }
        // Positionen async im Hintergrund erstellen (nicht im kritischen Pfad)
        if (hasPositions && calculatedPositions.length > 0) {
            Promise.all(
                calculatedPositions.map(pos =>
                    base44.asServiceRole.entities.OfferPosition.create({
                        offerId: offer.id,
                        ...pos
                    }).catch(e => console.error(`Fehler bei Position ${pos.pos}:`, e))
                )
            ).catch(e => console.error('Position creation error:', e));
        }
        
        // PDF wird nicht in offerWebhook generiert - zu rechenintensiv
        // PDF wird later on demand in der UI generiert
        let file_url = null;
        console.log('ℹ️ PDF wird später in der UI generiert');
        
        // API Log async im Hintergrund erstellen (nicht im kritischen Pfad)
        base44.asServiceRole.entities.ApiLog.create({
            typ: 'incoming_offer',
            method: 'POST',
            endpoint: '/offerWebhook',
            payload: { ticketId, ticketNumber, kundenName: kunde.name },
            response: {
                angebotId: offer.id,
                angebotNummer,
                posCount: calculatedPositions.length
            },
            status: 'success',
            timestamp: new Date().toISOString()
        }).catch(logError => console.error('Log-Fehler:', logError));
        
        // Success Response - direkt zurückgeben
        return Response.json({
            success: true,
            message: isUpdate ? 'Angebot erfolgreich aktualisiert' : 'Angebot erfolgreich erstellt',
            data: {
                angebotId: offer.id,
                angebotNummer,
                pdfUrl: file_url,
                summeNetto,
                summeUst,
                summeBrutto,
                status: hasPositions ? 'in_bearbeitung' : 'draft',
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