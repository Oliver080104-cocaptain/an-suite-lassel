import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Request Body lesen
        const payload = await req.json();
        console.log('📥 Incoming vermittler webhook:', JSON.stringify(payload, null, 2));
        
        const {
            vermittlerId,
            name,
            email,
            telefon,
            provisionssatz,
            status,
            notizen
        } = payload;
        
        // Validierung
        if (!name) {
            return Response.json({ 
                error: 'Name erforderlich' 
            }, { status: 400 });
        }
        
        let vermittler;
        
        // Prüfen ob Vermittler existiert (nach vermittlerId oder E-Mail)
        if (vermittlerId) {
            const existing = await base44.asServiceRole.entities.Vermittler.filter({ 
                id: vermittlerId 
            });
            
            if (existing.length > 0) {
                // Update bestehender Vermittler
                vermittler = await base44.asServiceRole.entities.Vermittler.update(existing[0].id, {
                    name,
                    email: email || existing[0].email,
                    telefon: telefon || existing[0].telefon,
                    provisionssatz: provisionssatz !== undefined ? parseFloat(provisionssatz) : existing[0].provisionssatz,
                    status: status || existing[0].status,
                    notizen: notizen || existing[0].notizen
                });
                
                console.log('✅ Vermittler aktualisiert:', name);
                
                // API Log erstellen
                await base44.asServiceRole.entities.ApiLog.create({
                    typ: 'incoming_vermittler',
                    method: 'POST',
                    endpoint: '/vermittlerWebhook',
                    payload: payload,
                    response: {
                        vermittlerId: vermittler.id,
                        action: 'updated'
                    },
                    status: 'success',
                    timestamp: new Date().toISOString()
                });
                
                return Response.json({
                    success: true,
                    message: 'Vermittler erfolgreich aktualisiert',
                    data: {
                        vermittlerId: vermittler.id,
                        name: vermittler.name,
                        action: 'updated'
                    }
                }, { status: 200 });
            }
        }
        
        // Falls E-Mail vorhanden, nach E-Mail suchen
        if (email) {
            const existingByEmail = await base44.asServiceRole.entities.Vermittler.filter({ 
                email: email 
            });
            
            if (existingByEmail.length > 0) {
                // Update bestehender Vermittler
                vermittler = await base44.asServiceRole.entities.Vermittler.update(existingByEmail[0].id, {
                    name,
                    telefon: telefon || existingByEmail[0].telefon,
                    provisionssatz: provisionssatz !== undefined ? parseFloat(provisionssatz) : existingByEmail[0].provisionssatz,
                    status: status || existingByEmail[0].status,
                    notizen: notizen || existingByEmail[0].notizen
                });
                
                console.log('✅ Vermittler aktualisiert (via E-Mail):', name);
                
                // API Log erstellen
                await base44.asServiceRole.entities.ApiLog.create({
                    typ: 'incoming_vermittler',
                    method: 'POST',
                    endpoint: '/vermittlerWebhook',
                    payload: payload,
                    response: {
                        vermittlerId: vermittler.id,
                        action: 'updated'
                    },
                    status: 'success',
                    timestamp: new Date().toISOString()
                });
                
                return Response.json({
                    success: true,
                    message: 'Vermittler erfolgreich aktualisiert',
                    data: {
                        vermittlerId: vermittler.id,
                        name: vermittler.name,
                        action: 'updated'
                    }
                }, { status: 200 });
            }
        }
        
        // Neuen Vermittler erstellen
        vermittler = await base44.asServiceRole.entities.Vermittler.create({
            name,
            email: email || null,
            telefon: telefon || null,
            provisionssatz: provisionssatz !== undefined ? parseFloat(provisionssatz) : 10,
            status: status || 'aktiv',
            notizen: notizen || null
        });
        
        console.log('✨ Neuer Vermittler erstellt:', name);
        
        // API Log erstellen
        await base44.asServiceRole.entities.ApiLog.create({
            typ: 'incoming_vermittler',
            method: 'POST',
            endpoint: '/vermittlerWebhook',
            payload: payload,
            response: {
                vermittlerId: vermittler.id,
                action: 'created'
            },
            status: 'success',
            timestamp: new Date().toISOString()
        });
        
        // Success Response
        return Response.json({
            success: true,
            message: 'Vermittler erfolgreich erstellt',
            data: {
                vermittlerId: vermittler.id,
                name: vermittler.name,
                provisionssatz: vermittler.provisionssatz,
                action: 'created'
            }
        }, { status: 200 });
        
    } catch (error) {
        console.error('❌ Fehler:', error);
        
        // Error Log erstellen
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.entities.ApiLog.create({
                typ: 'incoming_vermittler',
                method: 'POST',
                endpoint: '/vermittlerWebhook',
                payload: await req.json().catch(() => ({})),
                response: { error: error.message },
                status: 'error',
                timestamp: new Date().toISOString()
            });
        } catch (logError) {
            console.error('Log-Fehler:', logError);
        }
        
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});