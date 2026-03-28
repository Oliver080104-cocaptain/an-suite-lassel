import React from 'react';
import moment from 'moment';

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6937375d862a164b90207fd3/9f59feb3a_lassel_logo-removebg-preview.png';

export function generateDeliveryNotePdfHtml(deliveryNote, positions, companySettings) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return moment(dateStr).format('DD.MM.YYYY');
  };

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { margin: 12mm 15mm 15mm 15mm; size: A4 portrait; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 10.5pt; 
      color: #333; 
      line-height: 1.5;
      padding: 0;
      overflow: visible !important;
      height: auto !important;
    }
    .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0 5mm; padding-bottom: 20mm; overflow: visible !important; height: auto !important; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30mm; margin-bottom: 10mm; }
    .header-left { flex: 1; }
    .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; width: 40%; }
    .logo { max-height: 65px; max-width: 150px; object-fit: contain; }
    .meta-block { text-align: right; font-size: 9pt; line-height: 1.8; }
    
    /* Kundenadresse */
    .sender-line { font-size: 7pt; color: #666; margin-bottom: 15px; }
    .customer-address { margin-bottom: 25px; font-size: 10.5pt; line-height: 1.8; }
    .customer-name { font-weight: bold; font-size: 10.5pt; margin-bottom: 1px; }
    
    /* Metadaten */
    .meta-row { margin-bottom: 3px; display: flex; justify-content: flex-end; align-items: baseline; gap: 8px; }
    .meta-label { color: #888; white-space: nowrap; }
    .meta-value { font-weight: normal; color: #2d3748; }

    /* Dokument Title */
    .doc-title-section { margin-bottom: 20px; }
    .doc-title { font-size: 18pt; font-weight: bold; color: #2d3748; }
    .doc-subtitle { font-size: 8.5pt; color: #666; margin-top: 2px; }
    
    /* Objekt */
    .object-line { font-size: 9pt; margin-bottom: 25px; padding: 0px; line-height: 1.2; }
    .object-line div { margin-bottom: 5px; }
    
    /* Positions Header */
    .positions-header {
      display: flex;
      background: #f5f5f5;
      border-top: 1px solid #ccc;
      border-bottom: 1px solid #ccc;
      padding: 5px 3px;
      font-size: 7.5pt;
      font-weight: 600;
      color: #2d3748;
      margin: 6px 0 0 0;
    }
    .positions-header .col-desc { width: 75%; padding-right: 10px; }
    .positions-header .col-menge { width: 25%; text-align: left; }

    /* Position Item Container */
    .position-item {
      display: flex !important;
      width: 100%;
      height: auto !important;
      overflow: visible !important;
      border-bottom: 1pt solid #e5e5e5;
      padding: 8pt 6pt;
      margin: 0;
      gap: 0;
    }

    /* Positions List Container */
    .positions-list {
      display: block !important;
      width: 100%;
      overflow: visible !important;
      widows: 1 !important;
      orphans: 1 !important;
    }

    /* Position Columns */
    .pos-col-desc {
      flex: 0 0 75%;
      padding-right: 10px;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-menge {
      flex: 0 0 25%;
      font-size: 8.5pt;
      text-align: left;
      vertical-align: top;
      box-sizing: border-box;
    }

    .pos-title { 
      font-weight: 600; 
      color: #2d3748; 
      margin: 0 0 3pt 0;
      font-size: 9pt;
    }
    .pos-desc { 
      font-size: 8.5pt; 
      color: #555; 
      line-height: 1.4; 
      white-space: pre-wrap; 
      margin: 2pt 0 0 0;
    }

    /* Abschlusstext */
    .closing { 
      page-break-inside: avoid !important;
      margin-top: 15pt; 
      margin-bottom: 8mm; 
      font-size: 9.5pt; 
      line-height: 1.5;
    }
    .closing p { margin-bottom: 4pt; }
    .signature { margin-top: 8px; font-weight: 600; font-size: 9.5pt; }

    /* Footer */
    .footer { 
      position: relative;
      margin-top: 10mm;
      padding-top: 8px; 
      border-top: 2px solid #2d3748;
      font-size: 9.5pt; 
      color: #333; 
      line-height: 1.7;
      font-weight: 500;
    }
    .footer strong { font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="sender-line">Lassel GmbH - Hetzmannsdorf 25 - 2041 Wullersdorf</div>
        <div class="customer-address">
          ${deliveryNote.hausinhabung ? `
          <div class="customer-name">${deliveryNote.hausinhabung}</div>
          <div>p.A. ${deliveryNote.hausverwaltungName || ''}</div>
          <div>${deliveryNote.hausverwaltungStrasse || ''}</div>
          <div>${deliveryNote.hausverwaltungPlz || ''} ${deliveryNote.hausverwaltungOrt || ''}</div>
          <div>Österreich</div>
          ` : `
          <div class="customer-name">${deliveryNote.kundeName || ''}</div>
          <div>${deliveryNote.kundeStrasse || ''}</div>
          <div>${deliveryNote.kundePlz || ''} ${deliveryNote.kundeOrt || ''}</div>
          <div>Österreich</div>
          `}
        </div>
      </div>
      <div class="header-right">
        <img src="${LOGO_URL}" alt="Lassel" class="logo" />
        <div class="meta-block">
          <div class="meta-row">
            <span class="meta-label">Lieferschein-Nr.:</span>
            <span class="meta-value">${deliveryNote.lieferscheinNummer || ''}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Datum:</span>
            <span class="meta-value">${formatDate(deliveryNote.datum)}</span>
          </div>
          ${deliveryNote.erstelltDurch ? `
          <div class="meta-row">
            <span class="meta-label">Ihr Ansprechpartner:</span>
            <span class="meta-value">${deliveryNote.erstelltDurch}</span>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
    
    <!-- Document Title -->
    <div class="doc-title-section">
      <div class="doc-title">Lieferschein ${deliveryNote.lieferscheinNummer || ''}</div>
    </div>
    
    <!-- Objekt und Ticketnummer -->
    <div class="object-line" style="font-weight: 600;">
      ${deliveryNote.objektBezeichnung ? `<div>OBJ: ${deliveryNote.objektBezeichnung}</div>` : ''}
      ${deliveryNote.ticketNumber ? `<div style="font-size: 8.5pt; color: #666; font-weight: normal;">Ticketnummer: ${deliveryNote.ticketNumber}</div>` : ''}
      ${deliveryNote.referenzAngebotNummer ? `<div style="font-size: 8.5pt; color: #666; font-weight: normal;">Referenz Angebot: ${deliveryNote.referenzAngebotNummer}</div>` : ''}
    </div>
    
    <!-- Positions List -->
    <div class="positions-header">
      <div class="col-desc">Beschreibung</div>
      <div class="col-menge">Menge</div>
    </div>
    <div class="positions-list">
      ${positions.map((p, idx) => `
      <div class="position-item">
        <div class="pos-col-desc">
          <div class="pos-title">${idx + 1}. ${p.produktName || ''}</div>
          ${p.beschreibung ? `<div class="pos-desc">${p.beschreibung}</div>` : ''}
        </div>
        <div class="pos-col-menge">${p.menge || 0} ${p.einheit || 'Stk'}</div>
      </div>
      `).join('')}
    </div>
    
    <!-- Closing -->
    <div class="closing">
      <div class="signature">
        <p>Mit freundlichen Grüßen</p>
        <p>${deliveryNote.erstelltDurch || 'Lassel GmbH'}</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div><strong>${companySettings?.firmenname || ''}</strong> _ ${companySettings?.strasse || ''} _ ${companySettings?.plz || ''} ${companySettings?.ort || ''} _ ${companySettings?.land || ''}</div>
      <div><strong>TEL.</strong> ${companySettings?.telefon || ''} &nbsp; <strong>E-MAIL</strong> ${companySettings?.email || ''}</div>
      <div><strong>WEB</strong> ${companySettings?.website || ''}${companySettings?.amtsgericht ? ` &nbsp; AMTSGERICHT ${companySettings.amtsgericht}` : ''}${companySettings?.fnNr ? ` &nbsp; <strong>FN-NR.</strong> ${companySettings.fnNr}` : ''}${companySettings?.ustIdNr ? ` &nbsp; <strong>UST.-ID</strong> ${companySettings.ustIdNr}` : ''}${companySettings?.steuernummer ? ` &nbsp; <strong>STEUER-NR.</strong> ${companySettings.steuernummer}` : ''}</div>
      <div>${companySettings?.geschaeftsfuehrung ? `GESCHÄFTSFÜHRUNG ${companySettings.geschaeftsfuehrung}` : ''}${companySettings?.bankName ? ` &nbsp; <strong>BANK</strong> ${companySettings.bankName}` : ''}${companySettings?.blz ? ` &nbsp; BLZ ${companySettings.blz}` : ''}${companySettings?.iban ? ` &nbsp; <strong>IBAN</strong> ${companySettings.iban}` : ''}${companySettings?.bic ? ` &nbsp; <strong>BIC</strong> ${companySettings.bic}` : ''}</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function generateOfferPdfHtml(offer, positions, companySettings) {
   const formatCurrency = (val) => new Intl.NumberFormat('de-DE', { 
     style: 'currency', 
     currency: 'EUR',
     minimumFractionDigits: 2
   }).format(val || 0);

   const formatDate = (dateStr) => {
     if (!dateStr) return '-';
     return moment(dateStr).format('DD.MM.YYYY');
   };

   // VAT gruppieren - bei reverseCharge alle auf 0% setzen
   const ustGruppen = {};
   positions.forEach(p => {
     const ustSatz = offer.reverseCharge ? 0 : (parseFloat(p.ustSatz) || 20);
     const gesamtNetto = parseFloat(p.gesamtNetto) || 0;
     if (!ustGruppen[ustSatz]) ustGruppen[ustSatz] = 0;
     ustGruppen[ustSatz] += gesamtNetto * (ustSatz / 100);
   });

   return `
 <!DOCTYPE html>
 <html lang="de">
 <head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <style>
     @page { margin: 15mm 20mm; size: A4 portrait; }
     * { margin: 0; padding: 0; box-sizing: border-box; }
     body { 
       font-family: Arial, sans-serif; 
       font-size: 10pt; 
       color: #000; 
       line-height: 1.4;
       padding: 0;
       margin: 0;
       overflow: visible !important;
       height: auto !important;
     }
     .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0; overflow: visible !important; height: auto !important; position: relative; }

      /* Header */
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30mm; margin-bottom: 10mm; }
      .header-left { flex: 1; }
      .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; width: 40%; }
      .logo { max-height: 65px; max-width: 150px; object-fit: contain; }
      .meta-block { text-align: right; font-size: 9pt; line-height: 1.8; }

    /* Kundenadresse */
    .sender-line { font-size: 8pt; color: #666; margin-bottom: 5mm; }
    .customer-address { margin-bottom: 25px; font-size: 10pt; line-height: 1.4; }
    .customer-name { font-weight: bold; font-size: 10pt; margin-bottom: 2px; }

    /* Metadaten */
    .meta-row { margin-bottom: 3px; display: flex; justify-content: flex-end; gap: 8px; }
    .meta-label { color: #888; white-space: nowrap; }
    .meta-value { font-weight: normal; color: #000; }

    /* Dokument Title */
    .doc-title-section { margin-bottom: 20px; }
    .doc-title { font-size: 17pt; font-weight: bold; color: #000; }

    /* Objekt */
    .object-line { font-size: 10pt; margin-bottom: 20px; font-weight: bold; page-break-after: avoid; }
    .ticket-line { font-size: 8.5pt; color: #666; font-weight: normal; margin-top: 4px; }

    /* Positions Header */
    .positions-header {
      display: flex;
      background: #f8f8f8;
      border-bottom: 1.5px solid #333;
      padding: 8px 6px;
      font-size: 9pt;
      font-weight: bold;
      color: #000;
      margin: 0 0 0 0;
    }
    .positions-header .col-desc { width: 60%; padding-right: 10px; }
    .positions-header .col-menge { width: 10%; text-align: center; }
    .positions-header .col-preis { width: 15%; text-align: right; }
    .positions-header .col-gesamt { width: 15%; text-align: right; }

    /* Position Item Container */
    .position-item {
      display: flex !important;
      width: 100%;
      height: auto !important;
      overflow: visible !important;
      border-bottom: 0.5pt solid #ddd;
      padding: 10pt 6pt;
      margin: 0;
      gap: 0;
    }

    /* Positions List Container */
    .positions-list {
      display: block !important;
      width: 100%;
      overflow: visible !important;
      widows: 1 !important;
      orphans: 1 !important;
    }

    /* Position Columns */
    .pos-col-desc {
      flex: 0 0 60%;
      padding-right: 10px;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-menge {
      flex: 0 0 10%;
      font-size: 9.5pt;
      text-align: center;
      padding-top: 0;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-preis {
      flex: 0 0 15%;
      font-size: 9.5pt;
      text-align: right;
      padding-top: 0;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-gesamt {
      flex: 0 0 15%;
      font-size: 9.5pt;
      text-align: right;
      padding-top: 0;
      vertical-align: top;
      box-sizing: border-box;
    }

    .pos-title { 
      font-weight: bold; 
      color: #000; 
      margin: 0 0 4pt 0;
      font-size: 9.5pt;
    }
    .pos-desc { 
      font-size: 9pt; 
      color: #333; 
      line-height: 1.4; 
      white-space: pre-wrap; 
      margin: 2pt 0 0 0;
      padding-left: 8pt;
    }

    /* Summen */
    .totals { margin-top: 25pt; margin-left: auto; width: 40%; min-width: 280px; }
    .total-row { display: flex; justify-content: space-between; padding: 5pt 0; font-size: 10pt; }
    .total-row.main { font-weight: normal; padding-bottom: 5pt; }
    .total-row.final { font-weight: bold; font-size: 11pt; border-top: 1.5pt solid #000; margin-top: 10pt; padding-top: 10pt; }

    /* Anmerkungen */
    .remarks {
      margin-top: 15pt;
      padding-top: 10pt;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      line-height: 1.5;
      white-space: pre-wrap;
      color: #333;
    }

    /* Abschlusstext */
    .closing { 
      page-break-inside: avoid !important;
      margin-top: 18mm; 
      margin-bottom: 15mm; 
      font-size: 9.5pt; 
      line-height: 1.5;
    }
    .closing p { margin-bottom: 6pt; }
     .signature { margin-top: 12pt; font-weight: bold; font-size: 10pt; }

    /* Footer */
    .footer { 
      position: relative;
      margin-top: 15mm;
      padding-top: 10px; 
      border-top: 1.5px solid #333;
      font-size: 7.5pt; 
      color: #666; 
      line-height: 1.6;
      font-weight: normal;
    }
    .footer strong { font-weight: 600; }
    .footer div { margin-bottom: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="sender-line">${companySettings?.firmenname || 'Lassel GmbH'} - ${companySettings?.strasse || 'Hetzmannsdorf 25'} - ${companySettings?.plz || '2041'} ${companySettings?.ort || 'Wullersdorf'}</div>
        <div class="customer-address">
          ${offer.hausinhabung ? `
          <div class="customer-name">${offer.hausinhabung}</div>
          <div>p.A. ${offer.rechnungsempfaengerName || ''}</div>
          <div>${offer.rechnungsempfaengerStrasse || ''}</div>
          <div>${offer.rechnungsempfaengerPlz || ''} ${offer.rechnungsempfaengerOrt || ''}</div>
          <div>Österreich</div>
          ${offer.rechnungsempfaengerUstId ? `<div style="margin-top: 4px;">UID: ${offer.rechnungsempfaengerUstId}</div>` : ''}
          ` : `
          <div class="customer-name">${offer.rechnungsempfaengerName || ''}</div>
          <div>${offer.rechnungsempfaengerStrasse || ''}</div>
          <div>${offer.rechnungsempfaengerPlz || ''} ${offer.rechnungsempfaengerOrt || ''}</div>
          <div>Österreich</div>
          ${offer.rechnungsempfaengerUstId ? `<div style="margin-top: 4px;">UID: ${offer.rechnungsempfaengerUstId}</div>` : ''}
          `}
        </div>
      </div>
      <div class="header-right">
        <img src="${LOGO_URL}" alt="Lassel" class="logo" />
        <div class="meta-block">
          <div class="meta-row">
            <span class="meta-label">Angebotsnummer:</span>
            <span class="meta-value">${offer.angebotNummer || ''}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Datum:</span>
            <span class="meta-value">${formatDate(offer.datum)}</span>
          </div>
          ${offer.erstelltDurch ? `
          <div class="meta-row">
            <span class="meta-label">Ihr Ansprechpartner:</span>
            <span class="meta-value">${offer.erstelltDurch}</span>
          </div>
          ` : ''}
          ${offer.geschaeftsfallNummer ? `
          <div class="meta-row">
            <span class="meta-label">Geschäftsfallnummer:</span>
            <span class="meta-value">${offer.geschaeftsfallNummer}</span>
          </div>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- Document Title -->
    <div class="doc-title-section">
      <div class="doc-title">Angebot ${offer.angebotNummer || ''}</div>
    </div>

    <!-- Objekt -->
    <div class="object-line">
      OBJ: ${offer.objektBezeichnung || ''}
      ${offer.ticketNumber ? `<div class="ticket-line">Ticket: ${offer.ticketNumber}</div>` : ''}
    </div>
    
    <!-- Positions List -->
    <div class="positions-header">
      <div class="col-desc">Beschreibung</div>
      <div class="col-menge">Menge</div>
      <div class="col-preis">Einzelpreis</div>
      <div class="col-gesamt">Gesamtpreis</div>
    </div>
    <div class="positions-list">
      ${positions.map((p, idx) => `
      <div class="position-item">
        <div class="pos-col-desc">
          <div class="pos-title">${idx + 1}. ${p.produktName || ''}</div>
          ${p.beschreibung ? `<div class="pos-desc">${p.beschreibung}</div>` : ''}
        </div>
        <div class="pos-col-menge">${p.menge || 0} ${p.einheit || 'Stk'}</div>
        <div class="pos-col-preis">${formatCurrency(p.einzelpreisNetto)}</div>
        <div class="pos-col-gesamt">${formatCurrency(p.gesamtNetto)}</div>
      </div>
      `).join('')}
    </div>
    
    <!-- Totals -->
    <div class="totals">
      <div class="total-row main">
        <span>Gesamtbetrag netto</span>
        <span>${formatCurrency(offer.summeNetto)}</span>
      </div>
      ${Object.entries(ustGruppen).map(([rate, amount]) => `
      <div class="total-row">
        <span>zzgl. Umsatzsteuer ${rate}%</span>
        <span>${formatCurrency(amount)}</span>
      </div>
      `).join('')}
      <div class="total-row final">
        <span>Gesamtbetrag brutto</span>
        <span>${formatCurrency(offer.reverseCharge ? offer.summeNetto : offer.summeBrutto)}</span>
      </div>
    </div>

    <!-- Closing -->
     <div class="closing">
       <p>Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>
       <p>Wir bedanken uns sehr für Ihr Vertrauen.</p>
       <div class="signature">
         <p>Mit freundlichen Grüßen</p>
         <p>${offer.erstelltDurch || 'Reinhard Lassl'}</p>
       </div>
       </div>
    
    <!-- Footer -->
    <div class="footer">
      <div><strong>${companySettings?.firmenname || ''}</strong> _ ${companySettings?.strasse || ''} _ ${companySettings?.plz || ''} ${companySettings?.ort || ''} _ ${companySettings?.land || ''} &nbsp; <strong>TEL.</strong> ${companySettings?.telefon || ''} &nbsp; <strong>E-MAIL</strong> ${companySettings?.email || ''}</div>
      <div><strong>WEB</strong> ${companySettings?.website || ''}${companySettings?.amtsgericht ? ` &nbsp; AMTSGERICHT ${companySettings.amtsgericht}` : ''}${companySettings?.fnNr ? ` &nbsp; <strong>FN-NR.</strong> ${companySettings.fnNr}` : ''}${companySettings?.ustIdNr ? ` &nbsp; <strong>UST.-ID</strong> ${companySettings.ustIdNr}` : ''}${companySettings?.steuernummer ? ` &nbsp; <strong>STEUER-NR.</strong> ${companySettings.steuernummer}` : ''}</div>
      <div>${companySettings?.geschaeftsfuehrung ? `GESCHÄFTSFÜHRUNG ${companySettings.geschaeftsfuehrung}` : ''}${companySettings?.bankName ? ` &nbsp; <strong>BANK</strong> ${companySettings.bankName}` : ''}${companySettings?.blz ? ` &nbsp; BLZ ${companySettings.blz}` : ''}${companySettings?.iban ? ` &nbsp; <strong>IBAN</strong> ${companySettings.iban}` : ''}${companySettings?.bic ? ` &nbsp; <strong>BIC</strong> ${companySettings.bic}` : ''}</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function generateInvoicePdfHtml(invoice, positions, companySettings) {
  const formatCurrency = (val) => new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(val || 0);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return moment(dateStr).format('DD.MM.YYYY');
  };

  // Dynamisch entscheiden, welche UID angezeigt wird
  const displayUID = invoice.rechnungAnHI ? invoice.uidVonHI : invoice.uidnummer;

  // VAT gruppieren
  const ustGruppen = {};
  positions.forEach(p => {
    const ustSatz = parseFloat(p.ustSatz) || 20;
    const gesamtNetto = parseFloat(p.gesamtNetto) || 0;
    if (!ustGruppen[ustSatz]) ustGruppen[ustSatz] = 0;
    ustGruppen[ustSatz] += gesamtNetto * (ustSatz / 100);
  });
  
  const isStorno = invoice.rechnungstyp === 'storno';
  const hasReverseCharge = Object.keys(ustGruppen).some(rate => rate == 0);

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { margin: 12mm 15mm 15mm 15mm; size: A4 portrait; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 10.5pt; 
      color: #333; 
      line-height: 1.5;
      padding: 0;
      overflow: visible !important;
      height: auto !important;
    }
    .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0 5mm; padding-bottom: 20mm; overflow: visible !important; height: auto !important; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30mm; margin-bottom: 10mm; }
    .header-left { flex: 1; }
    .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; width: 40%; }
    .logo { max-height: 65px; max-width: 150px; object-fit: contain; }
    .meta-block { text-align: right; font-size: 9pt; line-height: 1.8; }

    /* Kundenadresse */
    .sender-line { font-size: 7pt; color: #666; margin-bottom: 15px; }
    .customer-address { margin-bottom: 25px; font-size: 10.5pt; line-height: 1.8; }
    .customer-name { font-weight: bold; font-size: 10.5pt; margin-bottom: 1px; }
    
    /* Metadaten */
    .meta-row { margin-bottom: 3px; display: flex; justify-content: flex-end; align-items: baseline; gap: 8px; }
    .meta-label { color: #888; white-space: nowrap; }
    .meta-value { font-weight: normal; color: #2d3748; }

    /* Dokument Title */
    .doc-title-section { margin-bottom: 20px; }
    .doc-title { font-size: 18pt; font-weight: bold; color: #2d3748; }
    
    /* Objekt */
    .object-line { font-size: 9pt; margin-bottom: 25px; padding: 0px; line-height: 1.2; }
    .object-line div { margin-bottom: 5px; }
    
    /* Intro */
    .intro { margin-bottom: 6px; font-size: 8.5pt; line-height: 1.4; page-break-after: avoid; display: none; }
    .intro strong { font-weight: 600; }
    
    /* Positions Header */
    .positions-header {
      display: flex;
      background: #f5f5f5;
      border-top: 1px solid #ccc;
      border-bottom: 1px solid #ccc;
      padding: 5px 3px;
      font-size: 7.5pt;
      font-weight: 600;
      color: #2d3748;
      margin: 0px 0 0 0;
    }
    .positions-header .col-desc { width: 55%; padding-right: 10px; }
    .positions-header .col-menge { width: 15%; text-align: left; }
    .positions-header .col-preis { width: 15%; text-align: right; }
    .positions-header .col-gesamt { width: 15%; text-align: right; }

    /* Position Item Container */
    .position-item {
      display: flex !important;
      width: 100%;
      height: auto !important;
      overflow: visible !important;
      border-bottom: 1pt solid #e5e5e5;
      padding: 8pt 6pt;
      margin: 0;
      gap: 0;
    }

    /* Positions List Container */
    .positions-list {
      display: block !important;
      width: 100%;
      overflow: visible !important;
      widows: 1 !important;
      orphans: 1 !important;
    }

    /* Position Columns */
    .pos-col-desc {
      flex: 0 0 55%;
      padding-right: 10px;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-menge {
      flex: 0 0 15%;
      font-size: 8.5pt;
      text-align: left;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-preis {
      flex: 0 0 15%;
      font-size: 8.5pt;
      text-align: right;
      vertical-align: top;
      box-sizing: border-box;
    }
    .pos-col-gesamt {
      flex: 0 0 15%;
      font-size: 8.5pt;
      text-align: right;
      vertical-align: top;
      box-sizing: border-box;
    }

    .pos-title { 
      font-weight: 600; 
      color: #2d3748; 
      margin: 0 0 3pt 0;
      font-size: 9pt;
    }
    .pos-desc { 
      font-size: 8pt; 
      color: #555; 
      line-height: 1.4; 
      white-space: pre-wrap; 
      margin: 2pt 0 0 0;
    }
    
    /* Summen */
    .totals { margin-top: 25pt; margin-left: auto; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 6pt 0; font-size: 10pt; }
    .total-row.main { font-weight: 600; padding-bottom: 10pt; }
    .total-row.final { font-weight: bold; font-size: 12pt; border-top: 2pt solid #2d3748; margin-top: 10pt; padding-top: 12pt; }
    
    /* Payment Info */
    .payment { margin-top: 25pt; font-size: 9.5pt; line-height: 1.8; }
    
    /* Reverse Charge */
    .reverse-charge { margin-top: 15pt; font-size: 8pt; color: #666; font-style: italic; }
    
    /* Abschlusstext */
    .closing { 
      page-break-inside: avoid !important;
      margin-top: 15pt; 
      margin-bottom: 8mm; 
      font-size: 8.5pt; 
      line-height: 1.5;
    }
    .signature { margin-top: 8px; font-weight: 600; font-size: 9pt; }

    /* Footer */
    .footer { 
      position: relative;
      margin-top: 10mm;
      padding-top: 8px; 
      border-top: 1.5px solid #999;
      font-size: 7.5pt; 
      color: #333; 
      line-height: 1.6;
    }
    .footer strong { font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="sender-line">Lassel GmbH - Hetzmannsdorf 25 - 2041 Wullersdorf</div>
        <div class="customer-address">
          ${invoice.hausinhabung ? `
          <div class="customer-name">${invoice.hausinhabung}</div>
          <div>p.A. ${invoice.hausverwaltungName || ''}</div>
          <div>${invoice.hausverwaltungStrasse || ''}</div>
          <div>${invoice.hausverwaltungPlz || ''} ${invoice.hausverwaltungOrt || ''}</div>
          <div>Österreich</div>
          ` : `
          <div class="customer-name">${invoice.kundeName || ''}</div>
          <div>${invoice.kundeStrasse || ''}</div>
          <div>${invoice.kundePlz || ''} ${invoice.kundeOrt || ''}</div>
          <div>Österreich</div>
          `}
        </div>
      </div>
      <div class="header-right">
        <img src="${LOGO_URL}" alt="Lassel" class="logo" />
        <div class="meta-block">
          <div class="meta-row">
            <span class="meta-label">${invoice.rechnungstyp === 'storno' ? 'Storno-Nr.' : 'Rechnungs-Nr.'}:</span>
            <span class="meta-value">${invoice.rechnungsNummer || ''}</span>
          </div>
          ${invoice.rechnungstyp === 'storno' && invoice.stornoVonRechnung ? `
          <div class="meta-row">
            <span class="meta-label">Urspr. Rechnung:</span>
            <span class="meta-value">${invoice.stornoVonRechnung}</span>
          </div>
          ` : ''}
          <div class="meta-row">
            <span class="meta-label">${invoice.rechnungstyp === 'storno' ? 'Stornodatum:' : 'Rechnungsdatum:'}:</span>
            <span class="meta-value">${formatDate(invoice.datum)}</span>
          </div>
        ${(invoice.leistungszeitraumVon || invoice.leistungszeitraumBis || (invoice.arbeitstage && invoice.arbeitstage.length > 0)) ? `
        <div class="meta-row">
          <span class="meta-label">Leistungszeitraum:</span>
          <span class="meta-value" style="white-space: pre-line; line-height: 1.3;">${(() => {
            // Verwende gespeicherte Arbeitstage, falls vorhanden
            const allDays = invoice.arbeitstage && invoice.arbeitstage.length > 0
              ? invoice.arbeitstage.map(d => moment(d)).sort((a, b) => a.diff(b))
              : (() => {
                  if (!invoice.leistungszeitraumVon || !invoice.leistungszeitraumBis) {
                    return [];
                  }
                  const days = [];
                  const start = moment(invoice.leistungszeitraumVon);
                  const end = moment(invoice.leistungszeitraumBis);
                  let current = start.clone();
                  while (current.isSameOrBefore(end, 'day')) {
                    days.push(current.clone());
                    current.add(1, 'day');
                  }
                  return days;
                })();
            
            if (allDays.length === 0) return formatDate(invoice.datum);
            
            // Zusammenhängende Bereiche finden
            const ranges = [];
            let rangeStart = allDays[0];
            let rangeEnd = allDays[0];
            
            for (let i = 1; i < allDays.length; i++) {
              if (allDays[i].diff(rangeEnd, 'days') === 1) {
                // Zusammenhängend
                rangeEnd = allDays[i];
              } else {
                // Lücke gefunden
                ranges.push({ start: rangeStart, end: rangeEnd });
                rangeStart = allDays[i];
                rangeEnd = allDays[i];
              }
            }
            ranges.push({ start: rangeStart, end: rangeEnd });
            
            // Formatieren - einzelne Tage und Bereiche ohne Jahr
            const formatted = ranges.map(range => {
              if (range.start.isSame(range.end, 'day')) {
                // Einzelner Tag - nur DD.MM.
                return range.start.format('DD.MM.YYYY');
              } else {
                // Bereich von-bis - mit Jahr am Ende
                return range.start.format('DD.MM.YYYY') + ' - ' + range.end.format('DD.MM.YYYY');
              }
            }).join(', ');
            
            return formatted;
          })()}</span>
        </div>
        ` : `
        <div class="meta-row">
          <span class="meta-label">Leistungsdatum:</span>
          <span class="meta-value">${formatDate(invoice.datum)}</span>
        </div>
        `}
        ${displayUID ? `
        <div class="meta-row">
          <span class="meta-label">USt-IdNr.:</span>
          <span class="meta-value">${displayUID}</span>
        </div>
        ` : ''}
        ${invoice.erstelltDurch ? `
          <div class="meta-row">
            <span class="meta-label">Ihr Ansprechpartner:</span>
            <span class="meta-value">${invoice.erstelltDurch}</span>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
    
    <!-- Document Title -->
    <div class="doc-title-section">
      <div class="doc-title">${invoice.rechnungstyp === 'storno' ? 'Stornorechnung' : 'Rechnung'} ${invoice.rechnungsNummer || ''}</div>
      ${invoice.rechnungstyp === 'storno' && invoice.stornoVonRechnung ? `
      <div class="doc-subtitle" style="color: #d97706; font-weight: 600;">Bezug: Rechnung ${invoice.stornoVonRechnung}</div>
      ` : ''}
    </div>
    
    <!-- Objekt und Ticketnummer -->
    <div class="object-line" style="font-weight: 600; margin-bottom: 10px;">
      ${invoice.objektBezeichnung ? `<div style="margin-bottom: 4px;">OBJ: ${invoice.objektBezeichnung}</div>` : ''}
      ${invoice.ticketNumber ? `<div style="font-size: 8.5pt; color: #666; font-weight: normal; margin-bottom: 3px;">Ticketnummer: ${invoice.ticketNumber}</div>` : ''}
      ${invoice.referenzAngebotNummer ? `<div style="font-size: 8.5pt; color: #666; font-weight: normal;">Referenz Angebot: ${invoice.referenzAngebotNummer}</div>` : ''}
    </div>
    
    ${invoice.rechnungstyp === 'storno' && invoice.stornoGrund ? `
    <!-- Grund für Stornierung -->
    <div style="margin-bottom: 20px; padding: 12px; background: #fef3c7; border-left: 4px solid #d97706;">
      <div style="font-weight: 600; color: #92400e; margin-bottom: 4px;">Grund für diese Stornierung:</div>
      <div style="color: #78350f; font-size: 9pt;">${invoice.stornoGrund}</div>
    </div>
    ` : ''}
    
    <!-- Intro Text -->
    <div class="intro">
      <p><strong>Sehr geehrte Damen und Herren,</strong></p>
      ${invoice.rechnungstyp === 'storno' ? `
      <p style="margin-top: 6px;">wir stornieren hiermit die Rechnung ${invoice.stornoVonRechnung}.</p>
      <p>Die ursprünglichen Positionen werden mit negativen Beträgen aufgeführt:</p>
      ` : `
      <p style="margin-top: 6px;">vielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!</p>
      <p>Hiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:</p>
      `}
    </div>
    
    <!-- Positions List -->
    <div class="positions-header">
      <div class="col-desc">Beschreibung</div>
      <div class="col-menge">Menge</div>
      <div class="col-preis">Einzelpreis</div>
      <div class="col-gesamt">Gesamtpreis</div>
    </div>
    <div class="positions-list">
      ${positions.map((p, idx) => `
      <div class="position-item">
        <div class="pos-col-desc">
          <div class="pos-title">${idx + 1}. ${p.produktName || ''}</div>
          ${p.beschreibung ? `<div class="pos-desc">${p.beschreibung}</div>` : ''}
        </div>
        <div class="pos-col-menge">${p.menge || 0} ${p.einheit || 'Stk'}</div>
        <div class="pos-col-preis">${formatCurrency(p.einzelpreisNetto)}</div>
        <div class="pos-col-gesamt">${formatCurrency(p.gesamtNetto)}</div>
      </div>
      `).join('')}
    </div>
    
    <!-- Totals -->
    <div class="totals">
      <div class="total-row main">
        <span>Gesamtbetrag netto</span>
        <span>${formatCurrency(invoice.summeNetto)}</span>
      </div>
      ${Object.entries(ustGruppen).map(([rate, amount]) => `
      <div class="total-row">
        <span>zzgl. Umsatzsteuer ${rate}%</span>
        <span>${formatCurrency(amount)}</span>
      </div>
      `).join('')}
      <div class="total-row final">
        <span>Gesamtbetrag brutto</span>
        <span>${formatCurrency(invoice.summeBrutto)}</span>
      </div>
    </div>
    
    <!-- Payment Info / Gutschrift Info -->
    ${invoice.rechnungstyp === 'storno' ? `
    <div class="payment">
      <p><strong>Wichtiger Hinweis:</strong> Diese Stornorechnung dient der Korrektur der oben genannten Rechnung.</p>
      <p style="margin-top: 6px;">Der Betrag wird mit der ursprünglichen Rechnung verrechnet bzw. Ihnen erstattet.</p>
      <p style="margin-top: 12px; font-size: 8.5pt; color: #666; font-style: italic;">
        <strong>Aufbewahrungspflicht:</strong> Diese Stornorechnung ist aufzubewahren. Die Aufbewahrungspflicht beträgt 7 Jahre ab dem Ende des Kalenderjahres, in dem die Stornierung ausgestellt wurde.
      </p>
    </div>
    ` : `
    <div class="payment">
      ${invoice.zahlungszielTage ? `
      <div style="margin-bottom: 6px;"><strong>Zahlungsbedingungen:</strong> ${invoice.zahlungszielTage} Tage netto</div>
      ` : ''}
      ${invoice.faelligAm ? `
      <div style="margin-bottom: 6px;"><strong>Fällig am:</strong> ${formatDate(invoice.faelligAm)}</div>
      ` : ''}
      <div style="margin-top: 12px; font-size: 9pt; line-height: 1.6;">
        Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.
      </div>
    </div>
    `}
    
    ${hasReverseCharge ? `
    <div class="reverse-charge">
      Die Steuerschuld gemäß § 19 Abs. 1a UstG 1994 geht auf den Leistungsempfänger über.
    </div>
    ` : ''}
    
    ${invoice.bemerkung ? `
    <!-- Bemerkungen / Abschlusstext -->
    <div style="margin-top: 12pt; padding-top: 8pt; font-size: 8.5pt; line-height: 1.5; white-space: pre-wrap; color: #333;">
${invoice.bemerkung}
    </div>
    ` : ''}
    
    <!-- Closing -->
    <div class="closing">
      <div class="signature">
        <p>Mit freundlichen Grüßen</p>
        <p>${invoice.erstelltDurch || 'Lassel GmbH'}</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div><strong>${companySettings?.firmenname || ''}</strong> _ ${companySettings?.strasse || ''} _ ${companySettings?.plz || ''} ${companySettings?.ort || ''} _ ${companySettings?.land || ''}</div>
      <div><strong>TEL.</strong> ${companySettings?.telefon || ''} &nbsp; <strong>E-MAIL</strong> ${companySettings?.email || ''}</div>
      <div><strong>WEB</strong> ${companySettings?.website || ''}${companySettings?.amtsgericht ? ` &nbsp; AMTSGERICHT ${companySettings.amtsgericht}` : ''}${companySettings?.fnNr ? ` &nbsp; <strong>FN-NR.</strong> ${companySettings.fnNr}` : ''}${companySettings?.ustIdNr ? ` &nbsp; <strong>UST.-ID</strong> ${companySettings.ustIdNr}` : ''}${companySettings?.steuernummer ? ` &nbsp; <strong>STEUER-NR.</strong> ${companySettings.steuernummer}` : ''}</div>
      <div>${companySettings?.geschaeftsfuehrung ? `GESCHÄFTSFÜHRUNG ${companySettings.geschaeftsfuehrung}` : ''}${companySettings?.bankName ? ` &nbsp; <strong>BANK</strong> ${companySettings.bankName}` : ''}${companySettings?.blz ? ` &nbsp; BLZ ${companySettings.blz}` : ''}${companySettings?.iban ? ` &nbsp; <strong>IBAN</strong> ${companySettings.iban}` : ''}${companySettings?.bic ? ` &nbsp; <strong>BIC</strong> ${companySettings.bic}` : ''}</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}