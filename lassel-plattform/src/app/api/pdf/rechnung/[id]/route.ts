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

function fmtMenge(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Number(n) || 0)
}

const CSS = `
  @page { margin: 12mm 15mm 15mm 15mm; size: A4 portrait; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #333; line-height: 1.5; padding: 0; overflow: visible !important; height: auto !important; }
  .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0 5mm; padding-bottom: 20mm; overflow: visible !important; height: auto !important; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30mm; margin-bottom: 10mm; }
  .header-left { flex: 1; }
  .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; width: 40%; }
  .logo { max-height: 65px; max-width: 150px; object-fit: contain; }
  .meta-block { text-align: right; font-size: 9pt; line-height: 1.8; }
  .sender-line { font-size: 7pt; color: #666; margin-bottom: 15px; }
  .customer-address { margin-bottom: 25px; font-size: 10.5pt; line-height: 1.8; }
  .customer-name { font-weight: bold; font-size: 10.5pt; margin-bottom: 1px; }
  .meta-row { margin-bottom: 3px; display: flex; justify-content: flex-end; align-items: baseline; gap: 8px; }
  .meta-label { color: #888; white-space: nowrap; }
  .meta-value { font-weight: normal; color: #2d3748; }
  .doc-title-section { margin-bottom: 20px; }
  .doc-title { font-size: 18pt; font-weight: bold; color: #2d3748; }
  .object-line { font-size: 9pt; margin-bottom: 10px; padding: 0; line-height: 1.2; font-weight: 600; }
  .object-line div { margin-bottom: 5px; }
  .positions-header { display: flex; background: #f5f5f5; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 5px 3px; font-size: 7.5pt; font-weight: 600; color: #2d3748; margin: 0; }
  .positions-header .col-desc { width: 55%; padding-right: 10px; }
  .positions-header .col-menge { width: 15%; text-align: left; }
  .positions-header .col-preis { width: 15%; text-align: right; }
  .positions-header .col-gesamt { width: 15%; text-align: right; }
  .positions-list { display: block !important; width: 100%; overflow: visible !important; widows: 1 !important; orphans: 1 !important; }
  .position-item { display: flex !important; width: 100%; height: auto !important; overflow: visible !important; border-bottom: 1pt solid #e5e5e5; padding: 8pt 6pt; margin: 0; gap: 0; }
  .pos-col-desc { flex: 0 0 55%; padding-right: 10px; vertical-align: top; box-sizing: border-box; }
  .pos-col-menge { flex: 0 0 15%; font-size: 8.5pt; text-align: left; vertical-align: top; box-sizing: border-box; }
  .pos-col-preis { flex: 0 0 15%; font-size: 8.5pt; text-align: right; vertical-align: top; box-sizing: border-box; }
  .pos-col-gesamt { flex: 0 0 15%; font-size: 8.5pt; text-align: right; vertical-align: top; box-sizing: border-box; }
  .pos-title { font-weight: 600; color: #2d3748; margin: 0 0 3pt 0; font-size: 9pt; }
  .pos-desc { font-size: 8pt; color: #555; line-height: 1.4; white-space: pre-wrap; margin: 2pt 0 0 0; }
  .totals { margin-top: 25pt; margin-left: auto; width: 300px; }
  .total-row { display: flex; justify-content: space-between; padding: 6pt 0; font-size: 10pt; }
  .total-row.main { font-weight: 600; padding-bottom: 10pt; }
  .total-row.final { font-weight: bold; font-size: 12pt; border-top: 2pt solid #2d3748; margin-top: 10pt; padding-top: 12pt; }
  .payment { margin-top: 25pt; font-size: 9.5pt; line-height: 1.8; }
  .closing { page-break-inside: avoid !important; margin-top: 15pt; margin-bottom: 8mm; font-size: 8.5pt; line-height: 1.5; }
  .signature { margin-top: 8px; font-weight: 600; font-size: 9pt; }
  .footer { position: relative; margin-top: 10mm; padding-top: 8px; border-top: 1.5px solid #999; font-size: 7.5pt; color: #333; line-height: 1.6; }
  .footer strong { font-weight: 600; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #E85A1B; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(232,90,27,0.4); z-index: 100; }
  @media print { .print-btn { display: none; } @page { size: A4; } }
`

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [{ data: rechnung, error }, posResult, settingsResult] = await Promise.all([
    supabase.from('rechnungen').select('*').eq('id', id).single(),
    supabase.from('rechnung_positionen').select('*').eq('rechnung_id', id).order('position'),
    supabase.from('company_settings').select('rechnungFusstext').limit(1).maybeSingle(),
  ])
  if (error || !rechnung) return new NextResponse('Rechnung nicht gefunden', { status: 404 })

  const positionen: any[] = posResult.data || []
  const erstelltVon = rechnung.erstellt_von || ''
  const fusstext = rechnung.fusszeile || (settingsResult.data as any)?.rechnungFusstext || ''

  // Empfänger bestimmen: Hausinhabung oder direkter Kunde (snake_case DB columns)
  const rechnungAnHI = rechnung.rechnung_an_hi || false
  let empfaengerName = ''
  let empfaengerAdresseHtml = ''
  let empfaengerUID = ''

  if (rechnungAnHI && rechnung.hausinhabung) {
    empfaengerName = rechnung.hausinhabung
    const hvName = rechnung.hausverwaltung_name ? `p.A. ${esc(rechnung.hausverwaltung_name)}<br>` : ''
    const hvStr = rechnung.hausverwaltung_strasse ? `${esc(rechnung.hausverwaltung_strasse)}<br>` : ''
    const hvPlzOrt = (rechnung.hausverwaltung_plz || rechnung.hausverwaltung_ort)
      ? `${esc(rechnung.hausverwaltung_plz || '')} ${esc(rechnung.hausverwaltung_ort || '')}<br>`
      : ''
    empfaengerAdresseHtml = `${hvName}${hvStr}${hvPlzOrt}Österreich`
    empfaengerUID = rechnung.uid_von_hi || ''
  } else {
    empfaengerName = rechnung.kunde_name || ''
    const str = rechnung.kunde_strasse ? `${esc(rechnung.kunde_strasse)}<br>` : ''
    const plzOrt = (rechnung.kunde_plz || rechnung.kunde_ort)
      ? `${esc(rechnung.kunde_plz || '')} ${esc(rechnung.kunde_ort || '')}<br>`
      : ''
    empfaengerAdresseHtml = `${str}${plzOrt}Österreich`
    empfaengerUID = rechnung.kunde_uid || ''
  }

  const posRows = positionen.map((p, i) => {
    const lines = (p.beschreibung as string || '').split('\n')
    const titel = esc(lines[0] || '')
    const desc = lines.slice(1).join('\n').trim()
    return `
    <div class="position-item">
      <div class="pos-col-desc">
        <div class="pos-title">${i + 1}. ${titel}</div>
        ${desc ? `<div class="pos-desc">${esc(desc)}</div>` : ''}
      </div>
      <div class="pos-col-menge">${fmtMenge(p.menge)} ${esc(p.einheit || 'Stk')}</div>
      <div class="pos-col-preis">${formatEuro(p.einzelpreis)}</div>
      <div class="pos-col-gesamt">${formatEuro(p.gesamtpreis)}</div>
    </div>`
  }).join('')

  const nettoGesamt = rechnung.netto_gesamt || positionen.reduce((s, p) => s + (Number(p.gesamtpreis) || 0), 0)
  const mwstGesamt = rechnung.mwst_gesamt || (nettoGesamt * 0.2)
  const bruttoGesamt = rechnung.brutto_gesamt || (nettoGesamt + mwstGesamt)

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
      <div class="sender-line">Lassel GmbH - Hetzmannsdorf 25 - 2041 Wullersdorf</div>
      <div class="customer-address">
        <div class="customer-name">${esc(empfaengerName)}</div>
        <div>${empfaengerAdresseHtml}</div>
        ${empfaengerUID ? `<div>UID: ${esc(empfaengerUID)}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <img src="${APP_URL}/logo.png" alt="Lassel" class="logo" />
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Rechnungs-Nr.:</span><span class="meta-value">${esc(rechnung.rechnungsnummer)}</span></div>
        <div class="meta-row"><span class="meta-label">Rechnungsdatum:</span><span class="meta-value">${formatDate(rechnung.rechnungsdatum || rechnung.created_at)}</span></div>
        ${(rechnung.leistungszeitraum_von && rechnung.leistungszeitraum_bis) ? `<div class="meta-row"><span class="meta-label">Leistungszeitraum:</span><span class="meta-value">${formatDate(rechnung.leistungszeitraum_von)} – ${formatDate(rechnung.leistungszeitraum_bis)}</span></div>` : `<div class="meta-row"><span class="meta-label">Leistungsdatum:</span><span class="meta-value">${formatDate(rechnung.rechnungsdatum || rechnung.created_at)}</span></div>`}
        ${rechnung.zahlungskondition ? `<div class="meta-row"><span class="meta-label">Zahlungskondition:</span><span class="meta-value">${esc(rechnung.zahlungskondition)}</span></div>` : ''}
        ${erstelltVon ? `<div class="meta-row"><span class="meta-label">Ihr Ansprechpartner:</span><span class="meta-value">${esc(erstelltVon)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <div class="doc-title-section">
    <div class="doc-title">Rechnung ${esc(rechnung.rechnungsnummer)}</div>
  </div>

  <div class="object-line">
    ${rechnung.objekt_adresse ? `<div>OBJ: ${esc(rechnung.objekt_adresse)}</div>` : ''}
    ${rechnung.ticket_nummer ? `<div style="font-size:8.5pt;color:#666;font-weight:normal">Ticketnummer: ${esc(rechnung.ticket_nummer)}</div>` : ''}
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
      <span>${formatEuro(nettoGesamt)}</span>
    </div>
    ${rechnung.reverse_charge
      ? '<div class="total-row"><span>zzgl. Umsatzsteuer (Reverse Charge)</span><span>0,00 €</span></div>'
      : `<div class="total-row"><span>zzgl. Umsatzsteuer 20%</span><span>${formatEuro(mwstGesamt)}</span></div>`
    }
    <div class="total-row final">
      <span>Gesamtbetrag brutto</span>
      <span>${formatEuro(bruttoGesamt)}</span>
    </div>
  </div>

  <div class="payment">
    <div style="margin-bottom:6px"><strong>Zahlungsbedingungen:</strong> ${esc(rechnung.zahlungskondition || '30 Tage netto')}</div>
    ${rechnung.faellig_bis ? `<div style="margin-bottom:6px"><strong>Fällig am:</strong> ${formatDate(rechnung.faellig_bis)}</div>` : ''}
    <div style="margin-top:12px;font-size:9pt;line-height:1.6">
      ${rechnung.notizen || 'Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.'}
    </div>
  </div>

  ${fusstext ? `<div style="margin-top:15pt;font-size:9pt;white-space:pre-wrap">${esc(fusstext)}</div>` : ''}

  <div class="closing">
    <div class="signature">
      <p>Mit freundlichen Grüßen</p>
      <p>${esc(erstelltVon || 'Reinhard Lassel')}</p>
    </div>
  </div>

  <div class="footer">
    <div><strong>Lassel GmbH</strong> _ Hetzmannsdorf 25 _ 2041 Wullersdorf _ Österreich</div>
    <div><strong>TEL.</strong> +436608060050 &nbsp; <strong>E-MAIL</strong> office@hoehenarbeiten-lassel.at</div>
    <div><strong>WEB</strong> www.hoehenarbeiten-lassel.at &nbsp; AMTSGERICHT Korneuburg &nbsp; <strong>UST.-ID</strong> ATU78127607 &nbsp; <strong>STEUER-NR.</strong> 22375/5414</div>
    <div>GESCHÄFTSFÜHRUNG Reinhard Lassel &nbsp; <strong>BANK</strong> Bank Volksbank &nbsp; BLZ 43000 &nbsp; <strong>IBAN</strong> AT454300048406028000 &nbsp; <strong>BIC</strong> VBOEATWWXXX</div>
  </div>

</div>
</body>
</html>`

  // Persist PDF URL
  supabase.from('rechnungen').update({ pdf_url: `${APP_URL}/api/pdf/rechnung/${id}` }).eq('id', id).then(() => {})

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
