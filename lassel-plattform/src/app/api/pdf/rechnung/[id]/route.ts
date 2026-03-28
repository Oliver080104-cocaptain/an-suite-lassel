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
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #333; background: #f0f0f0; padding: 20px; }
.page { width: 210mm; min-height: 297mm; background: white; margin: 0 auto; padding: 15mm 18mm 30mm 18mm; box-shadow: 0 2px 20px rgba(0,0,0,0.15); position: relative; }
.absender { font-size: 7.5px; color: #666; margin-bottom: 14px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.empfaenger { flex: 1; }
.empfaenger .name { font-size: 12px; font-weight: bold; margin-bottom: 3px; }
.empfaenger .adresse { font-size: 10px; line-height: 1.7; color: #333; }
.meta-block { text-align: right; min-width: 210px; }
.logo-img { height: 55px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 10px; }
.meta-table { font-size: 9.5px; border-collapse: collapse; margin-left: auto; }
.meta-table td { padding: 1.5px 0; }
.meta-table td:first-child { color: #888; padding-right: 8px; text-align: right; }
.meta-table td:last-child { font-weight: bold; color: #111; }
.doc-title { font-size: 18px; font-weight: bold; color: #111; margin-bottom: 6px; margin-top: 10px; }
.obj-line { font-size: 10px; font-weight: bold; color: #333; margin-bottom: 2px; }
.ticket-line { font-size: 9px; color: #666; margin-bottom: 20px; }
table.positionen { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9.5px; }
table.positionen thead tr { border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
table.positionen thead th { padding: 6px 8px; text-align: left; font-weight: bold; font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 0.3px; }
table.positionen thead th.right { text-align: right; }
table.positionen tbody td { padding: 8px; vertical-align: top; border-bottom: 1px solid #f0f0f0; font-size: 9.5px; line-height: 1.5; }
table.positionen tbody td.right { text-align: right; }
.pos-name { font-weight: bold; margin-bottom: 3px; }
.pos-desc { color: #555; font-size: 9px; line-height: 1.5; white-space: pre-wrap; }
.summen-wrapper { display: flex; justify-content: flex-end; margin-bottom: 24px; }
.summen-block { width: 260px; font-size: 10px; }
.summen-block table { width: 100%; border-collapse: collapse; }
.summen-block td { padding: 4px 0; }
.summen-block td:last-child { text-align: right; }
.brutto-row td { border-top: 2px solid #111; font-size: 12px; font-weight: bold; padding-top: 8px !important; }
.notizen-block { border-left: 3px solid #E85A1B; padding-left: 10px; margin-bottom: 20px; font-size: 9px; color: #555; white-space: pre-wrap; }
.abschlusstext { font-size: 9.5px; color: #444; line-height: 1.7; margin-bottom: 16px; }
.signatur { font-size: 10px; font-weight: bold; }
.footer { position: absolute; bottom: 10mm; left: 18mm; right: 18mm; border-top: 1px solid #ddd; padding-top: 6px; font-size: 7.5px; color: #666; text-align: center; line-height: 1.8; }
.print-btn { position: fixed; top: 16px; right: 16px; background: #E85A1B; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(232,90,27,0.4); z-index: 100; }
@media print { body { background: white; padding: 0; } .page { box-shadow: none; margin: 0; } .print-btn { display: none; } @page { size: A4; margin: 0; } }
`

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: rechnung, error } = await supabase
    .from('rechnungen')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !rechnung) {
    return new NextResponse('Rechnung nicht gefunden', { status: 404 })
  }

  const [posResult, firmaResult, mitarbeiterResult] = await Promise.all([
    supabase.from('rechnung_positionen').select('*').eq('rechnung_id', id).order('position'),
    supabase.from('einstellungen').select('value').eq('key', 'firma').maybeSingle(),
    rechnung.erstellt_von_id
      ? supabase.from('mitarbeiter').select('name').eq('id', rechnung.erstellt_von_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const positionen: Record<string, unknown>[] = posResult.data || []
  const firma: Record<string, string> = (firmaResult.data?.value as Record<string, string>) || {}
  const erstelltVon: string = (mitarbeiterResult.data as any)?.name || ''

  const firmaName = firma.name || 'Lassel GmbH'
  const firmaStrasse = firma.strasse || ''
  const firmaPlz = firma.plz || ''
  const firmaOrt = firma.ort || ''
  const firmaLand = firma.land || 'Österreich'
  const firmaTelefon = firma.telefon || ''
  const firmaEmail = firma.email || ''
  const firmaWebsite = firma.website || ''
  const firmaIban = firma.iban || ''
  const firmaBic = firma.bic || ''
  const firmaBank = firma.bank || ''
  const firmaUstId = firma.uid || ''
  const firmaSteuernummer = firma.steuernummer || ''
  const firmaAmtsgericht = firma.amtsgericht || ''
  const firmaGF = firma.geschaeftsfuehrung || ''

  const posRows = positionen.map((p, i) => {
    const lines = (p.beschreibung as string || '').split('\n')
    const firstLine = esc(lines[0] || '')
    const restLines = lines.slice(1).join('\n')
    return `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="pos-name">${firstLine}</div>
        ${restLines ? `<div class="pos-desc">${esc(restLines)}</div>` : ''}
      </td>
      <td class="right">${fmtMenge(p.menge)}</td>
      <td class="right">${esc(p.einheit || 'Stk')}</td>
      <td class="right">${formatEuro(p.einzelpreis)}</td>
      <td class="right">${p.rabatt_prozent ? esc(p.rabatt_prozent) + ' %' : '-'}</td>
      <td class="right">${esc(p.mwst_satz || 20)},00%</td>
      <td class="right">${formatEuro(p.gesamtpreis)}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>${CSS}</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">⬇ PDF speichern</button>
<div class="page">

  <div class="absender">${esc(firmaName)} - ${esc(firmaStrasse)} - ${esc(firmaPlz)} ${esc(firmaOrt)}</div>

  <div class="header">
    <div class="empfaenger">
      <div class="name">${esc(rechnung.kunde_name)}</div>
      <div class="adresse">
        ${rechnung.kunde_strasse ? esc(rechnung.kunde_strasse) + '<br>' : ''}
        ${rechnung.kunde_plz || ''} ${rechnung.kunde_ort || ''}<br>
        ${esc(rechnung.kunde_land || 'Österreich')}
        ${rechnung.kunde_uid ? '<br>' + esc(rechnung.kunde_uid) : ''}
      </div>
    </div>
    <div class="meta-block">
      <img class="logo-img" src="${APP_URL}/logo.png" alt="${esc(firmaName)}">
      <table class="meta-table">
        <tr><td>Rechnungsnummer:</td><td>${esc(rechnung.rechnungsnummer)}</td></tr>
        <tr><td>Datum:</td><td>${formatDate(rechnung.rechnungsdatum || rechnung.created_at)}</td></tr>
        ${rechnung.faellig_bis ? `<tr><td>Zahlbar bis:</td><td>${formatDate(rechnung.faellig_bis)}</td></tr>` : ''}
        ${erstelltVon ? `<tr><td>Ihr Ansprechpartner:</td><td>${esc(erstelltVon)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <div class="doc-title">Rechnung ${esc(rechnung.rechnungsnummer)}</div>
  ${rechnung.objekt_adresse ? `<div class="obj-line">OBJ: ${esc(rechnung.objekt_bezeichnung || rechnung.objekt_adresse)}</div>` : ''}
  ${rechnung.ticket_nummer ? `<div class="ticket-line">Ticket: ${esc(rechnung.ticket_nummer)}</div>` : '<div class="ticket-line">&nbsp;</div>'}

  <table class="positionen">
    <thead>
      <tr>
        <th style="width:25px">#</th>
        <th>Beschreibung</th>
        <th class="right" style="width:55px">Menge</th>
        <th class="right" style="width:45px">Einh.</th>
        <th class="right" style="width:85px">Einzelpreis</th>
        <th class="right" style="width:50px">Rabatt</th>
        <th class="right" style="width:50px">Ust.</th>
        <th class="right" style="width:85px">Gesamtpreis</th>
      </tr>
    </thead>
    <tbody>${posRows}</tbody>
  </table>

  <div class="summen-wrapper">
    <div class="summen-block">
      <table>
        <tr><td>Gesamtbetrag netto</td><td>${formatEuro(rechnung.netto_gesamt)}</td></tr>
        ${rechnung.reverse_charge
          ? '<tr><td>zzgl. Umsatzsteuer (Reverse Charge)</td><td>0,00 €</td></tr>'
          : `<tr><td>zzgl. Umsatzsteuer 20%</td><td>${formatEuro(rechnung.mwst_gesamt)}</td></tr>`
        }
        <tr class="brutto-row"><td>Gesamtbetrag brutto</td><td>${formatEuro(rechnung.brutto_gesamt)}</td></tr>
      </table>
    </div>
  </div>

  ${rechnung.notizen ? `<div class="notizen-block">${esc(rechnung.notizen)}</div>` : ''}

  <div class="abschlusstext">
    Bitte überweisen Sie den Rechnungsbetrag${rechnung.faellig_bis ? ` bis zum ${formatDate(rechnung.faellig_bis)}` : ''} auf das unten angeführte Konto.<br>
    Wir bedanken uns sehr für Ihr Vertrauen.
  </div>

  <div class="abschlusstext">
    <strong>Mit freundlichen Grüßen</strong><br><br>
    <span class="signatur">${esc(erstelltVon || firmaGF || firmaName)}</span>
  </div>

  <div class="footer">
    ${esc(firmaName)} _ ${esc(firmaStrasse)} _ ${esc(firmaPlz)} ${esc(firmaOrt)} _ ${esc(firmaLand)}
    ${firmaTelefon ? `&nbsp;&nbsp;TEL. ${esc(firmaTelefon)}` : ''}
    ${firmaEmail ? `&nbsp;&nbsp;E-MAIL ${esc(firmaEmail)}` : ''}<br>
    ${firmaWebsite ? `WEB ${esc(firmaWebsite)} &nbsp;` : ''}
    ${firmaAmtsgericht ? `AMTSGERICHT ${esc(firmaAmtsgericht)} &nbsp;` : ''}
    ${firmaUstId ? `UST.-ID ${esc(firmaUstId)} &nbsp;` : ''}
    ${firmaSteuernummer ? `STEUER-NR. ${esc(firmaSteuernummer)}` : ''}<br>
    ${firmaGF ? `GESCHÄFTSFÜHRUNG ${esc(firmaGF)} &nbsp;` : ''}
    ${firmaBank ? `BANK ${esc(firmaBank)} &nbsp;` : ''}
    ${firmaIban ? `IBAN ${esc(firmaIban)} &nbsp;` : ''}
    ${firmaBic ? `BIC ${esc(firmaBic)}` : ''}
  </div>

</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
