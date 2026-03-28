import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function esc(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
}

function fmtDate(s: unknown): string {
  if (!s) return ''
  try { return new Date(String(s)).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return String(s) }
}

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #f0f0f0; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.18); margin: 0 auto; position: relative; }
  .logo-img { height: 48px; width: auto; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .doc-title { font-size: 22px; font-weight: 700; }
  .doc-number { font-size: 13px; color: #555; }
  .address-block { margin: 4px 0; }
  .address-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .address-name { font-size: 13px; font-weight: 600; }
  .address-line { font-size: 11px; color: #444; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; padding: 14px; background: #f8f9fa; border-radius: 4px; }
  .meta-item label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px; }
  .meta-item span { font-size: 11px; font-weight: 500; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  thead th { background: #f8f9fa; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; padding: 6px 8px; border-bottom: 2px solid #e0e0e0; text-align: left; }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  td { padding: 7px 8px; font-size: 10px; vertical-align: top; }
  td.right { text-align: right; }
  td.center { text-align: center; }
  .pos-name { font-weight: 600; }
  .pos-desc { color: #666; font-size: 9px; margin-top: 2px; white-space: pre-wrap; }
  .checkbox { display: inline-block; width: 14px; height: 14px; border: 1px solid #333; }
  .anmerkung { margin: 16px 0; padding: 10px 14px; border-left: 3px solid #e05a1a; background: #fff8f5; font-size: 10px; color: #444; white-space: pre-wrap; }
  .signature-block { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
  .signature-line { border-top: 1px solid #333; padding-top: 4px; font-size: 9px; color: #888; margin-top: 48px; }
  .footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; border-top: 1px solid #e0e0e0; padding-top: 8px; }
  .footer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .footer-item { font-size: 8px; color: #888; line-height: 1.4; }
  .footer-item strong { color: #555; display: block; margin-bottom: 2px; }
  @media print { body { background: white; } .page { box-shadow: none; } }
</style>
</head>
<body>
<div class="page">
${body}
</div>
</body>
</html>`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: dn, error } = await supabase
    .from('lieferscheine')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !dn) {
    return new NextResponse('Lieferschein nicht gefunden', { status: 404 })
  }

  const { data: posData } = await supabase
    .from('lieferschein_positionen')
    .select('*')
    .eq('lieferschein_id', id)
    .order('position')
  const positions: Record<string, unknown>[] = posData || []

  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  const posRows = positions.map((p: Record<string, unknown>) => `
    <tr>
      <td>${esc(p.position)}</td>
      <td>
        <div class="pos-name">${esc(p.beschreibung)}</div>
      </td>
      <td class="right">${fmt(p.menge)}</td>
      <td>${esc(p.einheit)}</td>
      <td class="center"><span class="checkbox"></span></td>
    </tr>
  `).join('')

  const body = `
    <div class="header-row">
      <img class="logo-img" src="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/logo.png" alt="Lassel GmbH" />
      <div style="text-align:right">
        <div class="doc-title">LIEFERSCHEIN</div>
        <div class="doc-number">${esc(dn.lieferscheinnummer)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:20px 0;">
      <div class="address-block">
        <div class="address-label">Empfänger</div>
        <div class="address-name">${esc(dn.kunde_name)}</div>
        <div class="address-line">${esc(dn.kunde_strasse)}</div>
        <div class="address-line">${esc(dn.kunde_plz)} ${esc(dn.kunde_ort)}</div>
      </div>
      ${dn.objekt_adresse ? `
      <div class="address-block">
        <div class="address-label">Objekt</div>
        <div class="address-name">${esc(dn.objekt_adresse)}</div>
      </div>` : ''}
    </div>

    <div class="meta-grid">
      <div class="meta-item"><label>Datum</label><span>${fmtDate(dn.lieferdatum)}</span></div>
      ${dn.ticket_nummer ? `<div class="meta-item"><label>Ticketnummer</label><span>${esc(dn.ticket_nummer)}</span></div>` : ''}
    </div>

    <div class="section-title">Lieferpositionen</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Bezeichnung</th>
          <th class="right" style="width:60px">Menge</th>
          <th style="width:40px">Einh.</th>
          <th class="center" style="width:50px">Erledigt</th>
        </tr>
      </thead>
      <tbody>${posRows}</tbody>
    </table>

    ${dn.notizen ? `<div class="anmerkung">${esc(dn.notizen)}</div>` : ''}

    <div class="signature-block">
      <div>
        <div class="signature-line">Datum / Unterschrift Auftraggeber</div>
      </div>
      <div>
        <div class="signature-line">Datum / Unterschrift Auftragnehmer</div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-grid">
        <div class="footer-item">
          <strong>${esc(settings?.firmaName || 'Lassel GmbH')}</strong>
          ${esc(settings?.firmaStrasse || '')}<br/>
          ${esc(settings?.firmaPLZ || '')} ${esc(settings?.firmaOrt || '')}
        </div>
        <div class="footer-item">
          <strong>Bankverbindung</strong>
          ${esc(settings?.bank || '')}<br/>
          IBAN: ${esc(settings?.iban || '')}
        </div>
        <div class="footer-item">
          <strong>Kontakt</strong>
          ${esc(settings?.email || '')}<br/>
          ${esc(settings?.telefon || '')}
        </div>
        <div class="footer-item">
          <strong>Steuernummer</strong>
          ${esc(settings?.steuernummer || '')}<br/>
          UID: ${esc(settings?.uid || '')}
        </div>
      </div>
    </div>
  `

  return new NextResponse(wrap(body), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
