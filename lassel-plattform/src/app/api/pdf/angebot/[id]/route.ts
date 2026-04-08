import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderHtmlToPdfResponse } from '@/lib/pdf-renderer'

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
  @page { margin: 15mm 20mm; size: A4 portrait; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; padding: 0; margin: 0; overflow: visible !important; height: auto !important; }
  .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0; overflow: visible !important; height: auto !important; position: relative; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 0; margin-bottom: 10mm; }
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
  .positions-header .col-desc { flex: 0 0 55%; padding-right: 10px; }
  .positions-header .col-menge { flex: 0 0 12%; text-align: center; padding: 0 4px; }
  .positions-header .col-preis { flex: 0 0 16%; text-align: right; padding: 0 4px; }
  .positions-header .col-gesamt { flex: 0 0 17%; text-align: right; padding-left: 4px; }
  .positions-list { display: block !important; width: 100%; overflow: visible !important; widows: 1 !important; orphans: 1 !important; }
  .position-item { display: flex !important; width: 100%; height: auto !important; overflow: visible !important; border-bottom: 0.5pt solid #ddd; padding: 10pt 6pt; margin: 0; gap: 0; }
  .pos-col-desc { flex: 0 0 55%; padding-right: 10px; vertical-align: top; box-sizing: border-box; }
  .pos-col-menge { flex: 0 0 12%; font-size: 9.5pt; text-align: center; padding: 0 4px; vertical-align: top; box-sizing: border-box; }
  .pos-col-preis { flex: 0 0 16%; font-size: 9.5pt; text-align: right; padding: 0 4px; vertical-align: top; box-sizing: border-box; }
  .pos-col-gesamt { flex: 0 0 17%; font-size: 9.5pt; text-align: right; padding-left: 4px; vertical-align: top; box-sizing: border-box; }
  .pos-title { font-weight: bold; color: #000; margin: 0 0 4pt 0; font-size: 9.5pt; }
  .pos-desc { font-size: 9pt; color: #333; line-height: 1.4; white-space: pre-wrap; margin: 2pt 0 0 0; padding-left: 8pt; }
  .totals { margin-top: 25pt; margin-left: auto; width: 40%; min-width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 5pt 0; font-size: 10pt; }
  .total-row.main { font-weight: normal; padding-bottom: 5pt; }
  .total-row.final { font-weight: bold; font-size: 11pt; border-top: 1.5pt solid #000; margin-top: 10pt; padding-top: 10pt; }
  .remarks { margin-top: 15pt; padding-top: 10pt; border-top: 1px solid #ddd; font-size: 9pt; line-height: 1.5; white-space: pre-wrap; color: #333; }
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
  const disposition = new URL(req.url).searchParams.get('download') === '1'
    ? 'attachment'
    : 'inline'

  const [{ data: angebot, error }, posResult, companyResult] = await Promise.all([
    supabase.from('angebote').select('*').eq('id', id).single(),
    supabase.from('angebot_positionen').select('*').eq('angebot_id', id).order('position'),
    supabase.from('company_settings').select('*').limit(1).single(),
  ])
  if (error || !angebot) return new NextResponse('Angebot nicht gefunden', { status: 404 })

  if (posResult.error) {
    console.error('Positionen Query Fehler:', posResult.error)
  }

  const positionen: any[] = posResult.data || []
  const erstelltVon = angebot.erstellt_von || ''

  // Firmen-Fußtext: Angebot-spezifisch hat Vorrang, sonst globaler Default aus company_settings
  const companySettings: any = companyResult.data || {}
  const fusstext = angebot.fusszeile || companySettings.angebotFusstext || ''

  // Empfänger Logik
  let empfaengerName = ''
  let empfaengerZeile2 = ''
  let empfaengerStrasse = ''
  let empfaengerPlz = ''
  let empfaengerOrt = ''
  let empfaengerUID = ''

  if (angebot.rechnung_an_hi && angebot.hausinhabung) {
    empfaengerName = angebot.hausinhabung
    empfaengerZeile2 = `p.A. ${angebot.hausverwaltung_name || ''}`
    empfaengerStrasse = angebot.kunde_strasse || ''
    empfaengerPlz = angebot.kunde_plz || ''
    empfaengerOrt = angebot.kunde_ort || ''
    empfaengerUID = ''
  } else {
    empfaengerName = angebot.kunde_name || ''
    empfaengerStrasse = angebot.kunde_strasse || ''
    empfaengerPlz = angebot.kunde_plz || ''
    empfaengerOrt = angebot.kunde_ort || ''
    empfaengerUID = angebot.kunde_uid || ''
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

  const nettoGesamt = positionen.reduce((s, p) => s + (Number(p.gesamtpreis) || 0), 0)
  const mwstGesamt = angebot.mwst_gesamt || (nettoGesamt * 0.2)
  const bruttoGesamt = angebot.brutto_gesamt || (nettoGesamt + mwstGesamt)

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${CSS}</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="header-left">
      <div class="sender-line">Lassel GmbH - Hetzmannsdorf 25 - 2041 Wullersdorf</div>
      <div class="customer-address">
        <div class="customer-name">${esc(empfaengerName)}</div>
        ${empfaengerZeile2 ? `<div>${esc(empfaengerZeile2)}</div>` : ''}
        ${empfaengerStrasse ? `<div>${esc(empfaengerStrasse)}</div>` : ''}
        ${(empfaengerPlz || empfaengerOrt) ? `<div>${esc(empfaengerPlz)} ${esc(empfaengerOrt)}</div>` : ''}
        <div>Österreich</div>
        ${empfaengerUID ? `<div>${esc(empfaengerUID)}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <img src="${APP_URL}/logo.png" alt="Lassel" class="logo" />
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Angebotsnummer:</span><span class="meta-value">${esc(angebot.angebotsnummer)}</span></div>
        <div class="meta-row"><span class="meta-label">Datum:</span><span class="meta-value">${formatDate(angebot.angebotsdatum || angebot.created_at)}</span></div>
        ${angebot.gueltig_bis ? `<div class="meta-row"><span class="meta-label">Gültig bis:</span><span class="meta-value">${formatDate(angebot.gueltig_bis)}</span></div>` : ''}
        ${erstelltVon ? `<div class="meta-row"><span class="meta-label">Ihr Ansprechpartner:</span><span class="meta-value">${esc(erstelltVon)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <div class="doc-title-section">
    <div class="doc-title">Angebot ${esc(angebot.angebotsnummer)}</div>
  </div>

  <div class="object-line">
    ${esc(angebot.objekt_bezeichnung || angebot.objekt_adresse || '')}
    ${angebot.ticket_nummer ? `<div class="ticket-line">Ticket: ${esc(angebot.ticket_nummer)}</div>` : ''}
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
      <span>${formatEuro(angebot.netto_gesamt ?? nettoGesamt)}</span>
    </div>
    ${angebot.reverse_charge
      ? '<div class="total-row"><span>zzgl. Umsatzsteuer (Reverse Charge)</span><span>0,00 €</span></div>'
      : `<div class="total-row"><span>zzgl. Umsatzsteuer 20%</span><span>${formatEuro(mwstGesamt)}</span></div>`
    }
    <div class="total-row final">
      <span>Gesamtbetrag brutto</span>
      <span>${formatEuro(bruttoGesamt)}</span>
    </div>
  </div>

  ${angebot.notizen ? `<div class="remarks">${esc(angebot.notizen)}</div>` : ''}

  ${fusstext ? `
  <div style="
    margin-top: 20pt;
    margin-bottom: 15pt;
    font-size: 9pt;
    color: #333;
    line-height: 1.6;
    white-space: pre-wrap;">${esc(fusstext)}</div>` : ''}

  <div class="closing">
    ${!fusstext ? `<p>Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>
         <p>Wir bedanken uns sehr für Ihr Vertrauen.</p>` : ''}
    <div class="signature">
      <p>Mit freundlichen Grüßen</p>
      <p>${esc(erstelltVon || 'Reinhard Lassel')}</p>
    </div>
  </div>

  <div class="footer">
    <div><strong>Lassel GmbH</strong> _ Hetzmannsdorf 25 _ 2041 Wullersdorf _ Österreich &nbsp; <strong>TEL.</strong> +436608060050 &nbsp; <strong>E-MAIL</strong> office@hoehenarbeiten-lassel.at</div>
    <div><strong>WEB</strong> www.hoehenarbeiten-lassel.at &nbsp; AMTSGERICHT Korneuburg &nbsp; <strong>UST.-ID</strong> ATU78127607 &nbsp; <strong>STEUER-NR.</strong> 22375/5414</div>
    <div>GESCHÄFTSFÜHRUNG Reinhard Lassel &nbsp; <strong>BANK</strong> Bank Volksbank &nbsp; BLZ 43000 &nbsp; <strong>IBAN</strong> AT454300048406028000 &nbsp; <strong>BIC</strong> VBOEATWWXXX</div>
  </div>

</div>
</body>
</html>`

  // pdf_url wird NICHT mehr automatisch beim Render geschrieben — sie wird
  // nur von "Speichern & in Zoho ablegen" gesetzt.

  const fileName = `Angebot_${(angebot.angebotsnummer || id).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`
  return renderHtmlToPdfResponse(html, fileName, disposition)
}
