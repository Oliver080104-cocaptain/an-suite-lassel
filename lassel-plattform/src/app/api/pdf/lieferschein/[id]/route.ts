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
  .object-line { font-size: 9pt; margin-bottom: 25px; padding: 0; line-height: 1.2; font-weight: 600; }
  .object-line div { margin-bottom: 5px; }
  .positions-header { display: flex; background: #f5f5f5; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 5px 3px; font-size: 7.5pt; font-weight: 600; color: #2d3748; margin: 6px 0 0 0; }
  .positions-header .col-desc { width: 75%; padding-right: 10px; }
  .positions-header .col-menge { width: 25%; text-align: left; }
  .positions-list { display: block !important; width: 100%; overflow: visible !important; widows: 1 !important; orphans: 1 !important; }
  .position-item { display: flex !important; width: 100%; height: auto !important; overflow: visible !important; border-bottom: 1pt solid #e5e5e5; padding: 8pt 6pt; margin: 0; gap: 0; }
  .pos-col-desc { flex: 0 0 75%; padding-right: 10px; vertical-align: top; box-sizing: border-box; }
  .pos-col-menge { flex: 0 0 25%; font-size: 8.5pt; text-align: left; vertical-align: top; box-sizing: border-box; }
  .pos-title { font-weight: 600; color: #2d3748; margin: 0 0 3pt 0; font-size: 9pt; }
  .pos-desc { font-size: 8.5pt; color: #555; line-height: 1.4; white-space: pre-wrap; margin: 2pt 0 0 0; }
  .closing { page-break-inside: avoid !important; margin-top: 15pt; margin-bottom: 8mm; font-size: 9.5pt; line-height: 1.5; }
  .closing p { margin-bottom: 4pt; }
  .signature { margin-top: 8px; font-weight: 600; font-size: 9.5pt; }
  .footer { position: relative; margin-top: 10mm; padding-top: 8px; border-top: 2px solid #2d3748; font-size: 9.5pt; color: #333; line-height: 1.7; font-weight: 500; }
  .footer strong { font-weight: 700; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #E85A1B; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(232,90,27,0.4); z-index: 100; }
  @media print { .print-btn { display: none; } @page { size: A4; } }
`

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const autoPrint = new URL(req.url).searchParams.get('download') === '1'

  const { data: ls, error } = await supabase.from('lieferscheine').select('*').eq('id', id).single()
  if (error || !ls) return new NextResponse('Lieferschein nicht gefunden', { status: 404 })

  const [posResult, angebotResult] = await Promise.all([
    supabase.from('lieferschein_positionen').select('*').eq('lieferschein_id', id).order('position'),
    ls.angebot_id
      ? supabase.from('angebote').select('angebotsnummer').eq('id', ls.angebot_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const positionen: any[] = posResult.data || []
  const erstelltVon = ls.erstellt_von || ''
  const referenzAngebotNummer = (angebotResult.data as any)?.angebotsnummer || ''

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
    </div>`
  }).join('')

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
        <div class="customer-name">${esc(ls.kunde_name)}</div>
        ${ls.kunde_strasse ? `<div>${esc(ls.kunde_strasse)}</div>` : ''}
        ${(ls.kunde_plz || ls.kunde_ort) ? `<div>${esc(ls.kunde_plz || '')} ${esc(ls.kunde_ort || '')}</div>` : ''}
        <div>Österreich</div>
      </div>
    </div>
    <div class="header-right">
      <img src="${APP_URL}/logo.png" alt="Lassel" class="logo" />
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Lieferschein-Nr.:</span><span class="meta-value">${esc(ls.lieferscheinnummer)}</span></div>
        <div class="meta-row"><span class="meta-label">Datum:</span><span class="meta-value">${formatDate(ls.lieferdatum || ls.created_at)}</span></div>
        ${erstelltVon ? `<div class="meta-row"><span class="meta-label">Ihr Ansprechpartner:</span><span class="meta-value">${esc(erstelltVon)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <div class="doc-title-section">
    <div class="doc-title">Lieferschein ${esc(ls.lieferscheinnummer)}</div>
  </div>

  <div class="object-line">
    ${ls.objekt_adresse ? `<div>OBJ: ${esc(ls.objekt_adresse)}</div>` : ''}
    ${ls.ticket_nummer ? `<div style="font-size:8.5pt;color:#666;font-weight:normal">Ticketnummer: ${esc(ls.ticket_nummer)}</div>` : ''}
    ${referenzAngebotNummer ? `<div style="font-size:8.5pt;color:#666;font-weight:normal">Referenz Angebot: ${esc(referenzAngebotNummer)}</div>` : ''}
  </div>

  <div class="positions-header">
    <div class="col-desc">Beschreibung</div>
    <div class="col-menge">Menge</div>
  </div>
  <div class="positions-list">${posRows}</div>

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
${autoPrint ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 300))</script>' : ''}
</body>
</html>`

  // Persist PDF URL
  supabase.from('lieferscheine').update({ pdf_url: `${APP_URL}/api/pdf/lieferschein/${id}` }).eq('id', id).then(() => {})

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
