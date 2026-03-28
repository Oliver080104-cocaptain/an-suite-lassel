import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const payload = await req.json();

    // Validierung
    if (!payload.produktname && !payload.name) {
      return Response.json({ 
        success: false, 
        error: 'Produktname ist erforderlich' 
      }, { status: 400 });
    }

    // API Log erstellen
    await base44.asServiceRole.entities.ApiLog.create({
      typ: 'incoming_product',
      method: 'POST',
      endpoint: '/functions/productWebhook',
      payload: payload,
      status: 'pending',
      timestamp: new Date().toISOString()
    });

    // Produktdaten normalisieren
    const productData = {
      produktName: payload.produktname || payload.name,
      artikelnummer: payload.artikelnummer || payload.eintrag_id || payload.id,
      produktKategorie: payload.produktKategorie || payload.kategorie,
      produkttyp: payload.produkttyp || 'dienstleistung',
      einheit: payload.einheit || 'Stk',
      standardpreisNetto: parseFloat(payload.standardpreisNetto || payload.preis || payload.price) || 0,
      steuersatz: parseFloat(payload.steuersatz || payload.mwst || payload.vat) || 20,
      steuerpflichtig: payload.steuerpflichtig !== false,
      aktiv: payload.aktiv !== false,
      standarddauer: payload.standarddauer ? parseFloat(payload.standarddauer) : null,
      materialbedarf: payload.materialbedarf || null,
      einkaufspreis: payload.einkaufspreis ? parseFloat(payload.einkaufspreis) : null,
      beschreibung: payload.beschreibung || payload.description || ''
    };

    // Prüfen ob Produkt bereits existiert
    const allProducts = await base44.asServiceRole.entities.Product.list();
    const existingProduct = allProducts.find(p => 
      (productData.artikelnummer && p.artikelnummer === productData.artikelnummer) ||
      p.produktName === productData.produktName
    );

    let savedProduct;
    let action;

    if (existingProduct) {
      // Update
      await base44.asServiceRole.entities.Product.update(existingProduct.id, productData);
      savedProduct = { ...productData, id: existingProduct.id };
      action = 'updated';
    } else {
      // Create
      savedProduct = await base44.asServiceRole.entities.Product.create(productData);
      action = 'created';
    }

    // API Log aktualisieren
    await base44.asServiceRole.entities.ApiLog.create({
      typ: 'incoming_product',
      method: 'POST',
      endpoint: '/functions/productWebhook',
      payload: payload,
      response: { product: savedProduct, action },
      status: 'success',
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      action: action,
      product: savedProduct
    });

  } catch (error) {
    console.error('Product webhook error:', error);
    
    // API Log für Fehler
    try {
      await base44.asServiceRole.entities.ApiLog.create({
        typ: 'incoming_product',
        method: 'POST',
        endpoint: '/functions/productWebhook',
        payload: await req.json().catch(() => ({})),
        response: { error: error.message },
        status: 'error',
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});