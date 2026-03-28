import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function esc(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
}

function fmtCurrency(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
}

function fmtDate(s: unknown): string {
  if (!s) return ''
  try {
    return new Date(String(s)).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(s)
  }
}

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #f0f0f0; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.18); margin: 0 auto; position: relative; }
  .logo-img { height: 48px; width: auto; object-fit: contain; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .company-info { font-size: 9px; color: #555; line-height: 1.5; }
  .doc-title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
  .doc-number { font-size: 13px; color: #555; }
  .address-block { margin: 20px 0; }
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
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  tbody tr:hover { background: #fafafa; }
  td { padding: 7px 8px; font-size: 10px; vertical-align: top; }
  td.right { text-align: right; }
  td.number { font-variant-numeric: tabular-nums; }
  .pos-name { font-weight: 600; color: #1a1a1a; }
  .pos-desc { color: #666; font-size: 9px; margin-top: 2px; white-space: pre-wrap; }
  .summary-table { margin-left: auto; width: 240px; margin-top: 16px; }
  .summary-table td { padding: 4px 8px; font-size: 11px; }
  .summary-total { background: #1a1a1a; color: white; font-weight: 700; font-size: 12px; }
  .summary-total td { padding: 8px; }
  .anmerkung { margin: 16px 0; padding: 10px 14px; border-left: 3px solid #e05a1a; background: #fff8f5; font-size: 10px; color: #444; white-space: pre-wrap; }
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

  const { data: offer, error } = await supabase
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) {
    return new NextResponse('Angebot nicht gefunden', { status: 404 })
  }

  const { data: posData } = await supabase
    .from('offer_positions')
    .select('*')
    .eq('offerId', id)
    .order('pos')
  const positions: Record<string, unknown>[] = posData || []

  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  // Summen berechnen
  const summeNetto = positions.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.gesamtNetto) || 0), 0)
  const summeUst = positions.reduce((s: number, p: Record<string, unknown>) => {
    const netto = Number(p.gesamtNetto) || 0
    const ust = Number(p.ustSatz) || 0
    return s + netto * (ust / 100)
  }, 0)
  const summeBrutto = summeNetto + summeUst

  const posRows = positions.map((p: Record<string, unknown>) => `
    <tr>
      <td>${esc(p.pos)}</td>
      <td>
        <div class="pos-name">${esc(p.produktName)}</div>
        ${p.beschreibung ? `<div class="pos-desc">${esc(p.beschreibung)}</div>` : ''}
      </td>
      <td class="right number">${fmt(p.menge)}</td>
      <td>${esc(p.einheit)}</td>
      <td class="right number">${fmt(p.einzelpreisNetto)} €</td>
      ${p.rabattProzent ? `<td class="right number">${fmt(p.rabattProzent)}%</td>` : '<td>-</td>'}
      <td class="right number">${fmt(p.ustSatz)}%</td>
      <td class="right number">${fmt(p.gesamtNetto)} €</td>
    </tr>
  `).join('')

  const body = `
    <!-- Header -->
    <div class="header-row">
      <img class="logo-img" src="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/logo.png" alt="Lassel GmbH" />
      <div style="text-align:right">
        <div class="doc-title">ANGEBOT</div>
        <div class="doc-number">${esc(offer.angebotNummer)}</div>
      </div>
    </div>

    <!-- Adressen -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:20px 0;">
      <div class="address-block">
        <div class="address-label">Rechnungsempfänger</div>
        <div class="address-name">${esc(offer.rechnungsempfaengerName)}</div>
        <div class="address-line">${esc(offer.rechnungsempfaengerStrasse)}</div>
        <div class="address-line">${esc(offer.rechnungsempfaengerPlz)} ${esc(offer.rechnungsempfaengerOrt)}</div>
      </div>
      ${offer.objektBezeichnung ? `
      <div class="address-block">
        <div class="address-label">Objekt</div>
        <div class="address-name">${esc(offer.objektBezeichnung)}</div>
        <div class="address-line">${esc(offer.objektStrasse)}</div>
        <div class="address-line">${esc(offer.objektPlz)} ${esc(offer.objektOrt)}</div>
        ${offer.hausinhabung ? `<div class="address-line">HI: ${esc(offer.hausinhabung)}</div>` : ''}
      </div>` : ''}
    </div>

    <!-- Meta -->
    <div class="meta-grid">
      <div class="meta-item"><label>Angebotsdatum</label><span>${fmtDate(offer.datum)}</span></div>
      <div class="meta-item"><label>Gültig bis</label><span>${fmtDate(offer.gueltigBis)}</span></div>
      ${offer.ticketNumber ? `<div class="meta-item"><label>Ticketnummer</label><span>${esc(offer.ticketNumber)}</span></div>` : ''}
      ${offer.erstelltDurch ? `<div class="meta-item"><label>Erstellt von</label><span>${esc(offer.erstelltDurch)}</span></div>` : ''}
    </div>

    <!-- Positionen -->
    <div class="section-title">Positionen</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Bezeichnung</th>
          <th class="right" style="width:60px">Menge</th>
          <th style="width:40px">Einh.</th>
          <th class="right" style="width:80px">Einzelpreis</th>
          <th class="right" style="width:50px">Rabatt</th>
          <th class="right" style="width:40px">USt.</th>
          <th class="right" style="width:80px">Gesamt</th>
        </tr>
      </thead>
      <tbody>${posRows}</tbody>
    </table>

    <!-- Summen -->
    <table class="summary-table">
      <tbody>
        <tr><td>Nettobetrag:</td><td class="right number">${fmt(summeNetto)} €</td></tr>
        <tr><td>USt.:</td><td class="right number">${fmt(summeUst)} €</td></tr>
      </tbody>
      <tfoot>
        <tr class="summary-total"><td>Gesamtbetrag:</td><td class="right number">${fmt(summeBrutto)} €</td></tr>
      </tfoot>
    </table>

    ${offer.bemerkung ? `<div class="anmerkung">${esc(offer.bemerkung)}</div>` : ''}

    <!-- Footer -->
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
