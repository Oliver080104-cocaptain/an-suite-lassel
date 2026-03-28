import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return Response.json({ 
      error: 'Method not allowed. Use POST.' 
    }, { status: 405, headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);

    // Lese JSON-Body mit Google Drive Metadaten
    const data = await req.json();
    const { offerId, document_id, document_type, fileName, pdf_url } = data;
    
    // Unterstütze beide Feldnamen: offerId oder document_id
    const entityId = offerId || document_id;

    console.log('PDF-Metadaten von Google Drive empfangen:', { 
      entityId,
      offerId, 
      document_id,
      document_type, 
      fileName, 
      pdf_url 
    });

    // Validierung
    if (!entityId || !document_type || !pdf_url) {
      return Response.json({ 
        error: 'Fehlende erforderliche Felder (offerId/document_id, document_type, pdf_url)',
        received: data
      }, { status: 400, headers: corsHeaders });
    }

    // Bestimme Entity basierend auf document_type
    let entityName;
    const updateData = { pdfUrl: pdf_url };

    switch (document_type.toLowerCase()) {
      case 'offer':
      case 'angebot':
        entityName = 'Offer';
        updateData.status = 'final';
        break;
      case 'invoice':
      case 'rechnung':
        entityName = 'Invoice';
        break;
      case 'delivery_note':
      case 'lieferschein':
        entityName = 'DeliveryNote';
        updateData.status = 'erstellt';
        break;
      case 'partial_payment':
      case 'teilzahlung':
        entityName = 'PartialPayment';
        break;
      default:
        return Response.json({ 
          error: `Unbekannter document_type: ${document_type}`,
          allowedTypes: ['offer', 'invoice', 'delivery_note', 'partial_payment']
        }, { status: 400, headers: corsHeaders });
    }

    // Upsert: Update Entity mit Google Drive Link
    await base44.asServiceRole.entities[entityName].update(entityId, updateData);

    console.log(`✓ ${entityName} ${entityId} erfolgreich mit Google Drive Link aktualisiert`);

    return Response.json({ 
      success: true,
      message: `${entityName} erfolgreich aktualisiert`,
      entityId: entityId,
      pdfUrl: pdf_url,
      fileName
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Fehler beim Verarbeiten der PDF-Metadaten:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500, headers: corsHeaders });
  }
});