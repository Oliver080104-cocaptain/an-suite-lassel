import moment from 'moment';

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6937375d862a164b90207fd3/9f59feb3a_lassel_logo-removebg-preview.png';

export function generatePartialPaymentPdfHtml(invoice, payment, companySettings) {
  const formatCurrency = (val) => new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(val || 0);
  
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
    }
    .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0 5mm; }
    
    /* Header */
    .header { position: relative; margin-bottom: 20px; height: 80px; }
    .logo { position: absolute; top: 0; right: 0; width: 180px; height: auto; }

    /* Kundenadresse */
    .sender-line { font-size: 7pt; color: #666; margin-bottom: 15px; }
    .customer-address { margin-bottom: 25px; font-size: 10.5pt; line-height: 1.6; }
    .customer-name { font-weight: bold; font-size: 10.5pt; margin-bottom: 1px; }
    
    /* Dokument Header */
    .doc-header { margin-bottom: 30px; }
    .doc-title { font-size: 18pt; font-weight: bold; color: #2d3748; margin-bottom: 10px; }
    .doc-meta { font-size: 9pt; }
    .meta-row { margin-bottom: 6px; display: flex; justify-content: space-between; max-width: 400px; }
    .meta-label { color: #666; }
    .meta-value { font-weight: 600; color: #2d3748; }
    
    /* Payment Info Box */
    .payment-box {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }
    .payment-box .row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .payment-box .row:last-child {
      border-bottom: none;
      font-weight: bold;
      font-size: 12pt;
      padding-top: 15px;
      margin-top: 10px;
      border-top: 2px solid #2d3748;
    }
    
    /* Closing */
    .closing { margin-top: 30px; font-size: 9pt; line-height: 1.6; }
    .signature { margin-top: 15px; font-weight: 600; }

    /* Footer */
    .footer { 
      position: absolute;
      bottom: 15mm;
      left: 15mm;
      right: 15mm;
      padding-top: 8px; 
      border-top: 1.5px solid #999;
      font-size: 5.5pt; 
      color: #333; 
      line-height: 1.5;
    }
    .footer strong { font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <img src="${LOGO_URL}" alt="Lassel" class="logo" />
    </div>
    
    <!-- Sender Line -->
    <div class="sender-line">Lassel GmbH - Hetzmannsdorf 25 - 2041 Wullersdorf</div>
    
    <!-- Kunde -->
    <div class="customer-address">
      ${invoice.hausinhabung ? `
      <div class="customer-name">${invoice.hausinhabung} ${invoice.objektStrasse || ''}, ${invoice.objektPlz || ''} ${invoice.objektOrt || ''}</div>
      <div>p/A ${invoice.hausverwaltungName || ''}</div>
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
    
    <!-- Document Header -->
    <div class="doc-header">
      <div class="doc-title">Teilzahlungsbestätigung</div>
      <div class="doc-meta">
        <div class="meta-row">
          <span class="meta-label">Rechnungsnummer:</span>
          <span class="meta-value">${invoice.rechnungsNummer || ''}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Zahlungsdatum:</span>
          <span class="meta-value">${formatDate(payment.datum)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Zahlungsart:</span>
          <span class="meta-value">${payment.zahlungsart === 'überweisung' ? 'Überweisung' : payment.zahlungsart === 'bar' ? 'Bar' : 'Karte'}</span>
        </div>
      </div>
    </div>
    
    <!-- Payment Details Box -->
    <div class="payment-box">
      <div class="row">
        <span>Rechnungsbetrag gesamt:</span>
        <span>${formatCurrency(invoice.summeBrutto)}</span>
      </div>
      <div class="row">
        <span>Teilzahlung:</span>
        <span style="color: #16a34a; font-weight: 600;">${formatCurrency(payment.betrag)}</span>
      </div>
      ${payment.bemerkung ? `
      <div class="row">
        <span>Bemerkung:</span>
        <span style="font-size: 9pt;">${payment.bemerkung}</span>
      </div>
      ` : ''}
    </div>
    
    <!-- Closing -->
    <div class="closing">
      <p>Hiermit bestätigen wir den Eingang Ihrer Teilzahlung.</p>
      <p style="margin-top: 10px;">Vielen Dank für Ihre Zahlung!</p>
      <div class="signature">
        <p>Mit freundlichen Grüßen</p>
        <p>${invoice.erstelltDurch || 'Lassel GmbH'}</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div><strong>Lassel GmbH</strong> _ Hetzmannsdorf 25 _ 2041 Wullersdorf _ Österreich</div>
      <div><strong>TEL.</strong> +436608060050 &nbsp; <strong>E-MAIL</strong> office@hoehenarbeiten-lassel.at</div>
      <div><strong>WEB</strong> www.lassel.at &nbsp; AMTSGERICHT Korneuburg &nbsp; <strong>FN-NR.</strong> FN:578451P &nbsp; <strong>UST.-ID</strong> ATU78127607 &nbsp; <strong>STEUER-NR.</strong> 22375/5414</div>
      <div>GESCHÄFTSFÜHRUNG Lassel Reinhard &nbsp; <strong>BANK</strong> Bank Austria &nbsp; KONTO 52097524531 &nbsp; BLZ 12000 &nbsp; <strong>IBAN</strong> AT541200052097524531 &nbsp; <strong>BIC</strong> BKAUATWW</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}