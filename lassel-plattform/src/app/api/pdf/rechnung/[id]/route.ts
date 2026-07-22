import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderHtmlToPdfResponse } from '@/lib/pdf-renderer'
import { buildAdressblock, isHausinhabungAktiv } from '@/lib/adressblock'
import { num, round2, ustNachSaetzen } from '@/lib/money'

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

/** Steuersatz ohne unnoetige Nachkommastellen: 20 -> "20%", 13,5 -> "13,5%". */
function formatProzent(n: number): string {
  const gerundet = Math.round(n * 100) / 100
  return `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(gerundet)}%`
}

function formatEuro(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
}

function fmtMenge(n: unknown): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(num(n, 0))
}

/**
 * Formatiert ein Array von ISO-Tagen als kompakte Liste:
 * - Einzelner Tag: "01.04.2026"
 * - Zusammenhängender Zeitraum: "01.04.2026 – 03.04.2026"
 * - Mischung: "01.04.2026 – 03.04.2026, 05.04.2026, 10.04.2026 – 12.04.2026 (7 Tage)"
 * Fallback: von/bis, wenn arbeitstage leer.
 */
function formatArbeitstage(arbeitstage: string[] | null | undefined, von?: string | null, bis?: string | null): string {
  const days = Array.isArray(arbeitstage) ? arbeitstage.filter(Boolean) : []
  if (days.length === 0) {
    if (von && bis) return `${formatDate(von)} – ${formatDate(bis)}`
    if (von) return formatDate(von)
    return ''
  }
  // Parse als Mittag, um TZ-Kippen zu vermeiden
  const sorted = [...days].map(s => new Date(`${s}T12:00:00`)).sort((a, b) => a.getTime() - b.getTime())
  const ranges: { start: Date; end: Date }[] = []
  let rs = sorted[0], re = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = Math.round((sorted[i].getTime() - re.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 1) {
      re = sorted[i]
    } else {
      ranges.push({ start: rs, end: re })
      rs = sorted[i]
      re = sorted[i]
    }
  }
  ranges.push({ start: rs, end: re })
  const fmt = (d: Date) => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const parts = ranges.map(r =>
    r.start.getTime() === r.end.getTime() ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`
  )
  return sorted.length > 1 ? `${parts.join(', ')} (${sorted.length} Tage)` : parts[0]
}

const CSS = `
  @page { margin: 12mm 15mm 15mm 15mm; size: A4 portrait; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; padding: 0; overflow: visible !important; height: auto !important; }
  .container { width: 100%; max-width: 100%; margin: 0 auto; padding: 0; padding-bottom: 10mm; overflow: visible !important; height: auto !important; }
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

const PREVIEW_CSS = `
  @media screen {
    html, body { background: #ffffff !important; }
    body { padding: 12mm 15mm 15mm 15mm !important; margin: 0 !important; min-height: 297mm; box-sizing: border-box; }
  }
`

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const searchParams = new URL(req.url).searchParams
  const isPreview = searchParams.get('preview') === '1'
  const disposition = searchParams.get('download') === '1'
    ? 'attachment'
    : 'inline'

  const [
    { data: rechnung, error },
    { data: positionenRaw },
    { data: companySettings },
    { data: einstellungen },
  ] = await Promise.all([
    supabase.from('rechnungen').select('*').eq('id', id).single(),
    supabase.from('rechnung_positionen').select('*').eq('rechnung_id', id).order('position'),
    // company_settings ist die Tabelle, in die die Einstellungen-Seite
    // schreibt. Die Rechnungs-Route las bisher NUR die Key/Value-Tabelle
    // `einstellungen`, in der diese Schluessel nie angelegt werden — geaenderte
    // Firmen- und Bankdaten erreichten die Rechnung dadurch nie, und der
    // global gepflegte Rechnungs-Fusstext war dauerhaft leer. Das Angebots-PDF
    // liest company_settings bereits korrekt.
    supabase.from('company_settings').select('*').limit(1).maybeSingle(),
    supabase.from('einstellungen').select('key, value'),
  ])

  if (error || !rechnung) return new NextResponse('Rechnung nicht gefunden', { status: 404 })
  // Belege im Papierkorb nicht mehr ausliefern — sonst laesst sich ein
  // geloeschter Beleg ueber seine PDF-URL weiterhin abrufen und versenden.
  if (rechnung.geloescht_am != null) {
    return new NextResponse('Rechnung befindet sich im Papierkorb', { status: 410 })
  }

  const positionen: any[] = positionenRaw || []

  // Bei Schlussrechnungen: alle Anzahlungen + Teilrechnungen zum gleichen Angebot laden.
  //
  // Ausgeschlossen werden stornierte, gelöschte und noch im Entwurf stehende
  // Vorab-Rechnungen. Vorher zog die Schlussrechnung deren Beträge mit ab —
  // der Kunde bekam einen Restbetrag, der um eine nie fakturierte oder wieder
  // aufgehobene Anzahlung zu niedrig war, und Lassel fakturierte dauerhaft zu
  // wenig. Dieselbe Regel gilt in angebote/[id] (`fakturierteRechnungen`).
  let vorabRechnungen: any[] = []
  if (rechnung.ist_schlussrechnung && rechnung.angebot_id) {
    const { data: vorabData } = await supabase
      .from('rechnungen')
      .select('id, rechnungsnummer, rechnungstyp, teilbetrag_brutto, brutto_gesamt, rechnungsdatum, status, geloescht_am')
      .eq('angebot_id', rechnung.angebot_id)
      .in('rechnungstyp', ['anzahlung', 'teilrechnung'])
      .neq('id', rechnung.id)
      .order('rechnungsdatum', { ascending: true })
    // Filter in JS statt in der Abfrage: geloescht_am und status sind von der
    // Schema-Drift betroffen, eine serverseitige Bedingung darauf könnte die
    // gesamte Abfrage mit 400 killen.
    vorabRechnungen = (vorabData || []).filter(
      (r) => r.geloescht_am == null && r.status !== 'storniert' && r.status !== 'entwurf'
    )
  }

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

  // Vorrang: company_settings (Einstellungen-Seite) > einstellungen-Key/Value
  // (Altbestand) > fest hinterlegter Default. Die Feldnamen unterscheiden
  // sich zwischen den beiden Quellen, deshalb je Feld beide Schreibweisen.
  const cs: Record<string, string> = (companySettings as Record<string, string>) || {}
  const wert = (ausCs: string | undefined, ausKv: string | undefined, standard: string) =>
    (ausCs && String(ausCs).trim()) || (ausKv && String(ausKv).trim()) || standard

  const firma = {
    firmenname: wert(cs.firmenname, s.firmenname, 'Lassel GmbH'),
    strasse: wert(cs.strasse, s.strasse, 'Hetzmannsdorf 25'),
    plz: wert(cs.plz, s.plz, '2041'),
    ort: wert(cs.ort, s.ort, 'Wullersdorf'),
    telefon: wert(cs.telefon, s.telefon, '+436608060050'),
    email: wert(cs.email, s.email, 'office@hoehenarbeiten-lassel.at'),
    website: wert(cs.website, s.website, 'www.hoehenarbeiten-lassel.at'),
    ust_id: wert(cs.ustIdNr, s.ust_id, 'ATU78127607'),
    steuernummer: wert(cs.steuernummer, s.steuernummer, '22375/5414'),
    amtsgericht: wert(cs.amtsgericht, s.amtsgericht, 'Korneuburg'),
    geschaeftsfuehrung: wert(cs.geschaeftsfuehrung, s.geschaeftsfuehrung, 'Reinhard Lassel'),
    bank: wert(cs.bankName, s.bank, 'Bank Volksbank'),
    iban: wert(cs.iban, s.iban, 'AT454300048406028000'),
    bic: wert(cs.bic, s.bic, 'VBOEATWWXXX'),
    rechnungFusstext: wert(cs.rechnungFusstext, s.rechnungFusstext, ''),
  }

  const aktiv = isHausinhabungAktiv(rechnung.hausinhabung)
  const empf = buildAdressblock({
    hausinhabung: rechnung.hausinhabung,
    primaryName: rechnung.kunde_name,
    hausverwaltungName: rechnung.hausverwaltung_name || rechnung.kunde_name,
    strasse: aktiv ? (rechnung.hausverwaltung_strasse || rechnung.kunde_strasse) : rechnung.kunde_strasse,
    plz: aktiv ? (rechnung.hausverwaltung_plz || rechnung.kunde_plz) : rechnung.kunde_plz,
    ort: aktiv ? (rechnung.hausverwaltung_ort || rechnung.kunde_ort) : rechnung.kunde_ort,
    uid: rechnung.kunde_uid,
    uidHausinhabung: rechnung.uid_von_hi,
  })

  /**
   * Bei Anzahlung und Teilrechnung trägt der Beleg als Position 1 die
   * Abschlagszeile; darunter hängen ALLE Angebotspositionen zum vollen Preis
   * als Referenz. Ohne Kennzeichnung ergab die Positionsspalte im PDF eine
   * ganz andere Summe als der Summenblock darunter — für die Buchhaltung des
   * Kunden nicht nachvollziehbar und formal angreifbar.
   *
   * Die Referenzzeilen bekommen deshalb eine eigene Überschrift und keine
   * Preisspalte: sie beschreiben den Leistungsumfang, abgerechnet wird nur
   * der Abschlag.
   */
  const istTeilfaktura = ['anzahlung', 'teilrechnung'].includes(rechnung.rechnungstyp || '')
    && num(rechnung.teilbetrag_netto, 0) > 0

  const posRows = positionen.map((p, i) => {
    const lines = (p.beschreibung as string || '').split('\n')
    const titel = esc(lines[0] || '')
    const desc = lines.slice(1).join('\n').trim()
    // ?? statt ||: legitimer 0-Betrag (Gratis-/Info-Position) bleibt 0 statt
    // still durch Einzelpreis×Menge ersetzt zu werden.
    const gesamt = p.gesamtpreis != null ? num(p.gesamtpreis, 0) : round2(num(p.einzelpreis, 0) * num(p.menge, 0))
      // Rabatt sichtbar machen: gesamtpreis enthaelt ihn bereits, ohne
      // Ausweisung ergab Menge x Einzelpreis fuer den Kunden nicht den
      // Gesamtpreis — typische Rueckfrage, und der gewaehrte Nachlass war
      // nicht erkennbar.
    const rabatt = num(p.rabatt_prozent, 0)
    const rabattHinweis = rabatt > 0
      ? `<div style="font-size: 8.5pt; color: #666;">abzgl. ${formatProzent(rabatt)} Rabatt</div>`
      : ''
    // Referenzzeilen einer Abschlagsrechnung: Leistungsumfang ohne Preise.
    const istReferenz = istTeilfaktura && i > 0
    const trenner = istTeilfaktura && i === 1
      ? `
    <div style="margin-top: 14pt; padding: 6pt; font-size: 9pt; color: #555; background: #f8f8f8; border-bottom: 1px solid #ddd;">
      Leistungsumfang laut Angebot (Nachweis, nicht Teil dieser Abrechnung):
    </div>`
      : ''

    return `${trenner}
    <div class="position-item">
      <div class="pos-col-desc">
        <div class="pos-title">${i + 1}. ${titel}</div>
        ${desc ? `<div class="pos-desc">${esc(desc)}</div>` : ''}
      </div>
      <div class="pos-col-menge">${fmtMenge(p.menge)} ${esc(p.einheit || 'Stk')}</div>
      <div class="pos-col-preis">${istReferenz ? '' : `${formatEuro(p.einzelpreis || 0)}${rabattHinweis}`}</div>
      <div class="pos-col-gesamt">${istReferenz ? '<span style="color:#888;">—</span>' : formatEuro(gesamt)}</div>
    </div>`
  }).join('')

  const fusstext = rechnung.fusszeile || firma.rechnungFusstext

  /**
   * Zahlungsblock.
   *
   * Zwei Korrekturen gegenüber vorher:
   * 1. Bei Storno und Gutschrift stand hier unverändert „Bitte überweisen Sie
   *    den Rechnungsbetrag" — auf einem Beleg mit negativen Beträgen, der eine
   *    Zahlung RÜCKGÄNGIG macht. Diese Typen bekommen jetzt einen eigenen Text.
   * 2. Skonto und ein abweichendes Zahlungsziel wurden zwar gepflegt, aber von
   *    keiner PDF-Route je ausgegeben — die Vereinbarung stand nirgends auf
   *    dem Beleg und war damit nicht durchsetzbar.
   */
  const zahlungsblock = (() => {
    const typ = rechnung.rechnungstyp || 'normal'
    const istGutschrift = typ === 'storno' || typ === 'gutschrift'

    const skontoZeile = rechnung.skonto_aktiv && num(rechnung.skonto_prozent, 0) > 0
      ? `
    <div style="margin-top: 4px;"><strong>Skonto:</strong> ${formatProzent(num(rechnung.skonto_prozent, 0))} bei Zahlung innerhalb von ${num(rechnung.skonto_tage, 0)} Tagen</div>`
      : ''

    if (istGutschrift) {
      return `
  <div class="payment">
    <div style="font-size: 9pt;">
      Der ausgewiesene Betrag wird Ihnen gutgeschrieben. Eine Zahlung Ihrerseits
      ist nicht erforderlich.
    </div>
  </div>`
    }

    return `
  <div class="payment">
    <div><strong>Zahlungsbedingungen:</strong> ${esc(rechnung.zahlungskondition || '30 Tage netto')}</div>
    ${rechnung.faellig_bis ? `
    <div style="margin-top: 4px;"><strong>Fällig am:</strong> ${formatDate(rechnung.faellig_bis)}</div>` : ''}${skontoZeile}
    <div style="margin-top: 12px; font-size: 9pt;">
      Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer
      auf das unten angegebene Konto.
    </div>
  </div>`
  })()

  // Reverse-Charge-bewusste Beträge: bei RC gilt immer USt=0 / Brutto=Netto,
  // auch wenn evtl. fehlerhaft gespeicherte Alt-Beträge etwas anderes sagen.
  const reverseCharge = Boolean(rechnung.reverse_charge)
  const nettoGesamt = num(rechnung.netto_gesamt, 0)
  const mwstGesamt = reverseCharge ? 0 : num(rechnung.mwst_gesamt, 0)
  const bruttoGesamt = reverseCharge ? nettoGesamt : num(rechnung.brutto_gesamt, 0)

  /**
   * Umsatzsteuer je Satz ausweisen statt pauschal „20%".
   * § 11 UStG verlangt den Steuersatz; bei gemischten Sätzen getrennt.
   *
   * Die Gruppen kommen aus den Positionen. Weicht deren Summe vom
   * gespeicherten mwst_gesamt ab (Teilfaktura: die Angebotspositionen hängen
   * nur als Referenz am Beleg), ist der Kopfbetrag maßgeblich — dann wird
   * eine einzelne Zeile mit dem effektiven Satz gedruckt.
   */
  const ustZeilen = (() => {
    const gruppen = ustNachSaetzen(
      positionen.map((p) => ({
        menge: p.menge,
        einzelpreis: p.einzelpreis,
        rabattProzent: p.rabatt_prozent,
        mwstSatz: p.mwst_satz,
      })),
      { reverseCharge }
    )
    const summeGruppen = gruppen.reduce((s, g) => s + g.betrag, 0)
    const passt = gruppen.length > 0 && Math.abs(summeGruppen - mwstGesamt) < 0.02

    if (passt) {
      return gruppen
        .map((g) => `
    <div class="total-row"><span>zzgl. Umsatzsteuer ${formatProzent(g.satz)}</span><span>${formatEuro(g.betrag)}</span></div>`)
        .join('')
    }
    const effektiv = nettoGesamt > 0 ? (mwstGesamt / nettoGesamt) * 100 : 0
    return `
    <div class="total-row"><span>zzgl. Umsatzsteuer ${formatProzent(effektiv)}</span><span>${formatEuro(mwstGesamt)}</span></div>`
  })()

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${CSS}${isPreview ? PREVIEW_CSS : ''}</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="header-left">
      <div class="sender-line">${esc(firma.firmenname)} - ${esc(firma.strasse)} - ${esc(firma.plz)} ${esc(firma.ort)}</div>
      <div class="customer-address">
        <div class="customer-name">${esc(empf.name)}</div>
        ${empf.zeile2 ? `<div>${esc(empf.zeile2)}</div>` : ''}
        ${empf.strasse ? `<div>${esc(empf.strasse)}</div>` : ''}
        ${(empf.plz || empf.ort) ? `<div>${esc(empf.plz)} ${esc(empf.ort)}</div>` : ''}
        <div>${esc(empf.land)}</div>
        ${empf.uid ? `<div>UID: ${esc(empf.uid)}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <img src="${APP_URL}/logo.png" alt="${esc(firma.firmenname)}" class="logo" />
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Rechnungs-Nr.:</span><span class="meta-value">${esc(rechnung.rechnungsnummer)}</span></div>
        <div class="meta-row"><span class="meta-label">Rechnungsdatum:</span><span class="meta-value">${formatDate(rechnung.rechnungsdatum || rechnung.created_at)}</span></div>
        ${(() => {
          const lz = formatArbeitstage(rechnung.arbeitstage, rechnung.leistungszeitraum_von, rechnung.leistungszeitraum_bis)
          return lz ? `<div class="meta-row"><span class="meta-label">Leistungszeitraum:</span><span class="meta-value">${esc(lz)}</span></div>` : ''
        })()}
        ${rechnung.erstellt_von ? `
        <div class="meta-row"><span class="meta-label">Ihr Ansprechpartner:</span><span class="meta-value">${esc(rechnung.erstellt_von)}</span></div>` : ''}
        ${rechnung.referenz_angebot_nummer ? `
        <div class="meta-row"><span class="meta-label">Referenz Angebot:</span><span class="meta-value">${esc(rechnung.referenz_angebot_nummer)}</span></div>` : ''}
        ${rechnung.geschaeftsfallnummer ? `
        <div class="meta-row"><span class="meta-label">Geschäftsfall-Nr.:</span><span class="meta-value">${esc(rechnung.geschaeftsfallnummer)}</span></div>` : ''}
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
      <span>${formatEuro(nettoGesamt)}</span>
    </div>
    ${reverseCharge ? `
    <div class="total-row"><span>USt. (Reverse Charge)</span><span>0,00 €</span></div>` : ustZeilen}
    <div class="total-row final">
      <span>Gesamtbetrag brutto</span>
      <span>${formatEuro(bruttoGesamt)}</span>
    </div>
  </div>

  ${vorabRechnungen.length > 0 ? (() => {
    const summeVorab = vorabRechnungen.reduce(
      (s: number, r: any) => s + (Number(r.teilbetrag_brutto) || Number(r.brutto_gesamt) || 0),
      0
    )
    const restbetrag = (Number(rechnung.brutto_gesamt) || 0) - summeVorab
    return `
  <div style="margin-top: 18pt; padding-top: 10pt; border-top: 1px solid #ddd; font-size: 9.5pt;">
    <p style="font-weight: bold; margin-bottom: 6pt;">Bereits in Rechnung gestellt:</p>
    ${vorabRechnungen.map((r: any) => `
      <div style="display: flex; justify-content: space-between; padding: 2pt 0;">
        <span>${esc(r.rechnungsnummer)} (${formatDate(r.rechnungsdatum)})</span>
        <span>− ${formatEuro(Number(r.teilbetrag_brutto) || Number(r.brutto_gesamt) || 0)}</span>
      </div>
    `).join('')}
    <div style="display: flex; justify-content: space-between; padding: 2pt 0; border-top: 1px solid #ccc; margin-top: 4pt; padding-top: 4pt; font-weight: 600;">
      <span>Summe Anzahlungen / Teilrechnungen:</span>
      <span>− ${formatEuro(summeVorab)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 6pt 0; border-top: 1.5px solid #000; margin-top: 6pt; font-weight: bold; font-size: 10.5pt;">
      <span>Verbleibender Restbetrag:</span>
      <span>${formatEuro(restbetrag)}</span>
    </div>
  </div>
  `})() : ''}

  ${zahlungsblock}

  ${fusstext ? `
  <div style="margin-top: 20pt; margin-bottom: 15pt; padding-top: 10pt; border-top: 1px solid #ddd; font-size: 9pt; color: #333; line-height: 1.6; white-space: pre-wrap;">${esc(fusstext)}</div>` : ''}

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
</body>
</html>`

  if (isPreview) {
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  // pdf_url wird NICHT mehr automatisch beim Render geschrieben — sie wird
  // nur von "Speichern & in Zoho ablegen" gesetzt.

  const fileName = `Rechnung_${(rechnung.rechnungsnummer || id).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`
  return renderHtmlToPdfResponse(html, fileName, disposition)
}
