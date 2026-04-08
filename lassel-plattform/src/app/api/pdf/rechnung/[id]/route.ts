import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://an-suite-lassel.vercel.app'

function esc(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return String(d) }
}

function formatEuro(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
}

const CSS = `
  @page { margin: 12mm 15mm 15mm 15mm; size: A4 portrait; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; padding: 0; overflow: visible !important; height: auto !important; }
  .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0 20mm; padding-bottom: 20mm; overflow: visible !important; height: auto !important; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30mm; margin-bottom: 10mm; }
  .header-left { flex: 1; }
  .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; width: 40%; }
  .logo { max-height: 65px; max-width: 150px; object-fit: contain; }
  .meta-block { text-align: right; font-size: 9pt; line-height: 1.8; }
  .sender-line { font-size: 8pt; color: #666; margin-bottom: 5mm; }
  .customer-address { margin-bottom: 25px; font-size: 10pt; line-height: 1.4; }
  .customer-name { font-weight: bold; font-size: 10pt; margin-bottom: 2px; }
  .meta-row { margin-bottom: 3px; display: flex; justify-content: flex-end; gap: 8px; }
  .meta-label { color: #888; white-space: nowrap; }
  .meta-value { font-weight: normal; color: #000; }
  .doc-title-section { margin-bottom: 20px; }
  .doc-title { font-size: 17pt; font-weight: bold; color: #000; }
  .object-line { font-size: 10pt; margin-bottom: 20px; font-weight: bold; page-break-after: avoid; }
  .ticket-line { font-size: 8.5pt; color: #666; font-weight: normal; margin-top: 4px; }
  .positions-header { display: flex; background: #f8f8f8; border-bottom: 1.5px solid #333; padding: 8px 6px; font-size: 9pt; font-weight: bold; color: #000; margin: 0; }
  .positions-header .col-desc { width: 55%; padding-right: 10px; }
  .positions-header .col-menge { width: 15%; text-align: left; }
  .positions-header .col-preis { width: 15%; text-align: right; }
  .positions-header .col-gesamt { width: 15%; text-align: right; }
  .positions-list { display: block !important; width: 100%; overflow: visible !important; widows: 1 !important; orphans: 1 !important; }
  .position-item { display: flex !important; width: 100%; height: auto !important; overflow: visible !important; border-bottom: 0.5pt solid #ddd; padding: 10pt 6pt; margin: 0; gap: 0; }
  .pos-col-desc { flex: 0 0 55%; padding-right: 10px; vertical-align: top; box-sizing: border-box; }
  .pos-col-menge { flex: 0 0 15%; font-size: 9.5pt; text-align: left; padding-top: 0; vertical-align: top; box-sizing: border-box; }
  .pos-col-preis { flex: 0 0 15%; font-size: 9.5pt; text-align: right; padding-top: 0; vertical-align: top; box-sizing: border-box; }
  .pos-col-gesamt { flex: 0 0 15%; font-size: 9.5pt; text-align: right; padding-top: 0; vertical-align: top; box-sizing: border-box; }
  .pos-title { font-weight: bold; color: #000; margin: 0 0 4pt 0; font-size: 9.5pt; }
  .pos-desc { font-size: 9pt; color: #333; line-height: 1.4; white-space: pre-wrap; margin: 2pt 0 0 0; padding-left: 8pt; }
  .totals { margin-top: 25pt; margin-left: auto; width: 40%; min-width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 5pt 0; font-size: 10pt; }
  .total-row.main { font-weight: normal; padding-bottom: 5pt; }
  .total-row.final { font-weight: bold; font-size: 11pt; border-top: 1.5pt solid #000; margin-top: 10pt; padding-top: 10pt; }
  .payment { margin-top: 20pt; font-size: 9.5pt; line-height: 1.7; }
  .closing { page-break-inside: avoid !important; margin-top: 18mm; margin-bottom: 15mm; font-size: 9.5pt; line-height: 1.5; }
  .closing p { margin-bottom: 6pt; }
  .signature { margin-top: 12pt; font-weight: bold; font-size: 10pt; }
  .footer { position: relative; margin-top: 15mm; padding-top: 10px; border-top: 1.5px solid #333; font-size: 7.5pt; color: #666; line-height: 1.6; font-weight: normal; }
  .footer strong { font-weight: 600; }
  .footer div { margin-bottom: 2px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #E85A1B; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(232,90,27,0.4); z-index: 100; }
  @media print { .print-btn { display: none; } @page { size: A4; } }
`

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const autoPrint = new URL(req.url).searchParams.get('download') === '1'

  const [
    { data: rechnung, error },
    { data: positionenRaw },
    { data: einstellungen },
  ] = await Promise.all([
    supabase.from('rechnungen').select('*').eq('id', id).single(),
    supabase.from('rechnung_positionen').select('*').eq('rechnung_id', id).order('position'),
    supabase.from('einstellungen').select('key, value'),
  ])

  if (error || !rechnung) return new NextResponse('Rechnung nicht gefunden', { status: 404 })

  const positionen: any[] = positionenRaw || []

  // Typ-Mapping für Titel
  const typToPdfTitle: Record<string, string> = {
    normal: 'RECHNUNG',
    anzahlung: 'ANZAHLUNGSRECHNUNG',
    teilrechnung: 'TEILRECHNUNG',
    schlussrechnung: 'SCHLUSSRECHNUNG',
    gutschrift: 'GUTSCHRIFT',
    storno: 'STORNORECHNUNG',
  }
  const pdfTitle = (rechnung.ist_schlussrechnung
    ? 'SCHLUSSRECHNUNG'
    : (typToPdfTitle[rechnung.rechnungstyp || 'normal'] || 'RECHNUNG'))

  // Einstellungen parsen
  const s: Record<string, string> = {}
  einstellungen?.forEach((e: any) => {
    try { s[e.key] = JSON.parse(e.value) } catch { s[e.key] = e.value }
  })

  const firma = {
    firmenname: s.firmenname || 'Lassel GmbH',
    strasse: s.strasse || 'Hetzmannsdorf 25',
    plz: s.plz || '2041',
    ort: s.ort || 'Wullersdorf',
    telefon: s.telefon || '+436608060050',
    email: s.email || 'office@hoehenarbeiten-lassel.at',
    website: s.website || 'www.hoehenarbeiten-lassel.at',
    ust_id: s.ust_id || 'ATU78127607',
    steuernummer: s.steuernummer || '22375/5414',
    amtsgericht: s.amtsgericht || 'Korneuburg',
    geschaeftsfuehrung: s.geschaeftsfuehrung || 'Reinhard Lassel',
    bank: s.bank || 'Bank Volksbank',
    iban: s.iban || 'AT454300048406028000',
    bic: s.bic || 'VBOEATWWXXX',
    rechnungFusstext: s.rechnungFusstext || '',
  }

  // Empfänger Logik
  let empfaengerName = ''
  let empfaengerZeile2 = ''
  let empfaengerStrasse = ''
  let empfaengerPlz = ''
  let empfaengerOrt = ''
  let empfaengerUID = ''

  if (rechnung.rechnung_an_hi && rechnung.hausinhabung) {
    empfaengerName = rechnung.hausinhabung
    empfaengerZeile2 = `p.A. ${rechnung.hausverwaltung_name || ''}`
    empfaengerStrasse = rechnung.hausverwaltung_strasse || ''
    empfaengerPlz = rechnung.hausverwaltung_plz || ''
    empfaengerOrt = rechnung.hausverwaltung_ort || ''
    empfaengerUID = rechnung.uid_von_hi || ''
  } else {
    empfaengerName = rechnung.kunde_name || ''
    empfaengerStrasse = rechnung.kunde_strasse || ''
    empfaengerPlz = rechnung.kunde_plz || ''
    empfaengerOrt = rechnung.kunde_ort || ''
    empfaengerUID = rechnung.kunde_uid || ''
  }

  const posRows = positionen.map((p, i) => {
    const lines = (p.beschreibung as string || '').split('\n')
    const titel = esc(lines[0] || '')
    const desc = lines.slice(1).join('\n').trim()
    const gesamt = p.gesamtpreis || (p.einzelpreis * p.menge) || 0
    return `
    <div class="position-item">
      <div class="pos-col-desc">
        <div class="pos-title">${i + 1}. ${titel}</div>
        ${desc ? `<div class="pos-desc">${esc(desc)}</div>` : ''}
      </div>
      <div class="pos-col-menge">${p.menge} ${esc(p.einheit || 'Stk')}</div>
      <div class="pos-col-preis">${formatEuro(p.einzelpreis || 0)}</div>
      <div class="pos-col-gesamt">${formatEuro(gesamt)}</div>
    </div>`
  }).join('')

  const fusstext = rechnung.fusszeile || firma.rechnungFusstext

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${CSS}</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">⬇ PDF speichern</button>
<div class="container">

  <div class="header">
    <div class="header-left">
      <div class="sender-line">${esc(firma.firmenname)} - ${esc(firma.strasse)} - ${esc(firma.plz)} ${esc(firma.ort)}</div>
      <div class="customer-address">
        <div class="customer-name">${esc(empfaengerName)}</div>
        ${empfaengerZeile2 ? `<div>${esc(empfaengerZeile2)}</div>` : ''}
        ${empfaengerStrasse ? `<div>${esc(empfaengerStrasse)}</div>` : ''}
        ${(empfaengerPlz || empfaengerOrt) ? `<div>${esc(empfaengerPlz)} ${esc(empfaengerOrt)}</div>` : ''}
        <div>Österreich</div>
        ${empfaengerUID ? `<div>UID: ${esc(empfaengerUID)}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <img src="${APP_URL}/logo.png" alt="${esc(firma.firmenname)}" class="logo" />
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Rechnungs-Nr.:</span><span class="meta-value">${esc(rechnung.rechnungsnummer)}</span></div>
        ${rechnung.rechnungstyp && rechnung.rechnungstyp !== 'normal' ? `
        <div class="meta-row"><span class="meta-label">Typ:</span><span class="meta-value">${esc(rechnung.rechnungstyp)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-label">Rechnungsdatum:</span><span class="meta-value">${formatDate(rechnung.rechnungsdatum || rechnung.created_at)}</span></div>
        ${(rechnung.leistungszeitraum_von && rechnung.leistungszeitraum_bis) ? `
        <div class="meta-row"><span class="meta-label">Leistungszeitraum:</span><span class="meta-value">${formatDate(rechnung.leistungszeitraum_von)} – ${formatDate(rechnung.leistungszeitraum_bis)}</span></div>` : ''}
        ${rechnung.erstellt_von ? `
        <div class="meta-row"><span class="meta-label">Ihr Ansprechpartner:</span><span class="meta-value">${esc(rechnung.erstellt_von)}</span></div>` : ''}
        ${rechnung.referenz_angebot_nummer ? `
        <div class="meta-row"><span class="meta-label">Referenz Angebot:</span><span class="meta-value">${esc(rechnung.referenz_angebot_nummer)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <div class="doc-title-section">
    <div class="doc-title">${esc(pdfTitle)} ${esc(rechnung.rechnungsnummer)}</div>
  </div>

  <div class="object-line">
    ${esc(rechnung.objekt_bezeichnung || rechnung.objekt_adresse || '')}
    ${rechnung.ticket_nummer ? `<div class="ticket-line">Ticket: ${esc(rechnung.ticket_nummer)}</div>` : ''}
  </div>

  <div class="positions-header">
    <div class="col-desc">Beschreibung</div>
    <div class="col-menge">Menge</div>
    <div class="col-preis">Einzelpreis</div>
    <div class="col-gesamt">Gesamtpreis</div>
  </div>
  <div class="positions-list">${posRows}</div>

  <div class="totals">
    <div class="total-row main">
      <span>Gesamtbetrag netto</span>
      <span>${formatEuro(rechnung.netto_gesamt || 0)}</span>
    </div>
    ${rechnung.reverse_charge ? `
    <div class="total-row"><span>USt. (Reverse Charge)</span><span>0,00 €</span></div>` : `
    <div class="total-row"><span>zzgl. Umsatzsteuer 20%</span><span>${formatEuro(rechnung.mwst_gesamt || 0)}</span></div>`}
    <div class="total-row final">
      <span>Gesamtbetrag brutto</span>
      <span>${formatEuro(rechnung.brutto_gesamt || 0)}</span>
    </div>
  </div>

  <div class="payment">
    <div><strong>Zahlungsbedingungen:</strong> ${esc(rechnung.zahlungskondition || '30 Tage netto')}</div>
    ${rechnung.faellig_bis ? `
    <div style="margin-top: 4px;"><strong>Fällig am:</strong> ${formatDate(rechnung.faellig_bis)}</div>` : ''}
    <div style="margin-top: 12px; font-size: 9pt;">
      Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer
      auf das unten angegebene Konto.
    </div>
  </div>

  <!-- TEST: Fußzeile debug -->
  <div style="background:red;color:white;padding:10px;font-size:9pt;">
    FUSSZEILE TEST: ${fusstext ? esc(fusstext) : 'LEER'}
  </div>

  ${fusstext ? `
  <div style="margin-top: 15pt; padding: 8pt 12pt;
    border-left: 3px solid #999;
    background: #fafafa;
    font-size: 8.5pt; color: #444; line-height: 1.6;
    white-space: pre-wrap;
    margin-bottom: 15pt;">${esc(fusstext)}</div>` : ''}

  <div class="closing">
    <div class="signature">
      <p>Mit freundlichen Grüßen</p>
      <p>${esc(rechnung.erstellt_von || firma.geschaeftsfuehrung)}</p>
    </div>
  </div>

  <div class="footer">
    <div><strong>${esc(firma.firmenname)}</strong> _ ${esc(firma.strasse)} _ ${esc(firma.plz)} ${esc(firma.ort)} _ Österreich</div>
    <div><strong>TEL.</strong> ${esc(firma.telefon)} &nbsp; <strong>E-MAIL</strong> ${esc(firma.email)}</div>
    <div><strong>WEB</strong> ${esc(firma.website)} &nbsp; AMTSGERICHT ${esc(firma.amtsgericht)} &nbsp; <strong>UST.-ID</strong> ${esc(firma.ust_id)} &nbsp; <strong>STEUER-NR.</strong> ${esc(firma.steuernummer)}</div>
    <div>GESCHÄFTSFÜHRUNG ${esc(firma.geschaeftsfuehrung)} &nbsp; <strong>BANK</strong> ${esc(firma.bank)} &nbsp; <strong>IBAN</strong> ${esc(firma.iban)} &nbsp; <strong>BIC</strong> ${esc(firma.bic)}</div>
  </div>

</div>
${autoPrint ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 300))</script>' : ''}
</body>
</html>`

  // Persist PDF URL
  supabase.from('rechnungen').update({ pdf_url: `${APP_URL}/api/pdf/rechnung/${id}` }).eq('id', id).then(() => {})

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
